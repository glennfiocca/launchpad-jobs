"use client"

import { useEffect, useState } from "react"
import { Loader2, Gift, Users, Zap } from "lucide-react"
import { CopyLinkButton } from "./copy-link-button"
import type { ReferralDashboardData } from "@/lib/referral"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending — waiting for first application", color: "text-yellow-400" },
  CONVERTED: { label: "Converted — you earned 10 credits", color: "text-green-400" },
  EXPIRED: { label: "Expired", color: "text-zinc-500" },
  FLAGGED: { label: "Under Review", color: "text-orange-400" },
  REVOKED: { label: "Revoked", color: "text-red-400" },
}

export function ReferralDashboard() {
  const [data, setData] = useState<ReferralDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/referral")
      .then((r) => r.json())
      .then((json: { success: boolean; data?: ReferralDashboardData; error?: string }) => {
        if (json.success && json.data) {
          setData(json.data)
        } else {
          setError(json.error ?? "Failed to load referral data")
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-zinc-400">
        {error ?? "No referral data available."}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Link + Code */}
      <section className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Your Referral Link</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Share this link — you earn 10 credits when your friend submits their first application.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-3 py-2 rounded-md bg-black text-sm text-zinc-300 border border-zinc-800 truncate select-all">
            {data.referralLink}
          </code>
          <CopyLinkButton text={data.referralLink} label="Copy Link" />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Short code:</span>
          <code className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono tracking-widest">
            {data.referralCode}
          </code>
          <CopyLinkButton text={data.referralCode} label="Copy" />
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
          <Users className="w-5 h-5 mx-auto text-blue-400 mb-2" />
          <p className="text-2xl font-bold text-white">{data.totalReferred}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Referred</p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
          <Zap className="w-5 h-5 mx-auto text-green-400 mb-2" />
          <p className="text-2xl font-bold text-white">{data.totalConverted}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Converted</p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
          <Gift className="w-5 h-5 mx-auto text-purple-400 mb-2" />
          <p className="text-2xl font-bold text-white">{data.referralCredits}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Bonus Credits</p>
        </div>
      </section>

      {/* Referral History */}
      {data.referrals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">Referral History</h2>
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {data.referrals.map((ref) => {
              const statusInfo = STATUS_LABELS[ref.status] ?? {
                label: ref.status,
                color: "text-zinc-400",
              }
              return (
                <div
                  key={ref.id}
                  className="flex items-center justify-between px-4 py-3 bg-zinc-900/50"
                >
                  <span className="text-sm text-zinc-400">
                    {new Date(ref.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className={`text-xs font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="text-center py-8 text-zinc-500 text-sm">
          No referrals yet. Share your link to get started.
        </section>
      )}

      {/* How it works */}
      <section className="p-4 rounded-xl border border-zinc-800/50 bg-zinc-950">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          How it works
        </h3>
        <ol className="text-sm text-zinc-400 space-y-1.5 list-decimal list-inside">
          <li>Share your unique referral link with friends</li>
          <li>They sign up using your link</li>
          <li>When they submit their first job application, you earn 10 bonus credits</li>
          <li>Bonus credits are used before your daily free credits</li>
        </ol>
      </section>
    </div>
  )
}
