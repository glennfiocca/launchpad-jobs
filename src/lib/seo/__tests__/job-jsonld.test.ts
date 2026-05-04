import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildJobPostingJsonLd } from "../job-jsonld";
import { VALIDITY_WINDOW_DAYS } from "@/config/seo";
import type { JobWithCompany } from "@/lib/jobs/get-job";

// Shared fixture builder. Tests override individual fields via the partials.
function makeJob(overrides: {
  job?: Partial<JobWithCompany>;
  company?: Partial<JobWithCompany["company"]>;
} = {}): JobWithCompany {
  const company = {
    id: "co_1",
    name: "Acme Corp",
    slug: "acme",
    provider: "GREENHOUSE" as const,
    logoUrl: "https://logos.example/acme.png",
    website: "https://acme.example",
    industry: null,
    size: null,
    about: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides.company,
  };

  const job: JobWithCompany = {
    id: "job_1",
    publicJobId: "PL-abc123",
    externalId: "999001",
    companyId: company.id,
    company,
    provider: "GREENHOUSE",
    title: "Senior Software Engineer",
    location: "San Francisco, CA",
    department: "Engineering",
    employmentType: "Full-time",
    remote: false,
    boardToken: "acme",
    absoluteUrl: "https://boards.greenhouse.io/acme/jobs/999001",
    content: "<p>Build great things at Acme.</p>",
    salaryMin: 150000,
    salaryMax: 220000,
    salaryCurrency: "USD",
    applicationQuestions: [{ id: "q1", label: "Why us?", required: true, type: "text" }],
    isActive: true,
    postedAt: new Date("2026-04-15T12:00:00Z"),
    validThrough: new Date("2026-05-15T12:00:00Z"),
    createdAt: new Date("2026-04-15T11:00:00Z"),
    updatedAt: new Date("2026-04-15T11:00:00Z"),
    ...overrides.job,
  };

  return job;
}

