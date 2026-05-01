import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { DispatchStatusBadge } from "@/components/admin/applications/dispatch-status-badge"

export const dynamic = "force-dynamic"

export default async function AdminQueuePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/auth/signin")

  const applications = await db.application.findMany({
    where: { submissionStatus: "AWAITING_OPERATOR" },
    select: {
      id: true,
      submissionError: true,
      claimedByUserId: true,
      claimedAt: true,
      appliedAt: true,
      claimedBy: { select: { id: true, email: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
      job: {
        select: {
          title: true,
          company: { select: { name: true } },
        },
      },
      documents: {
        where: { kind: "OPERATOR_SUMMARY" },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { appliedAt: "asc" },
  })

  const currentUserId = session.user.id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Operator Queue</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Applications blocked by CAPTCHA waiting for human-assisted submission.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3">
          <p className="text-xs text-zinc-500">Total in queue</p>
          <p className="text-2xl font-bold text-white">{applications.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3">
          <p className="text-xs text-zinc-500">Unclaimed</p>
          <p className="text-2xl font-bold text-amber-300">
            {applications.filter((a) => !a.claimedByUserId).length}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3">
          <p className="text-xs text-zinc-500">Claimed by me</p>
          <p className="text-2xl font-bold text-blue-300">
            {applications.filter((a) => a.claimedByUserId === currentUserId).length}
          </p>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-400">Queue is empty — no applications awaiting operator review.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Applicant</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Company / Job</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Time in Queue</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Error</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Claimed By</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">PDF</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const isMine = app.claimedByUserId === currentUserId
                return (
                  <tr key={app.id} className="border-b border-zinc-800/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-zinc-300">
                      {app.user.name ?? app.user.email ?? app.user.id}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-300">{app.job.company.name}</p>
                      <p className="text-zinc-500 text-xs">{app.job.title}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                      {app.submissionError ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {app.claimedByUserId ? (
                        <span className={isMine ? "text-blue-400" : "text-zinc-400"}>
                          {isMine ? "You" : (app.claimedBy?.email ?? app.claimedByUserId)}
                        </span>
                      ) : (
                        <span className="text-amber-400">Unclaimed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DispatchStatusBadge status="AWAITING_OPERATOR" />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {app.documents.length > 0 ? (
                        <span className="text-emerald-400" title="Q&A summary PDF available">
                          ✓
                        </span>
                      ) : (
                        <span className="text-zinc-600" title="PDF not yet generated">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
