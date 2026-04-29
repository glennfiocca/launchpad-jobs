/**
 * Ingests discovered and validated board tokens into the CompanyBoard table.
 * Uses (provider, boardToken) as the dedup key matching the Prisma @@unique constraint.
 */

import { PrismaClient } from "@prisma/client";
import type { AtsProvider } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidatedBoard } from "./validate-token";

const db = new PrismaClient();

export interface DiscoveryResultFile {
  readonly timestamp: string;
  readonly source: string;
  readonly stats: {
    readonly candidatesTested: number;
    readonly valid: number;
    readonly netNew: number;
    readonly withActiveJobs: number;
  };
  readonly boards: readonly ValidatedBoard[];
}

export async function ingestBoards(
  boards: readonly ValidatedBoard[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const board of boards) {
    const provider: AtsProvider = board.provider ?? "GREENHOUSE";

    try {
      const existing = await db.companyBoard.findUnique({
        where: {
          provider_boardToken: {
            provider,
            boardToken: board.token,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await db.companyBoard.create({
        data: {
          name: board.name,
          boardToken: board.token,
          provider,
          website: board.website,
          isActive: true,
        },
      });
      created++;
    } catch (error) {
      console.error(
        `Failed to ingest board [${provider}] ${board.token}:`,
        error
      );
      skipped++;
    }
  }

  return { created, skipped };
}

export function saveResults(
  results: DiscoveryResultFile,
  outputDir: string
): string {
  const filename = `discovery-results-${results.timestamp}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  return filepath;
}

export function loadResults(filepath: string): DiscoveryResultFile {
  const content = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(content) as DiscoveryResultFile;
}

/**
 * Returns existing tokens as a set of "PROVIDER:token" keys for dedup.
 * Also includes bare tokens for backward compatibility.
 */
export async function getExistingTokens(): Promise<Set<string>> {
  const boards = await db.companyBoard.findMany({
    select: { boardToken: true, provider: true },
  });

  const tokens = new Set<string>();
  for (const b of boards) {
    const lower = b.boardToken.toLowerCase();
    tokens.add(`${b.provider}:${lower}`);
    tokens.add(lower);
  }

  return tokens;
}

export async function disconnect(): Promise<void> {
  await db.$disconnect();
}
