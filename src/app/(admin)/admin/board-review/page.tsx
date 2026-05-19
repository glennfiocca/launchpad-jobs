import { BoardReviewRoot } from "@/components/admin/board-review/board-review-root"

export const dynamic = "force-dynamic"

/**
 * Admin: Board Review. Server entry point — auth is enforced by the
 * surrounding `(admin)/layout.tsx` (ADMIN role), so the page itself only
 * needs to mount the client root.
 */
export default function AdminBoardReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Board Review</h1>
        <p className="text-zinc-400 text-sm mt-1">
          One card at a time — approve, reject, or park each board and resolve each unmatched company.
        </p>
      </div>
      <BoardReviewRoot />
    </div>
  )
}
