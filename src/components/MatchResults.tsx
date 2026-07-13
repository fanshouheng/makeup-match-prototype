import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Library,
} from "lucide-react";
import type { CreatorMatch } from "../domain/matching";
import { CreatorPhoto } from "./CreatorPhoto";

interface MatchResultsProps {
  creatorsCount: number;
  matches: CreatorMatch[];
  onManageCreators: () => void;
}

export function MatchResults({
  creatorsCount,
  matches,
  onManageCreators,
}: MatchResultsProps) {
  return (
    <section className="matches-section" aria-labelledby="matches-title">
      <div className="matches-heading">
        <div>
          <p className="eyebrow">阶段 2 / 匹配结果</p>
          <h2 id="matches-title">更值得参考的博主</h2>
        </div>
        <button className="button button-ghost" onClick={onManageCreators} type="button">
          <Library size={17} />
          管理博主库
        </button>
      </div>

      {creatorsCount === 0 ? (
        <div className="matches-empty">
          <Library size={28} />
          <h3>博主库还是空的</h3>
          <button className="button button-primary" onClick={onManageCreators} type="button">
            前往博主库
          </button>
        </div>
      ) : (
        <>
          {creatorsCount < 5 && (
            <div className="notice notice-warning match-sample-notice">
              <AlertCircle size={17} />
              <p>当前只有 {creatorsCount} 位博主，可以测试流程，但还不能判断推荐价值。</p>
            </div>
          )}
          <div className="match-grid">
            {matches.map((match, index) => (
              <article className="match-card" key={match.creator.id}>
                <div className="match-card-photo">
                  <CreatorPhoto creator={match.creator} />
                  <span className="match-rank">第 {index + 1} 名</span>
                </div>
                <div className="match-card-body">
                  <div>
                    <h3>{match.creator.name}</h3>
                    {match.creator.tags.length > 0 && (
                      <p className="match-tags">{match.creator.tags.join(" · ")}</p>
                    )}
                  </div>
                  <ul className="match-reasons">
                    {match.reasons.map((reason) => (
                      <li key={reason.feature}>
                        <CheckCircle2 size={16} />
                        <span>{reason.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="match-focus">
                    <span>建议重点看</span>
                    {match.reasons.map((reason) => reason.focus).join("、")}
                  </p>
                  <div className="match-links">
                    {match.creator.tutorialUrl && (
                      <a className="button button-primary" href={match.creator.tutorialUrl} target="_blank" rel="noreferrer">
                        打开教程
                        <ExternalLink size={15} />
                      </a>
                    )}
                    {match.creator.douyinUrl && (
                      <a className="button button-secondary" href={match.creator.douyinUrl} target="_blank" rel="noreferrer">
                        博主主页
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
