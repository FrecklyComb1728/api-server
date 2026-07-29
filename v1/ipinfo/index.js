const express = require('express');
const axios = require('axios');
const fs = require('fs');
const net = require('net');
const path = require('path');
const logger = require('../../utils/logger');
const { getStore } = require('../../libs/cacheStore');

const router = express.Router();
const configPath = path.join(__dirname, 'config.json');
const config = require(configPath);

const cache = getStore();
const CACHE_PREFIX = 'ipinfo:';
const IP_VERSION_VALUES = new Map([
  ['ipv4', 4],
  ['ipv6', 6]
]);
let lastUsedApiIndex = -1;
const apiRequestCounters = Object.create(null);
const apiIpVersions = new Map();
const apiNames = new Set();
if (!Array.isArray(config.upstream_apis)) {
  throw new Error('upstream_apis 必须是数组');
}
config.upstream_apis.forEach(api => {
  if (!api || typeof api.name !== 'string' || !api.name.trim()) {
    throw new Error('每个 upstream API 必须配置非空 name');
  }
  const apiName = api.name.trim();
  if (apiNames.has(apiName)) {
    throw new Error(`upstream API 名称重复: ${apiName}`);
  }
  apiNames.add(apiName);
  apiIpVersions.set(api.name, parseIpVersions(api));
  apiRequestCounters[api.name] = {
    count: 0,
    windowStartTime: Date.now(),
    isAvailable: api.enabled
  };
});

function parseIpVersions(api) {
  if (api.ip_versions === undefined) {
    return new Set(IP_VERSION_VALUES.values());
  }
  if (typeof api.ip_versions !== 'string') {
    throw new Error(`API ${api.name} 的 ip_versions 必须是逗号分隔的字符串`);
  }
  const configuredVersions = api.ip_versions
    .split(',')
    .map(version => version.trim().toLowerCase())
    .filter(Boolean);
  const unknownVersion = configuredVersions.find(version => !IP_VERSION_VALUES.has(version));
  if (unknownVersion) {
    throw new Error(`API ${api.name} 的 ip_versions 包含未知值: ${unknownVersion}`);
  }
  return new Set(configuredVersions.map(version => IP_VERSION_VALUES.get(version)));
}

function supportsIpVersion(apiName, ipVersion) {
  return apiIpVersions.get(apiName)?.has(ipVersion) === true;
}

function resetRequestCounter(apiName) {
  const api = config.upstream_apis.find(a => a.name === apiName);
  if (!api) return;
  apiRequestCounters[apiName] = {
    count: 0,
    windowStartTime: Date.now(),
    isAvailable: api.enabled
  };
}

function isApiAvailable(apiName) {
  const api = config.upstream_apis.find(a => a.name === apiName);
  if (!api || !api.enabled) return false;
  const counter = apiRequestCounters[apiName];
  if (!counter) return false;
  const now = Date.now();
  if (now - counter.windowStartTime > api.time_window * 1000) {
    resetRequestCounter(apiName);
    return true;
  }
  return counter.count < api.max_requests;
}

function getAvailableApis(ipVersion) {
  return config.upstream_apis.filter(api => (
    supportsIpVersion(api.name, ipVersion) && isApiAvailable(api.name)
  ));
}

function selectNextApi(availableApis) {
  if (!availableApis || availableApis.length === 0) {
    return null;
  }
  if (availableApis.length === 1) {
    return availableApis[0];
  }
  const strategy = config.load_balance_strategy || 'round_robin';
  switch (strategy) {
    case 'random':
      return availableApis[Math.floor(Math.random() * availableApis.length)];
    case 'least_used':
      return availableApis.reduce((least, current) => {
        const leastCount = apiRequestCounters[least.name].count;
        const currentCount = apiRequestCounters[current.name].count;
        return currentCount < leastCount ? current : least;
      });
    default:
      lastUsedApiIndex = (lastUsedApiIndex + 1) % availableApis.length;
      return availableApis[lastUsedApiIndex];
  }
}

