"use client";

import { useState, useRef } from "react";
import { Bell } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useNotifications } from "./use-notifications";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showTooltip() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltipVisible(true);
  }

  function hideTooltip() {
    hideTimer.current = setTimeout(() => setTooltipVisible(false), 150);
  }

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

  const tooltipLabel =
    count > 0
      ? `${count} unread notification${count === 1 ? "" : "s"}`
      : "Notifications";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
        <Popover.Trigger asChild>
          <button
            onClick={() => {
              hideTooltip();
              setTooltipVisible(false);
            }}
            aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
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

        {tooltipVisible && !open && (
          <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 z-50 shadow-xl pointer-events-none">
            {tooltipLabel}
            <div className="absolute -bottom-1.5 right-3 w-3 h-3 bg-zinc-900 border-r border-b border-white/10 rotate-45" />
          </div>
        )}
      </div>

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
