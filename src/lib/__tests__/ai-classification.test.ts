import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock the Anthropic SDK ---
// vi.mock is hoisted above all top-level `import`/`const` declarations, so
// any helpers it references must live inside vi.hoisted(). We expose stand-in
// error classes the production code can `instanceof`-check.

const mocks = vi.hoisted(() => {
  const mockCreate = vi.fn();

  class MockAnthropicError extends Error {}

  class MockAPIError extends MockAnthropicError {
    status: number | undefined;
    headers: Headers | undefined;
    constructor(status: number | undefined, message: string, headers?: Headers) {
      super(message);
      this.status = status;
      this.headers = headers;
    }
  }

  class MockAPIUserAbortError extends MockAPIError {
    constructor(message = "Request was aborted") {
      super(undefined, message);
      this.name = "APIUserAbortError";
    }
  }

  class MockAPIConnectionError extends MockAPIError {
    constructor(message = "Connection error") {
      super(undefined, message);
      this.name = "APIConnectionError";
    }
  }

  class MockAPIConnectionTimeoutError extends MockAPIConnectionError {
    constructor(message = "Connection timeout") {
      super(message);
      this.name = "APIConnectionTimeoutError";
    }
  }

  class MockBadRequestError extends MockAPIError {
    constructor(message = "Bad request", headers?: Headers) {
      super(400, message, headers);
      this.name = "BadRequestError";
    }
  }

  class MockRateLimitError extends MockAPIError {
    constructor(message = "Rate limited", headers?: Headers) {
      super(429, message, headers);
      this.name = "RateLimitError";
    }
  }

  class MockInternalServerError extends MockAPIError {
    constructor(message = "Internal server error", headers?: Headers) {
      super(500, message, headers);
      this.name = "InternalServerError";
    }
  }

  return {
    mockCreate,
    MockAnthropicError,
    MockAPIError,
    MockAPIUserAbortError,
    MockAPIConnectionError,
    MockAPIConnectionTimeoutError,
    MockBadRequestError,
    MockRateLimitError,
    MockInternalServerError,
  };
});

vi.mock("@anthropic-ai/sdk", () => {
  // The default export is a class — instantiated as `new Anthropic({...})`.
  // Its `messages.create` resolves to the mocked function.
  class MockAnthropic {
    messages = { create: mocks.mockCreate };
  }
  return {
    default: MockAnthropic,
    APIError: mocks.MockAPIError,
    AnthropicError: mocks.MockAnthropicError,
    APIUserAbortError: mocks.MockAPIUserAbortError,
    APIConnectionError: mocks.MockAPIConnectionError,
    APIConnectionTimeoutError: mocks.MockAPIConnectionTimeoutError,
    BadRequestError: mocks.MockBadRequestError,
    RateLimitError: mocks.MockRateLimitError,
    InternalServerError: mocks.MockInternalServerError,
  };
});

const {
  mockCreate,
  MockAPIUserAbortError,
  MockBadRequestError,
  MockRateLimitError,
  MockInternalServerError,
} = mocks;

// Import AFTER vi.mock so the module sees the mocked SDK.
import { classifyRecruitingEmail } from "../ai";

// Helper — produce a well-formed Anthropic Message reply
function fakeMessage(body: object) {
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
  };
}

// Suppress noisy console output from the production retry/error logging
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockCreate.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("classifyRecruitingEmail — happy path", () => {
  it("returns the parsed classification on a valid response", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeMessage({
        status: "PHONE_SCREEN",
        confidence: 0.92,
        reasoning: "Recruiter scheduled a 30-min call",
      }),
    );

    const result = await classifyRecruitingEmail(
      "Quick chat next week?",
      "Hey, would love to set up a 30-minute call to chat about the role.",
      "APPLIED",
    );

    expect(result).toEqual({
      status: "PHONE_SCREEN",
      confidence: 0.92,
      reasoning: "Recruiter scheduled a 30-min call",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("clamps out-of-range confidence to [0,1]", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeMessage({
        status: "OFFER",
        confidence: 1.5,
        reasoning: "Offer extended",
      }),
    );

    const result = await classifyRecruitingEmail("Offer", "We're pleased to offer", "INTERVIEWING");
    expect(result.confidence).toBe(1);
  });

  it("falls back to current status when AI returns an invalid status", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeMessage({
        status: "NOT_A_REAL_STATUS",
        confidence: 0.9,
        reasoning: "garbage",
      }),
    );

    const result = await classifyRecruitingEmail("Subject", "Body", "REVIEWING");
    expect(result).toEqual({
      status: "REVIEWING",
      confidence: 0,
      reasoning: "Invalid status in AI response",
    });
  });
});

