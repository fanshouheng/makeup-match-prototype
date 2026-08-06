# Supabase 公开博主库部署

本文件供项目开发和部署使用。面向用户的产品说明位于 `README.md`，审核流程位于 `docs/ADMIN_REVIEW.md`。

## 1. 初始化数据库

按顺序执行：

1. `supabase/migrations/202607170001_public_creator_library.sql`
2. `supabase/migrations/202607170002_creator_submission_rate_limit.sql`
3. `supabase/migrations/202607170004_explicit_rate_limit_denial.sql`
4. `supabase/migrations/20260722071544_add_creator_reference_modes.sql`
5. `supabase/migrations/20260722094929_product_event_metrics.sql`
6. `supabase/migrations/20260723054229_enforce_creator_reference_modes.sql`
7. `supabase/migrations/20260723054251_extend_product_event_metrics.sql`
8. `supabase/migrations/20260723060615_add_men_photo_selected_metric.sql`
9. `supabase/migrations/20260723080320_add_women_photo_selected_metric.sql`
10. `supabase/migrations/20260723092337_creator_outreach_tracking.sql`
11. `supabase/migrations/20260723173725_add_analysis_failure_reason.sql`
12. `supabase/migrations/20260723174626_add_creator_platform_support.sql`
13. `supabase/migrations/20260723124712_ai_creator_discovery_rate_limit.sql`
14. `supabase/migrations/20260723232454_ai_creator_discovery_logs.sql`
15. `supabase/migrations/20260727114006_plus_invite_memberships.sql`
16. `supabase/migrations/20260727125231_match_negative_feedback.sql`
17. `supabase/migrations/20260731092923_plus_makeup_background_jobs.sql`
18. `supabase/migrations/20260806150000_referral_reward_wallets.sql`

第二、三个迁移只增加私有限流能力并显式拒绝客户端访问，不会关闭现有提交入口。第四个迁移为现有申请和公开创作者补充参考页面与内容方向，已有记录默认保持为“女生 + 妆容”。第五个迁移创建匿名会话事件表。第六个迁移约束女生参考只使用妆容内容，第七个迁移补充访问和创作者链接点击事件，第八、九个迁移分别补充男生和女生模式选图事件；产品事件表不向匿名或已登录客户端开放读写权限。第十个迁移创建私有博主跟进台账，只允许 `service_role` 访问，不能向 `anon` 或 `authenticated` 授权。第十一个迁移为分析失败增加固定原因代码；旧事件保持未分类，不做历史猜测。第十二个迁移增加抖音/小红书平台与通用主页字段，并保留旧抖音字段用于滚动部署兼容。第十三个迁移为可选 AI 推荐创建私有限流表和原子计数函数。第十四个迁移创建私有 AI 调用日志，只保存时间、状态、耗时、固定错误分类和参考模式。第十五个迁移创建私有一次性邀请码和用户自读的 Plus 权益表，并提供仅 `service_role` 可调用的原子兑换函数。第十六个迁移创建结构化负反馈表。第十七个迁移创建仅 `service_role` 可访问的 Plus 后台任务表、原子预占/退款函数和每小时过期清理任务。第十八个迁移创建私有邀请关系、匹配与 AI 次数钱包、不可变交易记录、原子扣退函数和超时 AI 预扣清理任务；这些表不向浏览器角色开放。

暂时不要执行 `202607170003_lock_creator_submission_writes.sql`。它会关闭浏览器直接写数据库和存储的旧入口，应在 Edge Function 验证成功后最后执行。

如果新项目关闭了 Data API 的自动授权，在启用 RLS 后还需要允许匿名客户端读取公开博主表：

```sql
grant usage on schema public to anon;
grant select on table public.creators to anon;
```

不要向 `anon` 或 `authenticated` 授予 `creator_submissions` 的读取权限。

