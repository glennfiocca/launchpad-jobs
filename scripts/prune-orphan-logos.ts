// scripts/prune-orphan-logos.ts
// Track C.1 — Spaces orphan logo prune.
//
// Lists every object under the `logos/` prefix in DO Spaces, diffs against
// `Company.logoUrl` keys in the DB, and deletes anything in Spaces that no
// row references.
//
// Idempotent: a second `--apply` run after deletes reports 0 orphans.
//
// Usage:
//   # Dry run (default — prints what would be deleted, makes no changes):
//   npx tsx scripts/prune-orphan-logos.ts
//
//   # Actually delete orphans:
//   npx tsx scripts/prune-orphan-logos.ts --apply
//
//   # Cap the delete count under --apply (safety):
//   npx tsx scripts/prune-orphan-logos.ts --apply --limit=100
//
//   # Override the prefix (useful for testing against a sub-prefix):
//   npx tsx scripts/prune-orphan-logos.ts --prefix=logos/manual/
//
// TODO(orchestrator): Run weekly via DO scheduled job. Add to .do/app.yaml jobs[]:
//   - name: prune-orphan-logos
//     schedule: "0 4 * * 0"   # 04:00 UTC every Sunday
//     run_command: npx tsx scripts/prune-orphan-logos.ts --apply
//     instance_size_slug: basic-xxs
//     environment_slug: node-js
//     envs: <inherit DATABASE_URL + DO_SPACES_*>

import { db } from "@/lib/db";
import {
  listSpacesObjects,
  deleteSpacesObjects,
  SPACES_BUCKET,
  SPACES_REGION,
  type SpacesObject,
} from "@/lib/spaces";
import { extractSpacesKey } from "@/lib/spaces-url";

interface CliFlags {
  apply: boolean;
  limit: number | null;
  prefix: string;
}

function parseFlags(argv: string[]): CliFlags {
  let apply = false;
  let limit: number | null = null;
  let prefix = "logos/";

  for (const arg of argv.slice(2)) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = n;
    } else if (arg.startsWith("--prefix=")) {
      prefix = arg.slice("--prefix=".length);
      if (prefix.length === 0) throw new Error("--prefix cannot be empty");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { apply, limit, prefix };
}

