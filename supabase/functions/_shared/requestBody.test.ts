import { describe, expect, it } from "vitest";
import { hasAcceptableContentLength, readJsonWithLimit } from "./requestBody";

describe("bounded request bodies", () => {
  it("caps a body even when content-length is missing", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"too long"}'));
          controller.close();
        },
      }),
      // Required by Node when a stream is used as a request body.
      duplex: "half",
    } as RequestInit);
    await expect(readJsonWithLimit(request, 8)).rejects.toThrow("request_too_large");
  });

  it("parses a bounded JSON body", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJsonWithLimit(request, 64)).resolves.toEqual({ ok: true });
  });

  it("requires a valid declared size before multipart parsing", () => {
    expect(hasAcceptableContentLength(new Request("https://example.test"), 10)).toBe(false);
    expect(hasAcceptableContentLength(new Request("https://example.test", {
      headers: { "content-length": "11" },
    }), 10)).toBe(false);
    expect(hasAcceptableContentLength(new Request("https://example.test", {
      headers: { "content-length": "10" },
    }), 10)).toBe(true);
  });
});
