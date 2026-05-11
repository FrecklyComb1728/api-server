const cluster = require('cluster');
const os = require('os');
const config = require('./utils/configLoader');
const createApp = require('./core/app');

const port = Number(config.port) || 8633;
const clusterConfig = config && typeof config === 'object' ? config.cluster : null;
const clusterEnabled = Boolean(clusterConfig && clusterConfig.enabled);
const managedByPM2 = 'pm_id' in process.env;

// PM2 管理时以单进程运行，PM2 自己负责 cluster 和 reload
// 否则使用内置 cluster
if (!managedByPM2 && clusterEnabled && cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_NONE;

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
  const server = app.listen(port, () => {
    if (process.send) process.send('ready');
    if (managedByPM2 || !clusterEnabled || process.env.IS_PRIMARY_WORKER === '1') {
      console.log(`服务已启动: http://localhost:${port} (pid: ${process.pid})`);
    }
  });

  const shutdown = () => {
    server.close(() => {
      limiter.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
