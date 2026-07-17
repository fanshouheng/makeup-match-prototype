# Supabase 公开博主库配置

## 1. 创建并初始化项目

1. 在 Supabase 创建项目。
2. 在 SQL Editor 执行 `supabase/migrations/202607170001_public_creator_library.sql`。
3. 从 Project Settings -> API 获取 Project URL 和 anon key。
4. 复制 `.env.example` 为 `.env.local` 并填入真实值：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

重启 Vite 后，公开库和申请提交功能才会连接 Supabase。

## 2. 审核申请

前端提交的资料默认进入 `creator_submissions`，状态为 `pending`，不会自动公开。

1. 通过联系邮箱核验申请人确实控制其抖音主页。
2. 在 Supabase 后台记录核验时间：

```sql
update public.creator_submissions
set ownership_verified_at = now()
where id = '申请 UUID';
```

3. 确认名称、主页、教程和照片无误后批准：

```sql
select public.approve_creator_submission('申请 UUID');
```

批准函数会把可公开字段复制到 `creators`，联系邮箱不会进入公开表。需要拒绝时，在后台把 `status` 改为 `rejected`，同时填写 `reviewed_at` 和 `review_note`。

## 3. 上线前检查

- 当前存储桶限制为 5 MB，仅接受 JPEG、PNG 和 WebP。
- 普通用户的匹配照片只在浏览器本机处理；只有博主申请时主动上传的授权照片会进入 Supabase。
- 匿名上传可能产生“照片上传成功、资料写入失败”的孤立文件。应定期清理没有对应 `creator_submissions` 记录的 `submissions/` 文件。
- 正式公开部署前应在申请入口增加 CAPTCHA 和服务端限流，避免匿名上传滥用。RLS 不能替代反滥用措施。
- 不要把 service role key 放入 Vite 环境变量或任何前端代码。

## 4. 本地验证

```powershell
npm test
npm run build
npm run dev
```

验证路径：公开博主库为空 -> 打开申请表 -> 上传正脸照并通过质量检查 -> 提交后在 `creator_submissions` 看到 `pending` 记录 -> 核验并批准 -> 博主出现在公开库并参与匹配。
