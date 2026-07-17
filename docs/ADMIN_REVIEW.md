# 博主入库审核 SOP

本文件供项目运营人员使用，不是用户说明。审核在 Supabase Dashboard 中完成，不需要把 secret key 放进浏览器或本地前端。

## 1. 查看待审申请

```sql
select
  id,
  name,
  contact_email,
  douyin_url,
  tutorial_url,
  reference_photo_path,
  submitted_at
from public.creator_submissions
where status = 'pending'
order by submitted_at asc;
```

不要把联系邮箱、未审核照片或完整申请表复制到公开文档、聊天群或问题追踪系统。

## 2. 核验主页归属

至少完成以下一项：

1. 使用申请邮箱联系申请人，请对方从抖音主页公开联系方式回复。
2. 请申请人在主页简介中临时放置一次性核验文字，核验后删除。
3. 已经建立直接联系时，通过抖音账号私信确认申请编号。

同时检查：

- 申请名称与主页主体一致。
- 正脸照属于申请人本人，并明确同意用于公开匹配。
- 照片清晰、单人、正面，不含其他人的个人信息。
- 代表教程来自申请主页或获得了明确授权。

核验通过后记录时间：

```sql
update public.creator_submissions
set ownership_verified_at = now()
where id = '申请 UUID'
  and status = 'pending';
```

## 3. 批准入库

```sql
select public.approve_creator_submission('申请 UUID');
```

批准后检查公开博主库：名称、授权照片、主页和教程链接应正确显示，联系邮箱不应出现。

## 4. 拒绝申请

```sql
update public.creator_submissions
set
  status = 'rejected',
  reviewed_at = now(),
  review_note = '简短、客观的拒绝原因'
where id = '申请 UUID'
  and status = 'pending';
```

随后在 Supabase Storage 的 `creator-photos` 桶中删除该申请的 `reference_photo_path`。不要直接删除 `storage.objects` 表记录；应使用 Storage Dashboard 或 Storage API，确保底层文件同时删除。

确认照片删除后，可以删除不再需要保留的拒绝申请：

```sql
delete from public.creator_submissions
where id = '申请 UUID'
  and status = 'rejected';
```

## 5. 撤回、下架与删除

收到申请人请求后，先通过原联系邮箱或主页归属重新核验身份。

立即停止公开展示：

```sql
update public.creators
set is_active = false, updated_at = now()
where submission_id = '申请 UUID';
```

确认页面不再展示后：

1. 在 Storage Dashboard 删除对应授权照片。
2. 删除公开记录。
3. 删除原申请记录。

```sql
delete from public.creators
where submission_id = '申请 UUID';

delete from public.creator_submissions
where id = '申请 UUID';
```

## 6. 日常维护

每周检查：

- 是否存在超过 7 天未处理的待审申请。
- 是否存在数据库写入失败后留下的孤立照片。
- 是否有失效的抖音主页或教程链接。
- Edge Function 是否出现大量 `captcha_failed`、`rate_limited` 或上传失败日志。

限流表只保存加盐哈希，可以清理超过 24 小时的窗口：

```sql
delete from public.creator_submission_rate_limits
where window_started_at < now() - interval '24 hours';
```

审核记录只写完成判断所需的信息，不额外收集身份证、手机号、住址等资料。
