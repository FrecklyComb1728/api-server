const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const configPath = path.join(__dirname, 'config.json');
const config = require(configPath);

const ipCache = new Map();
let lastUsedApiIndex = -1;
const apiRequestCounters = {};
config.upstream_apis.forEach(api => {
  apiRequestCounters[api.name] = {
    count: 0,
    windowStartTime: Date.now(),
    isAvailable: api.enabled
  };
});

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
  const now = Date.now();
  if (now - counter.windowStartTime > api.time_window * 1000) {
    resetRequestCounter(apiName);
    return true;
  }
  return counter.count < api.max_requests;
}

function getAvailableApis() {
  return config.upstream_apis.filter(api => isApiAvailable(api.name));
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
  const keys = path.split('.');
  return keys.reduce((o, k) => (o || {})[k], obj);
}

function mapResponseToStandardFormat(data, fieldMapping) {
  const result = {};
  for (const [standardField, apiField] of Object.entries(fieldMapping)) {
    result[standardField] = getNestedValue(data, apiField);
  }
  return result;
}

function getFromCache(ip) {
  if (!ipCache.has(ip)) return null;
  const cacheItem = ipCache.get(ip);
  const now = Date.now();
  if (now - cacheItem.timestamp > config.cache_ttl * 1000) {
    ipCache.delete(ip);
    return null;
  }
  return cacheItem.data;
}

function saveToCache(ip, data) {
  ipCache.set(ip, {
    data,
    timestamp: Date.now()
  });
}

async function safeQueryIpInfo(ip, apiConfig) {
  if (!isApiAvailable(apiConfig.name)) {
    throw new Error(`API ${apiConfig.name} 不可用`);
  }
  incrementApiCounter(apiConfig.name);
  try {
    const url = apiConfig.url.replace('{ip}', ip);
    const response = await axios.get(url, { timeout: config.default_timeout });
    const standardData = mapResponseToStandardFormat(response.data, apiConfig.field_mapping);
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

async function queryIpInfoWithRetry(ip) {
  const cachedData = getFromCache(ip);
  if (cachedData) {
    return cachedData;
  }
  let availableApis = getAvailableApis();
  if (availableApis.length === 0) {
    const err = new Error('所有API不可用');
    err.source = '系统';
    throw err;
  }
  let result;
  let lastError;
  let retryCount = 0;
  let triedApis = new Set();
  while (retryCount <= config.retry_count) {
    availableApis = getAvailableApis().filter(api => !triedApis.has(api.name));
    if (availableApis.length === 0) {
      if (retryCount < config.retry_count) {
        triedApis.clear();
        availableApis = getAvailableApis();
        retryCount++;
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
      result = await safeQueryIpInfo(ip, selectedApi);
      saveToCache(ip, result);
      return result;
    } catch (error) {
      lastError = error;
      triedApis.add(selectedApi.name);
    }
  }
  if (lastError) {
    throw lastError;
  } else {
    const err = new Error('查询失败');
    err.source = '系统';
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
    const headerName = header.name.toLowerCase();
    const headerValue = req.headers[headerName];
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
  const normalizedIp = String(ip || '').trim().toLowerCase();
  try {
    const result = await queryIpInfoWithRetry(ip);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
