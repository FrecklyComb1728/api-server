# 配置

服务启动时读取项目根目录的 `server-config.json`。复制 `server-config.example.json` 并重命名即可使用。

## 完整示例

```json
{
  "projectName": "API Server",
  "port": 8633,
  "staticDir": "public",
  "apiDir": "v1",
  "index": {
    "templatePath": "template/index.html"
  },
  "error": {
    "templatePath": "template/error.html"
  },
  "markdown": {
    "templatePath": "template/markdown.html"
  },
  "log": {
    "enableFile": true,
    "logPath": "logs/access.log",
    "timezone": 8,
    "ipHeader": "X-Forwarded-For"
  },
  "rateLimit": {
    "enabled": true,
    "timeWindow": 60,
    "maxRequests": 100,
    "ipHeader": "X-Forwarded-For"
  },
  "cluster": {
    "enabled": true,
    "workers": 0
  }
}
```

## 字段说明

### 基础

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectName` | string | 站点标题与模板变量 |
| `port` | number | 监听端口，默认 `8633` |
| `staticDir` | string | 静态资源根目录，默认 `public` |
| `apiDir` | string | API 模块根目录，默认 `v1` |

### 页面模板

| 字段 | 说明 |
|------|------|
| `index.templatePath` | `/` 首页模板 |
| `error.templatePath` | HTTP 错误页模板 |
| `markdown.templatePath` | Markdown 渲染模板 |

### 日志

| 字段 | 说明 |
|------|------|
| `log.enableFile` | 是否写入日志文件 |
| `log.logPath` | 日志文件路径，如 `logs/access.log` |
| `log.timezone` | 时区偏移量，如 `8` = UTC+8 |
| `log.ipHeader` | 记录的客户端 IP 来源头，如 `X-Forwarded-For` |

### 限流

| 字段 | 说明 |
|------|------|
| `rateLimit.enabled` | 是否启用限流 |
| `rateLimit.timeWindow` | 统计窗口（秒） |
| `rateLimit.maxRequests` | 窗口内最大请求数，`0` = 不限流 |
| `rateLimit.ipHeader` | 客户端 IP 的 HTTP 头 |

### 多进程

| 字段 | 说明 |
|------|------|
| `cluster.enabled` | 是否启用内置 cluster 多进程 |
| `cluster.workers` | `0` = CPU 核心数，`>0` = 指定数量 |

**PM2 共存**：当进程由 PM2 管理时（检测到 `pm_id` 环境变量），内置 cluster 自动关闭，由 PM2 负责多进程管理和零停机 reload。直接 `node server.js` 启动时则使用内置 cluster。

## HTML 模板变量

返回 `.html` 文件时自动替换：

| 变量 | 来源 |
|------|------|
| `${projectName}` `/v1/{port}` `${staticDir}` `${apiDir}` | 配置 |
| `${maxRequests}` `${timeWindow}` `${timezone}` | 限流 / 日志配置 |

## 生效方式

修改 `server-config.json` 后需重启进程。PM2 环境下 `pm2 reload` 即可。
