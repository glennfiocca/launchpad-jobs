import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/app/api/admin/_helpers";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";
import type { AdminJobReport } from "@/types/admin";

const patchReportSchema = z.object({
  status: z.enum(["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"]),
  adminNote: z.string().max(5000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = patchReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { status, adminNote } = parsed.data;
  const isResolved = status === "RESOLVED" || status === "DISMISSED";

  try {
    const existing = await db.jobReport.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Report not found" },
        { status: 404 }
      );
    }

    const updated = await db.jobReport.update({
      where: { id },
      data: {
        status,
        adminNote,
        resolvedAt: isResolved ? new Date() : null,
        resolvedBy: isResolved ? (session.user.email ?? session.user.id) : null,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        job: {
          include: {
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    const data: AdminJobReport = {
      id: updated.id,
      category: updated.category,
      status: updated.status,
      message: updated.message,
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
      adminNote: updated.adminNote,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      user: updated.user,
      job: updated.job
        ? {
            id: updated.job.id,
            title: updated.job.title,
            publicJobId: updated.job.publicJobId,
            company: updated.job.company,
          }
        : null,
    };

    return NextResponse.json<ApiResponse<AdminJobReport>>({ success: true, data });
  } catch (err) {
    console.error("Failed to update report:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to update report" },
      { status: 500 }
    );
  }
}
