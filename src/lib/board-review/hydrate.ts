import type { CompanyBoard } from "@prisma/client"
import { db } from "@/lib/db"
import { companySlug } from "./company-slug"
import { rawBoardApiUrl, canonicalBoardUrl } from "./board-urls"
import type { QueueCard, QueueCardSampleJob } from "./types"

/**
 * Inflate a raw `CompanyBoard` row into the rich `QueueCard` shape the
 * client renders. Issues the joined Company lookup, the latest active Job,
 * the active-job count, and the most recent sync timestamp in parallel so
 * the queue feels instantaneous.
 */
export async function hydrateBoardCard(board: CompanyBoard): Promise<QueueCard> {
  const slug = companySlug(board.provider, board.boardToken)

  const [company, sampleJobRow, activeJobCount, latestJob] = await Promise.all([
    db.company.findUnique({
      where: { provider_slug: { provider: board.provider, slug } },
      select: { name: true, logoUrl: true, logoSource: true, website: true },
    }),
    db.job.findFirst({
      where: { provider: board.provider, boardToken: board.boardToken, isActive: true },
      orderBy: { postedAt: "desc" },
      select: {
        id: true,
        title: true,
        location: true,
        absoluteUrl: true,
        applyUrl: true,
        postedAt: true,
      },
    }),
    db.job.count({
      where: { provider: board.provider, boardToken: board.boardToken, isActive: true },
    }),
    // Most-recently-updated job stands in for "last sync time for this
    // board". Avoids a heavier SyncBoardResult lookup; updatedAt is bumped
    // on every sync regardless of whether anything changed.
    db.job.findFirst({
      where: { provider: board.provider, boardToken: board.boardToken },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ])

  const sampleJob: QueueCardSampleJob | null = sampleJobRow
    ? {
        id: sampleJobRow.id,
        title: sampleJobRow.title,
        location: sampleJobRow.location,
        absoluteUrl: sampleJobRow.absoluteUrl,
        applyUrl: sampleJobRow.applyUrl,
        postedAt: sampleJobRow.postedAt ? sampleJobRow.postedAt.toISOString() : null,
      }
    : null

  return {
    kind: "board",
    id: board.id,
    name: board.name,
    boardToken: board.boardToken,
    provider: board.provider,
    reviewStatus: board.reviewStatus,
    isActive: board.isActive,
    hosting: board.hosting,
    applyHostname: board.applyHostname,
    suspiciousSlug: board.suspiciousSlug,
    reviewerNotes: board.reviewerNotes,
    createdAt: board.createdAt.toISOString(),
    companyName: company?.name ?? null,
    companyLogoUrl: company?.logoUrl ?? null,
    companyLogoSource: company?.logoSource ?? null,
    companyWebsite: company?.website ?? null,
    activeJobCount,
    lastSyncAt: latestJob?.updatedAt ? latestJob.updatedAt.toISOString() : null,
    sampleJob,
    rawApiUrl: rawBoardApiUrl(board.provider, board.boardToken),
    canonicalBoardUrl: canonicalBoardUrl(board.provider, board.boardToken),
  }
}
