# UX/UI Specification: Save, Report, and Share

**Feature:** Save, Report, and Share actions on job listings
**Date:** 2026-04-21
**Status:** Ready for implementation

---

## Codebase Observations (Read Before Implementing)

These findings from the actual codebase override any generic assumptions in the plan.

- **No shadcn/Radix `dialog.tsx` or `button.tsx`** exists in `src/components/ui/`. The four files there are combobox/avatar components. All dialogs must be built with `@radix-ui/react-dialog` directly, following the same approach as `feedback-button.tsx` (which uses a custom slide-in panel) or importing Radix Dialog primitives raw.
- **Toast library:** `sonner` is installed and globally configured via `<Toaster theme="dark" richColors position="top-right" />` in `src/app/layout.tsx`. All toast calls use `import { toast } from "sonner"` with `toast.success(...)` / `toast.error(...)`.
- **Tooltip pattern:** The codebase rolls its own tooltip (see `notification-bell.tsx`) using `useState` + `onMouseEnter`/`onMouseLeave` with a small absolutely-positioned div. Use this same pattern; do not import a tooltip library.
- **Button styling baseline:** Icon buttons in `job-detail.tsx` use `className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors"` with `w-4 h-4` icons. Match this exactly.
- **`JobCard` is a `<button>` element** — the entire card is already a click target. Action buttons inside it must use `e.stopPropagation()` to prevent triggering the card's `onClick`.
- **Auth pattern:** `useSession()` from `next-auth/react` is the auth check. The detail panel already demonstrates the conditional render pattern (`session ? <authed content> : <sign-in link>`).
- **Jobs live under `(main)` route group**, not `(dashboard)`. The `(main)/layout.tsx` renders `<UserSidebar />`. The saved jobs page must be `src/app/(main)/jobs/saved/page.tsx`.
- **Fetch pattern:** `job-board.tsx` uses raw `fetch()` calls, not SWR or React Query. All new API calls must follow this pattern.
- **`JobWithCompany`** type is `Job & { company: Company; _count?: { applications: number } }`. The `publicJobId` field exists on the `Job` model and can be null.

---

## 1. JobCard Actions

### Actions on the card

Two actions only: **Save (Bookmark)** and **Share (Share2)**. Report is not shown on the card — it requires job context and a dialog, which would be too disruptive on a compact card.

### Layout

The card currently has this structure:
```
[logo] [company name]          [timeAgo]
       [job title]
       [publicJobId] [location] [remote] [department]
```

Add an action cluster in the top-right corner, replacing the `timeAgo` span's position. The `timeAgo` text moves below the action cluster or is dropped from the corner.

**Revised top-right slot:**
```
[timeAgo text]   [BookmarkButton] [ShareButton]
```
Both buttons sit in a `flex items-center gap-1` row. The `timeAgo` text shifts to left of this cluster: `flex items-center gap-2`.

### Exact markup structure for the top-right slot

```tsx
<div className="flex items-center gap-1 shrink-0">
  {job.postedAt && (
    <span className="text-xs text-zinc-500 mr-1">{timeAgo(job.postedAt)}</span>
  )}
  <SaveButton
    jobId={job.id}
    initialSaved={job.isSaved ?? false}
    variant="card"
    onToggle={onSaveToggle}
  />
  <ShareButton
    jobId={job.publicJobId ?? job.id}
    jobTitle={job.title}
    companyName={job.company.name}
    variant="card"
  />
</div>
```

### Icon specifications

| Action | Default icon | Saved/active icon | Size |
|--------|-------------|-------------------|------|
| Save | `Bookmark` (outline) | `BookmarkCheck` (filled) | `w-3.5 h-3.5` |
| Share | `Share2` | — (no state) | `w-3.5 h-3.5` |

Both from `lucide-react`.

### Button wrapper (card variant)

```tsx
// Minimum 44x44px touch target via padding; visual icon is smaller
<button
  type="button"
  aria-label="Save job"
  aria-pressed={saved}
  onClick={(e) => { e.stopPropagation(); handleSave(); }}
  className="p-2.5 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
>
  {loading
    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
    : saved
      ? <BookmarkCheck className="w-3.5 h-3.5 text-indigo-400" />
      : <Bookmark className="w-3.5 h-3.5" />
  }
</button>
```

The `p-2.5` padding (10px on all sides) brings the touch target to 10+14+10 = 34px; use `min-h-[44px] min-w-[44px]` with `flex items-center justify-center` if needed on mobile. On desktop the hover area is acceptable at the card scale.

