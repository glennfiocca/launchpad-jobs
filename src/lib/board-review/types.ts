import type {
  AtsProvider,
  BoardHosting,
  LogoSource,
  ReviewStatus,
} from "@prisma/client"

// ─── Queue card payload ─────────────────────────────────────────────────────
// Returned by GET /api/admin/board-review/next?kind=queue. Everything the
// reviewer needs to act is denormalized into this shape so the client never
// has to chain follow-up fetches.

export interface QueueCardSampleJob {
  id: string
  title: string
  location: string | null
  absoluteUrl: string | null
  applyUrl: string | null
  postedAt: string | null
}

export interface QueueCard {
  kind: "board"
  id: string
  name: string
  boardToken: string
  provider: AtsProvider
  reviewStatus: ReviewStatus
  isActive: boolean
  hosting: BoardHosting
  applyHostname: string | null
  suspiciousSlug: boolean
  reviewerNotes: string | null
  createdAt: string
  // Company-side fields (joined on companySlug)
  companyName: string | null
  companyLogoUrl: string | null
  companyLogoSource: LogoSource | null
  companyWebsite: string | null
  // Aggregates
  activeJobCount: number
  lastSyncAt: string | null
  sampleJob: QueueCardSampleJob | null
  // Public API + canonical board URLs for sanity-checking
  rawApiUrl: string
  canonicalBoardUrl: string
}

// ─── Miss card payload ──────────────────────────────────────────────────────

export interface MissCard {
  kind: "miss"
  id: string
  companyName: string
  companyUrl: string | null
  linkedinUrl: string | null
  countryCode: string | null
  totalJobsTs: number | null
  industry: string | null
  candidatesTried: string | null
  reviewStatus: ReviewStatus
  reviewerNotes: string | null
}

// ─── History row ────────────────────────────────────────────────────────────

export interface HistoryRow {
  kind: "board" | "miss"
  id: string
  name: string
  reviewStatus: ReviewStatus
  reviewedAt: string | null
  reviewedBy: string | null
  reviewerNotes: string | null
}

export interface HistoryPage {
  rows: HistoryRow[]
  total: number
  page: number
  pageSize: number
}

// ─── Validate-miss probe result ─────────────────────────────────────────────

export interface MissValidateResult {
  ok: boolean
  activeJobs?: number
  boardName?: string
  sampleJobTitle?: string
  sampleJobUrl?: string
  error?: string
}

// ─── Action body shapes (client → server) ───────────────────────────────────

export interface BoardActionBody {
  status: ReviewStatus
  notes?: string
}

export interface MissActionBody {
  status: ReviewStatus
  notes?: string
}

export interface MissResolveBody {
  slug: string
  ats: AtsProvider
  notes?: string
}

export interface MissValidateBody {
  slug: string
  ats: AtsProvider
}

export interface RevertBody {
  kind: "board" | "miss"
  id: string
}
