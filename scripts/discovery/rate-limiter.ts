/**
 * Rate limiter for Greenhouse API requests.
 * Sequential processing with configurable delay and exponential backoff on 429.
 */

interface RateLimiterConfig {
  readonly requestsPerSecond: number;
  readonly maxRetries: number;
  readonly baseBackoffMs: number;
  readonly timeoutMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerSecond: 5,
  baseBackoffMs: 2000,
  maxRetries: 3,
  timeoutMs: 10000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly delayMs: number;
  private lastRequestTime = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.delayMs = Math.ceil(1000 / this.config.requestsPerSecond);
  }

  async fetch(url: string): Promise<Response> {
    // Enforce rate limit
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      this.lastRequestTime = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.timeoutMs
        );

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 429) {
          const backoff =
            this.config.baseBackoffMs * Math.pow(2, attempt);
          console.warn(
            `Rate limited (429) on ${url}, backing off ${backoff}ms (attempt ${attempt + 1}/${this.config.maxRetries + 1})`
          );
          await sleep(backoff);
          continue;
        }

        return response;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));

        if (lastError.name === "AbortError") {
          console.warn(
            `Timeout on ${url} (attempt ${attempt + 1}/${this.config.maxRetries + 1})`
          );
        }

        if (attempt < this.config.maxRetries) {
          const backoff =
            this.config.baseBackoffMs * Math.pow(2, attempt);
          await sleep(backoff);
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }
}
