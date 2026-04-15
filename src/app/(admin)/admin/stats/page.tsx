import { db } from "@/lib/db"
import { StatCard } from "@/components/admin/stat-card"
import { STATUS_CONFIG } from "@/types"

export const dynamic = "force-dynamic"

export default async function AdminStatsPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    newSignups7d,
    newSignups30d,
    totalApplications,
    applications7d,
    applications30d,
    applicationsByStatus,
    subscriptionsByStatus,
    activeJobs,
    activeBoards,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.application.count(),
    db.application.count({ where: { appliedAt: { gte: sevenDaysAgo } } }),
    db.application.count({ where: { appliedAt: { gte: thirtyDaysAgo } } }),
    db.application.groupBy({ by: ["status"], _count: { status: true } }),
    db.user.groupBy({ by: ["subscriptionStatus"], _count: { subscriptionStatus: true } }),
    db.job.count({ where: { isActive: true } }),
    db.companyBoard.count({ where: { isActive: true } }),
  ])

  const maxAppStatus = Math.max(...applicationsByStatus.map((r) => r._count.status), 1)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Stats</h1>
        <p className="text-zinc-400 text-sm mt-1">Platform analytics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="New Users (7d)" value={newSignups7d} />
        <StatCard label="New Users (30d)" value={newSignups30d} />
        <StatCard label="Total Applications" value={totalApplications} />
        <StatCard label="Applications (7d)" value={applications7d} />
        <StatCard label="Applications (30d)" value={applications30d} />
        <StatCard label="Active Jobs" value={activeJobs} />
        <StatCard label="Active Boards" value={activeBoards} />
      </div>

      {/* Applications by status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Applications by Status</h2>
        <div className="space-y-3">
          {applicationsByStatus
            .sort((a, b) => b._count.status - a._count.status)
            .map((row) => {
              const config = STATUS_CONFIG[row.status]
              const pct = Math.round((row._count.status / maxAppStatus) * 100)
              return (
                <div key={row.status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: config?.color ?? "#a1a1aa" }}>{config?.label ?? row.status}</span>
                    <span className="text-white font-medium">{row._count.status}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: config?.color ?? "#a1a1aa",
                      }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Subscriptions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Users by Subscription</h2>
        <div className="space-y-2">
          {subscriptionsByStatus.map((row) => (
            <div key={row.subscriptionStatus} className="flex items-center justify-between text-sm">
              <span
                className={
                  row.subscriptionStatus === "ACTIVE"
                    ? "text-green-400"
                    : row.subscriptionStatus === "PAST_DUE"
                    ? "text-yellow-400"
                    : "text-zinc-400"
                }
              >
                {row.subscriptionStatus}
              </span>
              <span className="text-white font-medium">{row._count.subscriptionStatus}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
