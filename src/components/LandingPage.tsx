import { ArrowRight, MessageCircle, Music2 } from "lucide-react";
import { useState } from "react";
import { contactDouyinUrl, contactWechatId } from "../config";

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [contactNote, setContactNote] = useState<string>();

  return (
    <>
      <main className="landing-page">
        <section className="landing-intro">
          <div className="landing-entry">
            <p className="section-index">MAKEUP REFERENCE / 2026</p>
            <button className="start-button" onClick={onStart} type="button">
              Start
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="landing-copy">
            <h1>找到更适合你参考的美妆博主</h1>
            <p>
              上传一张正面照片，从面部结构出发寻找更接近的博主。不是评价长相，而是让妆容参照更具体；照片与个人比例只在当前设备完成分析。
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="social-links" aria-label="联系方式">
            <button
              aria-label="微信联系方式"
              onClick={() => setContactNote(contactWechatId ? `微信：${contactWechatId}` : "微信联系方式待补充")}
              title="微信"
              type="button"
            >
              <MessageCircle size={18} />
            </button>
            {contactDouyinUrl ? (
              <a aria-label="抖音主页" href={contactDouyinUrl} rel="noreferrer" target="_blank" title="抖音">
                <Music2 size={18} />
              </a>
            ) : (
              <button
                aria-label="抖音联系方式"
                onClick={() => setContactNote("抖音主页待补充")}
                title="抖音"
                type="button"
              >
                <Music2 size={18} />
              </button>
            )}
          </div>
          {contactNote && <p className="contact-note" role="status">{contactNote}</p>}
          <div className="footer-rule" />
          <p className="footer-copy">妆容参照 · 照片仅在当前设备处理</p>
        </div>
      </footer>
    </>
  );
}
