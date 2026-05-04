const config = require('./configLoader');
const { sendError } = require('./errorHandler');

class RateLimiter {
  constructor(rateLimitConfig) {
    this.enabled = rateLimitConfig.enabled !== false;
    this.timeWindow = rateLimitConfig.timeWindow || 60;
    this.maxRequests = rateLimitConfig.maxRequests || 100;
    this.ipHeader = rateLimitConfig.ipHeader === undefined ? 'X-Forwarded-For' : rateLimitConfig.ipHeader;
    this.ipRecords = new Map();
    this.apiPrefix = `/${config.apiDir || 'v1'}`;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  getClientIP(req) {
    if (this.ipHeader) {
      const forwardedIP = req.get(this.ipHeader);
      if (forwardedIP) {
        const first = String(forwardedIP)
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)[0];
        if (first) return first;
      }
    }
    return req.ip || req.connection.remoteAddress || '0.0.0.0';
  }

  isRateLimited(ip) {
    const now = Date.now();
    const records = this.ipRecords.get(ip);
    
    if (!records || records.length === 0) {
      return false;
    }

    const windowStart = now - this.timeWindow * 1000;
    const recentRequests = records.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length !== records.length) {
      this.ipRecords.set(ip, recentRequests);
    }

    return recentRequests.length >= this.maxRequests;
  }

  recordRequest(ip) {
    const now = Date.now();
    
    if (!this.ipRecords.has(ip)) {
      this.ipRecords.set(ip, []);
    }
    
    const records = this.ipRecords.get(ip);
    records.push(now);

    const windowStart = now - this.timeWindow * 1000;
    const recentRequests = records.filter(timestamp => timestamp > windowStart);
    this.ipRecords.set(ip, recentRequests);
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.timeWindow * 1000;
    
    for (const [ip, records] of this.ipRecords.entries()) {
      const recentRequests = records.filter(timestamp => timestamp > windowStart);
      
      if (recentRequests.length === 0) {
        this.ipRecords.delete(ip);
      } else {
        this.ipRecords.set(ip, recentRequests);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled || this.maxRequests === 0) {
        return next();
      }
      
      const ip = this.getClientIP(req);

      if (this.isRateLimited(ip)) {
        if (req.path.startsWith(this.apiPrefix)) {
          return res.status(429).json({ status: 'error', time: Date.now(), message: '请求过于频繁，请稍后重试' });
        }
        return sendError(res, 429);
      }

      this.recordRequest(ip);
      
      next();
    };
  }
}

module.exports = RateLimiter;
