import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImageDown,
  Library,
  LoaderCircle,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { CreatorMatch } from "../domain/matching";
import { CreatorPhoto } from "./CreatorPhoto";

export type MatchFeedback = "yes" | "no";
export type MatchShareStatus = "idle" | "sharing" | "shared" | "downloaded" | "error";

interface MatchResultsProps {
  creatorsCount: number;
  feedback: MatchFeedback | null;
  matches: CreatorMatch[];
  mode?: "all" | "primary" | "more";
  shareStatus: MatchShareStatus;
  onFeedback: (feedback: MatchFeedback) => void;
  onShare: () => void;
  onViewCreators: () => void;
}

export function MatchResults({
  creatorsCount,
  feedback,
  matches,
  mode = "all",
  shareStatus,
  onFeedback,
  onShare,
  onViewCreators,
}: MatchResultsProps) {
  const [primaryMatch, ...otherMatches] = matches;
  const showPrimary = mode !== "more";
  const showMore = mode !== "primary";
  const feedbackSubmitted = feedback !== null;
  const shareButtonLabel = shareStatus === "sharing"
    ? "正在分享"
    : shareStatus === "error"
      ? "重试分享"
      : shareStatus === "shared"
        ? "已分享"
        : shareStatus === "downloaded"
          ? "图片已下载"
          : "分享结果";
  const shareStatusMessage = shareStatus === "shared"
    ? "分享已完成"
    : shareStatus === "downloaded"
      ? "分享图已下载，发送图片即可分享"
      : shareStatus === "error"
        ? "分享失败，请重试"
        : "";

  return (
    <section className={`matches-section matches-${mode}`} aria-labelledby={`matches-title-${mode}`}>
      <div className="matches-heading">
        <div>
          <p className="eyebrow">{mode === "more" ? "MORE / 更多参照" : "MATCH / 相似匹配"}</p>
          <h2 id={`matches-title-${mode}`}>
            {mode === "more" ? "也可以看看这些博主" : "和你面部结构更接近的博主"}
          </h2>
        </div>
      </div>

      {creatorsCount === 0 ? (
        <div className="matches-empty">
          <Library size={28} />
          <h3>公开博主库还是空的</h3>
          <p>博主本人完成申请和身份核验后，才会参与匹配。</p>
          <button className="button button-primary" onClick={onViewCreators} type="button">
            博主入驻
          </button>
        </div>
      ) : (
        <>
          {mode === "all" && creatorsCount < 5 && (
            <div className="notice notice-warning match-sample-notice">
              <AlertCircle size={17} />
              <p>当前只有 {creatorsCount} 位已审核博主，结果仅用于体验匹配流程。</p>
            </div>
          )}
          {showPrimary && primaryMatch && (
            <article className="primary-match">
              <div className="primary-match-photo">
                <CreatorPhoto creator={primaryMatch.creator} />
                <span className="match-rank">最接近</span>
              </div>
              <div className="primary-match-body">
                <p className="eyebrow">首选参照</p>
                <h3>{primaryMatch.creator.name}</h3>
                <p className="primary-match-intro">这些面部结构特征与你更接近，可以优先参考她的妆容思路。</p>
                <ul className="match-reasons">
                  {primaryMatch.reasons.map((reason) => (
                    <li key={reason.feature}>
                      <CheckCircle2 size={16} />
                      <span>{reason.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="match-links">
                  {primaryMatch.creator.tutorialUrl && (
                    <a className="button button-primary" href={primaryMatch.creator.tutorialUrl} target="_blank" rel="noreferrer">
                      查看代表教程
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <a className="button button-secondary" href={primaryMatch.creator.douyinUrl} target="_blank" rel="noreferrer">
                    博主主页
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            </article>
          )}
          {showPrimary && primaryMatch && (
            <section
              className="match-engagement"
              aria-labelledby={`match-feedback-title-${mode}`}
            >
              <div className="match-engagement-copy">
                <p className="eyebrow">FEEDBACK / 结果反馈</p>
                <h3 id={`match-feedback-title-${mode}`}>这个结果是否符合你的感觉？</h3>
              </div>
              <div className="match-engagement-actions">
                <div className="match-feedback-actions" role="group" aria-label="匹配结果反馈">
                  <button
                    aria-pressed={feedback === "yes"}
                    data-selected={feedback === "yes"}
                    disabled={feedbackSubmitted}
                    onClick={() => onFeedback("yes")}
                    type="button"
                  >
                    <ThumbsUp size={16} />
                    符合
                  </button>
                  <button
                    aria-pressed={feedback === "no"}
                    data-selected={feedback === "no"}
                    disabled={feedbackSubmitted}
                    onClick={() => onFeedback("no")}
                    type="button"
                  >
                    <ThumbsDown size={16} />
                    不太符合
                  </button>
                </div>
                <button
                  className="button button-secondary match-share-button"
                  disabled={shareStatus === "sharing"}
                  onClick={onShare}
                  type="button"
                >
                  {shareStatus === "sharing"
                    ? <LoaderCircle className="spin" size={16} />
                    : shareStatus === "downloaded"
                      ? <ImageDown size={16} />
                      : <Share2 size={16} />}
                  {shareButtonLabel}
                </button>
                <span className="match-engagement-status" role="status">
                  {[feedbackSubmitted ? "反馈已记录" : "", shareStatusMessage]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </section>
          )}
          {mode === "all" && otherMatches.length > 0 && (
            <div className="more-matches-heading">
              <p className="eyebrow">更多参照</p>
              <h3>也可以看看这些博主</h3>
            </div>
          )}
          {showMore && <div className="match-grid">
            {otherMatches.map((match, index) => (
              <article className="match-card" key={match.creator.id}>
                <div className="match-card-photo">
                  <CreatorPhoto creator={match.creator} />
                  <span className="match-rank">第 {index + 2} 名</span>
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
          </div>}
        </>
      )}
    </section>
  );
}