function incrementApiCounter(apiName) {
  if (!apiRequestCounters[apiName]) return;
  apiRequestCounters[apiName].count++;
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  if (path.includes(',')) {
    const fields = path.split(',');
    return fields.map(field => getNestedValue(obj, field.trim())).filter(v => v).join('');
  }
  const parts = path.split('.');
  if (!parts || parts.length === 0) return undefined;
  return parts.reduce((o, k) => {
    if (o === null || o === undefined || typeof o !== 'object') return undefined;
    return o[k];
  }, obj);
}

function applyFieldTemplate(value, variables) {
  let out = String(value ?? '');
  if (!variables) return out;
  for (const [k, v] of Object.entries(variables)) {
    out = out.replaceAll(`{${k}}`, v === undefined || v === null ? '' : String(v));
  }
  return out;
}

function resolveFieldValue(data, apiField, variables) {
  if (apiField === undefined || apiField === null) return undefined;
  const raw = String(apiField);
  if (raw.includes(',')) {
    const fields = raw.split(',');
    return fields.map(field => resolveFieldValue(data, field.trim(), variables)).filter(v => v).join('');
  }
  const directMatch = raw.match(/^\{([\w.-]+)\}$/);
  if (directMatch) {
    const name = directMatch[1];
    if (Object.prototype.hasOwnProperty.call(variables || {}, name)) {
      return variables[name];
    }
  }
  if (raw.includes('{') && raw.includes('}')) {
    const parts = raw.split('.').map(part => {
      const m = part.match(/^\{([\w.-]+)\}$/);
      if (!m) return part;
      const key = m[1];
      if (!Object.prototype.hasOwnProperty.call(variables || {}, key)) return undefined;
      return variables[key];
    });
    if (!parts.some(p => p === undefined)) {
      let cur = data;
      for (const p of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = cur[p];
      }
      if (cur !== undefined) return cur;
    }
  }
  const resolvedPath = applyFieldTemplate(raw, variables);
  return getNestedValue(data, resolvedPath);
}

function mapResponseToStandardFormat(data, fieldMapping, variables) {
  const result = {};
  for (const [standardField, apiField] of Object.entries(fieldMapping)) {
    result[standardField] = resolveFieldValue(data, apiField, variables);
  }
  return result;
}

