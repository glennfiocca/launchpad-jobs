import { describe, it, expect } from "vitest";
import { jobsQuerySchema, SORT_OPTIONS } from "../validations/jobs";

describe("jobsQuerySchema — saved view + recently_saved sort", () => {
  it("accepts saved=true", () => {
    const r = jobsQuerySchema.safeParse({ saved: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.saved).toBe("true");
  });

  it("accepts saved=false", () => {
    const r = jobsQuerySchema.safeParse({ saved: "false" });
    expect(r.success).toBe(true);
  });

  it("rejects garbage saved values", () => {
    const r = jobsQuerySchema.safeParse({ saved: "yes" });
    expect(r.success).toBe(false);
  });

  it("includes 'recently_saved' in the sort enum", () => {
    expect(SORT_OPTIONS).toContain("recently_saved");
  });

  it("accepts sort=recently_saved", () => {
    const r = jobsQuerySchema.safeParse({ sort: "recently_saved" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sort).toBe("recently_saved");
  });

  it("preserves default sort=newest when sort is omitted", () => {
    const r = jobsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sort).toBe("newest");
  });
});
