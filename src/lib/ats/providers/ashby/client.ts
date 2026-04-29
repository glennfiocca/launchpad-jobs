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
    // Ashby has no separate board metadata endpoint — derive from the jobs response
    return {
      name: this.boardName,
      website: `https://jobs.ashbyhq.com/${this.boardName}`,
      logoUrl: null,
    };
  }

  async getJobs(): Promise<readonly NormalizedJob[]> {
    const url = `${ASHBY_BASE_URL}/${this.boardName}?includeCompensation=true`;
    const response = await this.fetchJson<AshbyApiResponse>(url);

    return response.jobs
      .filter((job) => job.isListed)
      .map(mapAshbyJobToNormalized);
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
