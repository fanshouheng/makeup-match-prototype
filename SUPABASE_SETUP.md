# Supabase 公开博主库部署

本文件供项目开发和部署使用。面向用户的产品说明位于 `README.md`，审核流程位于 `docs/ADMIN_REVIEW.md`。

## 1. 初始化数据库

使用 `supabase db push` 按文件名顺序执行 `supabase/migrations/` 中的全部迁移，不要手工跳过文件。`202607170003_lock_creator_submission_writes.sql` 会关闭匿名数据库与 Storage 直写；`20260727090637_fix_plus_invite_redeem_conflict.sql` 因历史排序问题保留为无操作迁移；`20260807090000_security_hardening.sql` 会再次关闭匿名直写、恢复最终邀请码函数、增加匿名事件限流，并为新写入的创作者特征向量增加数据库约束。

全新环境必须从空数据库执行完整迁移集。已有环境部署前先运行 `supabase migration list`，确认迁移历史；不要通过改名或手工跳过迁移来消除差异。

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
# 只有完成供应商测试、webhook、退款和小额验收后才设为 true
VITE_ENABLE_ONLINE_CHECKOUT=false
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
ADMIN_USER_IDS=允许签发邀请码和访问管理台的已确认 Auth 用户 UUID，多个值用英文逗号分隔
ENABLE_MALE_FACE_REPORT=false
# 商业化支付：MAKE UP Pro 价格和积分在 membership_plans 表中维护
STRIPE_SECRET_KEY=仅写入 Edge Function Secrets
STRIPE_WEBHOOK_SECRET=仅写入 Edge Function Secrets
ZPAY_PID=仅写入 Edge Function Secrets
ZPAY_KEY=仅写入 Edge Function Secrets
ZPAY_NOTIFY_URL=https://你的域名/functions/v1/payment-webhook
ZPAY_RETURN_URL=https://你的域名/report
ZPAY_TYPE=wxpay
```

多个允许域名使用英文逗号分隔。不要在 `ALLOWED_ORIGINS` 中使用 `*`。

管理员权限只按不可变的 Auth 用户 UUID 判断，不按邮箱字符串判断。先在 Supabase Authentication 中确认管理员账号已完成邮箱验证，再把其 UUID 写入 `ADMIN_USER_IDS`；不要把普通 Plus 用户 UUID 加入该变量。生产环境应开启邮箱确认，并为管理员启用 MFA。

本地联调时可以临时增加 `ALLOW_LOCAL_ORIGINS=true`，完成测试后应删除或改回 `false`。正式 Turnstile 站点也必须允许相应的本地域名。

`ARK_API_KEY` 和 `ARK_MODEL` 供 `plus-makeup-report` 使用。Supabase 托管的 Edge Function 会自动提供 `SUPABASE_URL`、`SUPABASE_SECRET_KEYS` 等项目级变量，不要把这些值提交到 Git，也不要在日志中输出任何完整密钥。

`DEEPSEEK_API_KEY` 供 `male-face-report` 和 `plus-makeup-report` 使用，函数固定调用 DeepSeek 对话 API 的 `deepseek-v4-pro`。密钥只能写入 Edge Function Secrets；已经粘贴到聊天、Issue、日志或前端环境变量中的密钥必须先撤销并轮换，不能继续部署使用。

对应火山引擎账号必须先开通方舟联网搜索插件；未开通时接口会返回 `ToolNotOpen`，前端显示“AI 联网搜索尚未完成配置”。不要在插件未开通、未完成一次真实联网请求前发布 AI 入口。

在 Supabase Dashboard -> Authentication -> URL Configuration 中，把正式站点设为 Site URL，并把账号确认邮件使用的 `https://你的域名/` 和管理员邮箱链接使用的 `https://你的域名/admin` 加入 Redirect URLs；需要本地联调时再临时加入对应本地地址。普通账号与 Plus 复用 `make-up-plus-auth` 本地存储键，已有账号可直接兑换 Plus 邀请码；`/admin` 使用独立登录态，不会被覆盖。保持 `sessions_single_per_user=false` 以允许多设备分别登录；退出管理台时只退出当前设备。

