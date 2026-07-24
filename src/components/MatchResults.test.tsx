import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreatorMatch } from "../domain/matching";
import { MatchResults } from "./MatchResults";

const match: CreatorMatch = {
  creator: {
    id: "creator",
    name: "示例创作者",
    referencePhotoUrl: "https://example.com/creator.jpg",
    platform: "douyin",
    profileUrl: "https://www.douyin.com/user/creator",
    tutorialUrl: "",
    referenceAudience: "men",
    contentTypes: ["appearance", "hair"],
    featureVector: {
      faceAspectRatio: 1.2,
      jawToCheekRatio: 0.8,
      foreheadToCheekRatio: 0.9,
      lowerThirdRatio: 0.44,
      eyeSpacingRatio: 0.24,
      eyeAspectRatio: 3.2,
      noseWidthRatio: 0.25,
      lipWidthRatio: 0.38,
      lipAspectRatio: 0.34,
    },
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  distance: 0.1,
  reasons: [
    { feature: "faceAspectRatio", text: "脸部长宽比例接近。" },
    { feature: "jawToCheekRatio", text: "下颌比例接近。" },
  ],
};

describe("MatchResults", () => {
  it("renders the male appearance-reference filters and content labels", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        contentFilter="all"
        creatorsCount={1}
        faceFeatures={match.creator.featureVector}
        feedback={null}
        matches={[match]}
        onContentFilterChange={() => undefined}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        referenceAudience="men"
        shareStatus="idle"
        showPlusOffer
      />,
    );

    expect(html).toContain("和你面部结构更接近的男生创作者");
    expect(html).toContain("综合参考");
    expect(html).toContain("发型");
    expect(html).toContain("妆容");
    expect(html).toContain("形象参考");
    expect(html).toContain("这个结果是否符合你的感觉？");
    expect(html).toContain("分享结果");
    expect(html).toContain("抖音主页");
    expect(html).not.toContain("PLUS / 付费功能测试");
  });

  it("labels and links a Xiaohongshu creator", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={1}
        faceFeatures={match.creator.featureVector}
        feedback={null}
        matches={[{
          ...match,
          creator: {
            ...match.creator,
            platform: "xiaohongshu",
            profileUrl: "https://www.xiaohongshu.com/user/profile/creator",
          },
        }]}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="idle"
      />,
    );

    expect(html).toContain("小红书主页");
    expect(html).toContain("https://www.xiaohongshu.com/user/profile/creator");
  });

  it("keeps the existing female makeup result copy", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={1}
        faceFeatures={match.creator.featureVector}
        feedback={null}
        matches={[{
          ...match,
          creator: {
            ...match.creator,
            referenceAudience: "women",
            contentTypes: ["makeup"],
          },
        }]}
        showPlusOffer
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="idle"
      />,
    );

    expect(html).toContain("和你面部结构更接近的博主");
    expect(html).toContain("可以优先参考她的妆容思路");
    expect(html).not.toContain("综合参考");
    expect(html).toContain("PLUS / 付费功能测试");
    expect(html).toContain("当前仅测试购买意向，不会扣款，也不收集支付信息");
    expect(html).toContain("¥19.9");
  });

  it("shows a recorded feedback and downloaded-share state", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={1}
        faceFeatures={match.creator.featureVector}
        feedback="yes"
        matches={[match]}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="downloaded"
      />,
    );

    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("反馈已记录 · 分享图已下载，发送图片即可分享");
    expect(html).toContain("图片已下载");
  });

  it("shows face guidance after the user rejects a match", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={10}
        faceFeatures={{
          ...match.creator.featureVector,
          faceAspectRatio: 1.3,
          jawToCheekRatio: 0.72,
        }}
        feedback="no"
        matches={[match]}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="idle"
      />,
    );

    expect(html).toContain("谢谢你告诉我们");
    expect(html).toContain("这次推荐可能还不够贴合");
    expect(html).toContain("面部纵向比例偏修长，下颌相对颧部更收窄");
    expect(html).toContain("长脸 窄下颌 妆容博主");
    expect(html).toContain("希望你天天开心");
  });

  it("shows a gentle search suggestion instead of a weak match", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={10}
        faceFeatures={{
          ...match.creator.featureVector,
          faceAspectRatio: 1.3,
          jawToCheekRatio: 0.72,
        }}
        feedback={null}
        matches={[]}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="idle"
      />,
    );

    expect(html).toContain("这次先不勉强推荐");
    expect(html).toContain("已授权博主库仍在完善");
    expect(html).toContain("面部纵向比例偏修长，下颌相对颧部更收窄");
    expect(html).toContain("长脸 窄下颌 妆容博主");
    expect(html).toContain("希望你天天开心");
    expect(html).not.toContain("这个结果是否符合你的感觉？");
  });

  it("offers optional AI discovery when the primary result has a user photo", () => {
    const html = renderToStaticMarkup(
      <MatchResults
        creatorsCount={1}
        faceFeatures={match.creator.featureVector}
        feedback={null}
        matches={[match]}
        onCreatorLinkClick={() => undefined}
        onFeedback={() => undefined}
        onShare={() => undefined}
        onViewCreators={() => undefined}
        shareStatus="idle"
        userPhoto={{} as HTMLImageElement}
      />,
    );

    expect(html).toContain("AI 找更多参考");
    expect(html).toContain("只返回博主名字");
    expect(html).not.toContain("豆包");
  });
});