### Saved state

- Unsaved: `Bookmark` icon, `text-zinc-500`, hover `text-indigo-400`
- Saved: `BookmarkCheck` icon, `text-indigo-400` always (no hover color change needed)
- Loading: `Loader2 animate-spin`, same size, `text-zinc-500`, button disabled

### Error state

On API failure: call `toast.error("Couldn't save job. Please try again.")`, revert optimistic state.

### Tooltip

Use the same inline tooltip pattern from `notification-bell.tsx`:

```tsx
<div className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
  <button ...>...</button>
  {tooltipVisible && (
    <div className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 z-50 shadow-xl pointer-events-none">
      {saved ? "Unsave job" : "Save job"}
    </div>
  )}
</div>
```

### Mobile

- `e.stopPropagation()` on all button `onClick` handlers prevents card selection from firing.
- The card is `overflow-hidden` with `relative` positioning; do not use absolute positioning for the buttons — keep them in flow so they don't create tap-zone confusion.
- No `pointer-events-none` overlay needed since buttons are in flow, not overlaid.

### Props change to `JobCard`

```tsx
interface JobCardProps {
  job: JobWithCompany;
  selected: boolean;
  onClick: () => void;
  isSaved?: boolean;          // new — passed from parent (JobBoard)
  onSaveToggle?: (jobId: string, saved: boolean) => void; // new
}
```

`JobBoard` must be updated to pass `isSaved` and `onSaveToggle` down. It will maintain a `savedJobIds: Set<string>` in state, fetched from `GET /api/jobs/saved` on mount (authenticated users only), and updated optimistically on toggle.

---

## 2. JobDetail Header Actions Row

### Placement

The header currently has:
```
[logo + company + title]     [X close button]
```

Expand the right-side cluster to three icon buttons + close:
```
[logo + company + title]     [Bookmark] [Flag] [Share2] [X]
```

All four in a `flex items-center gap-1` row.

### Exact markup

```tsx
<div className="flex items-center gap-1 shrink-0">
  <SaveButton
    jobId={job.id}
    initialSaved={isSaved}
    variant="detail"
    onToggle={onSaveToggle}
  />
  <ReportButton
    jobId={job.id}
    jobTitle={job.title}
    companyName={job.company.name}
    initialReported={isReported}
  />
  <ShareButton
    jobId={job.publicJobId ?? job.id}
    jobTitle={job.title}
    companyName={job.company.name}
    variant="detail"
  />
  <button
    onClick={onClose}
    aria-label="Close job detail"
    className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors ml-1"
  >
    <X className="w-4 h-4" />
  </button>
</div>
```

### Icon size

Use `w-4 h-4` to match the existing close button (`X className="w-4 h-4"`). Button padding: `p-1.5` matching the close button.

### Button styling (detail variant)

```tsx
// Base class for all three action buttons in detail header
const detailActionClass =
  "text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
```

### State-specific overrides

| Button | Normal | Active/toggled | Disabled |
|--------|--------|----------------|----------|
| Save (Bookmark) | `text-zinc-500` | `text-indigo-400` + BookmarkCheck icon | — |
| Report (Flag) | `text-zinc-500` | `text-red-400/60` + Flag icon + disabled | `opacity-50 cursor-not-allowed` |
| Share (Share2) | `text-zinc-500` | — (momentary) | — |

### Already-reported state

When `initialReported` is true:
- Render Flag icon with `text-red-400/60`
- Button has `disabled` attribute
- `aria-label="Already reported"`
- Tooltip text: "Already reported"
- No dialog is opened

### Props added to `JobDetail`

```tsx
interface JobDetailProps {
  job: JobWithCompany;
  hasPriorApplication: boolean;
  onClose: () => void;
  isSaved?: boolean;          // new
  isReported?: boolean;       // new
  onSaveToggle?: (jobId: string, saved: boolean) => void; // new
}
```

`JobBoard` passes these down. `isReported` is fetched from `GET /api/jobs/[id]/report-status` or included in the job payload — implementation detail for the Implementation subagent to decide, but the default should be `false` if not provided.

---

## 3. Report Dialog/Modal

### Trigger

Clicking the Flag icon button in `JobDetail` header when `initialReported` is false.

### Component

Build with `@radix-ui/react-dialog` primitives directly (no shadcn wrapper exists). Follow the import pattern:

```tsx
import * as Dialog from "@radix-ui/react-dialog"
```

### Full dialog structure

