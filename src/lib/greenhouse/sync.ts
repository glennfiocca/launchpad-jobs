import { db } from "@/lib/db";
import { createGreenhouseClient, isRemoteJob, extractDepartment } from "./client";
import { decode } from "html-entities";

interface SyncResult {
  companyName: string;
  boardToken: string;
  jobsAdded: number;
  jobsUpdated: number;
  jobsDeactivated: number;
  errors: string[];
}

// Sync all jobs for a given company board token
export async function syncGreenhouseBoard(
  boardToken: string,
  companyName: string,
  logoUrl?: string
): Promise<SyncResult> {
  const result: SyncResult = {
    companyName,
    boardToken,
    jobsAdded: 0,
    jobsUpdated: 0,
    jobsDeactivated: 0,
    errors: [],
  };

  const client = createGreenhouseClient(boardToken);

  // Upsert company
  const company = await db.company.upsert({
    where: { slug: boardToken },
    update: { name: companyName, ...(logoUrl && { logoUrl }) },
    create: { name: companyName, slug: boardToken, logoUrl },
  });

  let response;
  try {
    response = await client.getJobs();
  } catch (err) {
    result.errors.push(`Failed to fetch jobs: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const activeExternalIds = new Set<string>();

  for (const ghJob of response.jobs) {
    const externalId = String(ghJob.id);
    activeExternalIds.add(externalId);
    const location = ghJob.location?.name ?? null;
    const department = extractDepartment(ghJob.departments);
    const remote = location ? isRemoteJob(location) : false;

    const jobData = {
      title: ghJob.title,
      location,
      department,
      remote,
      boardToken,
      absoluteUrl: ghJob.absolute_url,
      content: ghJob.content ? decode(ghJob.content) : null,
      isActive: true,
      postedAt: ghJob.updated_at ? new Date(ghJob.updated_at) : null,
    };

    try {
      const existing = await db.job.findUnique({
        where: { externalId_boardToken: { externalId, boardToken } },
      });

      if (existing) {
        await db.job.update({
          where: { id: existing.id },
          data: jobData,
        });
        result.jobsUpdated++;
      } else {
        await db.job.create({
          data: {
            ...jobData,
            externalId,
            companyId: company.id,
          },
        });
        result.jobsAdded++;
      }
    } catch (err) {
      result.errors.push(
        `Job ${externalId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Deactivate jobs no longer in Greenhouse
  const deactivated = await db.job.updateMany({
    where: {
      boardToken,
      isActive: true,
      externalId: { notIn: Array.from(activeExternalIds) },
    },
    data: { isActive: false },
  });
  result.jobsDeactivated = deactivated.count;

  return result;
}

// Seed a curated list of well-known company board tokens
// More can be added via an admin UI later
export const SEED_BOARDS: Array<{ token: string; name: string; logoUrl?: string }> = [
  { token: "anthropic", name: "Anthropic" },
  { token: "stripe", name: "Stripe" },
  { token: "linear", name: "Linear" },
  { token: "vercel", name: "Vercel" },
  { token: "figma", name: "Figma" },
  { token: "notion", name: "Notion" },
  { token: "openai", name: "OpenAI" },
  { token: "databricks", name: "Databricks" },
  { token: "hashicorp", name: "HashiCorp" },
  { token: "shopify", name: "Shopify" },
];