function getCacheKey(ip) {
  const ipStr = String(ip || '').trim();
  const match = ipStr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return ipStr;
  const parts = match.slice(1).map(Number);
  if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return ipStr;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

async function getFromCache(ip) {
  const key = CACHE_PREFIX + getCacheKey(ip);
  const cached = await cache.get(key);
  if (!cached) return null;
  if (cached && cached.data) {
    return {
      ...cached,
      data: {
        ...cached.data,
        ip
      }
    };
  }
  return cached;
}

async function saveToCache(ip, data) {
  const key = CACHE_PREFIX + getCacheKey(ip);
  const ttl = Number(config.cache_ttl);
  await cache.set(key, data, ttl > 0 ? ttl : 0);
}

async function safeQueryIpInfo(ip, apiConfig) {
  if (!isApiAvailable(apiConfig.name)) {
    throw new Error(`API ${apiConfig.name} 不可用`);
  }
  incrementApiCounter(apiConfig.name);
  try {
    const url = apiConfig.url.replaceAll('{ip}', encodeURIComponent(ip));
    const response = await axios.get(url, { timeout: config.default_timeout });
    const standardData = mapResponseToStandardFormat(response.data, apiConfig.field_mapping, { ip });
    const filteredData = {};
    config.response_fields.forEach(field => {
      if (standardData[field] !== undefined) {
        filteredData[field] = standardData[field];
      }
    });
    return {
      source: apiConfig.name,
      data: filteredData,
      raw_data: response.data
    };
  } catch (error) {
    const err = new Error(`查询失败: ${error.message}`);
    err.source = apiConfig.name;
    throw err;
  }
}

function isIpv4MappedIpv6(ip) {
  if (net.isIP(ip) !== 6) {
    return false;
  }
  const address = ip.split('%', 1)[0];
  try {
    const hostname = new URL(`http://[${address}]`).hostname.toLowerCase();
    return /^\[::ffff:[\da-f]{1,4}:[\da-f]{1,4}\]$/.test(hostname);
  } catch {
    return false;
  }
}

function parseIp(ip) {
  const normalizedIp = String(ip || '').trim();
  const ipVersion = net.isIP(normalizedIp);
  if (ipVersion === 0) {
    const error = new Error('无效的IP地址');
    error.statusCode = 400;
    throw error;
  }
  if (isIpv4MappedIpv6(normalizedIp)) {
    const error = new Error('不支持IPv4映射IPv6地址');
    error.statusCode = 400;
    throw error;
  }
  return { normalizedIp, ipVersion };
}

async function queryIpInfoWithRetry(ip) {
  const { normalizedIp, ipVersion } = parseIp(ip);
  const cachedData = await getFromCache(normalizedIp);
  if (cachedData) {
    logger.debug(`IP缓存命中`, { ip: normalizedIp });
    return cachedData;
  }
  let availableApis = getAvailableApis(ipVersion);
  if (availableApis.length === 0) {
    const err = new Error(`没有支持 IPv${ipVersion} 的可用API`);
    err.source = '系统';
    err.statusCode = 503;
    throw err;
  }
  let result;
  let lastError;
  let retryRound = 0;
  let triedApis = new Set();
  while (retryRound <= config.retry_count) {
    availableApis = getAvailableApis(ipVersion).filter(api => !triedApis.has(api.name));
    if (availableApis.length === 0) {
      if (retryRound < config.retry_count) {
        triedApis.clear();
        availableApis = getAvailableApis(ipVersion);
        retryRound++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        break;
      }
    }
    if (availableApis.length === 0) {
      break;
    }
    const selectedApi = selectNextApi(availableApis);
    if (!selectedApi) {
      break;
    }
    try {
      result = await safeQueryIpInfo(normalizedIp, selectedApi);
      logger.debug(`IP查询成功`, { source: result.source, ip: normalizedIp });
      await saveToCache(normalizedIp, result);
      return result;
    } catch (error) {
      logger.warn(`IP查询上游失败`, { source: selectedApi.name, error: error.message, attempt: retryRound + 1 });
      lastError = error;
      triedApis.add(selectedApi.name);
    }
  }
  if (lastError) {
    throw lastError;
  } else {
    const err = new Error('查询失败');
    err.source = '系统';
    err.statusCode = 503;
    throw err;
  }
}

function getClientIp(req) {
  let ipHeaders = [];
  if (Array.isArray(config.ip_headers)) {
    if (config.ip_headers.length > 0 && typeof config.ip_headers[0] === 'object') {
      ipHeaders = [...config.ip_headers].sort((a, b) => a.priority - b.priority);
    } else {
      ipHeaders = config.ip_headers.map(header => ({ name: header }));
    }
  } else {
    ipHeaders = [
      { name: 'x-forwarded-for', priority: 1 },
      { name: 'x-real-ip', priority: 2 }
    ];
  }
  for (const header of ipHeaders) {
    const headerValue = req.get(header.name);
    if (headerValue) {
      const ips = headerValue.split(',').map(ip => ip.trim()).filter(ip => ip);
      if (ips.length > 0) {
        return ips[0];
      }
    }
  }
  const remoteIp = req.connection.remoteAddress || req.socket.remoteAddress || '';
  return remoteIp;
}

async function handleIpQuery(ip, res) {
  try {
    const result = await queryIpInfoWithRetry(ip);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
}

router.get('/', async (req, res) => {
  const queryIp = req.query.ip;
  if (queryIp) {
    return handleIpQuery(queryIp, res);
  } else {
    const clientIp = getClientIp(req);
    return handleIpQuery(clientIp, res);
  }
});

router.get('/:ip', async (req, res) => {
  const ip = req.params.ip;
  return handleIpQuery(ip, res);
});

module.exports = router;
module.exports.queryIpInfoWithRetry = queryIpInfoWithRetry;
module.exports.getClientIp = getClientIp;
module.exports.meta = {
  name: 'IP 信息',
  description: '多上游容灾，自动重试',
  endpoints: [
    { method: 'GET', path: '', description: '查询 当前/指定 IP', params: '?ip=x.x.x.x' },
    { method: 'GET', path: '/', description: '查询 当前/指定 IP', params: '?ip=x.x.x.x' },
    { method: 'GET', path: '/:ip', description: '查询指定 IP', params: '路径参数' }
  ]
};
