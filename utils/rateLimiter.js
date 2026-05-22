const config = require('./configLoader');
const { sendError } = require('./errorHandler');
const logger = require('./logger');
const { getStore } = require('../libs/rateLimitStore');

class RateLimiter {
  constructor(rateLimitConfig) {
    this.enabled = rateLimitConfig.enabled !== false;
    this.timeWindow = rateLimitConfig.timeWindow || 60;
    this.maxRequests = rateLimitConfig.maxRequests || 100;
    this.ipHeader = rateLimitConfig.ipHeader === undefined ? 'X-Forwarded-For' : rateLimitConfig.ipHeader;
    this.store = getStore();
    this.apiPrefix = `/${config.apiDir || 'v1'}`;

    if (this.enabled && this.maxRequests > 0) {
      logger.info(`限流器已启用: ${this.maxRequests}次/${this.timeWindow}s`);
    } else {
      logger.info('限流器已禁用');
    }
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

  async check(ip) {
    if (!this.enabled || this.maxRequests <= 0) {
      return { allowed: true };
    }
    return this.store.check(`ratelimit:${ip}`, this.timeWindow, this.maxRequests);
  }

  destroy() {
    if (this.store && typeof this.store.destroy === 'function') {
      this.store.destroy();
    }
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled || this.maxRequests === 0) {
        return next();
      }

      const ip = this.getClientIP(req);
      this.check(ip).then(result => {
        if (!result.allowed) {
          logger.warn(`限流触发`, { ip, count: `${this.maxRequests}/${this.timeWindow}s` });
          if (req.path.startsWith(this.apiPrefix)) {
            return res.status(429).json({ status: 'error', time: Date.now(), message: '请求过于频繁，请稍后重试' });
          }
          return sendError(res, 429);
        }
        next();
      }).catch(err => {
        logger.warn(`限流器检查异常，放行请求`, { ip, error: err.message });
        next();
      });
    };
  }
}

module.exports = RateLimiter;
