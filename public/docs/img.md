# 随机图片接口（/v1/img）

从上游聚合的图片列表中随机抽选，支持多种输出格式。

## 端点速览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/img` | 随机一张（UA 自适应横/竖屏） |
| `GET` | `/v1/img/h` | 随机一张（强制横屏） |
| `GET` | `/v1/img/v` | 随机一张（强制竖屏） |
| `GET` | `/v1/img/list` | 图片列表（UA 自适应） |
| `GET` | `/v1/img/list/h` | 图片列表（强制横屏） |
| `GET` | `/v1/img/list/v` | 图片列表（强制竖屏） |

## 通用参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `type` | string | `302` | 返回格式：`302` / `json` / `text` / `img` |

---

## 1. 随机图片

### 1.1 302 重定向

```bash
curl -L http://api.mfawa.top/v1/img
```

响应：`302 Found` → `Location: https://cdn.mfawa.top/image/background/xxx.png`

### 1.2 JSON

```bash
curl http://api.mfawa.top/v1/img?type=json
```

```json
{
  "status": "success",
  "time": 1730000000000,
  "data": {
    "id": "1",
    "name": "100066591_p0.png",
    "url": "https://cdn.mfawa.top/image",
    "path": "/background/100066591_p0.png",
    "fullUrl": "https://cdn.mfawa.top/image/background/100066591_p0.png"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.id` | string | 序号（从 "1" 开始） |
| `data.name` | string | 文件名 |
| `data.url` | string | 基础 URL |
| `data.path` | string | 图片路径（`/` 开头） |
| `data.fullUrl` | string | 完整图片 URL |

### 1.3 纯文本

```bash
curl http://api.mfawa.top/v1/img?type=text
```

```
https://cdn.mfawa.top/image/background/100066591_p0.png
```

### 1.4 图片流

```bash
curl http://api.mfawa.top/v1/img?type=img -o img.png
```

服务端代理拉取图片并流式返回，响应头（Content-Type、Content-Length、ETag）尽量与上游一致。

---

## 2. 图片列表

### 2.1 JSON 列表

```bash
curl http://api.mfawa.top/v1/img/list?type=json
```

```json
{
  "status": "success",
  "total": 3,
  "time": 1730000000000,
  "data": [
    { "id": "1", "name": "100066591_p0.png", "url": "https://cdn.mfawa.top/image", "path": "/background/100066591_p0.png" },
    { "id": "2", "name": "100257227_p0.png", "url": "https://cdn.mfawa.top/image", "path": "/background/100257227_p0.png" }
  ]
}
```

### 2.2 纯文本列表

```bash
curl http://api.mfawa.top/v1/img/list?type=text
```

```
https://cdn.mfawa.top/image/background/100066591_p0.png
https://cdn.mfawa.top/image/background/100257227_p0.png
```

---

## 3. User-Agent 规则

命中任一关键词则判定为竖屏，否则横屏：

`Mobile` `Android` `iPhone` `iPad` `iPod` `HarmonyOS` `Windows Phone`

---

## 4. 错误响应

| 状态码 | 场景 |
|--------|------|
| `400` | `type` 值不合法（仅支持 `302`/`json`/`text`/`img`） |
| `502` | 上游请求失败或图片列表为空 |
| `429` | 触发限流 |

```json
{ "status": "error", "time": 1730000000000, "message": "未获取到图片列表" }
```

---

## 5. 缓存与并发

- 缓存 TTL 由 `config.json` 的 `cache_ttl`（秒）控制。
- **Redis 模式**：多 worker 共享缓存，分布式锁防止并发重复拉取。
- **内存模式**：进程内缓存，stale-while-revalidate（过期返回旧数据并后台刷新）。
- 启动时自动预热横屏 + 竖屏两个缓存桶。