```tsx
<Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <Dialog.Content
      aria-labelledby="report-dialog-title"
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl shadow-black/50 focus-visible:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-150"
    >
      {/* content */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

On mobile (`w-full`), the dialog takes full width with `mx-4` implicit from `max-w-md`. The overlay covers the full viewport.

### Dialog content layout

```
[title: "Report this job"]
[subtitle: job.title · company.name  —  small, muted]

[Radio group: category selection]
  ( ) Spam or misleading
  ( ) Inaccurate information
  ( ) Offensive content
  ( ) Broken or dead link
  ( ) Other

[Textarea: "Tell us more (optional)"]
[character counter: "0 / 1000"  — right-aligned, appears once user starts typing]

[inline error message — only visible on API error]

[Cancel]  [Submit report]
```

### Category radio group

Use `@radix-ui/react-radio-group` or a custom radio implementation. Since no shadcn wrappers exist, use Radix RadioGroup primitives:

```tsx
import * as RadioGroup from "@radix-ui/react-radio-group"
```

Categories with display labels:

```ts
const REPORT_CATEGORIES = [
  { value: "SPAM",         label: "Spam or misleading" },
  { value: "INACCURATE",  label: "Inaccurate information" },
  { value: "OFFENSIVE",   label: "Offensive content" },
  { value: "BROKEN_LINK", label: "Broken or dead link" },
  { value: "OTHER",       label: "Other" },
] as const

type ReportCategory = typeof REPORT_CATEGORIES[number]["value"]
```

Radio item styling:

```tsx
<RadioGroup.Root
  value={category ?? ""}
  onValueChange={(v) => setCategory(v as ReportCategory)}
  className="space-y-2 mt-4"
>
  {REPORT_CATEGORIES.map(({ value, label }) => (
    <div key={value} className="flex items-center gap-3">
      <RadioGroup.Item
        id={`report-${value}`}
        value={value}
        className="w-4 h-4 rounded-full border border-zinc-600 bg-zinc-800 data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-500 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 shrink-0"
      >
        <RadioGroup.Indicator className="w-1.5 h-1.5 rounded-full bg-white" />
      </RadioGroup.Item>
      <label
        htmlFor={`report-${value}`}
        className="text-sm text-zinc-300 cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
  ))}
</RadioGroup.Root>
```

### Message textarea

```tsx
<div className="mt-4 space-y-1">
  <textarea
    id="report-message"
    value={message}
    onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
    placeholder="Tell us more (optional)"
    rows={3}
    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
    aria-describedby={message.length > 0 ? "report-char-count" : undefined}
  />
  {message.length > 0 && (
    <p
      id="report-char-count"
      className={`text-xs text-right ${message.length >= 900 ? "text-amber-400" : "text-zinc-500"}`}
    >
      {message.length} / 1000
    </p>
  )}
</div>
```

- Counter only appears once user starts typing.
- Counter turns amber at 900+ characters as a soft warning.
- `OTHER` category requires message: validate before submit with inline error.

### Submit validation

```ts
const isSubmitDisabled =
  !category ||
  loading ||
  (category === "OTHER" && message.trim().length === 0)
```

### Buttons

```tsx
<div className="flex items-center justify-end gap-3 mt-6">
  <Dialog.Close asChild>
    <button
      type="button"
      disabled={loading}
      className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
    >
      Cancel
    </button>
  </Dialog.Close>
  <button
    type="button"
    onClick={handleSubmit}
    disabled={isSubmitDisabled}
    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
  >
    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    Submit report
  </button>
</div>
```

### Inline error

```tsx
{error && (
  <p
    role="alert"
    className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
  >
    {error}
  </p>
)}
```

Place above the button row. Do not close dialog on error.

### Success flow

1. API returns 200.
2. Close dialog: `setDialogOpen(false)`.
3. `toast.success("Report submitted. Thank you for helping improve the platform.")`
4. Set `reported = true` in local state (button becomes disabled immediately).

### Unauthenticated state

If the user is not signed in and clicks the Flag button, do not open the report dialog. Instead show a separate mini-dialog:

```tsx
// Different Dialog.Content content when !session:
<>
  <Dialog.Title id="report-dialog-title" className="text-lg font-semibold text-white">
    Sign in to report jobs
  </Dialog.Title>
  <p className="text-sm text-zinc-400 mt-2">
    You need an account to report job listings.
  </p>
  <div className="flex gap-3 mt-6 justify-end">
    <Dialog.Close asChild>
      <button type="button" className="...">Cancel</button>
    </Dialog.Close>
    <a
      href={`/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`}
      className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-100 transition-colors"
    >
      Sign in
    </a>
  </div>
