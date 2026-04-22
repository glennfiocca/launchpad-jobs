import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/app/api/admin/_helpers";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";
import type { AdminJobReport } from "@/types/admin";

export const dynamic = "force-dynamic";

const reportsQuerySchema = z.object({
  status: z.enum(["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"]).optional(),
  category: z.enum(["SPAM", "INACCURATE", "OFFENSIVE", "BROKEN_LINK", "OTHER"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(request: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const parsed = reportsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { status, category, search, page, limit } = parsed.data;
  const skip = (page - 1) * limit;

  try {
    const where = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { job: { title: { contains: search, mode: "insensitive" as const } } },
              { job: { company: { name: { contains: search, mode: "insensitive" as const } } } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [total, reports] = await Promise.all([
      db.jobReport.count({ where }),
      db.jobReport.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
          job: {
            include: {
              company: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const data: AdminJobReport[] = reports.map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      message: r.message,
      resolvedAt: r.resolvedAt,
      resolvedBy: r.resolvedBy,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user,
      job: r.job
        ? {
            id: r.job.id,
            title: r.job.title,
            publicJobId: r.job.publicJobId,
            company: r.job.company,
          }
        : null,
    }));

    return NextResponse.json<ApiResponse<AdminJobReport[]>>({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
