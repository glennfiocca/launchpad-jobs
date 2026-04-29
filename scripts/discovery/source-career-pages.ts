/**
 * Source C: Discover board tokens by crawling company career pages.
 * Searches for both Greenhouse and Ashby URLs in career page HTML.
 */

import type { AtsProvider } from "@prisma/client";
import type { TokenValidator, ValidationResult } from "./validate-token";

const GREENHOUSE_URL_REGEX =
  /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9][a-z0-9-]{1,50})/gi;

const GREENHOUSE_EMBED_REGEX =
  /greenhouse\.io\/(?:embed\/)?job_board\/js\?for=([a-z0-9][a-z0-9-]{1,50})/gi;

const ASHBY_URL_REGEX =
  /jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9-]{1,50})/gi;

const ASHBY_API_REGEX =
  /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9][a-z0-9-]{1,50})/gi;

const CAREER_PAGE_PATHS = ["/careers", "/jobs", "/join", "/work-with-us", "/about/careers"];

const SKIP_TOKENS = new Set([
  "embed",
  "api",
  "v1",
  "boards",
  "jobs",
  "undefined",
  "null",
  "example",
  "test",
  "posting-api",
  "job-board",
]);

interface CompanyToCheck {
  readonly name: string;
  readonly website: string;
}

interface CareerPageCandidate {
  readonly token: string;
  readonly provider: AtsProvider;
}

function extractTokensFromHtml(html: string): readonly CareerPageCandidate[] {
  const seen = new Set<string>();
  const candidates: CareerPageCandidate[] = [];

  // Greenhouse patterns
  for (const regex of [GREENHOUSE_URL_REGEX, GREENHOUSE_EMBED_REGEX]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const token = match[1].toLowerCase();
      const key = `GREENHOUSE:${token}`;
      if (!SKIP_TOKENS.has(token) && token.length >= 2 && !seen.has(key)) {
        seen.add(key);
        candidates.push({ token, provider: "GREENHOUSE" });
      }
    }
  }

  // Ashby patterns
  for (const regex of [ASHBY_URL_REGEX, ASHBY_API_REGEX]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const token = match[1].toLowerCase();
      const key = `ASHBY:${token}`;
      if (!SKIP_TOKENS.has(token) && token.length >= 2 && !seen.has(key)) {
        seen.add(key);
        candidates.push({ token, provider: "ASHBY" });
      }
    }
  }

  return candidates;
}

async function fetchCareerPage(
  baseUrl: string,
  careerPath: string
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, "")}${careerPath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LaunchpadBot/1.0; job-discovery)",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return html;
  } catch {
    return null;
  }
}

/**
 * Well-known company websites to check.
 * These are companies that are likely to use Greenhouse but whose
 * board token may not be an obvious slug of their name.
 */