</>
```

The `ReportButton` component checks `useSession()` internally and conditionally renders either the auth-prompt dialog or the report form dialog.

### Focus management

Radix Dialog handles focus trap and return-focus automatically. The first focusable element in the dialog (first radio item or Cancel button) receives focus on open.

---

## 4. Share Interaction

### Behavior (both card and detail variants)

```ts
async function handleShare(jobId: string, jobTitle: string, companyName: string) {
  const url = `${window.location.origin}/jobs?job=${encodeURIComponent(jobId)}`
  const shareData = {
    title: jobTitle,
    text: `${jobTitle} at ${companyName}`,
    url,
  }

  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      // No toast needed — native share sheet gives its own feedback
    } catch (err) {
      // User cancelled (AbortError) — no action needed
      if ((err as Error).name !== "AbortError") {
        fallbackCopyToClipboard(url)
      }
    }
  } else {
    fallbackCopyToClipboard(url)
  }
}

async function fallbackCopyToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard")
  } catch {
    toast.error(`Couldn't copy link: ${url}`, { duration: 8000 })
  }
}
```

- On desktop: `navigator.canShare` is typically false → clipboard fallback → toast.
- On mobile (iOS/Android): native share sheet appears → no toast after share.
- `AbortError` (user dismissed share sheet) → silent, no toast.
- Clipboard blocked: `toast.error` with the URL embedded in the message so the user can manually copy it. Use `duration: 8000` to give time to read/copy.

### No checkmark animation needed

The sonner toast provides sufficient feedback. Do not add local state for a transient checked icon — it adds complexity for minimal gain.

### Share button appearance

```tsx
<button
  type="button"
  aria-label="Share job"
  onClick={(e) => { e.stopPropagation(); handleShare(...); }}
  className={variant === "card"
    ? "p-2.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
    : "text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
  }
>
  <Share2 className={variant === "card" ? "w-3.5 h-3.5" : "w-4 h-4"} />
</button>
```

---

## 5. Saved Jobs Page

### Route

`src/app/(main)/jobs/saved/page.tsx`

This is under the `(main)` route group (which provides `UserSidebar`), not `(dashboard)`. The jobs browse page is at `(main)/jobs/page.tsx` — the saved page should live at `(main)/jobs/saved/page.tsx`.

### `isActive` fix in UserSidebar

The existing `isActive` for `/jobs` uses `pathname?.startsWith("/jobs")`. This means `/jobs/saved` will also be highlighted as "Browse Jobs". Add a specific check:

```ts
// In UserSidebar.isActive:
if (href === "/jobs/saved") return pathname === "/jobs/saved"
if (href === "/jobs") return pathname?.startsWith("/jobs") && pathname !== "/jobs/saved"
```

### Page structure

```tsx
// src/app/(main)/jobs/saved/page.tsx
"use client"

export default function SavedJobsPage() {
  return (
    <div className="h-full overflow-hidden bg-black flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-white">Saved Jobs</h1>
        <p className="text-zinc-400 mt-1">Jobs you've bookmarked</p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-6">
        <SavedJobsList />
      </div>
    </div>
  )
}
```

`SavedJobsList` is a client component that fetches from `GET /api/jobs/saved`.

### Saved jobs list behavior

- Initial fetch: `GET /api/jobs/saved?page=1&limit=20`
- Sort: save date descending (most recently saved first)
- Uses `JobCard` component directly — same card as browse page
- Each card receives `isSaved={true}` and `onSaveToggle` handler
- On unsave: optimistically remove the card from the list with a fade-out transition (`opacity-0 transition-opacity duration-200` then remove from array)

### Inactive job badge

If a saved job is no longer active (new field `isActive: boolean` on the job model, or check a `status` field — implementation detail), show an amber badge:

```tsx
// Wrapping div around JobCard for the badge overlay
<div className="relative">
  {!job.isActive && (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
      No longer active
    </div>
  )}
  <JobCard job={job} selected={false} onClick={() => {/* open detail */}} isSaved={true} onSaveToggle={handleUnsave} />
