const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'server-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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

    // 如果是 HTML 文件，替换模板变量
    if (mimeType === 'text/html' || filePath.endsWith('.html')) {
      const rateLimitEnabled = config.rateLimit.enabled ? '已启用' : '已禁用';
      const logEnabled = config.log.enableFile ? '已启用' : '已禁用';
      const rateLimitBadgeClass = config.rateLimit.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
      const logBadgeClass = config.log.enableFile ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
      const rateLimitStatus = config.rateLimit.enabled ? '已启用' : '已禁用';
      const logStatus = config.log.enableFile ? '已启用' : '已禁用';
      const timeWindow = config.rateLimit.timeWindow || 60;

      const htmlContent = content.toString('utf-8')
        .replace(/\$\{projectName\}/g, config.projectName)
        .replace(/\$\{port\}/g, config.port || 8633)
        .replace(/\$\{staticDir\}/g, config.staticDir || 'public')
        .replace(/\$\{apiDir\}/g, config.apiDir || 'api')
        .replace(/\$\{rateLimitEnabled\}/g, rateLimitEnabled)
        .replace(/\$\{logEnabled\}/g, logEnabled)
        .replace(/\$\{rateLimitBadgeClass\}/g, rateLimitBadgeClass)
        .replace(/\$\{logBadgeClass\}/g, logBadgeClass)
        .replace(/\$\{rateLimitStatus\}/g, rateLimitStatus)
        .replace(/\$\{logStatus\}/g, logStatus)
        .replace(/\$\{timezone\}/g, config.log.timezone || 8)
        .replace(/\$\{maxRequests\}/g, config.rateLimit.maxRequests || 100)
        .replace(/\$\{timeWindow\}/g, timeWindow);

      content = Buffer.from(htmlContent, 'utf-8');
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', content.length);
    res.send(content);
  } catch (error) {
    console.error(`[错误] 无法提供文件: ${filePath}`, error);
    sendError(res, 500);
  }
}

function setupStaticRoutes(app, config, markdownRenderer) {
  const staticDir = path.join(process.cwd(), config.staticDir);

  app.get('*', (req, res, next) => {
    try {
      if (req.path === '/') {
        const indexPath = path.join(process.cwd(), config.index.templatePath);
        return serveFile(res, indexPath);
      }

      let filePath = path.join(staticDir, req.path);

      if (req.path.endsWith('.raw.md')) {
        // 去掉 .raw 部分，获取实际的 .md 文件路径
        const actualPath = req.path.replace('.raw.md', '.md');
        filePath = path.join(staticDir, actualPath);
        return serveRawMarkdown(res, filePath);
      }

      if (req.path.endsWith('.md')) {
        return serveMarkdown(res, filePath, markdownRenderer);
      }

      serveFile(res, filePath);
    } catch (error) {
      console.error('[错误] 静态路由错误:', error);
      next(error);
    }
  });

  console.log('静态路由已加载');
}

module.exports = {
  serveFile,
  setupStaticRoutes
};
