// PipelineLogo — renders the Pipeline horizontal lockup via the SVG files in
// /public/logo-assets/. Height-driven; width computes from the lockup's
// intrinsic 220x56 viewBox (aspect ratio ~3.93:1). Inline `width: auto`
// guarantees the aspect is preserved even when className supplies only height.
//
// Usage:
//   <PipelineLogo className="h-11" />            // 44px tall nav
//   <PipelineLogo className="h-10" variant="light" />
//   <PipelineLogo className="h-8 w-8" markOnly /> // square mark only
//
// Wrapper rules (see CLAUDE_CODE_PROMPT.md in /public/logo-assets/):
//   • flex-shrink: 0 on the wrapping link/div — otherwise flex parents can
//     squeeze the logo and clip the mark.
//   • Do NOT set overflow:hidden, aspect-ratio, or object-fit on parents.

import * as React from "react";

export type PipelineLogoVariant =
  | "dark"        // primary: filled-blend mark, white wordmark (dark bg)
  | "dark-solid"  // dark variant without blend modes (Safari-safe)
  | "light"       // indigo outline + black wordmark (light bg)
  | "white"       // all-white outline + wordmark (colored bg)
  | "black";      // all-black outline + wordmark (print / mono)

export interface PipelineLogoProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  /** Color variant. Default "dark" (white wordmark + indigo blend mark). */
  variant?: PipelineLogoVariant;
  /** Render just the four-circle mark without the wordmark. */
  markOnly?: boolean;
  /** Accessible label. Default "Pipeline". */
  title?: string;
}

export function PipelineLogo({
  variant = "dark",
  markOnly = false,
  title = "Pipeline",
  style,
  ...rest
}: PipelineLogoProps) {
  const src = markOnly
    ? "/logo-assets/mark/pipeline-mark.svg"
    : `/logo-assets/lockup/pipeline-lockup-${variant}.svg`;

  return (
    <img
      src={src}
      alt={title}
      // width: auto is critical — without it some browsers apply the intrinsic
      // 220px width when className only sets height, distorting the aspect.
      style={{ width: "auto", ...style }}
      {...rest}
    />
  );
}

export default PipelineLogo;
