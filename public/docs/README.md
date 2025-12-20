# API Server

一个基于 Nodejs 的 API Server：自动加载 `api/` 目录下的模块，并同时提供静态资源与 Markdown 文档访问

## 运行

```bash
pnpm install
pnpm start
```

开发模式：

```bash
pnpm dev
```

启动后访问：`http://localhost:8633/`

## 文档

- 配置：[config.md](config.md)
- 插件：[plugin.md](plugin.md)
- API：
  - IP 查询：[ip.md](ip.md)
  - 天气预报：[weather.md](weather.md)

## 已实现 API

### IP 查询

- `GET /api/ipinfo`
- `GET /api/ipinfo?ip={ip}`
- `GET /api/ipinfo/{ip}`

返回为统一结构：

```json
{
  "source": "ip9",
  "data": {
    "ip": "1.2.3.4",
    "city": "...",
    "country": "...",
    "isp": "..."
  },
  "raw_data": {}
}
```

### 天气

三个入口返回同一结构，且 `realtime` 在上、`week` 在下：

- `GET /api/weather?city={城市}`
- `GET /api/weather/realtime?city={城市}`
- `GET /api/weather/week?city={城市}`

也支持通过 IP 推断城市：

- `GET /api/weather?ip={ip}`
- `GET /api/weather`（默认使用请求来源 IP）

返回结构：

```json
{
  "success": true,
  "data": {
    "realtime": {
      "ip": "1.2.3.4",
      "city": "北京",
      "high": "3",
      "low": "3",
      "temperature": "3",
      "weather": "阴",
      "wind": "西北风",
      "windSpeed": "3级",
      "visibility": "30km",
      "humidity": "44%",
      "time": "04:13:49",
      "date": "2025/12/20"
    },
    "week": [
      {
        "date": "2025/12/20",
        "wind": "北风",
        "windSpeed": "微风",
        "weather": "中雨转小雨",
        "temperature": "9℃",
        "week": "星期六"
      }
    ]
  }
}
```

