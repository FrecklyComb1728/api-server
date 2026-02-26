const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const createApp = require('./core/app');

const configPath = path.join(process.cwd(), 'server-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const port = Number(config.port) || 8633;

const clusterConfig = config && typeof config === 'object' ? config.cluster : null;
const clusterEnabled = Boolean(clusterConfig && clusterConfig.enabled);

if (clusterEnabled && cluster.isPrimary) {
  const configured = Number(clusterConfig?.workers);
  const cpuCount = Math.max(1, Number(os.cpus()?.length) || 1);
  const workers = configured > 0 ? configured : cpuCount;

  for (let i = 0; i < workers; i++) {
    cluster.fork();
  }

  cluster.on('exit', () => {
    cluster.fork();
  });
} else {
  const app = createApp();
  app.listen(port, () => {
    console.log(`服务已启动: http://localhost:${port}`);
  });
}
