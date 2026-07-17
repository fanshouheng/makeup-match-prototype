# 妆容参照

一个隐私优先的妆容博主相似匹配原型。用户选择正脸照片后，应用在浏览器本地提取面部比例，并与公开博主库进行相似度比较，返回更接近的博主主页和代表教程。

这个项目比较的是面部结构比例，不进行身份识别，也不输出审美、医学或人格判断。

## 隐私边界

普通用户的匹配照片不会上传到服务器：

- 原图只通过浏览器内存中的 Object URL 读取。
- MediaPipe 人脸模型和 WASM 在应用本地运行。
- 提取出的面部特征只保存在当前页面内存中。
- 相似度排序在浏览器本地完成。
- Supabase 只向浏览器提供已经审核通过的博主资料和特征向量。

唯一会上传照片的入口是“博主申请入库”。申请人主动提交授权正脸照、联系邮箱和主页信息，资料进入私有待审核表，不会自动公开。

| 场景 | 原图 | 面部特征 | 后端用途 |
| --- | --- | --- | --- |
| 普通用户匹配 | 仅本地处理 | 仅本地处理 | 下载公开博主库 |
| 博主申请入库 | 上传授权照片 | 上传 | 身份核验和入库审核 |

服务器或托管平台仍可能记录常规的 IP、请求时间和浏览器信息，但普通用户的匹配照片及其面部特征不在请求中。

## 当前功能

- 选择本地照片或使用手机拍照。
- 检查人脸数量、亮度、尺寸、倾斜、侧脸角度和嘴部状态。
- 基于 9 项归一化面部比例计算相似度。
- 从公开博主库返回最多 3 位相似博主。
- 展示匹配原因、博主主页和代表教程。
- 博主本人提交主页、邮箱、授权正脸照和可选教程。
- 申请默认进入 `pending`，管理员核验主页归属后才能公开。
- Supabase RLS 隔离私有申请资料和公开博主资料。

## 技术栈

- React 19 + TypeScript + Vite
- MediaPipe Tasks Vision
- Supabase Database + Storage + Row Level Security
- Vitest
- Lucide React

## 本地运行

环境要求：Node.js 20.19+ 或 22.12+。

```powershell
git clone https://github.com/fanshouheng/makeup-match-prototype.git
cd makeup-match-prototype
npm install
Copy-Item .env.example .env.local
npm run dev
```

`npm install` 会下载 MediaPipe 模型到 `public/mediapipe/`。该目录和 `.env.local` 不会提交到 Git。

在 `.env.local` 中填写自己的 Supabase 项目配置：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

前端只能使用 anon key 或现代 publishable key。不要把 service role key 放入 Vite 环境变量。

## 初始化 Supabase

1. 创建一个独立的 Supabase 项目。
2. 执行迁移文件：

   `supabase/migrations/202607170001_public_creator_library.sql`

3. 配置 `.env.local` 并重启 Vite。

迁移会创建：

- `creator_submissions`：私有申请表，匿名用户只能写入，不能读取。
- `creators`：公开博主表，匿名用户只能读取已启用记录。
- `creator-photos`：私有照片桶，仅允许读取已审核博主引用的照片。
- `approve_creator_submission(uuid)`：管理员审批函数。

更完整的部署、审核和安全说明见 [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)。

## 审核博主申请

申请不会自动公开。管理员需要先确认申请人能够控制其抖音主页，然后记录核验时间并执行审批：

```sql
update public.creator_submissions
set ownership_verified_at = now()
where id = '申请 UUID';

select public.approve_creator_submission('申请 UUID');
```

审批函数只把公开字段复制到 `creators`，联系邮箱保留在私有申请表中。

## 测试与构建

```powershell
npm test
npm run build
```

当前测试覆盖面部特征提取、照片质量检查、匹配排序和 Supabase 公开数据映射。

## 上线前仍需完成

- 在匿名申请入口增加 CAPTCHA 和服务端限流。
- 定期清理上传成功但申请写入失败产生的孤立照片。
- 准备隐私政策、博主授权说明和删除/撤回渠道。
- 用足够规模且经过授权的博主库验证匹配质量。
- 增加真实移动设备和不同光照条件下的回归测试。

当前版本是产品验证原型，不应把相似度结果解释为身份判断或专业建议。
