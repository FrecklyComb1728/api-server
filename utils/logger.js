const fs = require('fs');
const path = require('path');

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const LEVEL_NAMES = ['ERROR', 'WARN ', 'INFO ', 'DEBUG'];

let _instance = null;

class Logger {
  constructor() {
    if (_instance) return _instance;
    this.level = 2;
    this.file = false;
    this.dir = 'logs';
    this._initialized = false;
    this._buffer = [];
    this._flushTimer = null;
    _instance = this;
  }

  static getInstance() {
    if (!_instance) new Logger();
    return _instance;
  }

  init(config) {
    if (this._initialized) return;
    config = config || {};

    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    const cfgLevel = String(config.level || '').toUpperCase();
    const resolved = envLevel || cfgLevel || 'INFO';
    this.level = LEVELS[resolved] ?? 2;

    this.file = config.file === true || config.file === 'true';
    this.dir = config.dir || 'logs';

    if (this.file) {
      this._flushTimer = setInterval(() => this._flush(), 200);
      this._flushTimer.unref();
    }

    this._initialized = true;
  }

  _now() {
    const d = new Date();
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const tzh = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const tzm = String(absOffset % 60).padStart(2, '0');
    const tz = `${sign}${tzh}:${tzm}`;

    const pad = (n) => String(n).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const monthStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const timestamp = `${dateStr}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}${tz}`;

    return { timestamp, dateStr, monthStr };
  }

  _buildLine(levelName, message, extra) {
    const { timestamp } = this._now();
    let fields = '';
    if (extra) {
      const parts = [];
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined) {
          const val = String(v).replace(/\n/g, '\\n');
          parts.push(`${k}=${val}`);
        }
      }
      if (parts.length > 0) fields = ' ' + parts.join(' ');
    }
    return `${timestamp} [${levelName}]${fields} ${message}`;
  }

  _output(levelNum, message, extra) {
    if (levelNum > this.level) return;

    const cleanMsg = String(message || '').replace(/\n/g, '\\n');
    const line = this._buildLine(LEVEL_NAMES[levelNum], cleanMsg, extra);
    if (process.env.IS_PRIMARY_WORKER !== '0') {
      console.log(line);
    }

    if (!this.file) return;

    try {
      const { dateStr, monthStr } = this._now();
      this._buffer.push({ line, monthStr, dateStr });
    } catch (e) {
      console.error('日志缓冲失败:', e.message);
    }
  }

  _flush() {
    if (this._buffer.length === 0) return;
    const lines = this._buffer.splice(0);
    try {
      for (const { line, monthStr, dateStr } of lines) {
        const monthDir = path.join(this.dir, monthStr);
        if (!fs.existsSync(monthDir)) {
          fs.mkdirSync(monthDir, { recursive: true });
        }
        const filePath = path.join(monthDir, `${dateStr}.log`);
        fs.appendFileSync(filePath, line + '\n', 'utf-8');
      }
    } catch (e) {
      console.error('日志写入文件失败:', e.message);
    }
  }

  error(message, extra) { this._output(0, message, extra); }
  warn(message, extra)  { this._output(1, message, extra); }
  info(message, extra)  { this._output(2, message, extra); }
  debug(message, extra) { this._output(3, message, extra); }

  child(req) {
    const self = this;
    const rid = req.rid || '-';
    const pid = process.pid;
    return {
      error(m, e) { self.error(m, { rid, pid, ...(e || {}) }); },
      warn(m, e)  { self.warn(m,  { rid, pid, ...(e || {}) }); },
      info(m, e)  { self.info(m,  { rid, pid, ...(e || {}) }); },
      debug(m, e) { self.debug(m, { rid, pid, ...(e || {}) }); },
    };
  }

  middleware() {
    const self = this;
    return (req, res, next) => {
      const start = Date.now();
      const method = req.method;
      const url = req.originalUrl || req.url;
      const rid = req.rid || '-';
      const pid = process.pid;
      const ip = req.ip || req.connection?.remoteAddress || '-';

      res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        self._output(2, `${method} ${url} ${status} ${duration}ms`, {
          rid, pid, method, url, status, duration_ms: duration, ip
        });
      });

      next();
    };
  }
}

module.exports = Logger.getInstance();
