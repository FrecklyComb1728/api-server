const fs = require('fs');
const path = require('path');
const createApp = require('./core/app');

const configPath = path.join(process.cwd(), 'server-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = createApp();
const port = Number(config.port) || 8633;

app.listen(port, () => {
  console.log(`服务已启动: http://localhost:${port}`);
});
