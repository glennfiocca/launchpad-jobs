/**
 * Admin API: update + delete a single CompanyLogoOverride row.
 *
 * Track B.4 of HARDENING_PLAN.md. Auth and shape mirror
 * src/app/api/admin/companies/[id]/route.ts.
 *
 * On any mutation, the in-process cache from the resolver is invalidated so
 * admin edits become visible within the next request, not after the 60s TTL.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, badRequest, notFound } from "../../_helpers";
import { updateLogoOverrideSchema } from "@/lib/validations/admin";
import { invalidateLogoOverrideCache } from "@/lib/company-logo";
import type { ApiResponse } from "@/types";
import type { CompanyLogoOverride } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json();
  const parsed = updateLogoOverrideSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { id } = await params;
  const existing = await db.companyLogoOverride.findUnique({ where: { id } });
  if (!existing) return notFound("Override not found");

  // Enforce uniqueness if (provider, slug) is being changed.
  const nextProvider = parsed.data.provider ?? existing.provider;
  const nextSlug = parsed.data.slug ?? existing.slug;
  if (nextProvider !== existing.provider || nextSlug !== existing.slug) {
    const duplicate = await db.companyLogoOverride.findUnique({
      where: { provider_slug: { provider: nextProvider, slug: nextSlug } },
    });
    if (duplicate && duplicate.id !== id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Another override already uses this (provider, slug)" },
        { status: 409 },
      );
    }
  }

  const updated = await db.companyLogoOverride.update({
    where: { id },
    data: {
      ...(parsed.data.provider !== undefined ? { provider: parsed.data.provider } : {}),
      ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
      ...(parsed.data.website !== undefined ? { website: parsed.data.website || null } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl || null } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
    },
  });

  invalidateLogoOverrideCache();

  // TODO(B.4 follow-up): trigger a logo refetch for the Company row that
  // matches this override's (provider, slug). The mapping is fuzzy — Company
  // slugs use `ashby-{boardToken}` for Ashby while override slugs are
  // already normalized — and the existing /api/admin/companies/[id]/refetch-logo
  // endpoint keys on CompanyBoard.id, not (provider, slug). Wiring this
  // cleanly requires either:
  //   (a) refactoring enrichCompanyLogo to be callable directly with a
  //       (provider, slug) pair, or
  //   (b) adding a "refetch by Company.id" wrapper that doesn't require a
  //       CompanyBoard.id.
  // Either is a small refactor but out of scope for B.4; cache invalidation
  // alone means the next sync cycle picks up the new override automatically.

  return NextResponse.json<ApiResponse<CompanyLogoOverride>>({
    success: true,
    data: updated,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const existing = await db.companyLogoOverride.findUnique({ where: { id } });
  if (!existing) return notFound("Override not found");

  await db.companyLogoOverride.delete({ where: { id } });

  invalidateLogoOverrideCache();

  return NextResponse.json<ApiResponse<{ id: string }>>({
    success: true,
    data: { id },
  });
}
