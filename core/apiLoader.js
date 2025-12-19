const fs = require('fs');
const path = require('path');
const { sendError } = require('../utils/errorHandler');

function loadApis(app, config) {
  const apiRoot = path.join(process.cwd(), config.apiDir || 'api');
  if (!fs.existsSync(apiRoot)) {
    return;
  }

  const modules = fs.readdirSync(apiRoot).filter((name) => {
    const full = path.join(apiRoot, name);
    try {
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'index.js'));
    } catch {
      return false;
    }
  });

  modules.forEach((name) => {
    const indexPath = path.join(apiRoot, name, 'index.js');
    try {
      const router = require(indexPath);
      const base = `/api/${name}`;
      app.use(base, router);
      console.error(`加载模块成功: ${name}`);
    } catch (e) {
      console.error(`加载模块失败: ${name}`, e.message);
    }
  });

  app.use('/api', (req, res) => {
    sendError(res, 404);
  });
}

module.exports = loadApis;
