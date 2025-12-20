# 天气信息接口

提供实时天气和 7 天天气预报查询服务，聚合多个主流天气服务商数据。

## 接口列表

### 1. 综合天气查询
- **路径**: `GET /api/weather`
- **说明**: 同时返回实时天气 (`realtime`) 和 7 天预报 (`week`)。
- **参数**:
    - `city` (Query, 可选): 城市名称（如：北京）。
    - `ip` (Query, 可选): 根据 IP 自动推断城市。
- **示例**: `GET /api/weather?city=北京`

### 2. 实时天气
- **路径**: `GET /api/weather/realtime`
- **说明**: 仅返回实时天气数据。
- **示例**: `GET /api/weather/realtime?city=北京`

### 3. 7天预报
- **路径**: `GET /api/weather/week`
- **说明**: 仅返回 7 天天气预报。
- **示例**: `GET /api/weather/week?city=北京`

## 响应结构

### 实时天气 (realtime)
```json
{
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
}
```

### 7天预报 (week)
```json
[
  {
    "date": "2025/12/20",
    "wind": "北风",
    "windSpeed": "微风",
    "weather": "中雨转小雨",
    "temperature": "9℃",
    "week": "星期六"
  },
  ...
]
```

## 功能特性
- **城市自动识别**: 支持通过 `city` 参数直接查询，或通过 `ip` 自动识别城市。
- **多源备份**: 实时天气支持 MSN、高德、52vmy、苏晏等，预报支持 CMA、Sojson。
- **智能匹配**: 支持城市名后缀（省/市/区）的自动补全与模糊匹配。