支付函数为 `create-payment-checkout`、`payment-status`、`payment-webhook` 和 `refund-payment`。正式目录为：100 积分单次报告（¥19.9 / US$2.99）、1000 积分月卡（¥59 / US$8.99，每天 50 次普通匹配）和年卡（¥599 / US$89.99，普通匹配不限次并连续 12 个月每月发 2000 积分）。客户端只提交供应商与商品代码；服务端读取金额、币种、积分和匹配权益。Stripe 根据月卡或年卡周期创建订阅 Checkout，只在确认付款后幂等发分；ZPAY 使用 `submit.php` POST 表单并在回调核对商户号、签名、金额和 `TRADE_SUCCESS`。年卡首月支付确认后发首月积分，后续由 `grant-due-annual-subscription-cycles` 定时任务按月发放，禁止一次性预发。管理员可按内部订单 ID 发起全额退款；积分已使用时自动退款会被阻止。不要把商户密钥、回调原文或付款凭证写入仓库、日志或数据库。

截至 2026-09-18，生产已部署统一钱包、会员订阅、正式目录、旧 Plus 转换、人工会员管理与商业概览迁移，以及对应订阅和支付 Edge Functions。`ZPAY_TYPE` 已明确设置为 `alipay`；Stripe Secrets 和真实支付验收尚未完成。支付验收完成前保持源码支付硬门槛和 `VITE_ENABLE_ONLINE_CHECKOUT=false`。

## 5. 部署并验证 Edge Function

部署 `supabase/functions/submit-creator/index.ts`。该公开函数必须设置 `verify_jwt = false`，因为它使用 Turnstile 和函数内限流完成自己的授权检查。

完成以下验证：

1. 未完成 Turnstile 时前端不能提交。
2. 有效 Turnstile token 可以提交一条 `pending` 申请。
3. 同一 IP 或邮箱一小时内第 4 次提交返回限流提示。
4. 非允许域名不能调用函数。
5. 失败的数据库写入不会留下孤立照片。
6. 匿名用户仍不能读取 `creator_submissions`。
7. 女生申请保存为 `women + makeup`，男生申请能保存所选的形象参考、发型或妆容方向。

## 6. 核验匿名直写已关闭

迁移完成后确认以下两个写策略均不存在：

- `anyone can submit a pending creator application`
- `anyone can upload a creator submission photo`

然后再次验证：

- 浏览器直接写 `creator_submissions` 被拒绝。
- 浏览器直接上传 `creator-photos/submissions/` 被拒绝。
- 通过 `submit-creator` Edge Function 仍能正常提交。

## 7. 退役独立 AI 推荐

原结果页的 3 积分独立 AI 博主推荐已经退役。部署当前 `supabase/functions/ai-creator-discovery/index.ts` 作为兼容处理器，并保持 `verify_jwt = true`；允许来源的旧客户端请求应返回 HTTP 410 和 `feature_retired`，不得校验照片、预占积分、调用第三方 AI 或写入新的推荐日志。历史账本用途、事件和聚合表继续保留，只用于解释旧记录。

## 8. 部署并验证男生 DeepSeek 报告

男生报告没有公开入口时保持 `ENABLE_MALE_FACE_REPORT=false` 或不设置。需要重新开放时，部署 `supabase/functions/male-face-report/index.ts`，设置 `verify_jwt = false` 和 `ENABLE_MALE_FACE_REPORT=true`；函数会验证允许来源、Turnstile、同意版本、固定九项比例、数值范围、报告模式、文风和原子 IP 限流。

上线前验证：

