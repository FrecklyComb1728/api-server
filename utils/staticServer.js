const fs = require('fs');
const path = require('path');
const config = require('./configLoader');
const logger = require('./logger');
const cluster = require('cluster');
const { getMimeType } = require('./mimeTypes');
const { sendError } = require('./errorHandler');
const { serveMarkdown, serveRawMarkdown } = require('./markdownRenderer');


function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return sendError(res, 404);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    return sendError(res, 404);
  }

  try {
    let content = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);

    if (mimeType === 'text/html' || filePath.endsWith('.html')) {
      const timeWindow = config?.rateLimit?.timeWindow || 60;

      const htmlContent = content.toString('utf-8')
        .replace(/\$\{projectName\}/g, config.projectName)
        .replace(/\$\{port\}/g, config.port || 8633)
        .replace(/\$\{apiDir\}/g, config.apiDir || 'v1')
        .replace(/\$\{maxRequests\}/g, config?.rateLimit?.maxRequests || 100)
        .replace(/\$\{timeWindow\}/g, timeWindow)
        .replace(/\$\{year\}/g, new Date().getFullYear());

      content = Buffer.from(htmlContent, 'utf-8');
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', content.length);
    logger.debug(`静态文件: ${filePath}`, { mime: mimeType });
    res.send(content);
  } catch (error) {
    logger.error(`无法提供文件: ${filePath}`, { error: error.message });
    sendError(res, 500);
  }
}

function setupStaticRoutes(app, config, markdownRenderer) {
  const staticDir = path.join(process.cwd(), config.staticDir);

  app.get('*', (req, res, next) => {
    try {
      if (req.path === '/') {
        const indexPath = path.join(process.cwd(), config?.index?.templatePath || 'template/index.html');
        return serveFile(res, indexPath);
      }

      const resolvedStaticDir = path.resolve(staticDir);
      let filePath = path.resolve(path.join(staticDir, req.path));
      if (!filePath.startsWith(resolvedStaticDir + path.sep) && filePath !== resolvedStaticDir) {
        return sendError(res, 404);
      }

      if (req.path.endsWith('.raw.md')) {
        const actualPath = req.path.replace('.raw.md', '.md');
        const resolvedPath = path.resolve(path.join(staticDir, actualPath));
        if (!resolvedPath.startsWith(resolvedStaticDir + path.sep) && resolvedPath !== resolvedStaticDir) {
          return sendError(res, 404);
        }
        return serveRawMarkdown(res, resolvedPath);
      }

      if (req.path.endsWith('.md')) {
        logger.debug(`渲染文档: ${req.path}`);
        return serveMarkdown(res, filePath, markdownRenderer);
      }

      serveFile(res, filePath);
    } catch (error) {
      logger.error(`静态路由错误`, { error: error.message });
      next(error);
    }
  });

  if (cluster.isPrimary || process.env.IS_PRIMARY_WORKER === '1') {
    logger.info('静态路由已加载');
  }
}

module.exports = {
  serveFile,
  setupStaticRoutes
};
