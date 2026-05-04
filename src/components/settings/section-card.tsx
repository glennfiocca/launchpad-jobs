import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <header className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && (
            <p className="text-sm text-zinc-400 mt-1">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}
