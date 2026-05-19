"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ApiResponse } from "@/types"
import type { QueueCard, MissCard } from "@/lib/board-review/types"

export type CardKind = "queue" | "misses"
export type ReviewCard = QueueCard | MissCard

interface NextResponseShape {
  card: ReviewCard | null
}

interface UseNextCardReturn {
  card: ReviewCard | null
  loading: boolean
  error: string | null
  fetchNext: () => Promise<void>
  reviewedSinceMount: number
  incrementReviewed: () => void
}

/**
 * Shared fetch hook used by both the Queue and Misses tab. Encapsulates
 * the `GET next?kind=...` request, swallows stale responses (request-id
 * tracked via a ref so an in-flight request that resolves *after* a newer
 * one fires never overwrites the newer card), and exposes a counter the
 * "All caught up." screen displays.
 */
export function useNextCard(kind: CardKind): UseNextCardReturn {
  const [card, setCard] = useState<ReviewCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewedSinceMount, setReviewedSinceMount] = useState(0)
  const reqIdRef = useRef(0)

  const fetchNext = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/board-review/next?kind=${kind}`, {
        cache: "no-store",
      })
      const json: ApiResponse<NextResponseShape> = await res.json()
      if (reqIdRef.current !== reqId) return
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load next card")
        setCard(null)
        return
      }
      setCard(json.data.card)
    } catch (err) {
      if (reqIdRef.current !== reqId) return
      const message = err instanceof Error ? err.message : "Network error"
      setError(message)
      setCard(null)
    } finally {
      if (reqIdRef.current === reqId) setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void fetchNext()
  }, [fetchNext])

  const incrementReviewed = useCallback(() => {
    setReviewedSinceMount((n) => n + 1)
  }, [])

  return { card, loading, error, fetchNext, reviewedSinceMount, incrementReviewed }
}
