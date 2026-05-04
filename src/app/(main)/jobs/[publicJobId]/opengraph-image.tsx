import { ImageResponse } from "next/og";
import { getJobByPublicId } from "@/lib/jobs/get-job";

// Image metadata — Next.js convention reads these as module exports.
export const alt = "Pipeline job posting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens — kept inline because ImageResponse cannot consume Tailwind
// classes; Satori only understands inline styles.
const COLORS = {
  bg: "#18181b", // zinc-900
  bgAccent: "#27272a", // zinc-800
  brand: "#a78bfa", // violet-400
  brandStrong: "#8b5cf6", // violet-500
  white: "#ffffff",
  muted: "#a1a1aa", // zinc-400
  chipBg: "#3f3f46", // zinc-700
} as const;

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min || !max) return null;
  // Rough USD K-format. Currency is assumed; refine if Pipeline ever surfaces non-USD ranges in OG.
  const minK = (min / 1000).toFixed(0);
  const maxK = (max / 1000).toFixed(0);
  return `$${minK}K – $${maxK}K`;
}

function formatLocationLine(
  location: string | null,
  remote: boolean,
  employmentType: string | null
): string | null {
  const parts: string[] = [];
  if (remote) {
    parts.push("Remote");
  } else if (location) {
    parts.push(location);
  }
  if (employmentType) {
    // Greenhouse strings come in mixed cases — normalize to "Full-time"-ish display.
    parts.push(employmentType);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface ImageProps {
  params: Promise<{ publicJobId: string }>;
}

// Renders the fallback OG image when the job isn't found. Sharing flows must
// never receive a 404/500 from the OG route — degrade gracefully instead.
function FallbackImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.bg,
          fontFamily: FONT_STACK,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: COLORS.brand,
            letterSpacing: "-0.02em",
          }}
        >
          Pipeline
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 36,
            color: COLORS.muted,
          }}
        >
          Job Posting
        </div>
      </div>
    ),
    { ...size }
  );
}

export default async function Image({ params }: ImageProps) {
  const { publicJobId } = await params;

  let job;
  try {
    job = await getJobByPublicId(publicJobId);
  } catch {
    // Database errors during OG render must not surface — fall back silently.
    return FallbackImage();
  }

  if (!job) return FallbackImage();

  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const locationLine = formatLocationLine(
    job.location,
    job.remote,
    job.employmentType
  );
  const logoUrl = job.company.logoUrl;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLORS.bg,
          fontFamily: FONT_STACK,
          padding: "64px 72px",
          position: "relative",
        }}
      >
        {/* Subtle accent strip across the top — gives the card a branded edge. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: COLORS.brandStrong,
            display: "flex",
          }}
        />

        {/* Wordmark — top-left. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.brand,
            letterSpacing: "-0.01em",
          }}
        >
          Pipeline
        </div>

        {/* Center stack: optional logo + title + company. flex:1 pushes the
            location/salary row toward the bottom. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginTop: 24,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              width={88}
              height={88}
              style={{
                width: 88,
                height: 88,
                borderRadius: 16,
                marginBottom: 28,
                objectFit: "contain",
                background: COLORS.bgAccent,
              }}
            />
          ) : null}

          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: COLORS.white,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              // Constrain to two visual lines worth of width — Satori has no
              // line-clamp, so width is the cleanest knob.
              maxWidth: 1000,
              display: "flex",
            }}
          >
            {job.title}
          </div>

          <div
            style={{
              marginTop: 20,
              fontSize: 36,
              color: COLORS.muted,
              display: "flex",
            }}
          >
            at {job.company.name}
          </div>
        </div>

        {/* Bottom row: location/employment chip + salary. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {locationLine ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 22px",
                  borderRadius: 999,
                  background: COLORS.chipBg,
                  color: COLORS.white,
                  fontSize: 26,
                  fontWeight: 500,
                }}
              >
                {locationLine}
              </div>
            ) : null}

            {salary ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 30,
                  fontWeight: 700,
                  color: COLORS.white,
                }}
              >
                {salary}
              </div>
            ) : null}
          </div>

          {/* CTA pill — bottom-right. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 26px",
              borderRadius: 999,
              background: COLORS.brandStrong,
              color: COLORS.white,
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            Apply on Pipeline
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