## 2. 配置前端

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key
VITE_PRIVACY_CONTACT_EMAIL=privacy@example.com
VITE_CONTACT_WECHAT_QR_URL=/wechat-contact.jpg
VITE_CONTACT_DOUYIN_URL=https://www.douyin.com/user/your-profile
```

前端只能使用 anon key 或现代 publishable key。不要把 service role key、secret key 或 Turnstile secret 放入 Vite 环境变量。

## 3. 创建 Turnstile 站点

在 Cloudflare Turnstile 中创建站点，把正式部署域名和需要使用的预览域名加入允许列表，获得 site key 和 secret key。

site key 写入前端环境变量 `VITE_TURNSTILE_SITE_KEY`。secret key 只写入 Supabase Edge Function Secrets。

## 4. 配置 Edge Function Secrets

在 Supabase Dashboard -> Edge Functions -> Secrets 中添加：

```text
CLOUDFLARE_SECRET_KEY=Turnstile secret key
ALLOWED_ORIGINS=https://makeup.soul.xn--fiqs8s,https://makeup-match-prototype.vercel.app
RATE_LIMIT_SALT=至少 32 个随机字符
ARK_API_KEY=火山引擎方舟 API Key
ARK_MODEL=支持图片理解与联网搜索的模型或推理接入点 ID
DEEPSEEK_API_KEY=DeepSeek 开放平台 API Key
ADMIN_EMAILS=允许签发邀请码和访问管理台的邮箱，多个邮箱用英文逗号分隔
```

多个允许域名使用英文逗号分隔。不要在 `ALLOWED_ORIGINS` 中使用 `*`。

本地联调时可以临时增加 `ALLOW_LOCAL_ORIGINS=true`，完成测试后应删除或改回 `false`。正式 Turnstile 站点也必须允许相应的本地域名。

`ARK_API_KEY` 和 `ARK_MODEL` 供 `ai-creator-discovery` 和 `plus-makeup-report` 使用。Supabase 托管的 Edge Function 会自动提供 `SUPABASE_URL`、`SUPABASE_SECRET_KEYS` 等项目级变量，不要把这些值提交到 Git，也不要在日志中输出任何完整密钥。

`DEEPSEEK_API_KEY` 供 `male-face-report` 和 `plus-makeup-report` 使用，函数固定调用 DeepSeek 对话 API 的 `deepseek-v4-pro`。密钥只能写入 Edge Function Secrets；已经粘贴到聊天、Issue、日志或前端环境变量中的密钥必须先撤销并轮换，不能继续部署使用。

对应火山引擎账号必须先开通方舟联网搜索插件；未开通时接口会返回 `ToolNotOpen`，前端显示“AI 联网搜索尚未完成配置”。不要在插件未开通、未完成一次真实联网请求前发布 AI 入口。

在 Supabase Dashboard -> Authentication -> URL Configuration 中，把正式站点设为 Site URL，并把账号确认邮件使用的 `https://你的域名/` 和管理员邮箱链接使用的 `https://你的域名/admin` 加入 Redirect URLs；需要本地联调时再临时加入对应本地地址。普通账号与 Plus 复用 `make-up-plus-auth` 本地存储键，已有账号可直接兑换 Plus 邀请码；`/admin` 使用独立登录态，不会被覆盖。

## 5. 部署并验证 Edge Function

部署 `supabase/functions/submit-creator/index.ts`。该公开函数必须设置 `verify_jwt = false`，因为它使用 Turnstile 和函数内限流完成自己的授权检查。

先保持旧匿名策略存在，完成以下验证：

1. 未完成 Turnstile 时前端不能提交。
2. 有效 Turnstile token 可以提交一条 `pending` 申请。
3. 同一 IP 或邮箱一小时内第 4 次提交返回限流提示。
4. 非允许域名不能调用函数。
5. 失败的数据库写入不会留下孤立照片。
6. 匿名用户仍不能读取 `creator_submissions`。
7. 女生申请保存为 `women + makeup`，男生申请能保存所选的形象参考、发型或妆容方向。

## 6. 关闭匿名直写

Edge Function 验证通过后，执行：

`supabase/migrations/202607170003_lock_creator_submission_writes.sql`

