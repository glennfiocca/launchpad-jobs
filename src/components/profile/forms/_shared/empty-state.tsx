import type { EmptyStateContent } from "./empty-states";

interface EmptyStateProps {
  content: EmptyStateContent;
}

export function EmptyState({ content: { icon: Icon, heading, body } }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
      <Icon className="w-8 h-8 text-zinc-600 mb-3" />
      <p className="text-sm font-medium text-zinc-300">{heading}</p>
      <p className="text-xs text-zinc-500 mt-1 max-w-xs">{body}</p>
    </div>
  );
}
