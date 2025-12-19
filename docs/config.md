# 配置

服务启动时读取项目根目录的 `server-config.json`。

## 示例

```json
{
  "projectName": "API Server",
  "port": 8633,
  "staticDir": "public",
  "apiDir": "api",
  "index": {
    "templatePath": "public/html/index.html"
  },
  "error": {
    "templatePath": "public/html/error.html"
  },
  "markdown": {
    "templatePath": "public/html/markdown.html"
  },
  "log": {
    "enableFile": true,
    "logPath": "access.log",
    "timezone": 8,
    "ipHeader": "X-Forwarded-For"
  },
  "rateLimit": {
    "enabled": true,
    "timeWindow": 60,
    "maxRequests": 100,
    "ipHeader": "X-Forwarded-For"
  }
}
```

## 字段说明

### 基础

- `projectName`：站点标题与部分模板变量
- `port`：监听端口
- `staticDir`：静态资源根目录（例如 `public/`）
- `apiDir`：API 模块根目录（例如 `api/`）

### 页面

- `index.templatePath`：访问 `/` 时返回的页面
- `error.templatePath`：HTTP 错误页模板
- `markdown.templatePath`：Markdown 渲染模板

### 日志

- `log.enableFile`：是否写入日志文件
- `log.logPath`：日志文件路径（相对项目根目录）
- `log.timezone`：日志时间时区偏移（例如 `8` 表示 UTC+8）
- `log.ipHeader`：记录的代理 IP 头（例如 `X-Forwarded-For`）

### 限流

- `rateLimit.enabled`：是否启用限流
- `rateLimit.timeWindow`：统计窗口（秒）
- `rateLimit.maxRequests`：窗口内最大请求数，设为 `0` 表示不限制
- `rateLimit.ipHeader`：用于识别客户端 IP 的请求头

## HTML 模板变量

当返回 `.html` 文件时会替换以下变量：

- `${projectName}` `${port}` `${staticDir}` `${apiDir}`
- `${rateLimitEnabled}` `${rateLimitStatus}` `${maxRequests}` `${timeWindow}`
- `${logEnabled}` `${logStatus}` `${timezone}`

## 生效方式

修改 `server-config.json` 后需要重启进程生效。

