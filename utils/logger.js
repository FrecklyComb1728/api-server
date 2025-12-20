const fs = require('fs');
const path = require('path');
class Logger {
  constructor(config) {
    this.enableFile = config.enableFile || false;
    this.logPath = config.logPath || 'access.log';
    this.timezone = config.timezone || 8; // 默认 UTC+8
    this.ipHeader = config.ipHeader === undefined ? 'X-Forwarded-For' : config.ipHeader;
  }

  getForwardedIP(req) {
    if (!this.ipHeader) return '';
    const headerValue = req.get(this.ipHeader);
    if (!headerValue) return '';
    const first = String(headerValue)
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)[0];
    return first || '';
  }

  formatTime(date) {
    const utcTime = date.getTime();
    const timezoneOffset = this.timezone * 60 * 60 * 1000;
    const localTime = new Date(utcTime + timezoneOffset);

    const year = localTime.getUTCFullYear();
    const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localTime.getUTCDate()).padStart(2, '0');
    const hours = String(localTime.getUTCHours()).padStart(2, '0');
    const minutes = String(localTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(localTime.getUTCSeconds()).padStart(2, '0');

    return `${year}/${month}/${day}-${hours}:${minutes}:${seconds}`;
  }

  formatLog(req, res, startTime) {
    const forwardedIP = this.getForwardedIP(req);
    const ip = forwardedIP || req.ip || req.connection.remoteAddress || '-';
    const time = this.formatTime(new Date());
    const method = req.method || '-';
    const urlPath = req.originalUrl || req.url || '-';
    const protocol = `HTTP/${req.httpVersion || '1.1'}`;
    const status = res.statusCode || '-';
    const bytes = res.get('Content-Length') || '-';
    const referer = req.get('Referer') || '-';
    const userAgent = req.get('User-Agent') || '-';

    return `${ip} - [${time}] "${method} ${urlPath} ${protocol}" ${status} ${bytes} "${referer}" "${userAgent}" "${forwardedIP || '-'}"`;
  }

  write(logEntry) {
    console.log(logEntry);
    if (this.enableFile) {
      try {
        const logDir = path.dirname(this.logPath);
        if (logDir !== '.' && !fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        fs.appendFileSync(this.logPath, logEntry + '\n', 'utf-8');
      } catch (error) {
        console.error('无法将日志写入文件:', error.message);
      }
    }
  }

  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        try {
          const logEntry = this.formatLog(req, res, startTime);
          this.write(logEntry);
        } catch (error) {
          console.error('请求记录失败:', error.message);
        }
      });

      next();
    };
  }
}

module.exports = Logger;
