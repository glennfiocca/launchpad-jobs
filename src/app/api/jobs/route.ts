import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ApiResponse, JobWithCompany } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") ?? "";
  const location = searchParams.get("location") ?? "";
  const department = searchParams.get("department") ?? "";
  const company = searchParams.get("company") ?? "";
  const remote = searchParams.get("remote");
  const employmentType = searchParams.get("employmentType") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Number(searchParams.get("limit") ?? "20"));
  const skip = (page - 1) * limit;

  const where = {
    isActive: true,
    ...(query && {
      OR: [
        { title: { contains: query, mode: "insensitive" as const } },
        { content: { contains: query, mode: "insensitive" as const } },
        { company: { name: { contains: query, mode: "insensitive" as const } } },
      ],
    }),
    ...(location && {
      location: { contains: location, mode: "insensitive" as const },
    }),
    ...(department && {
      department: { contains: department, mode: "insensitive" as const },
    }),
    ...(company && {
      company: { name: { contains: company, mode: "insensitive" as const } },
    }),
    ...(remote === "true" && { remote: true }),
    ...(employmentType && {
      employmentType: { contains: employmentType, mode: "insensitive" as const },
    }),
  };

  const [total, jobs] = await Promise.all([
    db.job.count({ where }),
    db.job.findMany({
      where,
      include: {
        company: true,
        _count: { select: { applications: true } },
      },
      orderBy: { postedAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return NextResponse.json<ApiResponse<JobWithCompany[]>>({
    success: true,
    data: jobs as JobWithCompany[],
    meta: { total, page, limit },
  });
}
