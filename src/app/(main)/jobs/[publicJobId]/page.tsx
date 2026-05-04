import { notFound } from "next/navigation";
import { getJobByPublicId } from "@/lib/jobs/get-job";
import { JobDetail } from "@/components/jobs/JobDetail";

// ISR: serve from cache for an hour, regenerate in the background after.
export const dynamic = "force-static";
export const revalidate = 3600;

interface JobPageProps {
  params: Promise<{ publicJobId: string }>;
}

export default async function JobPage({ params }: JobPageProps) {
  const { publicJobId } = await params;
  const job = await getJobByPublicId(publicJobId);

  if (!job) {
    // Returns a real 404 status — handled by ./not-found.tsx
    notFound();
  }

  return <JobDetail job={job} />;
}
