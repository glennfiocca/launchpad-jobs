import { UserSidebar } from "@/components/layout/user-sidebar";
import { PageTransition } from "@/components/layout/page-transition";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black flex">
      <UserSidebar />
      <main className="flex-1 overflow-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
