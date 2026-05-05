/**
 * Query Ashby's public GraphQL endpoint for an organization's hosted-jobs
 * configuration. The field that matters is `customJobsPageUrl` — when set,
 * the company self-hosts their careers page (e.g. Cursor at
 * `https://cursor.com/careers`) and the Ashby-hosted board pages are dead
 * SPA shells.
 *
 * Endpoint discovered via schema introspection. The query runs against the
 * same endpoint used by `getJobQuestions()` in the Ashby client; no auth.
 */

const ENDPOINT = "https://jobs.ashbyhq.com/api/non-user-graphql";
const FETCH_TIMEOUT_MS = 8000;

const ORG_INFO_QUERY = `
  query LaunchpadOrgInfo($organizationHostedJobsPageName: String!) {
    organizationFromHostedJobsPageName(
      organizationHostedJobsPageName: $organizationHostedJobsPageName
    ) {
      name
      publicWebsite
      customJobsPageUrl
      hostedJobsPageSlug
    }
  }
`;

export interface AshbyOrgInfo {
  name: string;
  publicWebsite: string | null;
  /** Set when the company self-hosts careers (Cursor → https://cursor.com/careers). */
  customJobsPageUrl: string | null;
  hostedJobsPageSlug: string | null;
}

export async function fetchAshbyOrgInfo(
  boardName: string,
): Promise<AshbyOrgInfo | null> {
  if (!boardName) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "LaunchpadOrgInfo",
        query: ORG_INFO_QUERY,
        variables: { organizationHostedJobsPageName: boardName },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data?: { organizationFromHostedJobsPageName: AshbyOrgInfo | null };
      errors?: Array<{ message: string }>;
    };

    if (body.errors?.length) {
      console.warn(
        `[ashby-org] GraphQL errors for ${boardName}:`,
        body.errors.map((e) => e.message).join("; "),
      );
      return null;
    }

    return body.data?.organizationFromHostedJobsPageName ?? null;
  } catch {
    return null;
  }
}
