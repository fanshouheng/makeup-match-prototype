import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductNav } from "./ProductNav";

describe("ProductNav", () => {
  it("uses the same four product tasks and marks the current task", () => {
    const html = renderToStaticMarkup(<ProductNav current="report" />);

    expect(html).toContain('href="/#start"');
    expect(html).toContain('href="/report"');
    expect(html).toContain('href="/subscription"');
    expect(html).toContain('href="/account"');
    expect(html).toContain('aria-label="找美妆博主"');
    expect(html).toContain('aria-label="MAKE UP Pro"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/report"/);
  });
});
