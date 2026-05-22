const cluster = require('cluster');
const os = require('os');
const config = require('./utils/configLoader');
const logger = require('./utils/logger');
const createApp = require('./core/app');

const port = Number(config.port) || 8633;
const clusterConfig = config && typeof config === 'object' ? config.cluster : null;
const clusterEnabled = Boolean(clusterConfig && clusterConfig.enabled);
const managedByPM2 = 'pm_id' in process.env;

if (!managedByPM2 && clusterEnabled && cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_NONE;

  const configured = Number(clusterConfig?.workers);
  const cpuCount = Math.max(1, Number(os.cpus().length) || 1);
  const workers = configured > 0 ? configured : cpuCount;

  logger.info(`启动 ${workers} 个 Worker 进程`, { pid: process.pid });

  for (let i = 0; i < workers; i++) {
    const worker = cluster.fork({ IS_PRIMARY_WORKER: i === 0 ? '1' : '0' });
    logger.debug(`fork worker pid=${worker.process.pid}`);
  }

  cluster.on('exit', (worker, code) => {
    logger.warn(`Worker 退出，重启中`, { workerPid: worker.process.pid, code, pid: process.pid });
    cluster.fork({ IS_PRIMARY_WORKER: '0' });
  });
} else {
  (async () => {
    const { app, limiter, destroy } = await createApp();
    const server = app.listen(port, () => {
      if (process.send) process.send('ready');
      if (managedByPM2 || !clusterEnabled || process.env.IS_PRIMARY_WORKER === '1') {
        logger.info(`服务已启动: http://localhost:${port}`, { pid: process.pid });
      }
    });

    const shutdown = () => {
      logger.info('收到关闭信号，等待请求完成');
      server.close(() => {
        destroy();
        limiter.destroy();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5000);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })();
}
