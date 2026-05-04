import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { notifyIndexNow, getIndexNowKey } from "../indexnow";
import { INDEXNOW_API_URL } from "@/config/seo";

const ORIGINAL_INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  // Reset fetch + env between tests so cases stay isolated.
  vi.restoreAllMocks();
  delete process.env.INDEXNOW_KEY;
  process.env.NEXT_PUBLIC_APP_URL = "https://trypipeline.ai";
  // Mute the no-op log line so test output stays clean.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_INDEXNOW_KEY === undefined) delete process.env.INDEXNOW_KEY;
  else process.env.INDEXNOW_KEY = ORIGINAL_INDEXNOW_KEY;
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("getIndexNowKey", () => {
  it("returns null when INDEXNOW_KEY is unset", () => {
    expect(getIndexNowKey()).toBeNull();
  });

  it("returns the key when set", () => {
    process.env.INDEXNOW_KEY = "abc-123";
    expect(getIndexNowKey()).toBe("abc-123");
  });

  it("trims whitespace and treats blank values as unset", () => {
    process.env.INDEXNOW_KEY = "   ";
    expect(getIndexNowKey()).toBeNull();
    process.env.INDEXNOW_KEY = "  abc  ";
    expect(getIndexNowKey()).toBe("abc");
  });
});

describe("notifyIndexNow", () => {
  it("no-ops with no fetch when INDEXNOW_KEY is unset", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await notifyIndexNow(["https://trypipeline.ai/jobs/abc"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no-ops with no fetch when urls is empty", async () => {
    process.env.INDEXNOW_KEY = "key-xyz";
    const fetchSpy = vi.spyOn(global, "fetch");
    await notifyIndexNow([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a single batch with the correct payload shape", async () => {
    process.env.INDEXNOW_KEY = "key-xyz";
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await notifyIndexNow(["https://trypipeline.ai/jobs/abc"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(INDEXNOW_API_URL);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      host: "trypipeline.ai",
      key: "key-xyz",
      keyLocation: "https://trypipeline.ai/indexnow-verification/key-xyz",
      urlList: ["https://trypipeline.ai/jobs/abc"],
    });
  });

  it("strips protocol from host but keeps full URL in keyLocation", async () => {
    process.env.INDEXNOW_KEY = "k1";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await notifyIndexNow(["https://example.com/jobs/1"]);

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.host).toBe("example.com");
    expect(body.keyLocation).toBe("https://example.com/indexnow-verification/k1");
  });

  it("splits 25000 urls into 3 batches of 10000/10000/5000", async () => {
    process.env.INDEXNOW_KEY = "k";
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    const urls = Array.from({ length: 25_000 }, (_, i) => `https://trypipeline.ai/jobs/${i}`);
    await notifyIndexNow(urls);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const sizes = fetchSpy.mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body));
      return body.urlList.length;
    });
    expect(sizes).toEqual([10_000, 10_000, 5_000]);
  });

  it("does not throw when fetch rejects", async () => {
    process.env.INDEXNOW_KEY = "k";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    await expect(notifyIndexNow(["https://trypipeline.ai/jobs/1"])).resolves.toBeUndefined();
  });

  it("does not throw when fetch returns 422 (key file unreachable)", async () => {
    process.env.INDEXNOW_KEY = "k";
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 422 }));

    await expect(notifyIndexNow(["https://trypipeline.ai/jobs/1"])).resolves.toBeUndefined();
  });

  it("does not throw on unexpected status codes", async () => {
    process.env.INDEXNOW_KEY = "k";
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await expect(notifyIndexNow(["https://trypipeline.ai/jobs/1"])).resolves.toBeUndefined();
  });

  it("falls back to default APP_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    process.env.INDEXNOW_KEY = "k";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await notifyIndexNow(["https://trypipeline.ai/jobs/1"]);

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.host).toBe("trypipeline.ai");
    expect(body.keyLocation).toBe("https://trypipeline.ai/indexnow-verification/k");
  });
});