</div>
```

Note: `JobCard` uses `overflow-hidden` and `relative` itself. The badge wrapper uses `relative` on the outer div with `z-10` to ensure it renders above the card. Given the card's `overflow-hidden`, the badge must be placed inside a wrapper div, not inside the card itself, to avoid being clipped.

Actually — since `JobCard` is `overflow-hidden`, an absolutely positioned element inside it will be clipped. The badge wrapper approach (outer relative div, absolute badge) is correct but the badge will appear outside the card's visual boundary. Prefer: pass an `inactiveBadge` prop to `JobCard` or wrap with a position-relative container. Implementation subagent should choose the cleanest approach.

### "Load more" button

```tsx
{hasMore && (
  <div className="flex justify-center mt-4 pb-4">
    <button
      onClick={loadMore}
      disabled={loadingMore}
      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 border border-zinc-800 rounded-lg hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
    >
      {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      Load more
    </button>
  </div>
)}
```

Recommendation: use "Load more" button (not infinite scroll) since the saved list is user-curated and typically short. Avoids the complexity of `IntersectionObserver` for a secondary page.

### Empty state

```tsx
<div className="flex flex-col items-center justify-center py-24 text-center">
  <Bookmark className="w-12 h-12 text-zinc-700 mb-4" />
  <h2 className="text-lg font-semibold text-white mb-2">No saved jobs yet</h2>
  <p className="text-sm text-zinc-400 max-w-xs">
    Browse jobs and click the bookmark icon to save them for later
  </p>
  <Link
    href="/jobs"
    className="mt-6 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-100 transition-colors"
  >
    <Briefcase className="w-4 h-4" />
    Browse Jobs
  </Link>
</div>
```

### Error state

```tsx
<div className="flex flex-col items-center justify-center py-24 text-center">
  <p className="text-sm text-red-400 mb-4">Failed to load saved jobs.</p>
  <button
    onClick={retry}
    className="text-sm text-zinc-400 hover:text-white underline"
  >
    Try again
  </button>
</div>
```

---

## 6. Admin Reports Page

### Route

`src/app/(admin)/admin/reports/page.tsx`

This is a server component following the exact pattern of `src/app/(admin)/admin/feedback/page.tsx`.

### Page structure

```tsx
// src/app/(admin)/admin/reports/page.tsx
import { db } from "@/lib/db"
import { Flag } from "lucide-react"

export const dynamic = "force-dynamic"

// Status config — mirrors TYPE_CONFIG in feedback page
const STATUS_CONFIG = {
  OPEN:      { label: "Open",      color: "text-red-400",   bg: "bg-red-500/10",   border: "border-red-500/20" },
  TRIAGED:   { label: "Triaged",   color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  RESOLVED:  { label: "Resolved",  color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  DISMISSED: { label: "Dismissed", color: "text-zinc-400",  bg: "bg-zinc-700/50",  border: "border-zinc-700" },
} as const

// Category config
const CATEGORY_CONFIG = {
  SPAM:         { label: "Spam",         color: "text-indigo-400", bg: "bg-indigo-500/10" },
  INACCURATE:   { label: "Inaccurate",   color: "text-amber-400",  bg: "bg-amber-500/10" },
  OFFENSIVE:    { label: "Offensive",    color: "text-red-400",    bg: "bg-red-500/10" },
  BROKEN_LINK:  { label: "Broken link",  color: "text-zinc-400",   bg: "bg-zinc-700/50" },
  OTHER:        { label: "Other",        color: "text-blue-400",   bg: "bg-blue-500/10" },
} as const
```

### Summary cards (top row)

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
  {(["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"] as const).map((s) => (
    <div key={s} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500">{STATUS_CONFIG[s].label}</p>
      <p className={`text-2xl font-bold mt-1 ${STATUS_CONFIG[s].color}`}>{counts[s]}</p>
    </div>
  ))}
</div>
```

### Table (report list)

The feedback page uses a card-per-item list. For reports, use the same card-list pattern (no `<table>` element) since the codebase has no table styling primitives. Each report card:

```tsx
<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
  {/* Row 1: category pill + status pill + date */}
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_CONFIG[report.category].bg} ${CATEGORY_CONFIG[report.category].color}`}>
        {CATEGORY_CONFIG[report.category].label}
      </span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CONFIG[report.status].bg} ${STATUS_CONFIG[report.status].color}`}>
        {STATUS_CONFIG[report.status].label}
      </span>
    </div>
    <span className="text-xs text-zinc-500 shrink-0">
      {new Date(report.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
    </span>
  </div>

  {/* Row 2: Job title (linked) */}
  <a
    href={`/jobs?job=${encodeURIComponent(report.job.publicJobId ?? report.job.id)}`}
    className="text-sm font-medium text-white hover:text-indigo-400 transition-colors"
  >
    {report.job.title} — {report.job.company.name}
  </a>

  {/* Row 3: message (truncated) */}
  {report.message && (
    <p className="text-sm text-zinc-300 line-clamp-3 whitespace-pre-wrap">{report.message}</p>
  )}

  {/* Row 4: reporter email */}
  <div className="text-xs text-zinc-600">{report.user?.email}</div>
</div>
```

### Inline status update

Because this is a server component page (matching feedback page), status updates require either:
1. A separate client component wrapper for each card's status selector, or
2. A Server Action

Recommendation: add a `ReportStatusForm` client component that wraps the status dropdown + save button for each card. This keeps the page server-rendered for the list while enabling status updates without a page reload.

```tsx
// Rendered inside each report card
<ReportStatusForm reportId={report.id} currentStatus={report.status} />
```

`ReportStatusForm` calls `PATCH /api/admin/reports/[id]` with `{ status }`.

### Empty state

```tsx
{reports.length === 0 && (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <Flag className="w-12 h-12 text-zinc-700 mb-4" />
    <p className="text-zinc-500 text-sm">No reports yet.</p>
  </div>
)}
```

### Filters note

The planning spec mentions status/category/search filters. Since the feedback page has no filters (it's a simple list), and this page mirrors it, implement filters as a v1.1 enhancement. The initial implementation loads all reports (capped at 200 like feedback) and relies on the browser's in-page search. Document this decision in a code comment.

---

## 7. Sidebar Additions

### UserSidebar — "Saved Jobs" nav item

Current `authNavItems` array:
```ts
const authNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile",   label: "Profile",   icon: User },
]
```

Insert "Saved Jobs" between "Browse Jobs" (public) and "Dashboard" (auth). Since `publicNavItems` and `authNavItems` are merged in `navItems`, the resulting order will be:

1. Browse Jobs (`/jobs`)
2. **Saved Jobs** (`/jobs/saved`) — auth only
3. Dashboard (`/dashboard`)
4. Profile (`/profile`)
5. Admin (`/admin`) — admin only

Updated arrays:
```ts
import { Briefcase, Bookmark, LayoutDashboard, User, Shield, LogOut, LogIn, Gift } from "lucide-react"

const publicNavItems = [
  { href: "/jobs", label: "Browse Jobs", icon: Briefcase },
]

const authNavItems = [
  { href: "/jobs/saved", label: "Saved Jobs",  icon: Bookmark },
  { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
  { href: "/profile",    label: "Profile",     icon: User },
]
```

The `isActive` function needs updating to prevent `/jobs/saved` from matching under `/jobs`:

```ts
function isActive(href: string) {
  if (href === "/jobs/saved") return pathname === "/jobs/saved"
  if (href === "/jobs") return (pathname?.startsWith("/jobs") && pathname !== "/jobs/saved") ?? false
  if (href === "/dashboard") return pathname?.startsWith("/dashboard") ?? false
  if (href === "/admin") return pathname?.startsWith("/admin") ?? false
  return pathname === href
}
```

### AdminSidebar — "Reports" nav item

Current `navItems` array ends with:
```ts
{ href: "/admin/feedback",      label: "Feedback",      icon: MessageSquare },
{ href: "/admin/notifications", label: "Notifications", icon: Bell },
{ href: "/admin/sync",          label: "Sync Logs",     icon: RefreshCw },
```

Insert "Reports" after "Feedback":
```ts
import { Flag } from "lucide-react" // add to existing imports

// In navItems array, after feedback entry:
{ href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
{ href: "/admin/reports",  label: "Reports",  icon: Flag },           // new
{ href: "/admin/notifications", label: "Notifications", icon: Bell },
```

---

## 8. Component Props and State

### `SaveButton`

```tsx
// src/components/jobs/save-button.tsx
"use client"

import { useState, useRef } from "react"
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"

interface SaveButtonProps {
  jobId: string
  initialSaved: boolean
  variant?: "card" | "detail"
  onToggle?: (jobId: string, saved: boolean) => void
}

export function SaveButton({ jobId, initialSaved, variant = "detail", onToggle }: SaveButtonProps) {
  const { data: session } = useSession()
  const [saved, setSaved] = useState(initialSaved)
  const [loading, setLoading] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isCard = variant === "card"
  const iconClass = isCard ? "w-3.5 h-3.5" : "w-4 h-4"
  const btnClass = isCard
    ? "p-2.5 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
    : "text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()

    if (!session) {
      toast.error("Sign in to save jobs")
      return
    }

    // Optimistic update
    const next = !saved
    setSaved(next)
    onToggle?.(jobId, next)
    setLoading(true)

    try {
      const res = await fetch(`/api/jobs/${jobId}/save`, { method: "POST" })
      if (!res.ok) throw new Error("Save failed")
    } catch {
      // Revert
      setSaved(!next)
      onToggle?.(jobId, !next)
      toast.error("Couldn't save job. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); setTooltipVisible(true) }}
      onMouseLeave={() => { hideTimer.current = setTimeout(() => setTooltipVisible(false), 150) }}
    >
      <button
        type="button"
        aria-label={saved ? "Unsave job" : "Save job"}
        aria-pressed={saved}
        onClick={handleToggle}
        disabled={loading}
        className={`${btnClass} ${saved ? "text-indigo-400" : ""}`}
      >
        {loading
          ? <Loader2 className={`${iconClass} animate-spin`} />
          : saved
            ? <BookmarkCheck className={`${iconClass} text-indigo-400`} />
            : <Bookmark className={iconClass} />
        }
      </button>
      {tooltipVisible && (
        <div className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 z-50 shadow-xl pointer-events-none">
          {saved ? "Unsave job" : "Save job"}
        </div>
      )}
    </div>
  )
}
```

**State:** `saved` (optimistic), `loading`, `tooltipVisible`
**API:** `POST /api/jobs/[id]/save` — toggles save state server-side
**Error:** reverts optimistic update, shows toast

### `ReportButton`

```tsx
// src/components/jobs/report-button.tsx
"use client"

interface ReportButtonProps {
  jobId: string
  jobTitle: string
  companyName: string
  initialReported: boolean
}
```

**Internal state:** `reported`, `dialogOpen`, `category: ReportCategory | null`, `message: string`, `loading: boolean`, `error: string | null`

**On mount:** `reported = initialReported`
**On Flag click:** if `reported`, no-op (button is disabled). If `!session`, open auth-prompt dialog. Else open report form dialog.
**On submit:** `POST /api/jobs/[id]/report` with `{ category, message }`. On success: close dialog, `setReported(true)`, show sonner toast.
**On error:** set `error` state, keep dialog open.
**Reset dialog state** on `onOpenChange(false)`: clear `category`, `message`, `error`, but NOT `reported`.

### `ShareButton`

```tsx
// src/components/jobs/share-button.tsx
"use client"

interface ShareButtonProps {
  jobId: string       // publicJobId — used to build the share URL
  jobTitle: string
  companyName: string
  variant?: "card" | "detail"
}
```

**No async state** — all synchronous after the initial `navigator.share` / `navigator.clipboard` calls.
**URL construction:** `${window.location.origin}/jobs?job=${encodeURIComponent(jobId)}`
**Share flow:** described fully in Section 4.
**`e.stopPropagation()`** required on card variant.

---

## 9. Accessibility Checklist

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| Save button | `aria-label` + `aria-pressed` | `aria-label={saved ? "Unsave job" : "Save job"}` + `aria-pressed={saved}` |
| Report button | `aria-label`, disabled state | `aria-label="Report job"` or `"Already reported"` when disabled |
| Share button | `aria-label` | `aria-label="Share job"` |
| Close button | `aria-label` | `aria-label="Close job detail"` (already has this) |
| Report dialog | `aria-labelledby` | `aria-labelledby="report-dialog-title"` on `Dialog.Content` |
| Dialog title | `id` matching | `<Dialog.Title id="report-dialog-title">` |
| Textarea | `aria-describedby` | Points to character counter element when visible |
| Radio items | `htmlFor` + `id` | Each radio has `id={report-${value}}` paired with label's `htmlFor` |
| Error messages | `role="alert"` | Inline error div uses `role="alert"` for screen reader announcement |
| Focus trap | Automatic | Radix Dialog handles this natively |
| Focus return | Automatic | Radix Dialog returns focus to trigger on close |
| Keyboard nav | Tab order | All buttons and radio items in natural DOM order |
| Focus ring | All interactive elements | `focus-visible:ring-1 focus-visible:ring-indigo-500/50` on all buttons |

---

## 10. Mobile Considerations

### Touch targets

All icon buttons must have a minimum 44x44px tap target:

- Card variant: `p-2.5` (10px padding) + 14px icon = 34px visual. Add `min-h-[44px] min-w-[44px] flex items-center justify-center` if click failures are observed in QA. For initial implementation, `p-2.5` is acceptable on card where space is tight.
- Detail variant: `p-1.5` (6px padding) + 16px icon = 28px. Wrap in a `min-h-[44px] min-w-[44px] flex items-center justify-center` container for mobile, especially since the detail header has more space.

### Card tap isolation

`JobCard` is a `<button>` element. Action buttons placed inside it will bubble the click up unless `e.stopPropagation()` is called. All three action handlers (`SaveButton`, `ShareButton`) must call `e.stopPropagation()`.

Do NOT use `pointer-events-none` on the card and `pointer-events-auto` on the buttons — this would prevent keyboard focus on the card itself.

### Share on mobile

On iOS and Android, `navigator.canShare()` typically returns `true` for basic share data. The native share sheet gives excellent UX. Ensure `navigator.canShare` is called before `navigator.share` to avoid the `NotAllowedError` that some browsers throw when `share()` is called without a user gesture.

### Report dialog on mobile

`max-w-md` with `w-full mx-4` gives an effective mobile width of `screen - 32px`. The dialog uses `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` centering. On small screens where the dialog might overflow, add `max-h-[90vh] overflow-y-auto` to `Dialog.Content`.

```tsx
// Mobile-safe Dialog.Content classes:
"fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl shadow-black/50 focus-visible:outline-none"
```

---

## 11. File List (New Files to Create)

```
src/components/jobs/save-button.tsx
src/components/jobs/report-button.tsx
src/components/jobs/share-button.tsx
src/app/(main)/jobs/saved/page.tsx
src/app/(admin)/admin/reports/page.tsx
```

## 12. Files to Modify

```
src/components/jobs/job-card.tsx       — add SaveButton + ShareButton, update props
src/components/jobs/job-detail.tsx     — add action row with SaveButton + ReportButton + ShareButton, update props
src/components/jobs/job-board.tsx      — add savedJobIds state, pass isSaved + onSaveToggle to JobCard + JobDetail
src/components/layout/user-sidebar.tsx — add "Saved Jobs" nav item, fix isActive logic
src/components/admin/admin-sidebar.tsx — add "Reports" nav item
```

## 13. API Endpoints Required

The following endpoints must be implemented (not part of this design spec, but listed for completeness):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/jobs/[id]/save` | Required | Toggle save state; returns `{ saved: boolean }` |
| `GET` | `/api/jobs/saved` | Required | Paginated list of saved jobs; returns `JobWithCompany[]` |
| `POST` | `/api/jobs/[id]/report` | Required | Submit report; body: `{ category, message? }` |
| `GET` | `/api/admin/reports` | Admin | List all reports with pagination |
| `PATCH` | `/api/admin/reports/[id]` | Admin | Update report status |

The job payload returned by `GET /api/jobs` and `GET /api/jobs/[id]` should eventually include `isSaved: boolean` and `isReported: boolean` fields computed per-user. For v1, these can be fetched separately or computed on the client by comparing against a loaded set of IDs.

---

## 14. Deviations from Original Plan

1. **Saved Jobs route is `(main)/jobs/saved`, not `(dashboard)/jobs/saved`.** Jobs live under the `(main)` group in this codebase. Using `(dashboard)` would place it outside the `UserSidebar` layout.

2. **No shadcn Dialog wrapper** — must use `@radix-ui/react-dialog` primitives directly. The `src/components/ui/` directory only contains combobox and avatar components.

3. **Tooltip implementation** — use inline state pattern from `notification-bell.tsx`, not a library.

4. **Toast library** — sonner (`import { toast } from "sonner"`), already installed and configured. Not shadcn's `useToast`.

5. **Admin reports page uses card-list, not a `<table>`** — mirrors the feedback page's rendering pattern. No table primitives exist in the codebase.

6. **Admin reports page is a server component** — status updates use a `ReportStatusForm` client sub-component with `PATCH /api/admin/reports/[id]`, following the server-component-with-client-islands pattern the feedback page implies.

7. **`JobBoard` must be updated** to track `savedJobIds: Set<string>` and pass `isSaved` down to both `JobCard` and `JobDetail`. This is a non-trivial addition to `job-board.tsx` — the implementation subagent should fetch `GET /api/jobs/saved` IDs on session load (similar to how `appliedJobIds` is fetched).

8. **Card bookmark position** — the plan says "top-right corner." In the current card markup the top-right slot is occupied by the `timeAgo` text span. The action buttons are placed inline with `timeAgo` (to its left) rather than as an absolute overlay, to avoid `overflow-hidden` clipping and tap zone conflicts.
