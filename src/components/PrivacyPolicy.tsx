import { Database, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import { privacyContactEmail } from "../config";

export function PrivacyPolicy() {
  return (
    <main className="privacy-page">
      <div className="page-heading privacy-heading">
        <div>
          <p className="eyebrow">PRIVACY / 最后更新：2026-07-22</p>
          <h1>隐私说明</h1>
        </div>
        <p className="heading-note">普通匹配与博主申请是两条独立的数据流程</p>
      </div>

      <div className="privacy-intro">
        <ShieldCheck size={28} />
        <div>
          <h2>用于匹配的照片不会上传</h2>
          <p>
            普通用户选择的照片、从照片中提取的面部比例和最终相似度排序，只在当前浏览器中处理。刷新或关闭页面后，本次照片与分析结果不会保留。
          </p>
        </div>
      </div>

      <section className="privacy-section">
        <Database size={21} />
        <div>
          <h2>访问公开博主库时</h2>
          <p>
            应用会从服务器下载已审核博主的公开资料、授权照片和面部比例，用于在你的设备上完成比较。服务器和托管服务可能记录常规的 IP、请求时间、浏览器类型和错误信息，但请求中不包含你的匹配照片或面部比例。
          </p>
          <p>
            为评估识别完成率、结果符合率和分享率，应用会记录选择照片、识别成功或失败、结果展示、你主动选择的“符合/不太符合”，以及首次成功分享。Supabase 只接收当前标签页会话的随机标识和事件名称，Vercel Analytics 记录聚合访问与产品事件；两者都不会收到照片、面部比例、匹配分数、博主名称或完整排序。关闭标签页后，随机会话标识不会继续用于后续会话。分享图片只在你点击后于本机生成，本站不会保存分享内容。
          </p>
        </div>
      </section>

      <section className="privacy-section">
        <UserRoundCheck size={21} />
        <div>
          <h2>博主申请入库时</h2>
          <p>
            申请人主动提交博主名称、抖音主页、联系邮箱、授权正脸照、从照片中提取的面部比例，以及可选的代表教程。联系邮箱只用于身份核验和申请沟通，不会出现在公开博主库中。
          </p>
          <p>
            申请不会自动公开。核验主页归属和照片授权后，公开库只展示博主名称、主页、授权照片、面部比例和代表教程。安全验证由 Cloudflare Turnstile 提供，申请资料与照片存储由 Supabase 提供。
          </p>
        </div>
      </section>

      <section className="privacy-section">
        <Trash2 size={21} />
        <div>
          <h2>撤回、下架与删除</h2>
          <p>
            申请人可以撤回待审申请，也可以要求下架或删除已经公开的博主资料。为防止他人冒充申请，我们会通过原联系邮箱或主页归属重新核验身份，再停止展示并处理相关资料。
          </p>
          {privacyContactEmail ? (
            <p>
              请发送邮件至 <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>。
            </p>
          ) : (
            <p>当前测试阶段，请通过产品发布页面联系运营方处理。</p>
          )}
        </div>
      </section>

      <p className="privacy-footnote">
        匹配结果只表示部分面部结构比例接近，不用于身份识别，也不是审美、医学或专业化妆结论。未满 18 周岁的申请人应在监护人知情并同意后申请入库。
      </p>
    </main>
  );
}