function requireSpacesEnv(): void {
  const missing: string[] = [];
  if (!process.env.DO_SPACES_KEY) missing.push("DO_SPACES_KEY");
  if (!process.env.DO_SPACES_SECRET) missing.push("DO_SPACES_SECRET");
  if (!process.env.DO_SPACES_BUCKET) missing.push("DO_SPACES_BUCKET");
  if (!process.env.DO_SPACES_REGION) missing.push("DO_SPACES_REGION");

  if (missing.length > 0) {
    console.error(
      `[prune-orphan-logos] ERROR: missing env vars: ${missing.join(", ")}`
    );
    console.error(
      "[prune-orphan-logos] Add them to .env (see DEPLOYMENT.md for values) and re-run."
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("[prune-orphan-logos] ERROR: DATABASE_URL not set");
    process.exit(1);
  }
}

/**
 * Builds the set of Spaces keys currently referenced by Company.logoUrl rows.
 * Skips logo.dev URLs and any other non-Spaces URL — those are not in our
 * bucket and so cannot orphan anything.
 */
async function loadReferencedKeys(): Promise<Set<string>> {
  const rows = await db.company.findMany({
    where: { logoUrl: { not: null } },
    select: { logoUrl: true },
  });

  const keys = new Set<string>();
  for (const { logoUrl } of rows) {
    const key = extractSpacesKey(logoUrl);
    if (key !== null) keys.add(key);
  }
  return keys;
}

function formatSummary(
  totalObjects: number,
  referencedInDb: number,
  orphans: number
): string {
  const ratio = totalObjects === 0 ? 0 : (orphans / totalObjects) * 100;
  return [
    `  total objects:   ${totalObjects}`,
    `  referenced in DB: ${referencedInDb}`,
    `  orphans:         ${orphans}`,
    `  orphan ratio:    ${orphans}/${totalObjects} = ${ratio.toFixed(1)}%`,
  ].join("\n");
}

function diffOrphans(
  spacesObjects: SpacesObject[],
  referencedKeys: Set<string>
): SpacesObject[] {
  return spacesObjects.filter((obj) => !referencedKeys.has(obj.key));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  requireSpacesEnv();

  console.log(`[prune-orphan-logos] bucket=${SPACES_BUCKET} region=${SPACES_REGION}`);
  console.log(`[prune-orphan-logos] prefix=${flags.prefix} apply=${flags.apply}`);
  if (flags.limit !== null) {
    console.log(`[prune-orphan-logos] limit=${flags.limit}`);
  }
  console.log("");

  console.log("[prune-orphan-logos] Listing Spaces objects...");
  const spacesObjects = await listSpacesObjects(flags.prefix);
  console.log(`[prune-orphan-logos] Found ${spacesObjects.length} objects`);

  console.log("[prune-orphan-logos] Loading referenced logoUrl keys from DB...");
  const referencedKeys = await loadReferencedKeys();
  console.log(`[prune-orphan-logos] Found ${referencedKeys.size} referenced keys`);
  console.log("");

  const orphans = diffOrphans(spacesObjects, referencedKeys);

  console.log("[prune-orphan-logos] Summary:");
  console.log(formatSummary(spacesObjects.length, referencedKeys.size, orphans.length));
  console.log("");

  if (orphans.length === 0) {
    console.log("[prune-orphan-logos] No orphans found. Done.");
    await db.$disconnect();
    return;
  }

  const previewLimit = 50;
  const preview = orphans.slice(0, previewLimit);
  console.log(
    `[prune-orphan-logos] Orphan keys (${
      orphans.length > previewLimit ? `first ${previewLimit} of ${orphans.length}` : orphans.length
    }):`
  );
  for (const obj of preview) {
    console.log(`  - ${obj.key} (${obj.size} bytes)`);
  }
  if (orphans.length > previewLimit) {
    console.log(`  ... and ${orphans.length - previewLimit} more`);
  }
  console.log("");

  if (!flags.apply) {
    console.log("[prune-orphan-logos] DRY RUN — no objects deleted.");
    console.log("[prune-orphan-logos] Re-run with --apply to delete the orphans above.");
    await db.$disconnect();
    return;
  }

  const targets =
    flags.limit !== null && orphans.length > flags.limit
      ? orphans.slice(0, flags.limit)
      : orphans;

  if (flags.limit !== null && orphans.length > flags.limit) {
    console.log(
      `[prune-orphan-logos] --limit=${flags.limit} active: deleting first ${targets.length} of ${orphans.length} orphans`
    );
  }

  const keysToDelete = targets.map((o) => o.key);
  console.log(`[prune-orphan-logos] Deleting ${keysToDelete.length} objects...`);

  const BATCH = 1000;
  let deleted = 0;
  let totalErrors = 0;

  for (let i = 0; i < keysToDelete.length; i += BATCH) {
    const batch = keysToDelete.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(keysToDelete.length / BATCH);

    process.stdout.write(
      `[prune-orphan-logos] Batch ${batchNum}/${totalBatches} (${batch.length} keys)... `
    );

    const result = await deleteSpacesObjects(batch);
    deleted += result.deleted;
    totalErrors += result.errors.length;

    process.stdout.write(
      `deleted=${result.deleted} errors=${result.errors.length}\n`
    );

    for (const err of result.errors) {
      console.error(`  ! ${err.key}: ${err.error}`);
    }
  }

  console.log("");
  console.log(`[prune-orphan-logos] Done. Deleted ${deleted}, errors ${totalErrors}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[prune-orphan-logos] FATAL:", err);
  process.exit(1);
});
