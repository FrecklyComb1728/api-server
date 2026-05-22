# API 文档

基于 Express 的 API 聚合服务，自动加载 `v1/` 目录下的模块。

## API 概览

| 模块 | 路径 | 说明 |
|------|------|------|
| 随机图片 | `/v1/img` | 横/竖屏自适应，302/json/text/img |
| IP 查询 | `/v1/ipinfo` | 多上游容灾，自动重试 + 负载均衡 |
| 天气 | `/v1/weather` | IP 定位城市，实时 + 7 天预报 |

查看所有端点：`GET /v1/meta`

## 通用约定

**基础 URL**：`http://api.mfawa.top`

**响应格式**：成功返回 JSON，失败返回 `{ "error": "..." }` 或 HTTP 状态码对应错误页。

**限流**：每 IP 100 次 / 60 秒，超出返回 `429`。

## 快速调用

```bash
# 获取所有模块元数据
curl http://api.mfawa.top/v1/meta

# 随机一张图片（302 跳转）
curl -L http://api.mfawa.top/v1/img

# 查询当前 IP 信息
curl http://api.mfawa.top/v1/ipinfo

# 北京天气
curl http://api.mfawa.top/v1/weather?city=北京
```

## 详细文档

- [IP 查询](ip.md)
- [天气预报](weather.md)
- [随机图片](img.md)
