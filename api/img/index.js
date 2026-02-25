const express = require('express');
const axios = require('axios');
const path = require('path');
const HttpClient = require('../../utils/httpClient');

const router = express.Router();
const config = require(path.join(__dirname, 'config.json'));

const http = new HttpClient({ timeout: Number(config?.timeout_ms) || 10000 });

let cache = { items: [], urls: [], fetchedAt: 0, baseUrl: '' };
let inflightRefresh = null;

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate');
  next();
});

function normalizeBaseUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(/\/+$/g, '');
}

function normalizePath(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.startsWith('/') ? s : `/${s}`;
}

function extractList(data) {
  function getByPath(obj, keys) {
    let cur = obj;
    for (const k of keys) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return cur;
  }

  function findArray(node, depth) {
    if (Array.isArray(node)) return node;
    if (!node || typeof node !== 'object') return null;

    const preferredPaths = [
      ['items'],
      ['list'],
      ['images'],
      ['result'],
      ['data'],
      ['data', 'items'],
      ['data', 'list'],
      ['data', 'images'],
      ['data', 'result']
    ];
    for (const p of preferredPaths) {
      const v = getByPath(node, p);
      if (Array.isArray(v)) return v;
    }

    if (depth >= 3) return null;
    for (const v of Object.values(node)) {
      const r = findArray(v, depth + 1);
      if (Array.isArray(r)) return r;
    }
    return null;
  }

  return findArray(data, 0) || [];
}

function ttlMs() {
  const v = Number(config?.cache_ttl);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v * 1000;
}

function isCacheFresh(now) {
  const ttl = ttlMs();
  if (ttl <= 0) return false;
  if (!cache || !cache.items || cache.items.length === 0) return false;
  return now - (cache.fetchedAt || 0) < ttl;
}

function startRefresh() {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const baseUrl = normalizeBaseUrl(config?.url);
    if (!baseUrl) {
      const err = new Error('配置缺少url');
      err.statusCode = 500;
      throw err;
    }

    const upstreamUrl = String(config?.upstream_url || 'https://picmi.1s.fan/api/images/list').trim();
    const upstreamPath = String(config?.upstream_path || '/background').trim() || '/background';
    const raw = await http.get(upstreamUrl, { path: upstreamPath });
    const list = extractList(raw);

    const items = [];
    const urls = [];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const p = normalizePath(it.path);
      if (!p) continue;
      const name = String(it.name ?? '').trim();
      items.push({ name, path: p });
      urls.push(`${baseUrl}${p}`);
    }

    cache = {
      items,
      urls,
      fetchedAt: Date.now(),
      baseUrl
    };
    return cache;
  })().finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
}

async function getCacheNonBlocking() {
  const now = Date.now();
  if (isCacheFresh(now)) return cache;

  if (cache && cache.items && cache.items.length > 0) {
    startRefresh().catch(() => {});
    return cache;
  }

  return startRefresh();
}

startRefresh().catch(() => {});

function getType(value, defaultValue) {
  const s = String(value ?? '').trim().toLowerCase();
  return s || defaultValue;
}

function buildListResponseData(c) {
  return c.items.map((it, idx) => ({
    id: String(idx + 1),
    name: it.name,
    url: c.baseUrl,
    path: it.path
  }));
}

router.get('/', async (req, res) => {
  const type = getType(req.query.type, '302');

  let c = null;
  try {
    c = await getCacheNonBlocking();
  } catch (e) {
    if (cache.items.length > 0) c = cache;
    else {
      const code = Number(e?.statusCode) || 502;
      return res.status(code).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }

  if (!c || c.urls.length === 0) {
    return res.status(502).json({ status: 'error', time: Date.now(), message: '未获取到图片列表' });
  }

  const idx = Math.floor(Math.random() * c.urls.length);
  const fullUrl = c.urls[idx];
  const it = c.items[idx] || { name: '', path: '' };
  const data = {
    id: String(idx + 1),
    name: it.name,
    url: c.baseUrl,
    path: it.path,
    fullUrl
  };

  if (type === '302') {
    return res.redirect(302, fullUrl);
  }
  if (type === 'img') {
    try {
      const timeout = Number(config?.timeout_ms) || 10000;
      const r = await axios.get(fullUrl, {
        responseType: 'stream',
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        },
        validateStatus: () => true
      });

      if (!r || !r.data) {
        return res.status(502).json({ status: 'error', time: Date.now(), message: '图片响应为空' });
      }

      const status = Number(r.status) || 502;
      res.status(status);
      if (r.headers && r.headers['content-type']) {
        res.set('Content-Type', String(r.headers['content-type']));
      }
      if (r.headers && r.headers['content-length']) {
        res.set('Content-Length', String(r.headers['content-length']));
      }
      if (r.headers && r.headers['etag']) {
        res.set('ETag', String(r.headers['etag']));
      }

      r.data.on('error', e => {
        if (!res.headersSent) {
          res.status(502).end(String(e?.message || e));
        } else {
          res.end();
        }
      });

      r.data.pipe(res);
      return;
    } catch (e) {
      return res.status(502).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }
  if (type === 'text') {
    res.type('text/plain; charset=utf-8');
    return res.send(fullUrl);
  }
  if (type === 'json') {
    return res.json({ status: 'success', time: Date.now(), data });
  }

  return res.status(400).json({ status: 'error', time: Date.now(), message: 'type仅支持text/json/302/img' });
});

router.get('/list', async (req, res) => {
  const type = getType(req.query.type, 'json');

  let c = null;
  try {
    c = await getCacheNonBlocking();
  } catch (e) {
    if (cache.items.length > 0) c = cache;
    else {
      const code = Number(e?.statusCode) || 502;
      return res.status(code).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }

  if (!c || c.urls.length === 0) {
    return res.status(502).json({ status: 'error', time: Date.now(), message: '未获取到图片列表' });
  }

  if (type === 'text') {
    res.type('text/plain; charset=utf-8');
    return res.send(c.urls.join('\n'));
  }
  if (type === 'json') {
    const data = buildListResponseData(c);
    return res.json({ status: 'success', total: data.length, time: Date.now(), data });
  }

  return res.status(400).json({ status: 'error', time: Date.now(), message: 'type仅支持text/json' });
});

module.exports = router;
