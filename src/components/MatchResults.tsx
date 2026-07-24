import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImageDown,
  Library,
  LoaderCircle,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  CREATOR_PLATFORM_LABELS,
  type CreatorContentFilter,
  type CreatorContentType,
  type ReferenceAudience,
} from "../domain/creator";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import {
  buildFaceSearchSuggestion,
  type CreatorMatch,
} from "../domain/matching";
import { AiCreatorDiscovery } from "./AiCreatorDiscovery";
import { CreatorPhoto } from "./CreatorPhoto";
import {
  PlusPaidIntentExperiment,
  PlusPaidIntentSpotlight,
} from "./PlusPaidIntentExperiment";

const CONTENT_LABELS: Record<CreatorContentType, string> = {
  appearance: "形象参考",
  hair: "发型",
  makeup: "妆容",
};

const MEN_FILTERS: Array<{ value: CreatorContentFilter; label: string }> = [
  { value: "all", label: "综合参考" },
  { value: "hair", label: "发型" },
  { value: "makeup", label: "妆容" },
];

export type MatchFeedback = "yes" | "no";
export type MatchShareStatus = "idle" | "sharing" | "shared" | "downloaded" | "error";
export type CreatorLinkDestination = "profile" | "content";

interface MatchResultsProps {
  creatorsCount: number;
  faceFeatures: FaceFeatureVector;
  feedback: MatchFeedback | null;
  matches: CreatorMatch[];
  mode?: "all" | "primary" | "more";
  referenceAudience?: ReferenceAudience;
  shareStatus: MatchShareStatus;
  contentFilter?: CreatorContentFilter;
  onContentFilterChange?: (filter: CreatorContentFilter) => void;
  onCreatorLinkClick: (destination: CreatorLinkDestination) => void;
  onFeedback: (feedback: MatchFeedback) => void;
  onShare: () => void;
  onViewCreators: () => void;
  showPlusOffer?: boolean;
  showPlusSpotlight?: boolean;
  userPhoto?: HTMLImageElement;
}

