import { ScanFace } from "lucide-react";
import { CreatorSimilarityLabeler } from "./CreatorSimilarityLabeler";
import "./admin.css";

export default function SimilarityLabelerApp() {
  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <span className="admin-wordmark">MAKE UP</span>
          <div>
            <p className="admin-kicker">LOCAL CALIBRATION</p>
            <h1>相似度标注</h1>
          </div>
        </div>
        <div className="admin-data-badge">
          <ScanFace size={18} />
          <span>本机标注<br /><small>不上传标签和特征</small></span>
        </div>
      </header>
      <section className="admin-content" aria-label="创作者相似度标注">
        <CreatorSimilarityLabeler />
      </section>
    </main>
  );
}
