import { db } from "@/lib/db";
import { generateUniquePublicJobId } from "@/lib/public-job-id";
import { createGreenhouseClient, isRemoteJob, extractDepartment } from "./client";
import { createNotification } from "@/lib/notifications";
import { decode } from "html-entities";

interface SyncResult {
  companyName: string;
  boardToken: string;
  jobsAdded: number;
  jobsUpdated: number;
  jobsDeactivated: number;
  applicationsUpdated: number;
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
    applicationsUpdated: 0,
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
          data: {
            ...jobData,
            ...(!existing.publicJobId
              ? { publicJobId: await generateUniquePublicJobId() }
              : {}),
          },
        });
        result.jobsUpdated++;
      } else {
        await db.job.create({
          data: {
            ...jobData,
            externalId,
            companyId: company.id,
            publicJobId: await generateUniquePublicJobId(),
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

  // Mark active applications on now-removed listings as LISTING_REMOVED
  if (deactivated.count > 0) {
    const removedJobs = await db.job.findMany({
      where: {
        boardToken,
        isActive: false,
        externalId: { notIn: Array.from(activeExternalIds) },
      },
      select: { id: true },
    });

    const removedJobIds = removedJobs.map((j) => j.id);

    // Find applications that are still in an "active" state for these jobs
    const affectedApplications = await db.application.findMany({
      where: {
        jobId: { in: removedJobIds },
        status: { notIn: ["REJECTED", "WITHDRAWN", "LISTING_REMOVED", "OFFER"] },
      },
      include: { job: { include: { company: true } } },
    });

    for (const app of affectedApplications) {
      try {
        await db.application.update({
          where: { id: app.id },
          data: { status: "LISTING_REMOVED" },
        });

        await db.applicationStatusHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: "LISTING_REMOVED",
            reason: "Job listing removed by employer",
            triggeredBy: "system",
          },
        });

        // Notify the applicant (fire-and-forget — sync must not fail because of this)
        createNotification({
          userId: app.userId,
          type: "LISTING_REMOVED",
          title: `Listing removed: ${app.job.title} at ${app.job.company.name}`,
          body: "The employer has removed this job listing. Your application history is preserved.",
          ctaUrl: `/dashboard?app=${app.id}`,
          ctaLabel: "View Dashboard",
          applicationId: app.id,
          jobId: app.jobId,
          data: {
            type: "LISTING_REMOVED",
            applicationId: app.id,
            jobId: app.jobId,
            jobTitle: app.job.title,
            companyName: app.job.company.name,
          },
          dedupeKey: `LISTING_REMOVED:${app.id}`,
        }).catch(() => undefined);

        result.applicationsUpdated++;
      } catch (err) {
        result.errors.push(
          `Application ${app.id} LISTING_REMOVED update: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}

/** Fetch active boards from the database. Use this instead of SEED_BOARDS in production. */
export async function getActiveBoards(): Promise<
  Array<{ token: string; name: string; logoUrl?: string; website?: string }>
> {
  const boards = await db.companyBoard.findMany({
    where: { isActive: true },
    select: { boardToken: true, name: true, logoUrl: true, website: true },
  })
  return boards.map((b) => ({
    token: b.boardToken,
    name: b.name,
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    ...(b.website ? { website: b.website } : {}),
  }))
}

// Seed a curated list of well-known company board tokens
// More can be added via an admin UI later
export const SEED_BOARDS: Array<{ token: string; name: string; logoUrl?: string; website?: string }> = [
  // Original
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
  // Tech & software
  { token: "okta", name: "Okta" },
  { token: "twilio", name: "Twilio" },
  { token: "coinbase", name: "Coinbase" },
  { token: "cloudflare", name: "Cloudflare" },
  { token: "mongodb", name: "MongoDB" },
  { token: "datadog", name: "Datadog" },
  { token: "elastic", name: "Elastic" },
  { token: "amplitude", name: "Amplitude" },
  { token: "braze", name: "Braze" },
  { token: "appian", name: "Appian" },
  { token: "applovin", name: "AppLovin" },
  { token: "webflow", name: "Webflow" },
  { token: "commvault", name: "Commvault" },
  { token: "agilysys", name: "Agilysys" },
  { token: "bandwidth", name: "Bandwidth" },
  { token: "avepoint", name: "AvePoint" },
  { token: "digimarc", name: "Digimarc" },
  { token: "audioeye", name: "AudioEye" },
  { token: "affinity", name: "Affinity" },
  { token: "celonis", name: "Celonis" },
  { token: "samsara", name: "Samsara" },
  { token: "couchbaseinc", name: "Couchbase" },
  { token: "bottomlinetechnologies", name: "Bottomline Technologies" },
  { token: "alarmcom", name: "Alarm.com" },
  { token: "dropbox", name: "Dropbox" },
  { token: "1stdibscom", name: "1stDibs" },
  { token: "vianttechnology", name: "Viant Technology" },
  { token: "backblaze", name: "Backblaze" },
  { token: "airship", name: "Airship" },
  { token: "alchemy", name: "Alchemy" },
  { token: "check", name: "Check" },
  { token: "chime", name: "Chime" },
  { token: "community", name: "Community" },
  { token: "corescientific", name: "Core Scientific" },
  { token: "coreweave", name: "CoreWeave" },
  // Consumer & marketplace
  { token: "airbnb", name: "Airbnb" },
  { token: "carvana", name: "Carvana" },
  { token: "doordashusa", name: "DoorDash" },
  { token: "cargurus", name: "CarGurus" },
  { token: "pinterest", name: "Pinterest" },
  { token: "duolingo", name: "Duolingo" },
  { token: "agoda", name: "Agoda" },
  { token: "buzzfeed", name: "BuzzFeed" },
  { token: "angi", name: "Angi" },
  { token: "allbirds", name: "Allbirds" },
  { token: "hellofresh", name: "HelloFresh" },
  { token: "riotgames", name: "Riot Games" },
  { token: "clear", name: "CLEAR" },
  // Fintech & financial
  { token: "affirm", name: "Affirm" },
  { token: "apollo", name: "Apollo" },
  { token: "block", name: "Block" },
  { token: "public", name: "Public" },
  { token: "optoinvest", name: "Opto Invest" },
  { token: "proshares", name: "ProShares" },
  { token: "pathward", name: "Pathward" },
  { token: "bitcoindepot", name: "Bitcoin Depot" },
  { token: "bitfarms", name: "Bitfarms" },
  // Enterprise & infrastructure
  { token: "costar", name: "CoStar" },
  { token: "godaddy", name: "GoDaddy" },
  { token: "esri", name: "Esri" },
  { token: "canonical", name: "Canonical" },
  { token: "axon", name: "Axon" },
  { token: "verisign", name: "VeriSign" },
  { token: "align", name: "Align Technology" },
  { token: "eqtcorporation", name: "EQT Corporation" },
  // Deep tech & aerospace
  { token: "spacex", name: "SpaceX" },
  { token: "lucidmotors", name: "Lucid Motors" },
  { token: "andurilindustries", name: "Anduril Industries" },
  { token: "appliedintuition", name: "Applied Intuition" },
  { token: "aurorainnovation", name: "Aurora Innovation" },
  { token: "archer", name: "Archer Aviation" },
  { token: "astspacemobile", name: "AST SpaceMobile" },
  { token: "axiom", name: "Axiom Space" },
  { token: "asteralabs", name: "Astera Labs" },
  // Biotech & pharma
  { token: "abcellera", name: "AbCellera" },
  { token: "absci", name: "Absci" },
  { token: "acadiapharmaceuticals", name: "Acadia Pharmaceuticals" },
  { token: "adaptivebiotechnologies", name: "Adaptive Biotechnologies" },
  { token: "apogeetherapeutics", name: "Apogee Therapeutics" },
  { token: "arvinas", name: "Arvinas" },
  { token: "axsometherapeutics", name: "Axsome Therapeutics" },
  { token: "avalotherapeutics", name: "Avalo Therapeutics" },
  { token: "axogen", name: "Axogen" },
  { token: "beamtherapeutics", name: "Beam Therapeutics" },
  { token: "billiontoone", name: "BillionToOne" },
  { token: "bridgebio", name: "BridgeBio" },
  { token: "carbon", name: "Carbon" },
  { token: "caredxinc", name: "CareDx" },
  { token: "cariboubiosciencesinc", name: "Caribou Biosciences" },
  { token: "celcuity", name: "Celcuity" },
  { token: "ceribell", name: "Ceribell" },
  { token: "cerus", name: "Cerus" },
  { token: "cogentbiosciences", name: "Cogent Biosciences" },
  { token: "compasspathways", name: "Compass Pathways" },
  { token: "compasstherapeutics", name: "Compass Therapeutics" },
  { token: "corcepttherapeutics", name: "Corcept Therapeutics" },
  { token: "cytokinetics", name: "Cytokinetics" },
  { token: "dayonebiopharmaceuticals", name: "Day One Biopharmaceuticals" },
  { token: "definiumtherapeutics", name: "Definium Therapeutics" },
  { token: "dianthustherapeutics", name: "Dianthus Therapeutics" },
  { token: "dynetherapeutics", name: "Dyne Therapeutics" },
  { token: "alumis", name: "Alumis" },
  { token: "amylyx", name: "Amylyx" },
  { token: "anterix", name: "Anterix" },
  { token: "cloverhealth", name: "Clover Health" },
  // Other / misc
  { token: "nerdy", name: "Nerdy" },
  { token: "bayada", name: "Bayada" },
  { token: "lakefieldveterinarygroup", name: "Lakefield Veterinary Group" },
  { token: "assetliving", name: "Asset Living" },
  { token: "coupang", name: "Coupang" },
  { token: "olsson", name: "Olsson" },
  { token: "metron", name: "Metron" },
  { token: "yld", name: "YLD" },
  { token: "hasbro", name: "Hasbro" },
  { token: "fox", name: "Fox Corporation" },
  { token: "genuine", name: "Genuine Parts" },
  { token: "realpha", name: "reAlpha" },
  { token: "airsculpt", name: "AirSculpt" },
  { token: "aura", name: "Aura" },
  { token: "able", name: "Able" },
  { token: "acumen", name: "Acumen" },
  { token: "activate", name: "Activate" },
  { token: "allied", name: "Allied" },
  { token: "apex", name: "Apex" },
  { token: "ark", name: "Ark" },
  { token: "array", name: "Array" },
  { token: "baidu", name: "Baidu" },
  { token: "beam", name: "Beam" },
  { token: "beyond", name: "Beyond Meat" },
  { token: "bluemoonmetals", name: "Blue Moon Metals" },
  { token: "bold", name: "Bold" },
  { token: "broadway", name: "Broadway" },
  { token: "caribou", name: "Caribou" },
  { token: "charles", name: "Charles" },
  { token: "clearfield", name: "Clearfield" },
  { token: "comstock", name: "Comstock" },
  { token: "crescent", name: "Crescent" },
  { token: "ess", name: "ESS Tech" },
  { token: "general", name: "General" },
  { token: "international", name: "International" },
  { token: "journey", name: "Journey" },
  { token: "universal", name: "Universal" },
];
