import Link from "next/link"
import { db } from "@/lib/db"
import { StatCard } from "@/components/admin/stat-card"
import { STATUS_CONFIG } from "@/types"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    newSignups30d,
    totalApplications,
    applications30d,
    activeJobs,
    activeBoards,
    recentApplications,
    applicationsByStatus,
    lastSync,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.application.count(),
    db.application.count({ where: { appliedAt: { gte: thirtyDaysAgo } } }),
    db.job.count({ where: { isActive: true } }),
    db.companyBoard.count({ where: { isActive: true } }),
    db.application.findMany({
      take: 10,
      orderBy: { appliedAt: "desc" },
      include: {
        user: { select: { email: true, name: true } },
        job: { select: { title: true, publicJobId: true, company: { select: { name: true } } } },
      },
    }),
    db.application.groupBy({ by: ["status"], _count: { status: true } }),
    db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">Platform overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Users" value={totalUsers} sub={`+${newSignups30d} last 30d`} />
        <StatCard label="Total Applications" value={totalApplications} sub={`+${applications30d} last 30d`} />
        <StatCard label="Active Jobs" value={activeJobs} />
        <StatCard label="Active Boards" value={activeBoards} />
        <StatCard label="New Signups (30d)" value={newSignups30d} />
        <StatCard label="Applications (30d)" value={applications30d} />
      </div>

      {/* Last Sync widget */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Last Sync</p>
          {lastSync ? (
            <>
              <p className="text-white font-medium mt-1">
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }).format(lastSync.startedAt)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {lastSync.status.replace("_", " ")} &middot;{" "}
                {lastSync.totalAdded + lastSync.totalUpdated + lastSync.totalDeactivated} changes
              </p>
            </>
          ) : (
            <p className="text-zinc-500 text-sm mt-1">No syncs yet</p>
          )}
        </div>
        <Link
          href="/admin/sync"
          className="text-xs text-violet-400 hover:text-violet-300 hover:underline shrink-0"
        >
          View all syncs →
        </Link>
      </div>

      {/* Applications by status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Applications by Status</h2>
        <div className="space-y-2">
          {applicationsByStatus
            .sort((a, b) => b._count.status - a._count.status)
            .map((row) => {
              const config = STATUS_CONFIG[row.status]
              return (
                <div key={row.status} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: config?.color ?? "#a1a1aa" }}>
                    {config?.label ?? row.status}
                  </span>
                  <span className="text-sm font-medium text-white">{row._count.status}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Recent applications */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Recent Applications</h2>
        <div className="space-y-3">
          {recentApplications.map((app) => (
            <div key={app.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-white">{app.job.title}</p>
                <p className="text-[10px] font-mono text-zinc-500 tabular-nums">{app.job.publicJobId}</p>
                <p className="text-xs text-zinc-400">
                  {app.job.company.name} · {app.user.email}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-zinc-500">
                  {new Date(app.appliedAt).toLocaleDateString()}
                </span>
                <p className="text-xs" style={{ color: STATUS_CONFIG[app.status]?.color ?? "#a1a1aa" }}>
                  {STATUS_CONFIG[app.status]?.label ?? app.status}
                </p>
              </div>
            </div>
          ))}
          {recentApplications.length === 0 && (
            <p className="text-sm text-zinc-500">No applications yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
