"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useNotifications } from "./use-notifications";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const {
    count,
    items,
    panelLoading,
    loading,
    nextCursor,
    markRead,
    markAllRead,
    remove,
    loadMore,
  } = useNotifications({ enabled: open });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label={
            count > 0 ? `${count} unread notifications` : "Notifications"
          }
          className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white px-0.5 leading-none">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="w-[360px] h-[480px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <NotificationPanel
            items={items}
            panelLoading={panelLoading}
            loading={loading}
            nextCursor={nextCursor}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onRemove={remove}
            onLoadMore={loadMore}
            onClose={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
