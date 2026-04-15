import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const TYPE_CONFIG = {
  BUG: { label: "Bug", color: "text-red-400", bg: "bg-red-500/10" },
  FEATURE: { label: "Idea", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  PRAISE: { label: "Praise", color: "text-pink-400", bg: "bg-pink-500/10" },
  OTHER: { label: "Other", color: "text-zinc-400", bg: "bg-zinc-700/50" },
} as const

type FeedbackType = keyof typeof TYPE_CONFIG

export default async function AdminFeedbackPage() {
  const feedback = await db.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  })

  const counts: Record<FeedbackType, number> = {
    BUG: feedback.filter((f) => f.type === "BUG").length,
    FEATURE: feedback.filter((f) => f.type === "FEATURE").length,
    PRAISE: feedback.filter((f) => f.type === "PRAISE").length,
    OTHER: feedback.filter((f) => f.type === "OTHER").length,
  }

  const ratedItems = feedback.filter((f) => f.rating !== null)
  const avgRating =
    ratedItems.length > 0
      ? (ratedItems.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratedItems.length).toFixed(1)
      : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Feedback</h1>
        <p className="text-zinc-400 text-sm mt-1">{feedback.length} submissions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(["BUG", "FEATURE", "PRAISE", "OTHER"] as const).map((t) => (
          <div key={t} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500">{TYPE_CONFIG[t].label}</p>
            <p className={`text-2xl font-bold mt-1 ${TYPE_CONFIG[t].color}`}>{counts[t]}</p>
          </div>
        ))}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Avg Rating</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{avgRating ?? "—"}</p>
        </div>
      </div>

      {/* Feedback list */}
      <div className="space-y-3">
        {feedback.length === 0 && (
          <p className="text-zinc-500 text-sm">No feedback yet.</p>
        )}
        {feedback.map((item) => {
          const config = TYPE_CONFIG[item.type as FeedbackType]
          const rating = item.rating ?? 0
          return (
            <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.color}`}
                  >
                    {config.label}
                  </span>
                  {item.rating !== null && (
                    <span className="text-yellow-400 text-xs">
                      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  {new Date(item.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{item.message}</p>

              <div className="flex items-center gap-4 text-xs text-zinc-600">
                {item.userEmail && <span>{item.userEmail}</span>}
                {item.pageUrl && (
                  <span className="truncate max-w-xs" title={item.pageUrl}>
                    {item.pageUrl.replace(/^https?:\/\/[^/]+/, "")}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
