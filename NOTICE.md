# 来源与改动

本项目是独立的 QQ / OneBot 集成试用版，不是 KigCraft 官方服务。

- 上游：<https://github.com/icyqwq/KigCraft>
- 固定版本：`229c76ac67771d7256930ee64eb8b313c1aab707`
- 上游许可证：GPL-3.0-or-later；完整上游源代码保留在 `vendor/kigcraft`。
- 新增：Node 任务服务、FAL 队列、QQ 收图适配器、费用预留、任务访问控制、安装/重启补丁、测试、中文说明。
- 2026-10-06 至 2026-10-08：补充自然语言命令兼容、公开群权限、跨群共享的每周 Credit、管理员豁免、结果来源与 AI 提示、可关闭的测试总额度，以及 GitHub 分支下载说明。QQ 版源码：<https://github.com/cloudris/KigCraft-QQ/tree/kigcraftqq>。
- 改动日期：2026-10-05。前端入口 `src/main.tsx` 改为 QQ 编辑页，增加 `src/bot`；`EditorWorkspace.tsx` 保存操作交给调用方；页面标题改为本项目名称。其余原始服务源码保留供查阅，不作为本项目运行后端。
- `COPYING` 是从 GNU 官方取得的 GPL v3 全文。本项目及修改部分按 GPL-3.0-or-later 提供。
- npm 依赖各自使用原有许可证，以 lockfile 固定版本。前端模型、WASM、原始图标随上游保留；本项目不宣称拥有其商标、作者身份或额外授权。

部署网页时，请保留“下载本部署完整源码”链接，并运行打包脚本生成与部署代码对应的源码包。发布修改版时也请更新本文件并包含修改后的源码、构建脚本、许可证及依赖清单。密钥、QQ 收图、账单状态和用户任务不属于公开源码，必须排除。
