# 费用控制与核对

2026-10-05 查阅 FAL 官方 [Sunburst 编辑接口](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api) 和 [价格说明](https://fal.ai/learn/tools/how-to-use-gpt-image-2-5)。该模型按 token 计费：说明页列出的 1024×1024 low 图片输出参考价格为 0.00588 美元，参考图及文本输入另计，最终金额以 FAL 账单为准。不能把这个数字当作所有编辑请求的固定总价。

本项目限制输出为一张低质量 1024 方图、输入最多 8 张且长边最多 1024、提示词最长 3500 字符。默认启用测试总额度限制（`BUDGET_LIMIT_ENABLED=true`），用每次 2 美元的高额预留和最多 4 次调用控制试用风险，共占用 8 美元本地额度；不自动返还、不自动充值、不自动进入下一轮。

设为 `BUDGET_LIMIT_ENABLED=false` 可同时取消累计调用次数和本地美元预留额的限制，之后不会因为达到 4 次或预留 8 美元停止生成。历史调用和预留计数仍持续记录，不是实际账单。此设置不重置每周 Credit、不改变群权限、不绕过 `PAID_ENABLED`；重新开启会按保留的累计值检查。改动后重启独立任务服务即可。

启用的预算检查与任务入队在同一进程中顺序完成，落盘后才发出 FAL 请求。提交状态为 `submitting` 时重启，会变成 `uncertain` 并停止重试。已取得 request_id 的任务只继续查询原请求。上游队列也设置 `X-Fal-No-Retry: 1`。

FAL Pricing API 返回的 `unit_price=1, unit=units` 是该端点的计费单位，不代表一次请求固定 1 美元。历史估价也不是最大费用保证，因此不会自动把估价当成账单扣减预留。

管理员在 FAL Dashboard 的请求和 Usage 中核对 `data/state.json` 内的 requestId。不要在群里贴 API key 或整个状态文件。若价格或模型规则改变，应先禁用付费生成并重新核对限制。

本服务不控制同一 FAL 账户里其他 Bot 功能。若账户启用了自动充值，请在 FAL 账户设置自行关闭，才能让余额成为账户级的额外约束。
