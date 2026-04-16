import { UserSidebar } from "@/components/layout/user-sidebar";
import { PageTransition } from "@/components/layout/page-transition";
import { CompactSiteFooter } from "@/components/layout/footer";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-black flex overflow-hidden">
      <UserSidebar />
      <main className="flex-1 overflow-hidden grid grid-rows-[1fr_auto]">
        <div className="h-full overflow-hidden min-h-0">
          <PageTransition>{children}</PageTransition>
        </div>
        <CompactSiteFooter />
      </main>
    </div>
  );
}
