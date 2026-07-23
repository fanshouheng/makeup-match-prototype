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
  reference_audience,
  content_types,
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
- 参考页面与申请人的公开内容一致。
- 形象参考、发型或妆容等内容方向与代表内容一致。
- 代表内容来自申请主页或获得了明确授权。

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

批准后检查公开创作者库：名称、授权照片、主页、参考页面、内容方向和代表内容链接应正确显示，联系邮箱不应出现。

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

## 6. 查看产品数据

打开生产站点的 `/admin`，使用已授权管理员邮箱登录，再切换到“产品数据”页签。页面默认显示最近 7 天的匿名标签页会话指标：

- 有效访问：至少进入过一次公开产品的会话数。
- 选择照片率：`选择照片会话 / 有效访问会话`。
- 女生模式选图会话：在女生模式选择过照片的会话数，以及占全部选图会话的比例。
- 男生模式选图会话：在男生模式选择过照片的会话数，以及占全部选图会话的比例。
- 分析完成率：`分析成功会话 / 选择照片会话`。
- 结果到达率：`结果展示会话 / 分析成功会话`。
- 反馈率：`提交符合或不符合的会话 / 结果展示会话`。
- 结果符合率：`符合反馈 /（符合反馈 + 不符合反馈）`。
- 博主点击率：`点击过任一创作者主页或代表内容的会话 / 结果展示会话`。
- 分享率：`首次成功分享会话 / 结果展示会话`。

同一会话的同一事件只计一次；同时体验女生和男生模式时会分别计入两项，因此两项比例之和可能超过 100%。统计不包含照片、面部比例、匹配分数、创作者名称、具体链接、排序或邮箱，也不能用于识别具体用户。指标从对应记录功能上线后开始累计，没有历史补录。

需要在 Supabase SQL Editor 复核原始事件数量时，可以运行：

```sql
select event_name, count(*) as sessions
from public.product_events
where created_at >= now() - interval '7 days'
group by event_name
order by event_name;
```

## 7. 日常维护

每周检查：

- 是否存在超过 7 天未处理的待审申请。
- 是否存在数据库写入失败后留下的孤立照片。
- 是否有失效的抖音主页或代表内容链接。
- Edge Function 是否出现大量 `captcha_failed`、`rate_limited` 或上传失败日志。

限流表只保存加盐哈希，可以清理超过 24 小时的窗口：

```sql
delete from public.creator_submission_rate_limits
where window_started_at < now() - interval '24 hours';
```

产品事件只用于短期产品验证。需要延长统计周期或导出数据前，先复核隐私说明和最小化原则，不要加入会话以外的用户标识或任何匹配内容。

审核记录只写完成判断所需的信息，不额外收集身份证、手机号、住址等资料。
