class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  _now() {
    return Date.now();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && this._now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    const ttl = Number(ttlSeconds);
    this.store.set(key, {
      value,
      expiresAt: ttl > 0 ? this._now() + ttl * 1000 : 0
    });
  }

  async del(key) {
    this.store.delete(key);
  }

  async has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && this._now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async setNX(key, value, ttlSeconds) {
    const exists = await this.has(key);
    if (exists) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async flush() {
    this.store.clear();
  }

  destroy() {
    this.store.clear();
  }
}

class RedisStore {
  constructor(redis, prefix) {
    this.redis = redis;
    this.prefix = prefix;
  }

  _key(key) {
    return this.prefix + key;
  }

  async get(key) {
    const raw = await this.redis.get(this._key(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async set(key, value, ttlSeconds) {
    const k = this._key(key);
    const serialized = JSON.stringify(value);
    const ttl = Number(ttlSeconds);
    if (ttl > 0) {
      await this.redis.set(k, serialized, 'EX', ttl);
    } else {
      await this.redis.set(k, serialized);
    }
  }

  async del(key) {
    await this.redis.del(this._key(key));
  }

  async has(key) {
    const exists = await this.redis.exists(this._key(key));
    return exists === 1;
  }

  async setNX(key, value, ttlSeconds) {
    const k = this._key(key);
    const serialized = JSON.stringify(value);
    const ttl = Number(ttlSeconds);
    let result;
    if (ttl > 0) {
      result = await this.redis.set(k, serialized, 'EX', ttl, 'NX');
    } else {
      result = await this.redis.set(k, serialized, 'NX');
    }
    return result === 'OK';
  }

  async flush() {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', this.prefix + '*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  destroy() {}
}

let storeInstance = null;

function init(mode, redisClient, prefix) {
  if (storeInstance) return storeInstance;
  storeInstance = mode === 'redis'
    ? new RedisStore(redisClient, prefix || '')
    : new MemoryStore();
  return storeInstance;
}

function getStore() {
  if (!storeInstance) throw new Error('CacheStore 未初始化');
  return storeInstance;
}

module.exports = { init, getStore };
