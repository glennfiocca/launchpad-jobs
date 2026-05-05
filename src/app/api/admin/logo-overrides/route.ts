/**
 * Admin API: list + create CompanyLogoOverride rows.
 *
 * Track B.4 of HARDENING_PLAN.md — DB-backed runtime source of truth for
 * curated logo/website overrides. The TS map at
 * `src/lib/company-logo/overrides.ts` is now a deploy-time seed only.
 *
 * Auth: requireAdminSession (mirrors src/app/api/admin/companies/route.ts).
 * On any mutation, the in-process cache from the resolver is invalidated so
 * admin edits become visible within the next request, not after the 60s TTL.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, badRequest } from "../_helpers";
import { createLogoOverrideSchema, paginationSchema } from "@/lib/validations/admin";
import { invalidateLogoOverrideCache } from "@/lib/company-logo";
import type { ApiResponse } from "@/types";
import type { CompanyLogoOverride } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const url = new URL(req.url);
  const parsed = paginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.message);

  const { page, limit, search } = parsed.data;
  const where = search
    ? {
        OR: [
          { slug: { contains: search, mode: "insensitive" as const } },
          { website: { contains: search, mode: "insensitive" as const } },
          { notes: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.companyLogoOverride.findMany({
      where,
      orderBy: [{ provider: "asc" }, { slug: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.companyLogoOverride.count({ where }),
  ]);

  return NextResponse.json<ApiResponse<CompanyLogoOverride[]>>({
    success: true,
    data: rows,
    meta: { total, page, limit },
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createLogoOverrideSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { provider, slug } = parsed.data;
  const existing = await db.companyLogoOverride.findUnique({
    where: { provider_slug: { provider, slug } },
  });
  if (existing) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "An override already exists for this (provider, slug)" },
      { status: 409 },
    );
  }

  const row = await db.companyLogoOverride.create({
    data: {
      provider,
      slug,
      website: parsed.data.website || null,
      logoUrl: parsed.data.logoUrl || null,
      notes: parsed.data.notes || null,
    },
  });

  invalidateLogoOverrideCache();

  return NextResponse.json<ApiResponse<CompanyLogoOverride>>(
    { success: true, data: row },
    { status: 201 },
  );
}
