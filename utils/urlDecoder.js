function urlDecoderMiddleware(req, res, next) {
    req.url = decodeURIComponent(req.url);
  next();
}

module.exports = urlDecoderMiddleware;
