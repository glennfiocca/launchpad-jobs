import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { UserSidebar } from "@/components/layout/user-sidebar";
import { CompactSiteFooter } from "@/components/layout/footer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="h-screen bg-black flex overflow-hidden">
      <UserSidebar />
      <main className="flex-1 overflow-hidden grid grid-rows-[1fr_auto]">
        <div className="overflow-hidden min-h-0">{children}</div>
        <CompactSiteFooter />
      </main>
    </div>
  );
}
