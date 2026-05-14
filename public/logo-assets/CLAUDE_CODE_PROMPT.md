# Pipeline logo — header & footer integration

I'm replacing the current logo with a new asset pack (in `/logo-assets/`). The new logo is a **horizontal lockup** (4-circle Ikigai mark + "pipeline" wordmark in Inter 700) with intrinsic viewBox **220 × 56**, aspect ratio **~3.93 : 1**. Sizing is driven by **height**; width should compute automatically.

Two things were broken before:
1. The mark was being **clipped on the left** — its wrapper had constraints (fixed `width` < `height`, or `overflow: hidden`) that cropped the SVG bounding box.
2. The wordmark was **way too small** — it read as a tiny label next to a dominant mark, instead of a balanced wordmark lockup.

Please make the following changes.

---

## 1. Drop in the new asset

Replace whatever component or `<img>` is rendering the current logo in the header and footer with:

```tsx
<img
  src="/logo-assets/lockup/pipeline-lockup-dark.svg"
  alt="Pipeline"
  height={44}        // 44 in nav, 40 in footer
  width="auto"
/>
```

Inter must already be loaded on the page (it is — the wordmark is rendered as live `<text>`).

If you have a `<Logo />` React component, update it to render the lockup SVG instead of whatever it currently does, and accept a `height` prop (default 44) plus a `variant` prop (`"dark" | "light" | "white" | "black"`) that picks the file from `/logo-assets/lockup/`.

---

## 2. Logo dimensions — exact values

| Surface | `height` | Computed width | Wordmark visual size |
|---|---|---|---|
| Header / nav | **44px** | ~173px | ~32px Inter 700 |
| Footer | **40px** | ~157px | ~29px Inter 700 |
| Mobile nav (if separate) | 36px | ~141px | ~26px |

The lockup viewBox is 220 × 56, so width = height × (220 / 56) ≈ height × 3.93.

---

## 3. Wrapper / container rules — read carefully

Whatever element wraps the `<img>` must NOT do any of the following, or the mark will get clipped again:

- ❌ Set `width` smaller than the natural lockup width.
- ❌ Use `overflow: hidden` on the wrapper.
- ❌ Use `aspect-ratio: 1 / 1` (the lockup is wide, not square).
- ❌ Force `width: auto` and `height` together with conflicting flex/grid constraints.
- ❌ Apply `object-fit: cover` on the `<img>`.

The wrapper should be either:

```css
/* Option A — inline-flex, lets the lockup size to its content */
.logo-link {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;       /* critical — don't let flexbox squeeze it */
}

/* Option B — explicit dimensions */
.logo-link {
  display: block;
  height: 44px;
  width: auto;
  flex-shrink: 0;
}
```

The `flex-shrink: 0` is the most likely missing line — if the header is a flex row and the nav cluster on the right is long, the logo will be the thing that gets squeezed unless you say so.

---

## 4. Header margin adjustments

Current header is roughly `padding: 0 32px; height: ~72px`. The new lockup at height 44 needs:

- **Header height: increase from ~72px to 80px.** The 44px-tall logo needs ~18px of vertical breathing room on each side, and the right-side cluster (Browse Jobs / Dashboard / Profile / Admin pill, ⚡0/10, Refer +10, Upgrade PRO, email) reads cramped at 72px once the logo grows.
- **Horizontal padding: keep `32px` on desktop**, but verify the pill nav doesn't collide with the logo at viewports between 1024–1280px. If it does, reduce the gap between the logo and the pill nav (currently large empty space) by switching the header layout from `justify-content: space-between` with a single right-cluster, to a 3-column grid: `[logo] [centered pill nav] [right cluster]`. That's what the screenshots imply is already happening — just confirm the columns size correctly with the bigger logo.
- **Right cluster gap: 24px between groups**, 12px inside the pill nav.

---

## 5. Footer margin adjustments

Current footer has a small 30px-ish logo crammed inline with link text. With the new 40px logo:

- **Footer top padding: bump to 32px**, bottom padding to 24px.
- **Logo + links**: put the logo on its own row above the links row on narrow viewports, or give it `margin-right: 40px` and `flex-shrink: 0` on wide viewports.
- **Link row text size**: currently ~13px monospace. Keep that, but increase `gap` between links from ~16px to **22px** so they don't visually compete with the bigger logo.
- **Copyright line**: keep on the far right, ~11px monospace, color `rgba(255,255,255,0.45)`.

---

## 6. Mobile considerations

At viewport widths below 768px:
- Header logo: drop to height **36px** (~141px wide).
- Footer logo: drop to height **32px** (~126px wide).
- Header height: 64px on mobile.
- If the right cluster collapses to a hamburger, the logo can stay left-aligned at full size.

---

## 7. Variants — when to use which

All variants live in `/logo-assets/lockup/`:

- `pipeline-lockup-dark.svg` — **default for header + footer** (dark backgrounds). Uses `mix-blend-mode: screen` for the filled rings.
- `pipeline-lockup-dark-solid.svg` — same look, no blend mode. Use this if you hit any rendering oddities in Safari or older browsers; visually nearly identical.
- `pipeline-lockup-light.svg` — for light backgrounds (white wordmark → black, indigo mark stays indigo outline).
- `pipeline-lockup-white.svg` — all white, for colored backgrounds (Pro upgrade banners, etc).
- `pipeline-lockup-black.svg` — all black, for print or single-color use.

The mark-only files in `/logo-assets/mark/` are for favicon (already good), social meta images, and any spot where only the symbol is appropriate.

---

## 8. What to verify when you're done

- [ ] Header logo not clipped at any viewport from 320px → 1920px wide.
- [ ] "pipeline" wordmark is clearly legible and visually balanced with the mark — not a tiny afterthought.
- [ ] No overlap between logo and right-side nav cluster at 1024px, 1280px, 1440px, 1920px viewports.
- [ ] Footer logo has breathing room above and below the link row.
- [ ] Mobile (< 768px) layout doesn't wrap the logo onto two lines or squeeze it.
- [ ] Favicon is unchanged.
- [ ] Inter font is loaded before the logo paints (otherwise the wordmark briefly renders in a fallback font).

---

If anything in the wrapper component or the header/footer layout fights these dimensions, fix the wrapper — don't shrink the logo. The proportions are intentional.
