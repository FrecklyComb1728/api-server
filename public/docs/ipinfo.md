# IP 信息查询接口（/v1/ipinfo）

查询 IP 的地理位置及 ISP 信息，多上游自动容灾。

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/ipinfo` | 查询当前请求来源 IP |
| `GET` | `/v1/ipinfo?ip=1.1.1.1` | 查询指定 IP |
| `GET` | `/v1/ipinfo/1.1.1.1` | 查询指定 IP（Path 参数） |

## 调用示例

```bash
# 查询当前 IP
curl http://api.mfawa.top/v1/ipinfo

# 查询指定 IP
curl http://api.mfawa.top/v1/ipinfo?ip=8.8.8.8
```

## 响应

```json
{
  "source": "ip9",
  "data": {
    "ip": "1.1.1.1",
    "country": "澳大利亚",
    "prov": "昆士兰州",
    "city": "布里斯班",
    "district": "",
    "isp": "APNIC",
    "lon": "153.021072",
    "lat": "-27.470125"
  },
  "raw_data": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | string | 数据来源 API 名称 |
| `data.ip` | string | 查询的 IP（缓存命中时注入） |
| `data.country` | string | 国家 |
| `data.prov` | string | 省份 |
| `data.city` | string | 城市 |
| `data.district` | string | 区县 |
| `data.isp` | string | ISP 运营商 |
| `data.lon` | string | 经度 |
| `data.lat` | string | 纬度 |
| `raw_data` | object | 上游原始响应 |

## 错误响应

| 状态码 | 场景 |
|--------|------|
| `500` | 所有上游均不可用或查询失败 |
| `429` | 触发限流 |

```json
{ "error": "所有API不可用" }
```

## 功能特性

- **多上游容灾**：配置多个 IP 查询 API，自动故障切换。
- **负载均衡**：`round_robin`（轮询）、`random`（随机）、`least_used`（最少使用）。
- **重试机制**：上游失败自动尝试下一个，可配置重试轮数。
- **/24 网段缓存**：同 C 段 IP 共享缓存，默认 7 天。
- **Redis 共享**：Redis 启用时多 worker 共享同一份缓存。
