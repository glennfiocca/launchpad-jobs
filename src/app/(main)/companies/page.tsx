import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { CompanyLogo } from "@/components/company-logo";

export const metadata: Metadata = {
  title: "Companies | Pipeline",
  description: "Browse companies hiring on Pipeline.",
};

// Index uses ?page= so we render dynamically and lean on the route cache via
// `revalidate`. (`force-static` would force searchParams to be empty.)
export const revalidate = 3600;

const PAGE_SIZE = 50;

interface CompaniesPageProps {
  searchParams: Promise<{ page?: string }>;
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  jobCount: number;
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

/**
 * Returns companies that have at least one active job, ordered by
 * descending active-job count. Implemented as a raw SQL query because
 * Prisma's `_count` filter syntax can't aggregate on a filtered relation
 * AND order by it in a single round-trip.
 */
async function loadCompanies(
  page: number,
): Promise<{ rows: CompanyRow[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totalResult] = await Promise.all([
    db.$queryRaw<CompanyRow[]>`
      SELECT
        c.id,
        c.name,
        c.slug,
        c."logoUrl",
        c.website,
        COUNT(j.id)::int AS "jobCount"
      FROM "Company" c
      INNER JOIN "Job" j ON j."companyId" = c.id AND j."isActive" = true
      GROUP BY c.id
      ORDER BY COUNT(j.id) DESC, c.name ASC
      LIMIT ${PAGE_SIZE}
      OFFSET ${offset}
    `,
    db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM "Company" c
      INNER JOIN "Job" j ON j."companyId" = c.id AND j."isActive" = true
    `,
  ]);

  return { rows, total: totalResult[0]?.count ?? 0 };
}

export default async function CompaniesIndexPage({
  searchParams,
}: CompaniesPageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const { rows, total } = await loadCompanies(page);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="h-full overflow-y-auto bg-black text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">Companies</h1>
          <p className="text-sm text-zinc-400 mt-2">
            {total.toLocaleString()} companies hiring on Pipeline.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-zinc-400">No companies are hiring right now.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rows.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/companies/${company.slug}`}
                  className="flex items-center gap-4 bg-zinc-900 border border-white/10 rounded-xl p-4 hover:border-white/20 hover:bg-zinc-900/80 transition-colors"
                >
                  <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                    <CompanyLogo
                      name={company.name}
                      logoUrl={company.logoUrl}
                      website={company.website}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {company.name}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {company.jobCount}{" "}
                      {company.jobCount === 1 ? "open role" : "open roles"}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">
                    View jobs →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-8 flex items-center justify-between text-sm"
          >
            {hasPrev ? (
              <Link
                href={`/companies?page=${page - 1}`}
                className="text-zinc-300 hover:text-white"
              >
                ← Previous
              </Link>
            ) : (
              <span className="text-zinc-600">← Previous</span>
            )}
            <span className="text-zinc-500">
              Page {page} of {totalPages}
            </span>
            {hasNext ? (
              <Link
                href={`/companies?page=${page + 1}`}
                className="text-zinc-300 hover:text-white"
              >
                Next →
              </Link>
            ) : (
              <span className="text-zinc-600">Next →</span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
