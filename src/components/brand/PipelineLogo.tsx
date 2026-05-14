// PipelineLogo.tsx — drop-in React component for the Pipeline horizontal lockup.
// Uses an inline SVG with the wordmark rendered as <text> in Inter 900, so it
// inherits whatever Inter weight the page has already loaded (you're using
// next/font/google for Inter, so this just works).
//
// Usage:
//   <PipelineLogo height={44} />
//   <PipelineLogo className="h-11 w-auto" />     // tailwind
//   <PipelineLogo markOnly height={32} />        // icon only

import * as React from "react";

export type PipelineLogoProps = {
  /** When true, renders just the four-circle mark (no wordmark). */
  markOnly?: boolean;
  /** Color of the wordmark. Default: #fafafa (matches --foreground). */
  wordColor?: string;
  /** Indigo used for the mark. Default: #6366f1 (matches --accent). */
  accent?: string;
  className?: string;
  title?: string;
} & Omit<React.SVGProps<SVGSVGElement>, "viewBox" | "xmlns">;

export function PipelineLogo({
  markOnly = false,
  wordColor = "#fafafa",
  accent = "#6366f1",
  className,
  title = "Pipeline",
  ...rest
}: PipelineLogoProps) {
  const uid = React.useId();
  const ids = {
    c1: `pl-c1-${uid}`,
    c2: `pl-c2-${uid}`,
    c3: `pl-c3-${uid}`,
    c4: `pl-c4-${uid}`,
  };

  if (markOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 120"
        className={className}
        role="img"
        aria-label={title}
        {...rest}
      >
        <defs>
          <clipPath id={ids.c1}><circle cx="60" cy="38" r="36" /></clipPath>
          <clipPath id={ids.c2}><circle cx="60" cy="82" r="36" /></clipPath>
          <clipPath id={ids.c3}><circle cx="38" cy="60" r="36" /></clipPath>
          <clipPath id={ids.c4}><circle cx="82" cy="60" r="36" /></clipPath>
        </defs>
        <g style={{ mixBlendMode: "screen" }} fill={accent} fillOpacity={0.55}>
          <circle cx="60" cy="38" r="36" />
          <circle cx="60" cy="82" r="36" />
          <circle cx="38" cy="60" r="36" />
          <circle cx="82" cy="60" r="36" />
        </g>
        <g clipPath={`url(#${ids.c1})`}>
          <g clipPath={`url(#${ids.c2})`}>
            <g clipPath={`url(#${ids.c3})`}>
              <g clipPath={`url(#${ids.c4})`}>
                <rect x="0" y="0" width="120" height="120" fill={accent} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 96"
      className={className}
      role="img"
      aria-label={title}
      {...rest}
    >
      <defs>
        <clipPath id={ids.c1}><circle cx="48" cy="26" r="36" /></clipPath>
        <clipPath id={ids.c2}><circle cx="48" cy="70" r="36" /></clipPath>
        <clipPath id={ids.c3}><circle cx="26" cy="48" r="36" /></clipPath>
        <clipPath id={ids.c4}><circle cx="70" cy="48" r="36" /></clipPath>
      </defs>
      {/* Mark — 88px tall, inset 4px so the soft outer rings don't clip */}
      <g transform="translate(4 4)">
        <g style={{ mixBlendMode: "screen" }} fill={accent} fillOpacity={0.55}>
          <circle cx="48" cy="26" r="36" />
          <circle cx="48" cy="70" r="36" />
          <circle cx="26" cy="48" r="36" />
          <circle cx="70" cy="48" r="36" />
        </g>
        <g clipPath={`url(#${ids.c1})`}>
          <g clipPath={`url(#${ids.c2})`}>
            <g clipPath={`url(#${ids.c3})`}>
              <g clipPath={`url(#${ids.c4})`}>
                <rect x="0" y="0" width="96" height="96" fill={accent} />
              </g>
            </g>
          </g>
        </g>
      </g>
      {/* Wordmark — Inter 900, -0.025em tracking */}
      <text
        x="112"
        y="67"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight={900}
        fontSize={56}
        letterSpacing="-1.4"
        fill={wordColor}
      >
        pipeline
      </text>
    </svg>
  );
}

export default PipelineLogo;