describe("buildJobPostingJsonLd", () => {
  it("happy path: emits all required + recommended fields for a fully populated job", () => {
    const job = makeJob();
    const ld = buildJobPostingJsonLd(job);

    expect(ld["@context"]).toBe("https://schema.org/");
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Senior Software Engineer");
    expect(ld.description).toBe("<p>Build great things at Acme.</p>");
    expect(ld.datePosted).toBe("2026-04-15");
    expect(ld.hiringOrganization).toEqual({
      "@type": "Organization",
      name: "Acme Corp",
      sameAs: "https://acme.example",
      logo: "https://logos.example/acme.png",
    });
    expect(ld.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "San Francisco",
        addressRegion: "CA",
        addressCountry: "US",
      },
    });
    expect(ld.validThrough).toBe("2026-05-15T12:00:00.000Z");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.baseSalary).toEqual({
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: 150000,
        maxValue: 220000,
        unitText: "YEAR",
      },
    });
    expect(ld.directApply).toBe(true);
    expect(ld.identifier).toEqual({
      "@type": "PropertyValue",
      name: "GREENHOUSE",
      value: "999001",
    });
  });

  it("minimum-required: works with only required fields populated", () => {
    const job = makeJob({
      job: {
        location: null,
        department: null,
        employmentType: null,
        content: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        applicationQuestions: null,
        postedAt: null,
        validThrough: null,
      },
      company: { logoUrl: null, website: null },
    });
    const ld = buildJobPostingJsonLd(job);

    expect(ld["@context"]).toBe("https://schema.org/");
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Senior Software Engineer");
    expect(ld.description).toBe("Senior Software Engineer at Acme Corp");
    expect(ld.datePosted).toBe("2026-04-15");
    expect(ld.hiringOrganization).toEqual({
      "@type": "Organization",
      name: "Acme Corp",
    });
    expect(ld.baseSalary).toBeUndefined();
    expect(ld.directApply).toBeUndefined();
  });

  it("non-remote job: jobLocation is set, jobLocationType is omitted", () => {
    const job = makeJob({
      job: { remote: false, location: "Boston, MA" },
    });
    const ld = buildJobPostingJsonLd(job);

    expect(ld.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Boston",
        addressRegion: "MA",
        addressCountry: "US",
      },
    });
    expect(ld.jobLocationType).toBeUndefined();
    expect(ld.applicantLocationRequirements).toBeUndefined();
  });

  it("remote job: emits jobLocationType=TELECOMMUTE + applicantLocationRequirements, omits jobLocation", () => {
    const job = makeJob({
      job: { remote: true, location: "Remote" },
    });
    const ld = buildJobPostingJsonLd(job);

    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.applicantLocationRequirements).toEqual({
      "@type": "Country",
      name: "USA",
    });
    expect(ld.jobLocation).toBeUndefined();
  });

  it("baseSalary is omitted when only one of min/max is set", () => {
    const onlyMin = buildJobPostingJsonLd(
      makeJob({ job: { salaryMin: 100000, salaryMax: null } }),
    );
    const onlyMax = buildJobPostingJsonLd(
      makeJob({ job: { salaryMin: null, salaryMax: 200000 } }),
    );
    const neither = buildJobPostingJsonLd(
      makeJob({ job: { salaryMin: null, salaryMax: null } }),
    );

    expect(onlyMin.baseSalary).toBeUndefined();
    expect(onlyMax.baseSalary).toBeUndefined();
    expect(neither.baseSalary).toBeUndefined();
  });

  it("baseSalary defaults currency to USD when salaryCurrency is null", () => {
    const job = makeJob({
      job: { salaryMin: 100, salaryMax: 200, salaryCurrency: null },
    });
    const ld = buildJobPostingJsonLd(job);
    expect(ld.baseSalary?.currency).toBe("USD");
  });

  it("employment type mapping: maps known strings to schema enum values", () => {
    const cases: Array<[string, string]> = [
      ["Full-time", "FULL_TIME"],
      ["Full Time", "FULL_TIME"],
      ["full time", "FULL_TIME"],
      ["Part-time", "PART_TIME"],
      ["Contract", "CONTRACTOR"],
      ["Contractor", "CONTRACTOR"],
      ["Internship", "INTERN"],
      ["Intern", "INTERN"],
      ["Temporary", "TEMPORARY"],
      ["Volunteer", "VOLUNTEER"],
      ["Per Diem", "PER_DIEM"],
      ["Other", "OTHER"],
    ];

    for (const [input, expected] of cases) {
      const ld = buildJobPostingJsonLd(makeJob({ job: { employmentType: input } }));
      expect(ld.employmentType, `input=${input}`).toBe(expected);
    }
  });

  it("employment type mapping: defaults to FULL_TIME for null/unknown", () => {
    const nullType = buildJobPostingJsonLd(makeJob({ job: { employmentType: null } }));
    const unknown = buildJobPostingJsonLd(
      makeJob({ job: { employmentType: "Asynchronous Gig" } }),
    );
    expect(nullType.employmentType).toBe("FULL_TIME");
    expect(unknown.employmentType).toBe("FULL_TIME");
  });

  it("directApply is true only when applicationQuestions is non-null", () => {
    const withQ = buildJobPostingJsonLd(
      makeJob({ job: { applicationQuestions: [{ id: "1" }] } }),
    );
    const withEmptyArrayQ = buildJobPostingJsonLd(
      makeJob({ job: { applicationQuestions: [] } }),
    );
    const noQ = buildJobPostingJsonLd(
      makeJob({ job: { applicationQuestions: null } }),
    );

    expect(withQ.directApply).toBe(true);
    // An empty array still indicates we own the apply flow — directApply=true.
    expect(withEmptyArrayQ.directApply).toBe(true);
    expect(noQ.directApply).toBeUndefined();
  });

  it("validThrough fallback: now + VALIDITY_WINDOW_DAYS when null", () => {
    const fixedNow = new Date("2026-05-01T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      const job = makeJob({ job: { validThrough: null } });
      const ld = buildJobPostingJsonLd(job);

      const expectedMs = fixedNow.getTime() + VALIDITY_WINDOW_DAYS * 86_400_000;
      expect(ld.validThrough).toBe(new Date(expectedMs).toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it("datePosted: falls back to createdAt when postedAt is null", () => {
    const job = makeJob({
      job: {
        postedAt: null,
        createdAt: new Date("2026-03-10T05:00:00Z"),
      },
    });
    const ld = buildJobPostingJsonLd(job);
    expect(ld.datePosted).toBe("2026-03-10");
  });

  it("location parsing: handles 'City, Country' format", () => {
    const job = makeJob({ job: { remote: false, location: "Berlin, Germany" } });
    const ld = buildJobPostingJsonLd(job);
    expect(ld.jobLocation?.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Berlin",
      addressCountry: "Germany",
    });
  });

  it("location parsing: single-token location yields locality-only address", () => {
    const job = makeJob({ job: { remote: false, location: "London" } });
    const ld = buildJobPostingJsonLd(job);
    expect(ld.jobLocation?.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "London",
    });
  });

  it("location parsing: 'Remote' string with remote=false produces no jobLocation", () => {
    const job = makeJob({ job: { remote: false, location: "Remote" } });
    const ld = buildJobPostingJsonLd(job);
    expect(ld.jobLocation).toBeUndefined();
    // remote=false so we don't emit telecommute either.
    expect(ld.jobLocationType).toBeUndefined();
  });

  it("strips undefined keys from the output object", () => {
    const job = makeJob({
      job: {
        location: null,
        salaryMin: null,
        salaryMax: null,
        applicationQuestions: null,
      },
      company: { logoUrl: null, website: null },
    });
    const ld = buildJobPostingJsonLd(job);

    // No key should hold an explicit `undefined` value.
    for (const key of Object.keys(ld) as Array<keyof typeof ld>) {
      expect(ld[key], `key=${String(key)}`).not.toBeUndefined();
    }
    // Nested organization should also be clean.
    const org = ld.hiringOrganization as unknown as Record<string, unknown>;
    for (const key of Object.keys(org)) {
      expect(org[key], `org.${key}`).not.toBeUndefined();
    }
  });
});
