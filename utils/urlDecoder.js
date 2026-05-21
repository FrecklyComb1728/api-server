const logger = require('./logger');

function urlDecoderMiddleware(req, res, next) {
  try {
    req.url = decodeURIComponent(req.url);
  } catch (error) {
    logger.warn(`URL 解码失败`, { url: req.url, error: error.message });
  }
  next();
}

module.exports = urlDecoderMiddleware;
