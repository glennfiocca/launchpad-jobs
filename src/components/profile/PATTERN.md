# Pipeline Profile Redesign v2 — Direction A "Manifold"

This file is the pattern guide for the 6 parallel tab agents redesigning
the rest of the profile tabs (professional, work-history, education,
skills-languages, projects-certs, preferences). PR1 has landed the
foundation — the sigil, page header, completion engine, sidebar status
dots, motion atoms, and the **Personal tab** as the reference
implementation. Your job is to bring your tab onto these rails.

Resume tab is OUT OF SCOPE for this PR family — it gets redesigned in
PR2 alongside the parsing pipeline. Leave `resume-form.tsx` alone.

---

## Reference implementation

The Personal tab is the canon. Open
[`src/components/profile/forms/personal-form.tsx`](./forms/personal-form.tsx)
and copy its structure. The bits that are load-bearing:

- `directionASectionClass` for the card wrapper.
- `<SectionHeader>` with an eyebrow + display title + (optional) right slot.
- `<FormEyebrow>` (optionally `accent`) above every section title.
- `directionAInputClass` on every text input (lavender focus ring, 12px radius).
- `<SavedPill visible={recentlySaved} />` in the section header that lights
  up for ~2 seconds after a successful save.
- For non-list tabs (Professional, Preferences), use a single
  `primaryWhiteBtnClass` submit at the bottom. **Do NOT** add Save buttons
  to individual fields.
- For list-tabs (Work History, Education, Skills/Languages, Projects/Certs),
  use the enhanced `<ListEditor>` — blur-to-save is unchanged.

---

## Design tokens (read these first)

Every color you reference must come from `@theme` (in
`src/app/globals.css`). Never hex literals in JSX. The tokens you'll use:

| Use | Token |
|---|---|
| Page bg | `bg-bg` |
| Elevated card | `bg-bg-elev` |
| Body text | `text-text` |
| Muted body | `text-text-muted` |
| Dim eyebrows | `text-text-dim` |
| Border | `border-white/[0.06]` or `border-border` |
| Stronger border | `border-border-strong` |
| Accent (lavender) | `var(--color-accent-lavender)` |
| Accent (cyan)   | `var(--color-accent-cyan)`   |
| Stage colors | `var(--color-stage-applied)` … `--color-stage-offer` |

Fonts:

- Display: `font-display` (Bricolage Grotesque). H1–H3.
- Body: default (Inter).
- Mono: `font-mono` (Geist Mono). Every numeric, every code-like field
  (URLs, emails, timestamps) gets `tabular-nums` too.

---

## Tab file structure

Each tab gets a single `*-form.tsx` file under `src/components/profile/forms/`.
If you find yourself growing past ~400 lines, extract row components into
sibling files (e.g. `work-experience-row.tsx`). The directory exists; stay
flat — don't create per-tab subfolders unless you have 3+ component files.

A tab roughly looks like:

```
src/components/profile/forms/
  ├── personal-form.tsx            ← reference
  ├── professional-form.tsx
  ├── work-history-form.tsx
  ├── ... (etc.)
  └── _shared/
       ├── atoms.tsx               ← FormEyebrow, SectionHeader, SavedPill, FieldDisplay, PulseDot
       ├── styles.ts               ← directionASection/Input, eyebrow*, pillBtnClass, primaryWhiteBtnClass, addRowBtnClass, …
       ├── list-editor.tsx         ← enhanced row entry / reorder flash
       ├── tab-config.ts           ← TAB_KEYS, TAB_LABELS (unchanged)
       └── use-child-resource.ts   ← unchanged blur-to-save contract
```

Use `_shared/styles.ts` for any new shared class strings. **Do NOT
inline arbitrary Tailwind chains in JSX when it's clearly a reusable atom.**

---

## Visible-state lifecycle

Every editable field exists in one of three states; the design needs to be
consistent across tabs:

