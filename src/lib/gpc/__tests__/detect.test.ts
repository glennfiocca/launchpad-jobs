import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";
import { isGpcRequest, readGpcFromRequest, GPC_HEADER, GPC_PROPAGATED } from "../detect";

const mockHeaders = headers as unknown as ReturnType<typeof vi.fn>;

function fakeHeaderBag(value: string | null) {
  return {
    get: (k: string) =>
      k.toLowerCase() === GPC_PROPAGATED.toLowerCase() ? value : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readGpcFromRequest", () => {
  function fakeReq(headers: Record<string, string>): NextRequest {
    const h = new Headers(headers);
    return { headers: h } as unknown as NextRequest;
  }

  it("returns true only when Sec-GPC is exactly '1'", () => {
    expect(readGpcFromRequest(fakeReq({ [GPC_HEADER]: "1" }))).toBe(true);
  });

  it("returns false when Sec-GPC is missing", () => {
    expect(readGpcFromRequest(fakeReq({}))).toBe(false);
  });

  it("returns false when Sec-GPC is '0'", () => {
    expect(readGpcFromRequest(fakeReq({ [GPC_HEADER]: "0" }))).toBe(false);
  });

  it("returns false when Sec-GPC is 'true'", () => {
    expect(readGpcFromRequest(fakeReq({ [GPC_HEADER]: "true" }))).toBe(false);
  });

  it("returns false when Sec-GPC is 'yes' or anything non-spec", () => {
    expect(readGpcFromRequest(fakeReq({ [GPC_HEADER]: "yes" }))).toBe(false);
  });
});

describe("isGpcRequest (server-component side)", () => {
  it("returns true when the propagated header is '1'", async () => {
    mockHeaders.mockResolvedValueOnce(fakeHeaderBag("1"));
    await expect(isGpcRequest()).resolves.toBe(true);
  });

  it("returns false when the propagated header is missing", async () => {
    mockHeaders.mockResolvedValueOnce(fakeHeaderBag(null));
    await expect(isGpcRequest()).resolves.toBe(false);
  });

  it("returns false when the propagated header is '0'", async () => {
    mockHeaders.mockResolvedValueOnce(fakeHeaderBag("0"));
    await expect(isGpcRequest()).resolves.toBe(false);
  });
});
