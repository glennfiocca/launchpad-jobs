import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getJobByPublicId } from "@/lib/jobs/get-job";
import { JobDetail } from "@/components/jobs/JobDetail";
import { buildJobMetadata } from "@/lib/seo/job-metadata";
import { buildJobPostingJsonLd } from "@/lib/seo/job-jsonld";

// ISR: serve from cache for an hour, regenerate in the background after.
export const dynamic = "force-static";
export const revalidate = 3600;

interface JobPageProps {
  params: Promise<{ publicJobId: string }>;
}

// Per-job metadata: title, description, canonical, OG, Twitter card.
// generateMetadata fetches independently from the page body — Next dedupes
// per request and the 1h ISR window absorbs the duplicate read at build/regen.
export async function generateMetadata(
  { params }: JobPageProps,
): Promise<Metadata> {
  const { publicJobId } = await params;
  const job = await getJobByPublicId(publicJobId);

  if (!job) {
    return {
      title: "Job not found | Pipeline",
      robots: "noindex",
    };
  }

  return buildJobMetadata(job);
}

export default async function JobPage({ params }: JobPageProps) {
  const { publicJobId } = await params;
  const job = await getJobByPublicId(publicJobId);

  if (!job) {
    // Returns a real 404 status — handled by ./not-found.tsx
    notFound();
  }

  // schema.org JobPosting block. Using dangerouslySetInnerHTML is the
  // documented Next.js pattern for emitting raw JSON-LD without HTML escaping.
  const jsonLd = JSON.stringify(buildJobPostingJsonLd(job));

  return (
    <>
      <JobDetail job={job} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    </>
  );
}