| State | Visual |
|---|---|
| **Empty** | dashed white/10 border, `text-dim` placeholder copy |
| **Editing (focused)** | lavender 50% border + 4px soft lavender shadow ring |
| **Saved (just-flashed)** | brief lavender border flash (1.2s) for list-editor rows; `<SavedPill>` for the section header on Personal/Professional/Preferences |

The `directionAInputClass` handles empty + editing. List-editor row entry
and reorder flash are gated on `useReducedMotion()`.

---

## Direction A section header treatment

```tsx
<SectionHeader
  eyebrow={<FormEyebrow accent>identity · required</FormEyebrow>}
  title="Personal Information"
  subtitle="The basics that go on every application — name, contact, where you're based."
  right={<SavedPill visible={recentlySaved} />}
/>
```

- **Eyebrow**: 10px mono, uppercase, `tracking-[0.08em]`. `accent` for
  lavender, otherwise `text-dim`. Phrasing pattern: `{noun} · {qualifier}`
  (e.g. `identity · required`, `professional · how you introduce yourself`,
  `stage · work history · 100%`).
- **Title**: Bricolage 18px / weight 600 / `text-text`. NOT uppercase.
- **Subtitle**: 13px / `text-text-muted`. Short — one or two sentences.
- **Right slot**: Saved pill, "X of Y filled" mono caption, or a small
  action button.

---

## Row dividers and lavender accent placement

- Section cards (`directionASectionClass`) carry a 14px corner radius and a
  hairline border. Cards do NOT stack on each other with margins — they
  flow with `space-y-6` on the form root.
- Inside a section, use the `border-t border-white/[0.06] pt-4 mt-2`
  divider when you have two logical sub-groups in one card (see the
  Social Links group split in `personal-form.tsx`).
- Lavender accent is **reserved** for: section-header accent eyebrow,
  next-best-action chip, current/active row chip (cyan also works for
  "live"), the dashed "Add row" CTA, and field focus rings. Don't use
  lavender for ordinary input borders.

---

## Atoms cheat-sheet

```tsx
import {
  FormEyebrow,        // mono uppercase eyebrow; pass `accent` for lavender
  SectionHeader,      // eyebrow + title + subtitle + right slot
  SavedPill,          // 2s "SAVED" flash with cyan pulse dot
  FieldDisplay,       // read-only display of a filled (or empty) field
  PulseDot,           // re-exported from cockpit/atoms
} from "./_shared/atoms";

import {
  directionASectionClass,   // section card
  directionAInputClass,     // text input
  primaryWhiteBtnClass,     // primary CTA (white→cream gradient)
  ghostBtnClass,            // ghost CTA (transparent, hairline)
  addRowBtnClass,           // dashed-lavender Add-row CTA
  pillBtnClass,             // pill toggle (accepts active boolean)
  eyebrowClass,             // standalone mono eyebrow
  eyebrowAccentClass,       // lavender variant
  sectionHeaderRowClass,    // eyebrow + title row with hairline below
  sectionDividerClass,      // intra-card section divider
  gridTwoCol,
  gridThreeCol,
} from "./_shared/styles";
```

---

## List-editor wiring (the four list-style tabs)

The existing `useChildResource` hook exposes:

- `items`, `loading`, `error`
- `lastCreatedId`, `consumeLastCreatedId` — id of the newest row, to scroll
  + focus into.
- `recentlySavedIds` — set of ids whose last PUT succeeded within ~2s.
- `create`, `update`, `remove`, `refresh`.

Wire them through the enhanced `<ListEditor>`:

```tsx
<ListEditor
  items={items}
  onAdd={() => create({ name: "", category: "language", proficiency: 3 })}
  onRemove={(idx) => remove(items[idx].id)}
  onReorder={(oldIdx, newIdx) => { /* swap order columns */ }}
  onItemUpdate={(idx, patch) => update(items[idx].id, patch)}
  renderItem={(row, idx, update) => <SkillFields row={row} onPatch={update} />}
  recentlySavedIds={recentlySavedIds}
  lastCreatedId={lastCreatedId}
  onAutoFocusConsumed={consumeLastCreatedId}
  addLabel="Add skill"
/>
```