const WELL_KNOWN_COMPANIES: readonly CompanyToCheck[] = [
  { name: "Snap", website: "https://www.snap.com" },
  { name: "Spotify", website: "https://www.spotify.com" },
  { name: "Slack", website: "https://www.slack.com" },
  { name: "Lyft", website: "https://www.lyft.com" },
  { name: "Palantir", website: "https://www.palantir.com" },
  { name: "Robinhood", website: "https://www.robinhood.com" },
  { name: "Snowflake", website: "https://www.snowflake.com" },
  { name: "Confluent", website: "https://www.confluent.io" },
  { name: "HashiCorp", website: "https://www.hashicorp.com" },
  { name: "Elastic", website: "https://www.elastic.co" },
  { name: "MongoDB", website: "https://www.mongodb.com" },
  { name: "Twilio", website: "https://www.twilio.com" },
  { name: "Unity", website: "https://www.unity.com" },
  { name: "Roblox", website: "https://www.roblox.com" },
  { name: "Discord", website: "https://www.discord.com" },
  { name: "Notion", website: "https://www.notion.so" },
  { name: "Figma", website: "https://www.figma.com" },
  { name: "Canva", website: "https://www.canva.com" },
  { name: "Grammarly", website: "https://www.grammarly.com" },
  { name: "Asana", website: "https://www.asana.com" },
  { name: "HubSpot", website: "https://www.hubspot.com" },
  { name: "Zendesk", website: "https://www.zendesk.com" },
  { name: "Okta", website: "https://www.okta.com" },
  { name: "SentinelOne", website: "https://www.sentinelone.com" },
  { name: "Zscaler", website: "https://www.zscaler.com" },
  { name: "Cloudflare", website: "https://www.cloudflare.com" },
  { name: "Datadog", website: "https://www.datadoghq.com" },
  { name: "Confluent", website: "https://www.confluent.io" },
  { name: "Fastly", website: "https://www.fastly.com" },
  { name: "Sumo Logic", website: "https://www.sumologic.com" },
  { name: "New Relic", website: "https://www.newrelic.com" },
  { name: "Splunk", website: "https://www.splunk.com" },
  { name: "Atlassian", website: "https://www.atlassian.com" },
  { name: "JFrog", website: "https://www.jfrog.com" },
  { name: "GitLab", website: "https://www.gitlab.com" },
  { name: "GitHub", website: "https://www.github.com" },
  { name: "Vercel", website: "https://www.vercel.com" },
  { name: "Netlify", website: "https://www.netlify.com" },
  { name: "DigitalOcean", website: "https://www.digitalocean.com" },
  { name: "Linode", website: "https://www.linode.com" },
  { name: "Akamai", website: "https://www.akamai.com" },
  { name: "Palo Alto Networks", website: "https://www.paloaltonetworks.com" },
  { name: "CrowdStrike", website: "https://www.crowdstrike.com" },
  { name: "Fortinet", website: "https://www.fortinet.com" },
  { name: "Proofpoint", website: "https://www.proofpoint.com" },
  { name: "Wiz", website: "https://www.wiz.io" },
  { name: "Snyk", website: "https://www.snyk.io" },
  { name: "Recorded Future", website: "https://www.recordedfuture.com" },
  { name: "Abnormal Security", website: "https://www.abnormalsecurity.com" },
];

export interface CareerPageResult {
  readonly source: string;
  readonly pagesChecked: number;
  readonly tokensFound: number;
  readonly results: readonly ValidationResult[];
}

export async function discoverFromCareerPages(
  validator: TokenValidator,
  additionalCompanies?: readonly CompanyToCheck[],
  onProgress?: (completed: number, total: number, current: string) => void,
  ashbyValidator?: TokenValidator
): Promise<CareerPageResult> {
  const companies = [
    ...WELL_KNOWN_COMPANIES,
    ...(additionalCompanies ?? []),
  ];

  console.log(`Checking career pages for ${companies.length} companies...`);

  const allCandidates = new Map<string, CareerPageCandidate>();
  let pagesChecked = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    onProgress?.(i + 1, companies.length, company.name);

    for (const careerPath of CAREER_PAGE_PATHS) {
      const html = await fetchCareerPage(company.website, careerPath);
      if (html) {
        pagesChecked++;
        const candidates = extractTokensFromHtml(html);
        for (const c of candidates) {
          const key = `${c.provider}:${c.token}`;
          if (!allCandidates.has(key)) {
            allCandidates.set(key, c);
          }
        }
        if (candidates.length > 0) {
          const labels = candidates.map(
            (c) => `[${c.provider}] ${c.token}`
          );
          console.log(
            `  FOUND on ${company.name}${careerPath}: ${labels.join(", ")}`
          );
          break; // Found tokens, skip other career paths for this company
        }
      }
    }
  }

  const candidateList = [...allCandidates.values()];
  console.log(
    `Found ${candidateList.length} tokens from ${pagesChecked} career pages`
  );

  // Validate all candidates, dispatching to the appropriate validator
  const results: ValidationResult[] = [];

  for (let i = 0; i < candidateList.length; i++) {
    const candidate = candidateList[i];
    const activeValidator =
      candidate.provider === "ASHBY" && ashbyValidator
        ? ashbyValidator
        : validator;

    const result = await activeValidator.validate(candidate.token);
    results.push(result);

    if (result.valid && result.board) {
      console.log(
        `  VALID: [${candidate.provider}] ${candidate.token} -> ${result.board.name} (${result.board.jobCount} jobs)`
      );
    }
  }

  return {
    source: "career-pages",
    pagesChecked,
    tokensFound: candidateList.length,
    results,
  };
}
