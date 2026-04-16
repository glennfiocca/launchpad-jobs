"use client";

import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { NotificationItem } from "./notification-item";
import type { Notification } from "@prisma/client";

interface NotificationPanelProps {
  items: Notification[];
  panelLoading: boolean;
  loading: boolean;
  nextCursor: string | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRemove: (id: string) => void;
  onLoadMore: () => void;
  onClose: () => void;
}

export function NotificationPanel({
  items,
  panelLoading,
  loading,
  nextCursor,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onLoadMore,
  onClose,
}: NotificationPanelProps) {
  const hasUnread = items.some((n) => !n.isRead);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold text-white">Notifications</h2>
        {hasUnread && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {panelLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Bell className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No notifications yet</p>
            <p className="text-xs text-zinc-600 mt-1">
              We'll notify you when something important happens.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {items.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={onMarkRead}
                onRemove={onRemove}
                onClose={onClose}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {nextCursor && !panelLoading && (
          <div className="py-3 text-center">
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              ) : (
                "Load more"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
        <Link
          href="/settings/notifications"
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Notification preferences →
        </Link>
      </div>
    </div>
  );
}
