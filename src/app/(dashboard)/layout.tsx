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
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        <CompactSiteFooter />
      </main>
    </div>
  );
}
