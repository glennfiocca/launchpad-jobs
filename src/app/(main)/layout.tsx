import { UserSidebar } from "@/components/layout/user-sidebar";
import { PageTransition } from "@/components/layout/page-transition";
import { CompactSiteFooter } from "@/components/layout/footer";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-black flex overflow-hidden">
      <UserSidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          <PageTransition>{children}</PageTransition>
        </div>
        <CompactSiteFooter />
      </main>
    </div>
  );
}
