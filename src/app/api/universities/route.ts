import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { universitiesQuerySchema } from "@/lib/validations/places";
import type { UniversitySuggestion } from "@/lib/validations/places";
import type { ApiResponse } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = universitiesQuerySchema.safeParse(
    Object.fromEntries(searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { q, limit } = parsed.data;

  const universities = await db.university.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: limit,
    select: { id: true, name: true, city: true, state: true },
  });

  const suggestions: UniversitySuggestion[] = universities;

  return NextResponse.json<ApiResponse<UniversitySuggestion[]>>({
    success: true,
    data: suggestions,
  });
}
