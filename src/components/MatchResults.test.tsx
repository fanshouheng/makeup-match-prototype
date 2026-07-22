import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CreatorProfile } from "../domain/creator";
import type { CreatorMatch } from "../domain/matching";
import { MatchResults } from "./MatchResults";

const creator: CreatorProfile = {
  id: "creator-1",
  name: "示例博主",
  referencePhotoUrl: "https://example.com/creator.jpg",
  douyinUrl: "https://www.douyin.com/user/example",
  tutorialUrl: "https://www.douyin.com/video/example",
  featureVector: {
    faceAspectRatio: 1.3,
    jawToCheekRatio: 0.8,
    foreheadToCheekRatio: 0.82,
    lowerThirdRatio: 0.34,
    eyeSpacingRatio: 0.26,
    eyeAspectRatio: 3,
    noseWidthRatio: 0.24,
    lipWidthRatio: 0.38,
    lipAspectRatio: 0.34,
  },
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

const match: CreatorMatch = {
  creator,
  distance: 0.1,
  reasons: [{ feature: "faceAspectRatio", text: "脸部长宽比例接近。" }],
};

function renderResults(
  feedback: "yes" | "no" | null = null,
  shareStatus: "idle" | "sharing" | "shared" | "downloaded" | "error" = "idle",
) {
  return renderToStaticMarkup(
    <MatchResults
      creatorsCount={1}
      feedback={feedback}
      matches={[match]}
      onFeedback={vi.fn()}
      onShare={vi.fn()}
      onViewCreators={vi.fn()}
      shareStatus={shareStatus}
    />,
  );
}

describe("MatchResults engagement", () => {
  it("offers feedback and sharing without a sign-in prompt", () => {
    const html = renderResults();

    expect(html).toContain("这个结果是否符合你的感觉？");
    expect(html).toContain("分享结果");
    expect(html).not.toContain("登录");
  });

  it("shows the recorded feedback state", () => {
    const html = renderResults("yes");

    expect(html).toContain("反馈已记录");
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows the desktop download completion state", () => {
    const html = renderResults(null, "downloaded");

    expect(html).toContain("图片已下载");
    expect(html).toContain("分享图已下载，发送图片即可分享");
  });
});
