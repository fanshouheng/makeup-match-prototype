import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Library,
  UserPlus,
} from "lucide-react";
import type { CreatorMatch } from "../domain/matching";
import { CreatorPhoto } from "./CreatorPhoto";

interface MatchResultsProps {
  creatorsCount: number;
  matches: CreatorMatch[];
  onViewCreators: () => void;
}

export function MatchResults({
  creatorsCount,
  matches,
  onViewCreators,
}: MatchResultsProps) {
  return (
    <section className="matches-section" aria-labelledby="matches-title">
      <div className="matches-heading">
        <div>
          <p className="eyebrow">相似匹配</p>
          <h2 id="matches-title">和你面部结构更接近的博主</h2>
        </div>
        <button className="button button-ghost" onClick={onViewCreators} type="button">
          <UserPlus size={17} />
          博主申请
        </button>
      </div>

      {creatorsCount === 0 ? (
        <div className="matches-empty">
          <Library size={28} />
          <h3>还没有可匹配的博主</h3>
          <p>博主本人完成申请和身份核验后，才会参与匹配。</p>
          <button className="button button-primary" onClick={onViewCreators} type="button">
            博主申请
          </button>
        </div>
      ) : (
        <>
          {creatorsCount < 5 && (
            <div className="notice notice-warning match-sample-notice">
              <AlertCircle size={17} />
              <p>当前只有 {creatorsCount} 位已审核博主，结果仅用于体验匹配流程。</p>
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
                  <h3>{match.creator.name}</h3>
                  <ul className="match-reasons">
                    {match.reasons.map((reason) => (
                      <li key={reason.feature}>
                        <CheckCircle2 size={16} />
                        <span>{reason.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="match-links">
                    {match.creator.tutorialUrl && (
                      <a className="button button-primary" href={match.creator.tutorialUrl} target="_blank" rel="noreferrer">
                        代表教程
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <a className="button button-secondary" href={match.creator.douyinUrl} target="_blank" rel="noreferrer">
                      博主主页
                      <ExternalLink size={15} />
                    </a>
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
