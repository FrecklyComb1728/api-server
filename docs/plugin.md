# 插件

系统会在启动时扫描 `api/` 目录下的子目录：只要目录内存在 `index.js`，就会自动挂载到 `/api/{目录名}`。

## 规则

- 目录：`api/{name}/`
- 入口：`api/{name}/index.js`
- 挂载：`/api/{name}`
- 导出：必须导出一个 `express.Router()`

## 示例

创建 `api/hello/index.js`：

```js
const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  const name = req.query.name ? String(req.query.name) : 'World';
  res.json({
    success: true,
    data: {
      message: `Hello, ${name}`
    }
  });
});

module.exports = router;
```

访问：

- `GET /api/hello`
- `GET /api/hello?name=mifeng`

## 请求与中间件

- JSON 请求体：已启用（`core/app.js:19`）
- URL 解码：已启用（`core/app.js:16`）
- CORS：已启用（`core/app.js:17`）
- 访问日志与限流：全局生效（`core/app.js:22`、`core/app.js:25`）

## 常用做法

### 读取同目录配置

```js
const path = require('path');

const config = require(path.join(__dirname, 'config.json'));
```

### 处理错误

```js
router.get('/demo', (req, res) => {
  if (!req.query.id) {
    return res.status(400).json({ success: false, message: '缺少 id' });
  }
  res.json({ success: true });
});
```

## 生效方式

新增或删除插件需要重启进程；使用 `pnpm dev` 时，Node 会在文件变化后自动重启。

