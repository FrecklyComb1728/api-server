const crypto = require('crypto');
const path = require('path');
const express = require('express');
const config = require('../utils/configLoader');
const logger = require('../utils/logger');
const corsMiddleware = require('../utils/corsHandler');
const urlDecoderMiddleware = require('../utils/urlDecoder');
const RateLimiter = require('../utils/rateLimiter');
const loadApis = require('./apiLoader');
const { errorHandlerMiddleware } = require('../utils/errorHandler');
const { setupStaticRoutes } = require('../utils/staticServer');
const { MarkdownRenderer } = require('../utils/markdownRenderer');

function createApp() {

  const app = express();

  app.use(urlDecoderMiddleware);
  app.use(corsMiddleware);
  app.use(express.json());

  app.use((req, res, next) => {
    req.rid = crypto.randomUUID().slice(0, 12);
    res.setHeader('X-Request-Id', req.rid);
    next();
  });

  logger.init(config.log || {});
  app.set('logger', logger);

  app.use(logger.middleware());

  const limiter = new RateLimiter(config.rateLimit || {});
  app.use(limiter.middleware());

  loadApis(app, config);

  const markdownTemplate = path.join(process.cwd(), config?.markdown?.templatePath || 'template/markdown.html');
  const renderer = new MarkdownRenderer(markdownTemplate);
  setupStaticRoutes(app, config, renderer);

  app.use(errorHandlerMiddleware);

  return { app, limiter };
}

module.exports = createApp;
