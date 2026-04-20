import { Gift } from "lucide-react"
import { ReferralDashboard } from "@/components/referral/referral-dashboard"

export const metadata = {
  title: "Referrals",
  description: "Invite friends and earn bonus application credits",
}

export default function ReferralsPage() {
  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Gift className="w-5 h-5 text-purple-400" />
          Referrals
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          Invite friends to Pipeline. Earn 10 free credits for every friend who applies to their first job.
        </p>
      </div>
      <ReferralDashboard />
    </div>
  )
}
