import { NextResponse } from "next/server";
import { requireAdminSession } from "../_helpers";
import type { ApiResponse } from "@/types";

/**
 * Logo backfill API.
 *
 * GET  — Returns status and results of the current or most recent backfill.
 * POST — Starts a logo backfill for all companies missing logos.
 */

interface BackfillStatus {
  running: boolean;
  progress: { completed: number; total: number; current: string };
  startedAt: string;
}

interface BackfillResult {
  completedAt: string;
  enriched: number;
  failed: number;
  total: number;
  durationMs: number;
}

let currentRun: BackfillStatus | null = null;
let lastResult: BackfillResult | null = null;

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  return NextResponse.json<
    ApiResponse<{ status: BackfillStatus | null; lastResult: BackfillResult | null }>
  >({
    success: true,
    data: { status: currentRun, lastResult },
  });
}

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  if (currentRun) {
    return NextResponse.json<ApiResponse<{ status: BackfillStatus }>>(
      {
        success: false,
        error: "A logo backfill is already in progress",
        data: { status: currentRun },
      },
      { status: 409 }
    );
  }

  currentRun = {
    running: true,
    progress: { completed: 0, total: 0, current: "Loading companies..." },
    startedAt: new Date().toISOString(),
  };

  runBackfill().catch((err) => {
    console.error("[logo-backfill] Fatal:", err);
    currentRun = null;
  });

  return NextResponse.json<ApiResponse<{ status: BackfillStatus }>>(
    { success: true, data: { status: currentRun } },
    { status: 202 }
  );
}

async function runBackfill(): Promise<void> {
  const startTime = Date.now();

  try {
    const { db } = await import("@/lib/db");
    const { enrichCompanyLogo } = await import("@/lib/logo-enrichment");

    const companies = await db.company.findMany({
      where: { logoUrl: null },
      select: { id: true, name: true, website: true },
    });

    if (currentRun) {
      currentRun.progress.total = companies.length;
      currentRun.progress.current = `Found ${companies.length} companies without logos`;
    }

    let enriched = 0;
    let failed = 0;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      if (currentRun) {
        currentRun.progress.completed = i;
        currentRun.progress.current = company.name;
      }

      const cdnUrl = await enrichCompanyLogo(company);
      if (cdnUrl) {
        enriched++;
      } else {
        failed++;
      }
    }

    lastResult = {
      completedAt: new Date().toISOString(),
      enriched,
      failed,
      total: companies.length,
      durationMs: Date.now() - startTime,
    };
  } finally {
    currentRun = null;
  }
}