1. 未勾选同意或未完成 Turnstile 时，前端不会调用 Edge Function。
2. 请求只包含九项精确比例、固定模式、固定文风、同意版本和 Turnstile token；不包含照片、关键点、姓名、设备标识、创作者信息或会话 ID。
3. 非允许来源、额外字段、缺失比例、超出范围的数值和错误同意版本会被拒绝。
4. 男生报告每 IP 每小时最多 3 次，只保存加盐单向哈希，不保存原始 IP 或面部比例。
5. DeepSeek 只接受服务端 Secret，浏览器产物和网络响应中不出现 `DEEPSEEK_API_KEY`。
6. DeepSeek 输出必须是 3 至 5 项结构化 JSON；未知或重复特征、过长内容和禁用羞辱词会被拒绝。
7. MAKE UP 数据库、Storage 和函数日志中没有精确比例、完整提示词或生成报告。
8. 页面明确标注 AI 生成，并说明 DeepSeek 可能依其规则处理必要的安全与运行日志。

## 9. 产品事件与管理台指标

部署 `supabase/functions/record-product-event/index.ts`，并保持 `verify_jwt = false`。该函数只接受允许来源提交的随机会话 UUID、固定事件名，以及分析失败时可选的固定原因代码；同一加盐 IP 哈希每小时最多写入 120 次。结构化“不符合”反馈还必须携带 1 至 3 个当前公开博主 UUID 的无顺序集合、`weighted-rms-v1` 算法版本、至少一个固定原因，以及可选的最多 160 字“其他”原因。`product_events` 与 `match_negative_feedback` 都不向 `anon` 或 `authenticated` 开放读取或直写权限。

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

管理台的“AI 调用”页签按产品数据页选择的日期范围显示调用数、成功率、最近记录平均耗时、固定语言/市场/平台分布和最多 50 条调用记录。只有真正发送到第三方 AI 服务的请求会计入；安全验证失败、限流和无效图片不会计入。

## 10. 审核与维护

申请默认进入 `pending`，不会自动公开。身份核验、批准、拒绝、撤回和删除步骤见 `docs/ADMIN_REVIEW.md`。

普通用户的默认匹配照片只在浏览器本地处理；最近一次有效分析可写入当前浏览器 IndexedDB，供同一设备的报告页恢复，不进入 Supabase 数据库或 Storage，也不跨设备同步。只有博主申请时主动提交的授权照片会进入服务端持久化存储。

## 11. 部署并验证账号与旧 Plus 兼容

执行 Plus 与安全硬化迁移后，部署 `supabase/functions/plus-access/index.ts`，并保持 `verify_jwt = false`。新账号只通过 Supabase Auth 标准注册和确认邮件创建；`status`、`redeem` 和 `issue` 在函数内部验证 JWT，`redeem` 要求邮箱已确认，`issue` 还要求用户 UUID 存在于 `ADMIN_USER_IDS`。浏览器端不得接触 `service_role` 或 secret key。上线前验证：

1. 当前浏览器前 3 次女生成功匹配未登录可用；失败和同一照片重试不计。之后接受邀请所得匹配次数；账号存在有效 Plus 时普通匹配不限次，且不扣本机免费次数或邀请次数。Plus 到期或撤销后恢复原有余额规则。
2. 新用户注册后必须先点击确认邮件，再登录并兑换有效邀请码；未确认邮箱不能激活 Plus。
3. 普通账号和 Plus 复用 `make-up-plus-auth` 存储键，不会覆盖 `/admin` 的管理员登录态。
4. 邮箱与管理员邮箱相同但 UUID 未授权的账号调用管理接口和 `issue` 均返回 `not_admin`；管理员签发后只收到一次邀请码明文，数据库只有 64 位哈希。
5. 无效、过期或已被其他账号兑换的邀请码分别被拒绝。
6. 两个已确认账号同时兑换同一邀请码时只有一个成功；成功账号能读取自己的权益，不能读取其他账号或邀请码表。
7. 执行上线迁移后，仍有效的旧 Plus 状态变为 `revoked`，创建 1 个月 `pro_monthly` 订阅并只发一次 1000 积分；原剩余期限不折算，重复执行不得重复发分。
8. `/report` 直接展示照片与报告生成流程，并在顶部和摘要显示登录账号的积分余额；`/account` 独立处理登录、注册和旧 Plus 兼容兑换，`/plus` 自动转到 `/report`，线上开关关闭时不得创建订单。

