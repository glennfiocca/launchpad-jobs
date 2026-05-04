import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { MapPin, Briefcase, Wifi, DollarSign, Building2 } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { JobApplyButton } from "@/components/jobs/JobApplyButton";
import type { JobWithCompany } from "@/lib/jobs/get-job";

interface JobDetailProps {
  job: JobWithCompany;
}

const SANITIZE_CONFIG = { USE_PROFILES: { html: true } } as const;

function formatSalary(min: number, max: number, currency: string | null): string {
  const code = currency ?? "USD";
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  });
  return `${fmt.format(min)} – ${fmt.format(max)}`;
}

function postedLabel(date: Date | null): string | null {
  if (!date) return null;
  return `Posted ${formatDistanceToNow(date, { addSuffix: true })}`;
}

/**
 * Server-rendered job detail. Renders all visible content into the HTML
 * source so search engines (and a future metadata layer) see it without JS.
 */
export function JobDetail({ job }: JobDetailProps) {
  const { company } = job;

  const sanitizedDescription = job.content
    ? DOMPurify.sanitize(job.content, SANITIZE_CONFIG)
    : "";

  const sanitizedAbout = company.about
    ? DOMPurify.sanitize(company.about, SANITIZE_CONFIG)
    : "";

  const posted = postedLabel(job.postedAt ?? job.createdAt ?? null);
  const hasSalary = job.salaryMin !== null && job.salaryMax !== null;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 text-zinc-100">
      {/* Closed banner — rendered above-the-fold for closed listings */}
      {!job.isActive && (
        <div
          role="status"
          className="bg-zinc-900 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <span className="text-red-400 text-base leading-none mt-0.5" aria-hidden>
            ●
          </span>
          <div>
            <p className="text-red-300 text-sm font-semibold">
              This role has closed
            </p>
            <p className="text-zinc-400 text-xs mt-1">
              The employer is no longer accepting applications. The listing is
              kept here for reference.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-8">
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
            <p className="text-sm text-zinc-400 mb-1">{company.name}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              {job.title} at {company.name}
            </h1>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5 text-sm">
          {job.location && (
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <MapPin className="w-4 h-4 text-zinc-500" />
              {job.location}
            </span>
          )}
          {job.employmentType && (
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Briefcase className="w-4 h-4 text-zinc-500" />
              {job.employmentType}
            </span>
          )}
          {job.remote && (
            <span className="inline-flex items-center gap-1.5 text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-medium text-xs">
              <Wifi className="w-3.5 h-3.5" />
              Remote
            </span>
          )}
          {hasSalary && (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <DollarSign className="w-4 h-4 text-emerald-400/70" />
              {formatSalary(job.salaryMin!, job.salaryMax!, job.salaryCurrency)}
            </span>
          )}
          {job.department && (
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Building2 className="w-4 h-4 text-zinc-500" />
              {job.department}
            </span>
          )}
          {posted && (
            <span className="inline-flex items-center gap-1.5 text-zinc-500 text-xs bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
              {posted}
            </span>
          )}
        </div>

        <JobApplyButton job={job} />
      </header>

      {/* Description */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">About the Role</h2>
        <div
          className="job-content text-sm text-zinc-200 leading-relaxed min-h-[200px]"
          dangerouslySetInnerHTML={{
            __html: sanitizedDescription || "<p>No description available.</p>",
          }}
        />
      </section>

      {/* Company about — only when present */}
      {sanitizedAbout && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            About {company.name}
          </h2>
          <div
            className="job-content text-sm text-zinc-200 leading-relaxed min-h-[120px]"
            dangerouslySetInnerHTML={{ __html: sanitizedAbout }}
          />
        </section>
      )}
    </article>
  );
}
