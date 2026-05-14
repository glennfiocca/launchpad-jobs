import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Navbar } from "@/components/layout/navbar";
import { CompactSiteFooter } from "@/components/layout/footer";
import { GpcPinger } from "@/components/gpc/gpc-pinger";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col">{children}</main>
      <CompactSiteFooter />
      {/* Records GPC opt-out once per browser session for authed users. */}
      <GpcPinger />
    </div>
  );
}
