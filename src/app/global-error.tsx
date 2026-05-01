"use client";

import { useEffect } from "react";

// Root-layout error boundary — replaces the root layout when the layout itself errors.
// Must include <html>/<body> and avoid any dependencies that the broken root layout
// would have provided (Tailwind, fonts, providers). Inline styles only.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "0.75rem",
            padding: "2rem",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            An unexpected error occurred
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              marginBottom: 0,
              fontSize: "0.875rem",
              color: "#a1a1aa",
            }}
          >
            The application failed to render. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              backgroundColor: "#fff",
              color: "#000",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.625rem 1.25rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
