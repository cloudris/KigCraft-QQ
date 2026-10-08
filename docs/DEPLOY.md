# 部署与回滚

## 安装

以运行 OpenClaw 的普通用户操作，不能用 root 写入该用户的插件目录。把项目放在 `~/kigcraft-qq`。

```sh
git clone --branch kigcraftqq --single-branch https://github.com/cloudris/KigCraft-QQ.git ~/kigcraft-qq
cd ~/kigcraft-qq
npm ci --omit=dev --ignore-scripts
# 若分享包已带构建产物，不必在服务器重新构建前端
npm --prefix vendor/kigcraft/frontend ci --ignore-scripts
npm run build
cp .env.example .env
chmod 600 .env
```

配置 `.env`：FAL_KEY、PUBLIC_URL（HTTPS 地址）、ALLOWED_GROUPS、ALLOWED_USERS；用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 创建 INTERNAL_TOKEN。测试阶段保留费用参数；确认后才把 PAID_ENABLED 改成 true。

全员开放的群同时填入 `ALLOWED_GROUPS` 和 `PUBLIC_GROUPS`。其他允许群继续由 `ALLOWED_USERS` 控制。把管理员 QQ 填入 `CREDIT_EXEMPT_USERS`，`WEEKLY_CREDITS=8`。修改配置后重启 `kigcraft-qq.service` 并使用 `~/restart-bot.sh` 重载 OneBot 适配器。周额度数据保存在 `data/state.json`，必须保留；不要通过删除状态来重置额度。重置时间固定为北京时间周日 23:59，与 Linux 的时区无关。

```sh
mkdir -p ~/.config/systemd/user
cp deploy/kigcraft-qq.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kigcraft-qq.service
node scripts/patch-onebot.mjs
node scripts/integrate-restart.mjs
~/restart-bot.sh
```

补丁脚本适配 `@kirigaya/openclaw-onebot` 的现有 JS 结构；未知版本会停止，不会猜位置修改。可传入 dist 的绝对路径。原文件保存 `.pre-kigcraft.bak`。它保留原有 OneBot peer/video 补丁及 BAONLY 重启步骤；独立任务服务使用 start，不会因为 Bot 重启打断 FAL 任务。

使用自己的 Caddy/Nginx 域名把 HTTPS 反向代理到 `127.0.0.1:18940`。阻止公网访问 `/internal/*`，参考 `deploy/Caddyfile.example`。内部接口同时要求本机来源与独立密钥。不要直接把 Node 端口绑定公网。

无域名试用可以运行 `node scripts/tunnel.mjs`，通过已有 Cloudflare Tunnel 程序提供临时 HTTPS 地址。此方式地址可能在隧道重启后改变，旧 QQ 链接失效。仅适合试用；正式分享部署建议固定域名。隧道程序会把新地址写入 `data/public-url.txt`，新任务自动使用新地址。

正式使用时如需取消测试总额度，设 `BUDGET_LIMIT_ENABLED=false`，再执行 `systemctl --user restart kigcraft-qq.service`。这项设置不在 OneBot 适配器中，无需重启 Bot；不要删除状态文件。每周 Credit 和开放群范围继续生效。

## 检查

```sh
curl http://127.0.0.1:18940/health
systemctl --user status kigcraft-qq.service
journalctl --user -u kigcraft-qq.service -n 30
```

从允许的账号在允许的群开始收图，确认非管理员能在 `PUBLIC_GROUPS` 发起任务，其他群和普通未 @ 消息不受影响。将 `ALLOWED_USERS` 留空会开放所有允许群，通常应保留管理员列表，仅通过 `PUBLIC_GROUPS` 开放指定群。同时重新评估全局付费额度；它不会随每周 Credit 重置。

## 停用或回滚

先把 `.env` 的 `PAID_ENABLED=false`，重启独立服务可禁止新付费提交；已有请求仅继续查结果。不要清空任务状态。

`scripts/uninstall.mjs` 只移除自身补丁、恢复重启调用，不覆盖之后别人对插件做的改动；停止 `kigcraft-qq.service` 后运行它，再用原 `~/restart-bot.sh` 重启。保留数据目录以便核对未完成请求。彻底删除前请自行备份。

升级 OneBot 后使用 `~/restart-bot.sh` 会重新检查并应用补丁；如果插件结构变化，脚本报错时应停止并核对，不要强行继续。
