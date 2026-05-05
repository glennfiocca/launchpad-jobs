"use client";

import { Bookmark } from "lucide-react";

interface EmptySavedStateProps {
  onBrowseAll: () => void;
}

/**
 * Empty state shown on the Saved view when the authenticated user has no
 * saved jobs. Pairs an oversized bookmark icon with copy that teaches the
 * "tap the bookmark on any job" gesture, plus a CTA to switch back to the
 * All view.
 */
export function EmptySavedState({ onBrowseAll }: EmptySavedStateProps) {
  return (
    <div className="text-center py-20 px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-5">
        <Bookmark className="w-7 h-7 text-indigo-400" aria-hidden />
      </div>
      <h2 className="text-lg font-medium text-white mb-2">
        Nothing saved yet
      </h2>
      <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
        Tap the bookmark icon on any job to save it for later. Your saved jobs
        will show up here.
      </p>
      <button
        type="button"
        onClick={onBrowseAll}
        className="mt-6 inline-flex items-center gap-2 px-4 h-9 rounded-full bg-white text-zinc-900 text-sm font-medium hover:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        Browse all jobs
      </button>
    </div>
  );
}
