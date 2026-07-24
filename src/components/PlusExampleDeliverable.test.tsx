import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlusExampleDeliverable } from "./PlusExampleDeliverable";

describe("PlusExampleDeliverable", () => {
  it("shows a clearly labeled, concrete example before paid intent", () => {
    const html = renderToStaticMarkup(
      <PlusExampleDeliverable
        onEdit={() => undefined}
        selectionSummary={["自定义：我要参加毕业典礼", "妆造：清透自然"]}
      />,
    );

    expect(html).toContain("示例，不基于你的照片");
    expect(html).toContain("毕业典礼 · 清透自然");
    expect(html).toContain("可解释的结构观察");
    expect(html).toContain("日间稳妥版");
    expect(html).toContain("合影表达版");
    expect(html).toContain("底妆");
    expect(html).toContain("修容");
    expect(html).toContain("唇部");
    expect(html).toContain("按内容能力找参考，不按长相找人");
    expect(html).toContain("自定义");
  });
});
