# KigCraft QQ

为 QQ / OneBot 机器人增加“连续收图 → FAL 生成头壳参考图 → 手机网页精修 → 回传 QQ”的独立项目。

编辑器复用 [KigCraft](https://github.com/icyqwq/KigCraft) 开源代码，采用 GPL-3.0-or-later。项目不使用 KigCraft 网站账号、额度或线上私有接口。

QQ 集成源码位于本仓库的 [`kigcraftqq` 分支](https://github.com/cloudris/KigCraft-QQ/tree/kigcraftqq)。分享时请使用该分支链接；`main` 保留上游版本。上游代码及原说明位于 `vendor/kigcraft`，本页和 `docs/DEPLOY.md` 对应 QQ 版部署。

## 群内使用

1. `@Bot 生成参考图 角色名或具体要求`
2. 在 5 分钟内连续发送最多 8 张图片，不必每张都 @。支持直接图片和回复图片；支持 PNG、JPEG、WebP，单张不超过 16 MB。
3. 发送 `发完了` 开始生成，或 `取消生成` 退出。
4. Bot 把结果发回原群，并在私信中提供专属编辑链接。需允许机器人发送私信；如果 QQ 阻止陌生人消息，先加 Bot 好友。
5. 网页中可标注、调脸型/眼睛/嘴巴、液化。手动保存免费并回传 QQ；AI 精修、局部生成、四视图各占一次付费调用，提交前会确认 Credit 消耗。

群内图片结果消息会保留 Credit 提示，并附上项目来源和 AI 提示（包含后续精修、四视图和手动保存回传）：

> 本功能基于开源项目 KigCraft（GitHub：icyqwq/KigCraft）开发。  
> 图片由 AI 生成，仅供设计参考，不能替代建模或制作图纸。

也支持 `@Bot 生成Kigurumi头壳参考图，角色和要求`、`@Bot 生成头壳参考图：角色和要求`、`@Bot 制作头壳参考图 角色和要求` 和 `@Bot kig开始`。命令与要求之间可用空格、逗号或冒号；开始后仍需上传参考图，再发 `发完了`。

只有指定群、指定用户主动开始的收图会话被处理。普通未 @ 群聊不进入模型；不需要改变原来的 `requireMention=true`。

## 每周 Credit

每个 QQ 号默认每周 8 Credit，跨所有开放群、编辑链接和任务共用。新头壳第一次成功生成消耗 1 Credit，同一头壳后续每次 AI 精修、局部生成、四视图或重新生成消耗 0.5 Credit。手动调整保存不消耗 Credit；收图、取消、重复消息和重复提交也不扣额度。结果消息和编辑页均显示剩余额度。

北京时间每周日 **23:59:00** 自动进入新周期，未用完的不累计。按提交时间所属周期预留，跨周完成仍结算到原周期；不需要定时任务或重启。明确生成失败释放 Credit，网络故障导致提交结果不明时继续保留预留，等待管理员核对，不自动重试。

`CREDIT_EXEMPT_USERS` 中的账号免每周限额；启用全局 FAL 预算保护时仍受其限制。Credit 是本地使用额度，不是美元余额。历史任务不追扣，新版部署后开始记账；旧任务已有生成结果时继续编辑按 0.5 Credit。

开放权限：`ALLOWED_GROUPS` 是群范围；`PUBLIC_GROUPS` 指定其中对全员开放的群，其他群仍遵守 `ALLOWED_USERS`。原 OneBot 黑名单等规则继续生效。只开放新群不等于开放其他 FAL 工具或普通未 @ 群聊。

## 本地演示（不收费）

需要 Node.js 22 以上、npm。先执行：

```sh
git clone --branch kigcraftqq --single-branch https://github.com/cloudris/KigCraft-QQ.git kigcraft-qq
cd kigcraft-qq
npm ci --ignore-scripts
npm --prefix vendor/kigcraft/frontend ci --ignore-scripts
npm run build
npm test
npm run demo
```

打开终端显示的本机链接。演示图是本项目绘制的几何测试图，不调用 FAL。演示模式的“保存”写入测试回传队列，不会真的发送 QQ。演示任务位于 `data/demo`。

## Linux 部署

详细步骤见 [部署说明](docs/DEPLOY.md)。主要组件：

- `server/`：绑定本机端口的任务、图片、预算与 FAL 服务。
- `adapters/onebot-bridge.mjs`：在原 OneBot 连接中提前接收收图消息、回传结果。
- `vendor/kigcraft/frontend/`：可手机访问的原始编辑器与 QQ 页面。
- `scripts/`：可重复执行的安装补丁、原有重启脚本集成、源码打包。
- `test/`：会话隔离、断线、去重、费用拦截、图片权限、局部编辑及适配器测试。

没有把管理员 QQ、群号或服务器地址写死在逻辑中。复制 `.env.example` 配置自己的部署。已有 FAL 密钥只放服务器 `.env`，不会发送给浏览器。

## FAL 费用与可选测试限制

默认 `PAID_ENABLED=false`。启用后使用 FAL `openai/gpt-image-2.5/sunburst/edit`，每次固定 `1024×1024`、`quality=low`、`num_images=1`，最多 8 张已缩小的参考图。

默认 `BUDGET_LIMIT_ENABLED=true`，本轮最多 **4 次调用**，每次**预留 2 美元**，共 **8 美元**，给 10 美元账户余额保留余量。预留是保守的本地额度，不是账单，也不按日自动刷新。失败或未知提交仍占用预留，防止重复提交。管理员核对 FAL 请求记录后再决定如何调整；勿删除 `data/state.json` 来“重置”额度。

正式使用时可设 `BUDGET_LIMIT_ENABLED=false`，同时取消累计调用次数和美元预留额两项拦截。每周 Credit、群权限、付费总开关及防重复提交仍生效；历史计数和 Credit 账本保持原样。只需重启独立的 `kigcraft-qq.service`，不需要重启 OpenClaw。重新启用此开关会按历史累计值检查，不会开始新的测试轮次。

FAL 按实际 token/图片用量收费，本服务无法锁住其他插件的消费，也不能替 FAL 设置账户级账单上限。请关闭账户自动充值；测试期间避免其他图片功能同时消费。价格依据、参数限制和核对方法见 [费用说明](docs/BUDGET.md)。

## 版本边界

- 示例默认仅开放配置的管理员；通过 `PUBLIC_GROUPS` 开放群友，`WEEKLY_CREDITS` 设置每周额度。
- 这是概念参考图和像素编辑，不是头壳 3D 模型或加工图纸；四视图仍可能不完全一致。
- 与 KigCraft 线上版本可能不同；当前开源编辑器没有截图中的独立“眉毛”入口。
- 局部生成把结果合成到涂选区域，区域外保留原图；边缘质量仍需人工检查。
- 五官识别在浏览器运行，较老手机首次加载会慢，可直接拖动关键点修正。
- 链接是 48 小时的随机访问凭证，持有者能编辑该任务，不等于 QQ 身份登录。请勿转发。生产部署必须使用 HTTPS。
- 多人同时处理的生成队列串行；提交结果不明时停止重试，已有 FAL 请求可在服务重启后继续查询。
- QQ 回传采用至少一次投递：极端情况下 QQ 已发送、确认前断线，可能重复一条结果；不会因此重复生成或再次收费。
- 用户图片和任务存储在本机 `data`，不会包含在分享包里。链接过期不自动删除数据，管理员需自行安排备份和清理。

## 分享或上传 GitHub

运行 `python scripts/package.py`，得到 `source.zip`（全部对应源码）和 `kigcraft-qq-release.zip`（含网页构建产物）。二者均排除 `.env`、`data`、依赖目录、日志和任务图片。不要直接压缩整台服务器的工作目录。

发布前保留 `LICENSE`、`COPYING`、`NOTICE.md` 和上游文件。此项目可以独立建仓库，不需要连同你的其他 Bot 配置公开。
