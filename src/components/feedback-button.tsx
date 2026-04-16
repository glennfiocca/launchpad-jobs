"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare, X, Star, Bug, Lightbulb, Heart, HelpCircle } from "lucide-react"

type FeedbackType = "BUG" | "FEATURE" | "PRAISE" | "OTHER"

interface TypeOption {
  value: FeedbackType
  label: string
  icon: React.ReactNode
  color: string
}

const TYPES: TypeOption[] = [
  { value: "BUG", label: "Bug", icon: <Bug className="w-4 h-4" />, color: "text-red-400" },
  { value: "FEATURE", label: "Idea", icon: <Lightbulb className="w-4 h-4" />, color: "text-yellow-400" },
  { value: "PRAISE", label: "Praise", icon: <Heart className="w-4 h-4" />, color: "text-pink-400" },
  { value: "OTHER", label: "Other", icon: <HelpCircle className="w-4 h-4" />, color: "text-zinc-400" },
]

const TYPE_PLACEHOLDER: Record<FeedbackType, string> = {
  BUG: "I was on the jobs page and clicked Apply, then...",
  FEATURE: "It would be great if...",
  PRAISE: "I love how...",
  OTHER: "Your thoughts...",
}

const TYPE_PROMPT: Record<FeedbackType, string> = {
  BUG: "Describe what happened and what you expected",
  FEATURE: "Describe your idea and the problem it solves",
  PRAISE: "Tell us what you love",
  OTHER: "What's on your mind?",
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>("OTHER")
  const [rating, setRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Reset form when closed (with delay to let animation finish)
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setType("OTHER")
        setRating(null)
        setHoverRating(null)
        setMessage("")
        setSubmitted(false)
        setError(null)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          rating: rating ?? undefined,
          message: message.trim(),
          pageUrl: window.location.href,
        }),
      })
      const json = await res.json() as { success: boolean }
      if (json.success) {
        setSubmitted(true)
        setTimeout(() => setOpen(false), 2000)
      } else {
        setError("Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoverRating ?? rating

  return (
    <>
      {/* Invisible backdrop to catch outside clicks (panel ref handles this) */}
      {open && <div className="fixed inset-0 z-40" aria-hidden="true" />}

      {/* Panel + trigger — pinned to right edge, vertically centered */}
      <div
        ref={panelRef}
        className="fixed right-0 bottom-8 z-50 flex items-center"
      >
        {/* Slide-out panel */}
        <div
          className={[
            "transition-all duration-300 ease-in-out origin-right overflow-hidden",
            open
              ? "opacity-100 translate-x-0 pointer-events-auto max-w-[20rem]"
              : "opacity-0 translate-x-4 pointer-events-none max-w-0 min-w-0",
          ].join(" ")}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-l-2xl shadow-2xl w-80 overflow-hidden">
            {submitted ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <Heart className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-white font-semibold">Thanks for the feedback!</p>
                <p className="text-zinc-400 text-sm">We read every submission.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-white">Share feedback</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-zinc-500 hover:text-white transition-colors"
                    aria-label="Close feedback form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Type selector */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={[
                          "flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all",
                          type === t.value
                            ? "border-violet-500/50 bg-violet-500/10 text-white"
                            : "border-zinc-700 bg-transparent text-zinc-400 hover:border-zinc-500 hover:text-white",
                        ].join(" ")}
                      >
                        <span className={type === t.value ? "text-violet-400" : t.color}>
                          {t.icon}
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Star rating */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">
                      How would you rate your experience?{" "}
                      <span className="text-zinc-600">(optional)</span>
                    </p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(rating === star ? null : star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          className="transition-transform hover:scale-110"
                          aria-label={`Rate ${star} out of 5`}
                        >
                          <Star
                            className={[
                              "w-6 h-6 transition-colors",
                              (displayRating ?? 0) >= star
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-zinc-600",
                            ].join(" ")}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">{TYPE_PROMPT[type]}</p>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      rows={4}
                      placeholder={TYPE_PLACEHOLDER[type]}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                    />
                  </div>

                  {/* Current page context */}
                  <p className="text-xs text-zinc-600 truncate" title={pathname ?? ""}>
                    Page: {pathname}
                  </p>

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Trigger tab */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Open feedback form"
          className="flex items-center gap-2 px-2.5 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium shadow-lg transition-all duration-200 rounded-l-xl"
          style={{ writingMode: "vertical-rl" as const, transform: "rotate(180deg)" }}
        >
          <MessageSquare className="w-4 h-4" />
          Feedback
        </button>
      </div>
    </>
  )
}