describe("classifyRecruitingEmail — timeout / abort", () => {
  it("retries when the first attempt aborts (timeout) and succeeds on retry", async () => {
    vi.useFakeTimers();

    mockCreate
      .mockRejectedValueOnce(new MockAPIUserAbortError("aborted"))
      .mockResolvedValueOnce(
        fakeMessage({
          status: "REVIEWING",
          confidence: 0.8,
          reasoning: "Under review",
        }),
      );

    const promise = classifyRecruitingEmail("re: app", "We're reviewing it", "APPLIED");

    // Drain the 2s default backoff + microtasks until the second attempt resolves.
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("REVIEWING");
    expect(result.confidence).toBe(0.8);
  });

  it("returns failure sentinel when both attempts time out", async () => {
    vi.useFakeTimers();

    mockCreate
      .mockRejectedValueOnce(new MockAPIUserAbortError("aborted-1"))
      .mockRejectedValueOnce(new MockAPIUserAbortError("aborted-2"));

    const promise = classifyRecruitingEmail("re: app", "body", "INTERVIEWING");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Caller passed currentStatus=INTERVIEWING; sentinel preserves it with confidence 0.
    expect(result).toEqual({
      status: "INTERVIEWING",
      confidence: 0,
      reasoning: "Classification failed",
    });
  });
});

describe("classifyRecruitingEmail — 429 rate limit", () => {
  it("retries once on 429 with default 2s backoff and succeeds", async () => {
    vi.useFakeTimers();

    mockCreate
      .mockRejectedValueOnce(new MockRateLimitError("rate limited"))
      .mockResolvedValueOnce(
        fakeMessage({
          status: "OFFER",
          confidence: 0.95,
          reasoning: "Offer extended",
        }),
      );

    const promise = classifyRecruitingEmail("offer!", "we are pleased to offer", "INTERVIEWING");

    // Backoff is 2000ms; advance past it.
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("OFFER");
  });

  it("honors retry-after header on 429 (seconds)", async () => {
    vi.useFakeTimers();

    const headers = new Headers({ "retry-after": "3" });
    mockCreate
      .mockRejectedValueOnce(new MockRateLimitError("rate limited", headers))
      .mockResolvedValueOnce(
        fakeMessage({
          status: "REVIEWING",
          confidence: 0.85,
          reasoning: "Reviewing",
        }),
      );

    const promise = classifyRecruitingEmail("subj", "body", "APPLIED");

    // Advance only 2s — should NOT have retried yet because retry-after said 3s.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Advance the rest.
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("REVIEWING");
  });

  it("returns failure sentinel when both attempts hit 429", async () => {
    vi.useFakeTimers();

    mockCreate
      .mockRejectedValueOnce(new MockRateLimitError("rate limited 1"))
      .mockRejectedValueOnce(new MockRateLimitError("rate limited 2"));

    const promise = classifyRecruitingEmail("subj", "body", "PHONE_SCREEN");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: "PHONE_SCREEN",
      confidence: 0,
      reasoning: "Classification failed",
    });
  });
});

describe("classifyRecruitingEmail — 4xx (deterministic)", () => {
  it("does NOT retry on 400 and returns failure sentinel", async () => {
    mockCreate.mockRejectedValueOnce(new MockBadRequestError("bad request"));

    const result = await classifyRecruitingEmail("subj", "body", "APPLIED");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "APPLIED",
      confidence: 0,
      reasoning: "Classification failed",
    });
  });
});

describe("classifyRecruitingEmail — 5xx", () => {
  it("retries once on 5xx and succeeds", async () => {
    vi.useFakeTimers();

    mockCreate
      .mockRejectedValueOnce(new MockInternalServerError("server boom"))
      .mockResolvedValueOnce(
        fakeMessage({
          status: "REJECTED",
          confidence: 0.9,
          reasoning: "Not moving forward",
        }),
      );

    const promise = classifyRecruitingEmail("update", "we are not moving forward", "INTERVIEWING");
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("REJECTED");
  });
});
