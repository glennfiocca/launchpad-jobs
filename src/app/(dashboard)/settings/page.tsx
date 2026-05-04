import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, UserCircle2 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { IdentityForm } from "@/components/settings/identity-form";
import { SectionCard } from "@/components/settings/section-card";

export const metadata = {
  title: "Account settings",
  description: "Manage your Pipeline account",
};

export default async function SettingsAccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/auth/signin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Member since{" "}
          {user.createdAt.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <IdentityForm
        initialName={user.name ?? ""}
        email={user.email ?? ""}
      />

      <SectionCard
        title="Career profile"
        description="Resume, work history, education, and job preferences."
      >
        <Link
          href="/profile"
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <UserCircle2 className="w-5 h-5 text-indigo-400" />
            <div>
              <p className="text-sm font-medium text-white">
                Edit career profile
              </p>
              <p className="text-xs text-zinc-500">
                Pipeline uses this to auto-apply on your behalf.
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </Link>
      </SectionCard>
    </div>
  );
}
