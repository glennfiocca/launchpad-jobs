import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Mail, ShieldCheck, KeyRound } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { SectionCard } from "@/components/settings/section-card";
import { SignOutEverywhereButton } from "@/components/settings/sign-out-everywhere-button";
import { LOGIN_EVENTS_DISPLAY_LIMIT } from "@/lib/settings/constants";

export const metadata = {
  title: "Security — Pipeline",
  description: "Sign-in activity and account security",
};

const RELATIVE_TIME_DIVISIONS: ReadonlyArray<{
  unit: Intl.RelativeTimeFormatUnit;
  amount: number;
}> = [
  { unit: "second", amount: 60 },
  { unit: "minute", amount: 60 },
  { unit: "hour", amount: 24 },
  { unit: "day", amount: 30 },
  { unit: "month", amount: 12 },
  { unit: "year", amount: Number.POSITIVE_INFINITY },
];

function formatRelativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const { unit, amount } of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  return date.toISOString();
}

function truncate(value: string | null, max: number): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export default async function SettingsSecurityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const events = await db.loginEvent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: LOGIN_EVENTS_DISPLAY_LIMIT,
    select: {
      id: true,
      createdAt: true,
      ipAddress: true,
      userAgent: true,
      provider: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Security</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Review recent activity and manage account access.
        </p>
      </div>

      <SectionCard
        title="Sign-in method"
        description="Magic link via email — no password to remember."
      >
        <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <Mail className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 leading-relaxed">
            We email you a one-time link each time you sign in. If you stop
            receiving the email, contact{" "}
            <a
              href="mailto:support@trypipeline.ai"
              className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
            >
              support@trypipeline.ai
            </a>
            .
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent sign-in activity"
        description={`Last ${LOGIN_EVENTS_DISPLAY_LIMIT} sign-ins to your account.`}
        action={<SignOutEverywhereButton />}
      >
        {events.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-zinc-400">
              No recent sign-ins recorded yet. They&apos;ll appear here next
              time you sign in.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left">
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((e) => (
                  <tr key={e.id} className="text-zinc-300">
                    <td
                      className="px-4 py-3 whitespace-nowrap text-zinc-400"
                      title={e.createdAt.toISOString()}
                    >
                      {formatRelativeTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {e.provider ?? "email"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {e.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <span title={e.userAgent ?? undefined}>
                        {truncate(e.userAgent, 40)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Two-factor authentication"
        description="Add a second factor to defend against email account takeover."
      >
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 opacity-70">
          <KeyRound className="w-5 h-5 text-zinc-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-zinc-400">
              Two-factor authentication is on the roadmap.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wide bg-white/5 border border-white/10 text-zinc-400 px-2 py-1 rounded">
            <ShieldCheck className="inline w-3 h-3 mr-1" />
            Coming soon
          </span>
        </div>
      </SectionCard>
    </div>
  );
}
