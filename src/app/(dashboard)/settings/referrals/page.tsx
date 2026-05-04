import { ReferralDashboard } from "@/components/referral/referral-dashboard"
import { SectionCard } from "@/components/settings/section-card"

export const metadata = {
  title: "Referrals",
  description: "Invite friends and earn bonus application credits",
}

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Invite friends to Pipeline. Earn 10 free credits for every friend who applies to their first job.
        </p>
      </div>

      <SectionCard
        title="Your referral link"
        description="Share this with friends — they sign up, you both win."
      >
        <ReferralDashboard />
      </SectionCard>
    </div>
  )
}