The list editor uses `directionAInputClass` indirectly — it doesn't care
what your row component renders. Use the Direction A classes in your row
components.

### Hard constraints
- **No Save buttons on list rows.** Blur-to-save is the contract.
- **No modals for editing.** Inline only.
- **No new wizards / multi-step flows.** 8 tabs in their current order.
- **No new shadcn imports.** Use Radix directly (Popover for tooltips).

---

## Motion

Every framer-motion animation MUST gate on `useReducedMotion()`:

```tsx
import { useReducedMotion } from "framer-motion";

const reduced = useReducedMotion();
const style = reduced ? undefined : { animation: "pp-fade-up 360ms ease-out" };
```

The five keyframes live in `globals.css`:
- `pp-ping` — pulse-dot ripple
- `pp-fade-up` — row entry (also used by the page-header H1)
- `pp-saved-in` — SAVED pill flash
- `pp-reorder-flash` — lavender background flash for ~1.2s
- `pp-pulse-glow` — sigil vertex pulse (and the resume parse-tease strip
  when PR2 lands)

They also no-op under `prefers-reduced-motion: reduce` at the CSS level.

---

## Tab agents — known integration points

When you finish your tab, the next-best-action chip and the sigil tooltip
copy already cover your axis. You don't need to touch them. What you DO
need to confirm:

1. **Per-section completion** — `computePerSectionScore` in
   `src/lib/profile/completeness.ts` already knows about your tab.
   Read your axis's rule there (binary or proportional) and make sure
   the fields you render are the same ones the scorer counts.
2. **Sidebar status dot** — your tab's dot will turn lavender (partial)
   or cyan (full) automatically based on the score. Test by adding /
   removing a row.
3. **Page header sigil** — your axis pulses, snaps inward when empty,
   and hovering / tapping the vertex shows the tooltip copy from
   `sigil-tooltip-copy.ts`. If your tab introduces new sub-buckets you
   want surfaced in the tooltip, extend `getTooltipCopy` (it's a small
   matrix; new copy is welcome but keep the empty / partial / full
   structure).
4. **MobileHeader** — the mobile fallback already shows your axis's
   count. Verify your tab renders cleanly at < 768px.
5. **Sticky sidebar** — desktop sidebar uses `top-[calc(var(--navbar-h)+16px)]`.
   You don't need to repeat this anywhere; just make sure your tab content
   doesn't accidentally introduce its own sticky element that fights it.

---

## A11y checklist (apply to your tab)

- Every interactive element has `aria-label` or visible text.
- Every numeric uses `tabular-nums`.
- Every animation respects `useReducedMotion()`.
- "Saved" pill uses `aria-live="polite"` (the atom does this for you).
- Reorder buttons say "Move up" / "Move down" / "Remove" — preserve
  these labels.

---

## Out of scope (don't touch)

- Resume tab. PR2 territory.
- Chrome: navbar, footer, FeedbackTab, account menu, billing badges,
  PipelineLogo, PageTransition.
- IA: 8 tabs, current order, URL sync via `?tab=…` with `router.replace`.
- API routes. `/api/profile`, `/api/profile/<slug>`, `/api/profile/resume`
  stay as-is.
- Prisma schema. No migrations.
- Zod validation schemas.

---

## Verification before you push

1. `npm run build` passes.
2. `npm run lint` passes.
3. Visit `/profile?tab={your-tab}` — section renders, hovering the sigil
   shows your axis's tooltip copy, sidebar status dot reflects state.
4. Toggle "Reduce motion" in the OS — all animations should resolve to
   their initial state instead of looping.
