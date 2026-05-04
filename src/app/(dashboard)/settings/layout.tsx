import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsSidenav } from "@/components/settings/sidenav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  // Soft-deleted users should not be able to access settings even if a stale
  // cookie still has a session. Mirrors the auth.ts signIn callback gate.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { deletedAt: true },
  });
  if (user?.deletedAt) redirect("/auth/signin");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 md:p-8 md:flex md:gap-8">
        <SettingsSidenav />
        <main className="flex-1 min-w-0 space-y-6">{children}</main>
      </div>
    </div>
  );
}
