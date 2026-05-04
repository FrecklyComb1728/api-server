function urlDecoderMiddleware(req, res, next) {
  try {
    req.url = decodeURIComponent(req.url);
  } catch (error) {
    console.warn('[警告] URL 解码失败:', req.url);
  }
  next();
}

module.exports = urlDecoderMiddleware;
