import { ArrowRight, MessageCircle, Music2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { contactDouyinUrl, contactWechatQrUrl } from "../config";

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [wechatOpen, setWechatOpen] = useState(false);

  useEffect(() => {
    if (!wechatOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWechatOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [wechatOpen]);

  return (
    <>
      <main className="landing-page">
        <section className="landing-intro">
          <div className="landing-entry">
            <p className="section-index">AI FOR YOUR LOOK / 2026</p>
            <button className="start-button" onClick={onStart} type="button">
              Start
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="landing-copy">
            <h1>
              <span>找到更适合你</span>
              <span>参考的美妆博主</span>
            </h1>
            <p>
              <span>上传一张正面照片，从面部结构出发寻找更接近的博主。</span>
              <span>不是评价长相，而是让妆容参照更具体；照片与个人比例只在当前设备完成分析。</span>
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="social-links" aria-label="联系方式">
            <button
              aria-label="微信联系方式"
              aria-expanded={wechatOpen}
              aria-haspopup="dialog"
              onClick={() => setWechatOpen(true)}
              title="微信"
              type="button"
            >
              <MessageCircle size={18} />
            </button>
            <a aria-label="抖音主页" href={contactDouyinUrl} rel="noreferrer" target="_blank" title="抖音">
              <Music2 size={18} />
            </a>
          </div>
          <div className="footer-rule" />
          <p className="footer-copy">妆容参照 · 照片仅在当前设备处理</p>
        </div>
      </footer>

      {wechatOpen && (
        <div className="contact-modal-backdrop" onClick={() => setWechatOpen(false)}>
          <section
            aria-label="微信联系方式"
            aria-modal="true"
            className="contact-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="关闭微信二维码"
              className="contact-modal-close"
              onClick={() => setWechatOpen(false)}
              title="关闭"
              type="button"
            >
              <X size={20} />
            </button>
            <img alt="微信联系人二维码" src={contactWechatQrUrl} />
            <p>微信扫码添加好友</p>
          </section>
        </div>
      )}
    </>
  );
}