然后再次验证：

- 浏览器直接写 `creator_submissions` 被拒绝。
- 浏览器直接上传 `creator-photos/submissions/` 被拒绝。
- 通过 `submit-creator` Edge Function 仍能正常提交。

## 7. 部署并验证 AI 推荐

部署 `supabase/functions/ai-creator-discovery/index.ts`，并设置 `verify_jwt = true`。该函数由网关和函数内部共同校验登录态，同时验证允许来源、Turnstile、同意版本、JPEG 文件头、请求大小和每 IP 每小时 3 次的限流。

上线前验证：

1. 未登录时不能调用；未展开、未勾选同意或未完成 Turnstile 时，前端不会发送照片。
2. 浏览器只发送最长边不超过 1024 像素、大小不超过 1.5 MB 的 JPEG 副本。
3. 非允许来源、无效图片、错误同意版本或第 4 次请求会被拒绝。
4. AI 响应只接受 1 至 5 个名字，不接受链接、换行或额外字段。
5. `store: false` 生效，MAKE UP 数据库和 Storage 中没有照片副本、AI 结果或名字。
6. 候选博主照片不会被下载或分析，AI 名字不会自动进入公开创作者库。
7. 缺少 `ARK_API_KEY` 或 `ARK_MODEL` 时返回 `service_not_configured`；联网搜索插件未开通时返回 `web_search_not_configured`。
8. 真正发送到 AI 服务的请求会记录固定运行元数据；日志不包含照片、面部比例、提示词、返回名字、推荐结果、原始 IP 或用户 ID。

## 8. 部署并验证男生 DeepSeek 报告

部署 `supabase/functions/male-face-report/index.ts`，并设置 `verify_jwt = false`。该公开函数只接受允许来源，并在函数内验证 Turnstile、同意版本、固定九项比例、数值范围、报告模式、文风和共享 AI 限流。

上线前验证：

1. 未勾选同意或未完成 Turnstile 时，前端不会调用 Edge Function。
2. 请求只包含九项精确比例、固定模式、固定文风、同意版本和 Turnstile token；不包含照片、关键点、姓名、设备标识、创作者信息或会话 ID。
3. 非允许来源、额外字段、缺失比例、超出范围的数值和错误同意版本会被拒绝。
4. 男生报告与 AI 联网推荐共享每 IP 每小时 3 次的限流，只保存加盐单向哈希，不保存原始 IP 或面部比例。
5. DeepSeek 只接受服务端 Secret，浏览器产物和网络响应中不出现 `DEEPSEEK_API_KEY`。
6. DeepSeek 输出必须是 3 至 5 项结构化 JSON；未知或重复特征、过长内容和禁用羞辱词会被拒绝。
7. MAKE UP 数据库、Storage 和函数日志中没有精确比例、完整提示词或生成报告。
8. 页面明确标注 AI 生成，并说明 DeepSeek 可能依其规则处理必要的安全与运行日志。

## 9. 产品事件与管理台指标

部署 `supabase/functions/record-product-event/index.ts`，并保持 `verify_jwt = false`。该函数只接受允许来源提交的随机会话 UUID、固定事件名，以及分析失败时可选的固定原因代码。结构化“不符合”反馈还必须携带 1 至 3 个博主 UUID 的无顺序集合、`weighted-rms-v1` 算法版本、至少一个固定原因，以及可选的最多 160 字“其他”原因。`product_events` 与 `match_negative_feedback` 都不向 `anon` 或 `authenticated` 开放读取或直写权限。

重新部署 `supabase/functions/admin-review/index.ts`，让受保护的 `/admin` 管理台按所选北京时间日期范围读取访问、选图、女生与男生模式选图、分析、结果、反馈、创作者链接点击和分享聚合指标；未传日期的旧版管理台请求仍读取最近 7×24 小时。验证：

