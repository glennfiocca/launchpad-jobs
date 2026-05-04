import { describe, it, expect } from "vitest";
import { buildJobMetadata } from "../job-metadata";
import type { JobWithCompany } from "@/lib/jobs/get-job";

function makeJob(overrides: {
  job?: Partial<JobWithCompany>;
  company?: Partial<JobWithCompany["company"]>;
} = {}): JobWithCompany {
  const company = {
    id: "co_1",
    name: "Acme",
    slug: "acme",
    provider: "GREENHOUSE" as const,
    logoUrl: null,
    website: null,
    industry: null,
    size: null,
    about: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides.company,
  };

  const job: JobWithCompany = {
    id: "job_1",
    publicJobId: "PL-meta1",
    externalId: "999001",
    companyId: company.id,
    company,
    provider: "GREENHOUSE",
    title: "Engineer",
    location: "San Francisco, CA",
    department: null,
    employmentType: "Full-time",
    remote: false,
    boardToken: "acme",
    absoluteUrl: null,
    content: "<p>Build great things at Acme. We are hiring engineers.</p>",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    applicationQuestions: null,
    isActive: true,
    postedAt: new Date("2026-04-15T12:00:00Z"),
    validThrough: null,
    createdAt: new Date("2026-04-15T11:00:00Z"),
    updatedAt: new Date("2026-04-15T11:00:00Z"),
    ...overrides.job,
  };

  return job;
}

describe("buildJobMetadata", () => {
  it("title is truncated to 60 characters", () => {
    const job = makeJob({
      job: {
        title: "Extremely Long Senior Staff Principal Software Engineer Position",
      },
      company: { name: "OverlyVerboseCorporationOfAmerica" },
    });
    const meta = buildJobMetadata(job);
    expect(typeof meta.title).toBe("string");
    expect((meta.title as string).length).toBeLessThanOrEqual(60);
  });

  it("title includes job title, company, location, and Pipeline brand when room allows", () => {
    const job = makeJob({
      job: { title: "Engineer", location: "NYC, NY" },
      company: { name: "Acme" },
    });
    const meta = buildJobMetadata(job);
    expect(meta.title).toContain("Engineer");
    expect(meta.title).toContain("Acme");
    expect(meta.title).toContain("Pipeline");
  });

  it("description extracts plain text from HTML content", () => {
    const job = makeJob({
      job: {
        content: "<p>Hello <strong>world</strong>! &amp; welcome.</p>",
      },
    });
    const meta = buildJobMetadata(job);
    expect(meta.description).not.toContain("<p>");
    expect(meta.description).not.toContain("<strong>");
    expect(meta.description).toContain("Hello world");
    expect(meta.description).toContain("&");
  });

  it("description is capped at ~155 chars (with possible salary suffix)", () => {
    const longContent = "<p>" + "Lorem ipsum dolor sit amet ".repeat(20) + "</p>";
    const job = makeJob({ job: { content: longContent } });
    const meta = buildJobMetadata(job);
    // Give some headroom for the salary suffix when present; here salary is null.
    expect((meta.description ?? "").length).toBeLessThanOrEqual(160);
  });

  it("description includes salary suffix when both bounds are present", () => {
    const job = makeJob({
      job: {
        content: "<p>Cool gig.</p>",
        salaryMin: 150000,
        salaryMax: 220000,
        salaryCurrency: "USD",
      },
    });
    const meta = buildJobMetadata(job);
    expect(meta.description).toMatch(/USD 150K.{1,3}220K/);
  });

  it("description falls back to generic copy when content is null", () => {
    const job = makeJob({
      job: { content: null, title: "Engineer" },
      company: { name: "Acme" },
    });
    const meta = buildJobMetadata(job);
    expect(meta.description).toBe("Apply to Engineer at Acme on Pipeline.");
  });

  it("canonical URL points to trypipeline.ai/jobs/{publicJobId}", () => {
    const job = makeJob({ job: { publicJobId: "PL-canon" } });
    const meta = buildJobMetadata(job);
    expect(meta.alternates?.canonical).toBe("https://trypipeline.ai/jobs/PL-canon");
  });

  it("openGraph block is wired with title, description, url, siteName, image", () => {
    const job = makeJob({ job: { publicJobId: "PL-og" } });
    const meta = buildJobMetadata(job);

    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.openGraph?.description).toBe(meta.description);
    expect((meta.openGraph as { url?: string })?.url).toBe(
      "https://trypipeline.ai/jobs/PL-og",
    );
    expect(meta.openGraph?.siteName).toBe("Pipeline");
    expect((meta.openGraph as { type?: string })?.type).toBe("website");
    const images = (meta.openGraph as { images?: string[] })?.images ?? [];
    expect(images[0]).toBe("/jobs/PL-og/opengraph-image");
  });

  it("twitter card is summary_large_image with mirrored title/description", () => {
    const job = makeJob();
    const meta = buildJobMetadata(job);

    expect((meta.twitter as { card?: string })?.card).toBe("summary_large_image");
    expect((meta.twitter as { title?: string })?.title).toBe(meta.title);
    expect((meta.twitter as { description?: string })?.description).toBe(
      meta.description,
    );
  });

  it("location 'Remote' is reflected in title", () => {
    const job = makeJob({
      job: { title: "Engineer", location: "Remote" },
      company: { name: "Acme" },
    });
    const meta = buildJobMetadata(job);
    expect(meta.title).toContain("Remote");
  });
});
