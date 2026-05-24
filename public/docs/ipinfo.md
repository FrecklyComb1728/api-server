# IP 信息查询接口（/v1/ipinfo）

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/ipinfo` | 查询当前请求来源 IP |
| `GET` | `/v1/ipinfo?ip=1.1.1.1` | 查询指定 IP |
| `GET` | `/v1/ipinfo/1.1.1.1` | 查询指定 IP（Path 参数） |

## 调用示例

```bash
curl http://api.mfawa.top/v1/ipinfo
curl http://api.mfawa.top/v1/ipinfo?ip=114.114.114.114
```

## 响应

```json
{
  "source": "bt.cn",
  "data": {
    "ip": "114.114.114.114",
    "country": "中国",
    "prov": "江苏",
    "city": "南京",
    "district": "",
    "isp": "114DNS",
    "lon": "118.767413",
    "lat": "32.041544"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | string | 数据来源 API |
| `data.ip` | string | 查询的 IP |
| `data.country` | string | 国家 |
| `data.prov` | string | 省份 |
| `data.city` | string | 城市 |
| `data.district` | string | 区县 |
| `data.isp` | string | ISP 运营商 |
| `data.lon` | string | 经度 |
| `data.lat` | string | 纬度 |

字段为空字符串表示该上游未返回此信息。

## 错误响应

| 状态码 | 场景 |
|--------|------|
| `500` | 所有上游均不可用或查询失败 |
| `429` | 触发限流 |

```json
{ "error": "所有API不可用" }
```

```json
{ "error": "请求过于频繁，请稍后重试" }
```

上游失败时自动重试其他 API，最多重试 3 轮。全部失败才返回 500。