1. 允许来源的合法事件返回 `recorded`。
2. 非法事件名、额外字段和非 UUID 会话标识被拒绝。
3. 匿名客户端不能直接读取 `product_events`。
4. 同一会话重复提交同一事件时，表中仍只有一条记录。
5. 点击事件中不包含创作者名称、ID、链接或结果名次。
6. 分析失败只接受 `no_face`、`multiple_faces`、`too_dark`、`pose_issue` 或 `component_error`；其他事件携带原因字段时被拒绝。
7. 失败事件不带原因时仍可写入，兼容已缓存的旧页面，并在管理台显示为旧版本未分类。
8. 结构化负反馈只接受 `analysis_incorrect`、`creator_mismatch`、`style_mismatch`、`problem_not_solved`、`other`，并拒绝重复博主 ID、未知算法版本、空原因和超长文本。
9. 结构化负反馈表中没有照片、面部比例、匹配分数、博主名称、链接或推荐顺序；管理台只汇总原因数量，满 50 条前显示继续收集。

管理台的“AI 调用”页签显示最近 7 天的调用数、成功率、最近记录平均耗时和最多 50 条调用记录。只有真正发送到第三方 AI 服务的请求会计入；安全验证失败、限流和无效图片不会计入。

## 10. 审核与维护

申请默认进入 `pending`，不会自动公开。身份核验、批准、拒绝、撤回和删除步骤见 `docs/ADMIN_REVIEW.md`。

普通用户的默认匹配照片只在浏览器本地处理；最近一次有效分析可写入当前浏览器 IndexedDB，供同一设备的 Plus 会员页恢复，不进入 Supabase 数据库或 Storage，也不跨设备同步。可选 AI 推荐仅在登录后转发用户单独同意的压缩副本，不写入 Supabase 数据库或 Storage，也不在调用日志保存用户 ID；只有博主申请时主动提交的授权照片会进入服务端持久化存储。

## 11. 部署并验证 Plus 邀请账号

执行第十五个迁移后，部署 `supabase/functions/plus-access/index.ts`，并保持 `verify_jwt = false`。`register` 在登录前调用，因此网关不预先校验 JWT；函数会先校验邮箱、密码和一次性邀请码，再通过服务端创建已确认邮箱的 Supabase Auth 用户并原子兑换邀请码，兑换失败时删除刚创建的用户。`status`、`redeem` 和 `issue` 仍在函数内部验证 JWT，`issue` 还会校验 `ADMIN_EMAILS`。浏览器端不得接触 `service_role` 或 secret key。上线前验证：

1. 当前浏览器前 3 次女生成功匹配未登录可用；失败和同一照片重试不计，之后只接受邀请所得匹配次数。
2. 已有账号登录后可以兑换有效邀请码；新用户填写邮箱、至少 8 位密码和有效邀请码后可直接注册激活，不发送确认邮件。
3. 普通账号和 Plus 复用 `make-up-plus-auth` 存储键，不会覆盖 `/admin` 的管理员登录态。
4. 非管理员调用 `issue` 返回 `not_admin`；管理员签发后只收到一次邀请码明文，数据库只有 64 位哈希。
5. 无效、过期或已被其他账号兑换的邀请码分别被拒绝；创建账号后若原子兑换失败，函数会清理刚创建的账号，并应在上线验证中确认没有留下可登录但未激活的孤立账号。
6. 两个账号同时使用同一邀请码注册或兑换时只有一个成功；成功账号能读取自己的权益，不能读取其他账号或邀请码表。
7. 激活后显示 3 次报告额度和 180 天有效期；当前 9.9 元内测包将其表述为 1 份正式报告和 2 次内测重试。会员页能从当前浏览器 IndexedDB 恢复最近一次有效分析和真实生成成功的报告。网站数据库和 Storage 中没有密码明文、普通用户照片、付款凭证或微信聊天；Plus 任务可按第 12 节边界临时保存比例、配置和报告。
8. `/plus` 不展示收款码、不声明自动确认付款，并要求用户付款前在微信确认名额、交付内容、时间和退款方式。

## 12. 部署并验证 Plus 妆造报告