export function MatchResults({
  creatorsCount,
  faceFeatures,
  feedback,
  matches,
  mode = "all",
  referenceAudience = "women",
  shareStatus,
  contentFilter = "all",
  onContentFilterChange,
  onCreatorLinkClick,
  onFeedback,
  onShare,
  onViewCreators,
  showPlusOffer = false,
  showPlusSpotlight = false,
  userPhoto,
}: MatchResultsProps) {
  const [primaryMatch, ...otherMatches] = matches;
  const isMen = referenceAudience === "men";
  const showPrimary = mode !== "more";
  const showMore = mode !== "primary";
  const noSuitableMatch = creatorsCount > 0 && matches.length === 0;
  const feedbackSubmitted = feedback !== null;
  const creatorLibraryLabel = isMen ? "已授权男生创作者库" : "已授权博主库";
  const faceSuggestion = buildFaceSearchSuggestion(
    faceFeatures,
    referenceAudience,
    contentFilter,
  );
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
  const primaryIntro = contentFilter === "hair"
    ? "这些面部轮廓特征与你更接近，可以优先参考他的发型内容。"
    : contentFilter === "makeup"
      ? "这些面部结构特征与你更接近，可以优先参考他的妆容内容。"
      : "这些面部结构特征与你更接近，可以从他的公开内容中寻找形象参考。";

  return (
    <section className={`matches-section matches-${mode}`} aria-labelledby={`matches-title-${mode}`}>
      <div className="matches-heading">
        <div>
          <p className="eyebrow">
            {noSuitableMatch
              ? "RESULT / 暂无合适参照"
              : mode === "more"
                ? "MORE / 更多参照"
                : "MATCH / 相似匹配"}
          </p>
          <h2 id={`matches-title-${mode}`}>
            {noSuitableMatch
              ? "这次先不勉强推荐"
              : isMen
              ? mode === "more"
                ? "更多男生形象参考"
                : "和你面部结构更接近的男生创作者"
              : mode === "more"
                ? "也可以看看这些博主"
                : "和你面部结构更接近的博主"}
          </h2>
        </div>
        {isMen && mode !== "more" && onContentFilterChange && (
          <div className="match-category-tabs" role="tablist" aria-label="男生参考内容">
            {MEN_FILTERS.map((filter) => (
              <button
                aria-selected={contentFilter === filter.value}
                key={filter.value}
                onClick={() => onContentFilterChange(filter.value)}
                role="tab"
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {creatorsCount === 0 ? (
        <div className="matches-empty">
          <Library size={28} />
          <h3>{isMen ? "这个方向还没有男生创作者" : "公开博主库还是空的"}</h3>
          <p>
            {isMen
              ? "创作者本人完成申请和身份核验后，才会进入男生形象参考。"
              : "博主本人完成申请和身份核验后，才会参与匹配。"}
          </p>
          <button className="button button-primary" onClick={onViewCreators} type="button">
            博主入驻
          </button>
        </div>
      ) : noSuitableMatch ? (
        <div className="no-match-result">
          <Search aria-hidden="true" size={28} />
          <div className="no-match-copy">
            <h3>
              暂未找到足够接近的{isMen ? "创作者" : "博主"}
            </h3>
            <p>
              LOOK AI 还在初期阶段，{creatorLibraryLabel}
              仍在完善。与其给你一个勉强的答案，我们更愿意诚实地告诉你：这次还没有足够合适的参照。
            </p>
          </div>
          <div className="no-match-guidance">
            <p>从这张照片的面部比例来看，你的脸型特征是：{faceSuggestion.description}。</p>
            <p className="no-match-keyword">
              可以试试搜索 <strong>「{faceSuggestion.keyword}」</strong>，继续寻找更适合你的参考。
            </p>
          </div>
          <p className="no-match-wish">谢谢你愿意来试试，也希望你天天开心。</p>
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
                <span className="creator-platform-label">
                  {CREATOR_PLATFORM_LABELS[primaryMatch.creator.platform]}
                </span>
                {isMen && (
                  <div className="creator-content-tags" aria-label="内容方向">
                    {primaryMatch.creator.contentTypes.map((type) => (
                      <span key={type}>{CONTENT_LABELS[type]}</span>
                    ))}
                  </div>
                )}
                <p className="primary-match-intro">
                  {isMen
                    ? primaryIntro
                    : "这些面部结构特征与你更接近，可以优先参考她的妆容思路。"}
                </p>
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
                    <a
                      className="button button-primary"
                      href={primaryMatch.creator.tutorialUrl}
                      onClick={() => onCreatorLinkClick("content")}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {isMen ? "查看代表内容" : "查看代表教程"}
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <a
                    className="button button-secondary"
                    href={primaryMatch.creator.profileUrl}
                    onClick={() => onCreatorLinkClick("profile")}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {CREATOR_PLATFORM_LABELS[primaryMatch.creator.platform]}主页
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            </article>
          )}
          {showPlusSpotlight && showPrimary && primaryMatch && !isMen && (
            <PlusPaidIntentSpotlight />
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
              {feedback === "no" && (
                <div className="match-feedback-recovery" role="status">
                  <Search aria-hidden="true" size={22} />
                  <div>
                    <h3>谢谢你告诉我们</h3>
                    <p>
                      LOOK AI 还在初期阶段，{creatorLibraryLabel}仍在完善，这次推荐可能还不够贴合。
                    </p>
                    <p className="match-feedback-guidance">
                      从这张照片的面部比例来看，你的脸型特征是：{faceSuggestion.description}。
                    </p>
                    <p className="match-feedback-keyword">
                      可以试试搜索 <strong>「{faceSuggestion.keyword}」</strong>，继续寻找更适合你的参考。
                    </p>
                    <p className="match-feedback-wish">希望你天天开心，也能找到真正喜欢的参考。</p>
                  </div>
                </div>
              )}
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
                  <span className="creator-platform-label">
                    {CREATOR_PLATFORM_LABELS[match.creator.platform]}
                  </span>
                  {isMen && (
                    <div className="creator-content-tags" aria-label="内容方向">
                      {match.creator.contentTypes.map((type) => (
                        <span key={type}>{CONTENT_LABELS[type]}</span>
                      ))}
                    </div>
                  )}
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
                      <a
                        className="button button-primary"
                        href={match.creator.tutorialUrl}
                        onClick={() => onCreatorLinkClick("content")}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {isMen ? "代表内容" : "代表教程"}
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <a
                      className="button button-secondary"
                      href={match.creator.profileUrl}
                      onClick={() => onCreatorLinkClick("profile")}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {CREATOR_PLATFORM_LABELS[match.creator.platform]}主页
                      <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>}
        </>
      )}
      {showPlusOffer && primaryMatch && !isMen && <PlusPaidIntentExperiment />}
      {showPrimary && userPhoto && (
        <AiCreatorDiscovery
          key={`${referenceAudience}:${contentFilter}`}
          contentFilter={contentFilter}
          referenceAudience={referenceAudience}
          userPhoto={userPhoto}
        />
      )}
    </section>
  );
}
