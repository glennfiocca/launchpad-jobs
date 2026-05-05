import type { AtsProvider } from "@prisma/client";
import type {
  AtsClient,
  NormalizedJob,
  NormalizedQuestion,
  NormalizedFieldType,
  BoardMeta,
} from "../../types";
import type {
  AshbyApiResponse,
  AshbyFieldEntry,
  AshbyFieldType,
  AshbyGraphQLResponse,
} from "./types";
import { mapAshbyJobToNormalized } from "./mapper";
import { discoverAshbyCustomJobMap } from "@/lib/ashby-custom-jobs";

const ASHBY_BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";
const ASHBY_GRAPHQL_URL = "https://jobs.ashbyhq.com/api/non-user-graphql";

const ASHBY_FIELD_TYPE_MAP: Record<AshbyFieldType, NormalizedFieldType> = {
  String: "text",
  SocialLink: "text",
  Email: "email",
  Phone: "phone",
  LongText: "textarea",
  File: "file",
  Boolean: "boolean",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  Location: "text",
  Number: "number",
  Date: "date",
};

const JOB_POSTING_QUERY = `
  query ApiJobPostingWithForms(
    $organizationHostedJobsPageName: String!,
    $jobPostingId: String!
  ) {
    jobPosting(
      organizationHostedJobsPageName: $organizationHostedJobsPageName,
      jobPostingId: $jobPostingId
    ) {
      applicationForm {
        id
        sourceFormDefinitionId
        sections {
          fieldEntries {
            id
            field
            isRequired
            isHidden
            descriptionHtml
          }
        }
      }
    }
  }
`;

/**
 * Ashby implementation of AtsClient.
 * Delegates to the Ashby Posting API and maps responses to normalized types.
 */
export class AshbyAtsClient implements AtsClient {
  readonly provider: AtsProvider = "ASHBY";
  private readonly boardName: string;

  constructor(boardName: string) {
    this.boardName = boardName;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(
        `Ashby API error ${res.status} for ${url}: ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  async getBoard(): Promise<BoardMeta> {
    // Ashby exposes no company-website signal at all (the Posting API has no
    // board-metadata endpoint, and per-job responses lack a top-level URL).
    // Returning the Ashby-hosted careers page as `website` was actively
    // misleading the logo pipeline — it would query logo.dev for
    // `jobs.ashbyhq.com` rather than the actual company. Returning null is
    // honest; the resolver layers (CompanyBoard.website override, the
    // curated overrides map, the multi-TLD heuristic) handle it from there.
    return {
      name: this.boardName,
      website: null,
      logoUrl: null,
    };
  }

  async getJobs(): Promise<readonly NormalizedJob[]> {
    const url = `${ASHBY_BASE_URL}/${this.boardName}?includeCompensation=true`;
    const response = await this.fetchJson<AshbyApiResponse>(url);

    const jobs = response.jobs
      .filter((job) => job.isListed)
      .map(mapAshbyJobToNormalized);

    // Self-hoster URL rewrite. Companies with `customJobsPageUrl` set
    // (Cursor, Deel, Skydio, ElevenLabs, etc.) have disabled the public
    // Ashby board, so the default `https://jobs.ashbyhq.com/{board}/{uuid}`
    // URL lands on a dead SPA shell. We run the full discovery inline:
    //
    //   1. GraphQL → org info (~500ms)
    //   2. Scrape careers index for /careers/{slug} links (~1s)
    //   3. Fetch each per-slug page, extract embedded Ashby UUID (~1s
    //      each, 4-concurrent)
    //   4. Use the slug URL when matched, else `?ashby_jid={uuid}` fallback
    //
    // Cost per self-hoster:
    //   - Slug-style (Cursor ~22s, Linear ~5s): pays for clean slug URLs
    //     on every job, including new ones.
    //   - Query-param-style (~17 others): scrape returns 0 slugs, skips
    //     per-slug fetching, completes in ~1s.
    //
    // For non-self-hosters, returns null after the GraphQL check (~500ms)
    // and the loop below short-circuits.
    const customMap = await discoverAshbyCustomJobMap(this.boardName);
    if (!customMap) return jobs;

    return jobs.map((job) => {
      const slugUrl = customMap.byUuid.get(job.externalId);
      const fallbackUrl = customMap.buildFallbackUrl(job.externalId);
      const newUrl = slugUrl ?? fallbackUrl;
      return newUrl ? { ...job, absoluteUrl: newUrl } : job;
    });
  }

  async getJobQuestions(
    jobExternalId: string
  ): Promise<readonly NormalizedQuestion[]> {
    try {
      const res = await fetch(ASHBY_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationName: "ApiJobPostingWithForms",
          variables: {
            organizationHostedJobsPageName: this.boardName,
            jobPostingId: jobExternalId,
          },
          query: JOB_POSTING_QUERY,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        console.error(
          `Ashby GraphQL error ${res.status} for job ${jobExternalId}: ${text}`
        );
        return [];
      }

      const body = (await res.json()) as AshbyGraphQLResponse;

      if (body.errors?.length) {
        console.error(
          `Ashby GraphQL errors for job ${jobExternalId}:`,
          body.errors.map((e) => e.message).join("; ")
        );
        return [];
      }

      const form = body.data?.jobPosting?.applicationForm;
      if (!form) {
        return [];
      }

      return form.sections.flatMap((section) =>
        section.fieldEntries
          .filter((entry) => entry.isHidden !== true)
          .map(mapFieldEntryToQuestion)
      );
    } catch (error) {
      console.error(
        `Failed to fetch Ashby job questions for ${jobExternalId}:`,
        error
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function mapFieldEntryToQuestion(
  entry: AshbyFieldEntry
): NormalizedQuestion {
  const { field } = entry;
  const fieldType =
    ASHBY_FIELD_TYPE_MAP[field.type] ?? ("text" as NormalizedFieldType);

  const question: NormalizedQuestion = {
    id: field.path,
    label: field.title,
    required: entry.isRequired,
    description: entry.descriptionHtml
      ? stripHtmlTags(entry.descriptionHtml)
      : null,
    fieldType,
  };

  if (
    (field.type === "ValueSelect" || field.type === "MultiValueSelect") &&
    field.selectableValues
  ) {
    return {
      ...question,
      options: field.selectableValues.map((sv) => ({
        value: sv.value,
        label: sv.label,
      })),
    };
  }

  return question;
}