执行第十七个迁移后，部署 `supabase/functions/plus-makeup-report/index.ts`，并保持 `verify_jwt = true`。网关和函数内部都会验证登录态；函数还会检查 Plus 权益、剩余额度、允许来源、同意版本、场景数量、妆造方向、九项比例键和值域。Plus 登录生成不要求 Turnstile；男生报告、AI 联网推荐和博主申请的 Turnstile 保持不变。函数支持 `start`、`status`、`ack` 三个动作，并通过 `EdgeRuntime.waitUntil()` 在首次请求返回后继续处理。上线前验证：

1. 未登录、权益失效、额度为 0 或未同意时不能创建任务；有效登录用户不再被 Turnstile 阻塞。
2. `start` 请求只包含九项精确比例、1 至 3 个场景、一个妆造方向和同意版本；不包含照片、关键点、姓名、设备标识、本地排名或博主库数据。
3. DeepSeek 输出只接受严格 JSON：一份结构报告、正好 3 套方案、每套 5 至 7 个步骤，以及边界说明；肤色、肤质、眼皮形态等未提供信息必须列为限制，不能虚构。
4. 豆包只接收场景、妆造方向、DeepSeek 生成的结构文字摘要和方案重点，不接收照片或九项精确比例；只返回 1 至 5 个无链接的公开博主名字，并设置 `store: false`。
5. `start` 原子预占 1 次额度并立即返回任务 ID；同一账号只能有一个处理中任务。失败、第二次恢复仍失败或过期时只退款一次，额度不能扣成负数或重复退回。
6. 额度更新只使用 Edge Function 内的服务端密钥；`anon` 和 `authenticated` 仍不能直接修改 `plus_memberships`。
7. 私有任务表暂存账号 ID、九项比例、场景、妆造方向和生成结果，不保存照片、关键点、完整提示词、设备标识或本地排名。生成成功或失败时立即清除精确比例；失败时同时清除配置和报告；成功报告写入当前浏览器 IndexedDB 后，前端调用 `ack` 删除整个任务。
8. 博主名字明确标为未核验线索，不自动进入公开创作者库，也不能据此下载或分析候选照片。
9. `status` 在用户刷新、切出或重新进入后返回同一任务；处理超过 3 分钟时最多恢复一次，第二次仍未完成则失败并退款。
10. `pg_cron` 中存在 `cleanup-plus-makeup-jobs`，每小时执行一次；任务有效期为 23 小时，过期处理任务会退款，所有过期任务会在 24 小时内删除。检查 `cron.job_run_details` 确认清理成功。
11. `plus_makeup_jobs` 已启用 RLS，`public`、`anon`、`authenticated` 对表和三个 `SECURITY DEFINER` 函数均无权限，只有 `service_role` 可调用；上线后运行数据库安全和性能 Advisors。

## 13. 部署并验证邀请与 AI 次数

执行第十八个迁移后，部署 `supabase/functions/rewards-access/index.ts` 并设置 `verify_jwt = true`，再重新部署 `ai-creator-discovery`。验证：

1. 邀请链接只携带 10 位随机代码，不包含用户 ID；受邀账号必须确认邮箱并成功完成一次女生匹配才算有效。
2. 每个有效邀请给邀请人 3 次匹配和 1 次 AI 推荐，受邀人 1 次 AI 推荐；邀请人 30 天最多获得 5 位奖励。
3. 匹配次数不能由管理台购买；管理员只能在人工确认 ¥9.9 后按已确认邮箱发放固定 10 次 AI 推荐。
4. AI 推荐在所有输入、安全验证和 IP 限流通过后预扣 1 次；上游失败或无效响应退回，成功后提交扣次。
5. 超过 10 分钟未提交的 AI 预扣由 `cleanup-reward-ai-reservations` 每 15 分钟退回；检查 `cron.job_run_details`。
6. `reward_*` 表均启用 RLS，`anon` 和 `authenticated` 无权直读或修改。记录中没有照片、面部比例、匹配结果、创作者名字、AI 内容、设备身份或付款凭证。
