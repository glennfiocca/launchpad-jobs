"use client";

import { useEffect } from "react";
import Link from "next/link";

// Segment-level error boundary — wraps route segments and their children.
// Must be a Client Component per Next.js App Router convention.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the full error in browser devtools for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="text-zinc-400 text-sm mt-2">
          An unexpected error occurred while rendering this page. You can try again, or head back home.
        </p>

        {error.digest && (
          <div className="mt-5">
            <p className="text-xs text-zinc-500 mb-1.5">Error reference</p>
            <code className="block bg-black border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300 break-all">
              {error.digest}
            </code>
            <p className="text-xs text-zinc-500 mt-1.5">
              Quote this code if you contact support.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center bg-white text-black font-semibold rounded-xl px-5 py-2.5 text-sm hover:bg-zinc-100 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Go home →
          </Link>
        </div>
      </div>
    </div>
  );
}