## 12. 部署并验证积分妆造报告

执行 `20260913090000_unified_points_wallet.sql` 和 `20260918100000_launch_membership_catalog.sql` 后，部署 `plus-makeup-report` 并保持 `verify_jwt = true`。函数检查登录态、至少 100 积分、允许来源、同意版本、场景、方向和九项比例值域。报告生成不要求 Turnstile。上线前验证：

1. 未登录、积分少于 10 或未同意时不能创建任务；有效登录用户不被 Turnstile 阻塞。
2. `start` 请求只包含九项精确比例、1 至 3 个场景、一个妆造方向和同意版本；不包含照片、关键点、姓名、设备标识、本地排名或博主库数据。
3. DeepSeek 输出只接受严格 JSON：一份结构报告、正好 3 套方案、每套 5 至 7 个步骤，以及边界说明；肤色、肤质、眼皮形态等未提供信息必须列为限制，不能虚构。
4. 豆包只接收场景、妆造方向和由服务端允许列表提取的妆容关键词，不接收照片、九项精确比例或 DeepSeek 自由文本；只返回 1 至 5 个无链接的公开博主名字，并设置 `store: false`。
5. `start` 原子预占 100 积分并立即返回任务 ID；同一账号只能有一个处理中任务。失败、第二次恢复仍失败或过期时只退分一次，余额不能扣成负数或重复退回。
6. 积分更新只使用 Edge Function 内的服务端密钥；`anon` 和 `authenticated` 不能直接修改钱包或预占表。
7. 私有任务表暂存账号 ID、九项比例、场景、妆造方向和生成结果，不保存照片、关键点、完整提示词、设备标识或本地排名。生成成功或失败时立即清除精确比例；失败时同时清除配置和报告；成功报告写入当前浏览器 IndexedDB 后，前端调用 `ack` 删除整个任务。
8. 博主名字明确标为未核验线索，不自动进入公开创作者库，也不能据此下载或分析候选照片。
9. `status` 在用户刷新、切出或重新进入后返回同一任务；处理超过 3 分钟时最多恢复一次，第二次仍未完成则失败并退款。
10. `pg_cron` 中存在 `cleanup-plus-makeup-jobs`，每小时执行一次；任务有效期为 23 小时，过期处理任务会退款，所有过期任务会在 24 小时内删除。检查 `cron.job_run_details` 确认清理成功。
11. `plus_makeup_jobs` 已启用 RLS，`public`、`anon`、`authenticated` 对表和三个 `SECURITY DEFINER` 函数均无权限，只有 `service_role` 可调用；上线后运行数据库安全和性能 Advisors。

## 13. 部署并验证邀请与积分

执行统一积分迁移后，部署 `rewards-access` 并设置 `verify_jwt = true`。验证：

1. 邀请链接只携带 10 位随机代码，不包含用户 ID；受邀账号必须确认邮箱并成功完成一次女生匹配才算有效。
2. 每个有效邀请给邀请人 3 次匹配和 3 积分，受邀人 3 积分；邀请人 30 天最多获得 5 位奖励。
3. 普通匹配次数不能由管理台单独出售或发放；管理员只可按已确认邮箱发放正整数积分。
4. 旧 `ai_discovery` 预占与流水只做历史兼容；新前端和退役接口都不得创建新的 3 积分预占。
5. 历史遗留且超过 10 分钟未提交的预占仍由 `cleanup-point-reservations` 每 15 分钟退回；检查 `cron.job_run_details`。
6. `reward_*` 表均启用 RLS，`anon` 和 `authenticated` 无权直读或修改。记录中没有照片、面部比例、匹配结果、创作者名字、AI 内容、设备身份或付款凭证。
