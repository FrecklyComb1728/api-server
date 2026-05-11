module.exports = {
  apps: [{
    name: 'mifeng-api-server',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '256M',
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    autorestart: true,
    env: { NODE_ENV: 'production' }
  }]
};