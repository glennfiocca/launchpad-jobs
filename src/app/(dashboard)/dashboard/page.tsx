import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const [applications, profile] = await Promise.all([
    db.application.findMany({
      where: { userId: session.user.id },
      include: {
        job: { include: { company: true } },
        emails: { orderBy: { receivedAt: "desc" }, take: 1 },
        statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { appliedAt: "desc" },
    }),
    db.userProfile.findUnique({ where: { userId: session.user.id } }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Applications</h1>
          <p className="text-slate-500 mt-1">{applications.length} total applications</p>
        </div>
        <div className="flex items-center gap-3">
          {!profile?.isComplete && (
            <Link
              href="/profile"
              className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100"
            >
              Complete your profile to apply
            </Link>
          )}
          <Link
            href="/jobs"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Browse Jobs
          </Link>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-xl border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-700 mb-2">No applications yet</h2>
          <p className="text-slate-400 text-sm mb-6">Browse jobs and apply with one click.</p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            Browse Jobs
          </Link>
        </div>
      ) : (
        <DashboardClient initialApplications={applications as Parameters<typeof DashboardClient>[0]["initialApplications"]} />
      )}
    </div>
  );
}
