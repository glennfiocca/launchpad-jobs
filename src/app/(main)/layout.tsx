import { UserSidebar } from "@/components/layout/user-sidebar";
import { PageTransition } from "@/components/layout/page-transition";
import { CompactSiteFooter } from "@/components/layout/footer";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-black flex overflow-hidden">
      <UserSidebar />
      <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <PageTransition>{children}</PageTransition>
        </div>
        <CompactSiteFooter />
      </main>
    </div>
  );
}
