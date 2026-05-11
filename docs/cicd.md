# CI/CD 零停机部署

基于 `webhook` + `PM2` 的零停机部署方案，不依赖 GitHub Actions。

## 文件清单

| 文件 | 说明 |
|------|------|
| `ecosystem.config.js` | PM2 配置（cluster 模式、max 进程数） |
| `deploy.sh` | 部署脚本（拉取代码、按需安装依赖、reload） |
| `webhook.example.json` | webhook 配置模板（需改名为 `webhook.json`） |
| `server-config.example.json` | 服务配置模板（需改名为 `server-config.json`） |

## 步骤

### 1. 环境准备

```bash
# 安装 PM2
npm install -g pm2

# 下载 webhook（二进制文件）
sudo curl -L -o /usr/local/bin/webhook \
  https://github.com/adnanh/webhook/releases/download/2.8.2/webhook-linux-amd64.tar.gz
sudo tar -xzf /usr/local/bin/webhook -C /tmp
sudo mv /tmp/webhook-linux-amd64/webhook /usr/local/bin/webhook
sudo chmod +x /usr/local/bin/webhook
```

### 2. 首次部署

```bash
cd /opt
git clone https://github.com/FrecklyComb1728/api-server.git
sudo chown -R webhook-deploy:webhook-deploy /opt/api-server
cd api-server

# 从示例文件创建实际配置
cp server-config.example.json server-config.json
# 编辑 server-config.json 调整配置

npm ci --registry=https://registry.npmmirror.com
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 配置开机自启
```

### 3. 部署脚本

`deploy.sh` 已包含在项目中，功能：

- 加锁防并发部署
- `git fetch` → `git reset --hard` 拉取最新代码
- 仅在 `package.json` 变动时重新 `npm ci`
- `pm2 reload` 零停机重启

设置权限：
```bash
chmod +x /opt/api-server/deploy.sh
chown webhook-deploy:webhook-deploy /opt/api-server/deploy.sh
```

### 4. Webhook 配置

```bash
cd /opt/api-server
cp webhook.example.json webhook.json
```

生成随机 secret：
```bash
openssl rand -hex 32
```

将输出填入 `webhook.json` 的 `secret` 字段。

### 5. 系统服务

创建 `/etc/systemd/system/webhook.service`：

```ini
[Unit]
Description=Webhook for API Server Deploy
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/api-server
ExecStart=/usr/local/bin/webhook -hooks /opt/api-server/webhook.json -port 9000
Restart=always
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/api-server/logs /tmp

[Install]
WantedBy=multi-user.target
```

启用：
```bash
sudo systemctl daemon-reload
sudo systemctl enable webhook
sudo systemctl start webhook
sudo systemctl status webhook
```

### 6. 开放端口

```bash
# ufw
sudo ufw allow 9000/tcp

# 或仅允许 GitHub IP 段
sudo ufw allow from 140.82.112.0/20 to any port 9000 proto tcp

# 云服务器需在安全组放行 9000 端口
```

### 7. GitHub Webhook

仓库 → Settings → Webhooks → Add webhook：

| 字段 | 值 |
|------|-----|
| Payload URL | `http://服务器IP:9000/hooks/deploy` |
| Content type | `application/json` |
| Secret | 与 `webhook.json` 一致 |
| Events | Just the `push` event |

### 8. 验证

```bash
# webhook 日志
sudo journalctl -u webhook -f

# PM2 状态
pm2 status

# 部署日志
tail -f /opt/api-server/logs/deploy.log
```

---

## 内地服务器优化

### npm 加速

部署脚本已配置 `--registry=https://registry.npmmirror.com`。

### Git 加速

```bash
git config --global url."https://gh.1s.fan/".insteadOf https://github.com/
```

### 代理

如有 HTTP 代理：
```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

---

## 故障排查

| 问题 | 检查 |
|------|------|
| webhook 不触发 | `journalctl -u webhook -f`，检查端口开放和 GitHub IP 可达 |
| 部署失败 | `cat logs/deploy.log`，确认 git fetch 成功、权限正确 |
| PM2 reload 失败 | `pm2 logs mifeng-api-server`，确认 `server.js` 正常 listen |
| 端口 9000 不通 | 云服务商安全组是否放行 |
