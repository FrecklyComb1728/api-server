# API Server

这是一个基于 Express 的 API 中转服务：自动加载 `v1/` 目录下的模块，并同时提供静态资源与 Markdown 文档访问。

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
- IP 查询：[ip.md](ip.md)
- 天气预报：[weather.md](weather.md)
- 随机图片：[img.md](img.md)

