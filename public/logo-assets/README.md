# Pipeline — Logo assets

Four-circle Ikigai mark. Indigo `#6366f1` / black / white. Inter wordmark (font-weight 700, letter-spacing -0.025em).

## Files

### Mark only (square, 120×120 viewBox)
- `mark/pipeline-mark.svg` — **primary**. Filled blend, indigo. Translucent rings brighten where they overlap; the four-way center is solid indigo. *Note: uses `mix-blend-mode: screen` — renders correctly in all modern browsers, but if you need a totally portable version that doesn't depend on blend modes, use `pipeline-mark-solid.svg` instead.*
- `mark/pipeline-mark-solid.svg` — same look without blend modes: indigo rings + solid indigo center.
- `mark/pipeline-mark-outline-indigo.svg` — outline only, indigo. Best at small sizes (favicon, 16–32px).
- `mark/pipeline-mark-outline-white.svg` — outline only, white. For color backgrounds.
- `mark/pipeline-mark-outline-black.svg` — outline only, black. For light prints.

### Lockup (mark + "pipeline" wordmark, 220×56 viewBox)
- `lockup/pipeline-lockup-dark.svg` — **primary nav/footer**. Filled-blend mark + white wordmark. Use on dark backgrounds.
- `lockup/pipeline-lockup-dark-solid.svg` — same as above but no blend mode.
- `lockup/pipeline-lockup-light.svg` — indigo outline mark + black wordmark. For light backgrounds.
- `lockup/pipeline-lockup-white.svg` — all-white. For color backgrounds where you want the logo to be a single color.
- `lockup/pipeline-lockup-black.svg` — all-black. For light prints or single-color use.

## Usage

### Nav (recommended sizing)
```html
<img src="/logo-assets/lockup/pipeline-lockup-dark.svg" alt="Pipeline" height="44" />
```
That renders the lockup at mark = 44px, wordmark ≈ 32px Inter 700 — the proportion the design canvas advances.

### Footer
```html
<img src="/logo-assets/lockup/pipeline-lockup-dark.svg" alt="Pipeline" height="40" />
```

### Favicon / app icon
Use `mark/pipeline-mark-outline-indigo.svg` for the favicon — it stays crisp at 16px. Existing favicon looks good — no change needed there.

## Notes

- The wordmark in the SVGs is rendered as **`<text>`** with `font-family="Inter, system-ui, …"`. Inter must be loaded on the page for the wordmark to render correctly. If you need a self-contained SVG that doesn't depend on a webfont, the text will need to be converted to outlined paths (let me know if you want this version).
- Viewbox dimensions are intentional — don't add `width` / `height` attributes that fight the aspect ratio. Always size with **`height`** (or CSS `height`) and let width compute automatically.
- The mark's SVG has 2px of internal padding on every side already; if your wrapper element is being clipped, the issue is your wrapper, not the asset.
