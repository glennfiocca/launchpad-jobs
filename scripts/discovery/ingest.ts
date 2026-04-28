/**
 * Ingests discovered and validated board tokens into the CompanyBoard table.
 * Follows the same upsert pattern as prisma/seed-company-boards.ts.
 */

import { PrismaClient } from "@prisma/client";
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
    try {
      const existing = await db.companyBoard.findUnique({
        where: { boardToken: board.token },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await db.companyBoard.create({
        data: {
          name: board.name,
          boardToken: board.token,
          website: board.website,
          isActive: true,
        },
      });
      created++;
    } catch (error) {
      console.error(`Failed to ingest board ${board.token}:`, error);
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

export async function getExistingTokens(): Promise<Set<string>> {
  const boards = await db.companyBoard.findMany({
    select: { boardToken: true },
  });
  return new Set(boards.map((b) => b.boardToken.toLowerCase()));
}

export async function disconnect(): Promise<void> {
  await db.$disconnect();
}
