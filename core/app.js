const fs = require('fs');
const path = require('path');
const express = require('express');
const corsMiddleware = require('../utils/corsHandler');
const urlDecoderMiddleware = require('../utils/urlDecoder');
const Logger = require('../utils/logger');
const RateLimiter = require('../utils/rateLimiter');
const loadApis = require('./apiLoader');
const { errorHandlerMiddleware } = require('../utils/errorHandler');
const { setupStaticRoutes } = require('../utils/staticServer');
const { MarkdownRenderer } = require('../utils/markdownRenderer');

function createApp() {
  const configPath = path.join(process.cwd(), 'server-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const app = express();

  app.use(urlDecoderMiddleware);
  app.use(corsMiddleware);
  app.use(express.json());

  const logger = new Logger(config.log || {});
  app.use(logger.middleware());

  const limiter = new RateLimiter(config.rateLimit || {});
  app.use(limiter.middleware());

  loadApis(app, config);

  const markdownTemplate = path.join(process.cwd(), config.markdown.templatePath);
  const renderer = new MarkdownRenderer(markdownTemplate);
  setupStaticRoutes(app, config, renderer);

  app.use(errorHandlerMiddleware);

  return app;
}

module.exports = createApp;
