import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { UserSidebar } from "@/components/layout/user-sidebar";
import { PageTransition } from "@/components/layout/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="min-h-screen bg-black flex">
      <UserSidebar />
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
