const cluster = require('cluster');
const os = require('os');
const config = require('./utils/configLoader');
const createApp = require('./core/app');

cluster.schedulingPolicy = cluster.SCHED_NONE;

const port = Number(config.port) || 8633;

const clusterConfig = config && typeof config === 'object' ? config.cluster : null;
const clusterEnabled = Boolean(clusterConfig && clusterConfig.enabled);

if (clusterEnabled && cluster.isPrimary) {
  const configured = Number(clusterConfig?.workers);
  const cpuCount = Math.max(1, Number(os.cpus().length) || 1);
  const workers = configured > 0 ? configured : cpuCount;

  console.log(`启动 ${workers} 个 Worker 进程`);

  for (let i = 0; i < workers; i++) {
    cluster.fork({ IS_PRIMARY_WORKER: i === 0 ? '1' : '0' });
  }

  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} 退出 (code: ${code})，重启中...`);
    cluster.fork({ IS_PRIMARY_WORKER: '0' });
  });
} else {
  const { app, limiter } = createApp();
  app.listen(port, () => {
    if (!clusterEnabled || process.env.IS_PRIMARY_WORKER === '1') {
      console.log(`服务已启动: http://localhost:${port}`);
    }
  });

  const shutdown = () => {
    limiter.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
