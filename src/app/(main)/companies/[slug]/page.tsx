import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Wifi, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumb-jsonld";

// ISR: hub pages change as jobs come and go, but a 1h re-render is plenty.
export const dynamic = "force-static";
export const revalidate = 3600;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";

// Below this number of active jobs, the page risks looking thin to search
// engines. We still render it (so the user can land on it from internal
// links), but mark it noindex/follow so Google de-prioritizes indexing
// without dropping crawl signals to the linked job pages.
const THIN_PAGE_THRESHOLD = 2;

interface CompanyPageProps {
  params: Promise<{ slug: string }>;
}

interface CompanyJob {
  id: string;
  publicJobId: string;
  title: string;
  location: string | null;
  remote: boolean;
  department: string | null;
}

interface LoadedCompany {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  about: string | null;
  jobs: CompanyJob[];
}

/**
 * Look up a company by slug.
 *
 * Trade-off: the unique constraint on Company is `(provider, slug)` — slug
 * alone is not unique. We use `findFirst` with a deterministic
 * `orderBy: { name: "asc" }` because:
 *   1. Same-slug collisions across providers are rare (companies are
 *      typically on a single ATS).
 *   2. URLs stay clean — `/companies/{slug}` is more shareable than
 *      `/companies/{provider}-{slug}`.
 * If/when collisions become real, we can disambiguate by encoding the
 * provider into the URL slug at sync time.
 */
async function loadCompany(slug: string): Promise<LoadedCompany | null> {
  const company = await db.company.findFirst({
    where: { slug },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      website: true,
      about: true,
      jobs: {
        where: { isActive: true },
        orderBy: [{ department: "asc" }, { postedAt: "desc" }, { title: "asc" }],
        select: {
          id: true,
          publicJobId: true,
          title: true,
          location: true,
          remote: true,
          department: true,
        },
      },
    },
  });

  return company;
}

const OTHER_ROLES_GROUP = "Other Roles";

function groupByDepartment(jobs: CompanyJob[]): Map<string, CompanyJob[]> {
  const groups = new Map<string, CompanyJob[]>();
  for (const job of jobs) {
    const key = job.department?.trim() || OTHER_ROLES_GROUP;
    const existing = groups.get(key);
    if (existing) {
      existing.push(job);
    } else {
      groups.set(key, [job]);
    }
  }
  return groups;
}

export async function generateMetadata({
  params,
}: CompanyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) {
    return { title: "Company not found | Pipeline" };
  }

  const activeJobCount = company.jobs.length;
  const isThin = activeJobCount < THIN_PAGE_THRESHOLD;
  const canonical = `${APP_URL}/companies/${slug}`;

  return {
    title: `${company.name} Jobs | Pipeline`,
    description: `Browse ${activeJobCount} open ${
      activeJobCount === 1 ? "role" : "roles"
    } at ${company.name}.`,
    alternates: { canonical },
    // Thin pages get noindex/follow — keep crawl flow to job pages but
    // avoid contributing to "thin content" Google penalties.
    robots: isThin ? "noindex, follow" : undefined,
  };
}

export default async function CompanyHubPage({ params }: CompanyPageProps) {
  const { slug } = await params;
  const company = await loadCompany(slug);

  if (!company) {
    notFound();
  }

  const activeJobCount = company.jobs.length;
  const departmentGroups = groupByDepartment(company.jobs);
  // Sort group keys: known departments first (alpha), "Other Roles" last.
  const orderedKeys = Array.from(departmentGroups.keys()).sort((a, b) => {
    if (a === OTHER_ROLES_GROUP) return 1;
    if (b === OTHER_ROLES_GROUP) return -1;
    return a.localeCompare(b);
  });

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Companies", href: "/companies" },
    { label: company.name },
  ];

  return (
    <div className="h-full overflow-y-auto bg-black text-zinc-100">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumbs items={breadcrumbs} />

        {/* Above-the-fold header */}
        <header className="mb-10">
          <div className="flex items-start gap-4 mb-5">
            {company.logoUrl && (
              <div className="shrink-0">
                <Image
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  width={80}
                  height={80}
                  priority
                  className="rounded-xl bg-white/5 border border-white/10 object-contain"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                Jobs at {company.name}
              </h1>
              <p className="text-sm text-zinc-400 mt-2">
                {activeJobCount}{" "}
                {activeJobCount === 1 ? "open role" : "open roles"}
              </p>
            </div>
          </div>

          {company.about && (
            <section className="mb-4">
              <h2 className="text-base font-semibold text-white mb-2">
                About {company.name}
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {company.about}
              </p>
            </section>
          )}

          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
            >
              Visit company website
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          )}
        </header>

        {/* Below-the-fold: jobs grouped by department */}
        {activeJobCount === 0 ? (
          <p className="text-zinc-400">
            No open roles at {company.name} right now.
          </p>
        ) : (
          orderedKeys.map((key) => {
            const jobs = departmentGroups.get(key)!;
            return (
              <section key={key} className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-3">
                  {key}
                </h2>
                <ul className="space-y-2">
                  {jobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.publicJobId}`}
                        className="block bg-zinc-900 border border-white/10 rounded-xl p-4 hover:border-white/20 hover:bg-zinc-900/80 transition-colors"
                      >
                        <p className="text-sm font-semibold text-white">
                          {job.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-zinc-500">
                          {job.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" aria-hidden />
                              {job.location}
                            </span>
                          )}
                          {job.remote && (
                            <span className="inline-flex items-center gap-1 text-blue-400">
                              <Wifi className="w-3 h-3" aria-hidden />
                              Remote
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </article>
    </div>
  );
}
