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

第二、三个迁移只增加私有限流能力并显式拒绝客户端访问，不会关闭现有提交入口。第四个迁移为现有申请和公开创作者补充参考页面与内容方向，已有记录默认保持为“女生 + 妆容”。第五个迁移创建匿名会话事件表。第六个迁移约束女生参考只使用妆容内容，第七个迁移补充访问和创作者链接点击事件，第八、九个迁移分别补充男生和女生模式选图事件；产品事件表不向匿名或已登录客户端开放读写权限。第十个迁移创建私有博主跟进台账，只允许 `service_role` 访问，不能向 `anon` 或 `authenticated` 授权。第十一个迁移为分析失败增加固定原因代码；旧事件保持未分类，不做历史猜测。

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
```

多个允许域名使用英文逗号分隔。不要在 `ALLOWED_ORIGINS` 中使用 `*`。

本地联调时可以临时增加 `ALLOW_LOCAL_ORIGINS=true`，完成测试后应删除或改回 `false`。正式 Turnstile 站点也必须允许相应的本地域名。

Supabase 托管的 Edge Function 会自动提供 `SUPABASE_URL`、`SUPABASE_SECRET_KEYS` 等项目级变量，不要把这些值提交到 Git。

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

## 7. 产品事件与管理台指标

部署 `supabase/functions/record-product-event/index.ts`，并保持 `verify_jwt = false`。该函数只接受允许来源提交的随机会话 UUID、固定事件名，以及分析失败时可选的固定原因代码；`product_events` 不向 `anon` 或 `authenticated` 开放读取或直写权限。

重新部署 `supabase/functions/admin-review/index.ts`，让受保护的 `/admin` 管理台读取最近 7 天的访问、选图、女生与男生模式选图、分析、结果、反馈、创作者链接点击和分享聚合指标。验证：

1. 允许来源的合法事件返回 `recorded`。
2. 非法事件名、额外字段和非 UUID 会话标识被拒绝。
3. 匿名客户端不能直接读取 `product_events`。
4. 同一会话重复提交同一事件时，表中仍只有一条记录。
5. 点击事件中不包含创作者名称、ID、链接或结果名次。
6. 分析失败只接受 `no_face`、`multiple_faces`、`too_dark`、`pose_issue` 或 `component_error`；其他事件携带原因字段时被拒绝。
7. 失败事件不带原因时仍可写入，兼容已缓存的旧页面，并在管理台显示为旧版本未分类。

## 8. 审核与维护

申请默认进入 `pending`，不会自动公开。身份核验、批准、拒绝、撤回和删除步骤见 `docs/ADMIN_REVIEW.md`。

普通用户的匹配照片只在浏览器本地处理。只有博主申请时主动提交的授权照片会进入 Supabase。
