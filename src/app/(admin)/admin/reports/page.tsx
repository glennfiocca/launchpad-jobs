import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { AdminReportsClient } from "./reports-client"

export const dynamic = "force-dynamic"

const CATEGORY_CONFIG = {
  SPAM: { label: "Spam", color: "text-red-400", bg: "bg-red-500/10" },
  INACCURATE: { label: "Inaccurate", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  OFFENSIVE: { label: "Offensive", color: "text-orange-400", bg: "bg-orange-500/10" },
  BROKEN_LINK: { label: "Broken Link", color: "text-blue-400", bg: "bg-blue-500/10" },
  OTHER: { label: "Other", color: "text-zinc-400", bg: "bg-zinc-700/50" },
} as const

const STATUS_CONFIG = {
  OPEN: { label: "Open", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  TRIAGED: { label: "Triaged", color: "text-blue-400", bg: "bg-blue-500/10" },
  RESOLVED: { label: "Resolved", color: "text-green-400", bg: "bg-green-500/10" },
  DISMISSED: { label: "Dismissed", color: "text-zinc-500", bg: "bg-zinc-700/50" },
} as const

export { CATEGORY_CONFIG, STATUS_CONFIG }

export default async function AdminReportsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const reports = await db.jobReport.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true } },
      job: {
        include: {
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  const counts = {
    OPEN: reports.filter((r) => r.status === "OPEN").length,
    TRIAGED: reports.filter((r) => r.status === "TRIAGED").length,
    RESOLVED: reports.filter((r) => r.status === "RESOLVED").length,
    DISMISSED: reports.filter((r) => r.status === "DISMISSED").length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Job Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">{reports.length} total reports</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"] as const).map((s) => (
          <div key={s} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500">{STATUS_CONFIG[s].label}</p>
            <p className={`text-2xl font-bold mt-1 ${STATUS_CONFIG[s].color}`}>{counts[s]}</p>
          </div>
        ))}
      </div>

      {/* Reports list */}
      <AdminReportsClient
        initialReports={reports.map((r) => ({
          id: r.id,
          category: r.category,
          status: r.status,
          message: r.message,
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
          resolvedBy: r.resolvedBy,
          adminNote: r.adminNote,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          user: r.user,
          job: r.job
            ? {
                id: r.job.id,
                title: r.job.title,
                publicJobId: r.job.publicJobId,
                company: r.job.company,
              }
            : null,
        }))}
        categoryConfig={CATEGORY_CONFIG}
        statusConfig={STATUS_CONFIG}
      />
    </div>
  )
}
