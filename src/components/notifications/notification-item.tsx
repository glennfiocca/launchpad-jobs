"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  Mail,
  AlertCircle,
  Briefcase,
  Megaphone,
  Info,
  Send,
  X,
} from "lucide-react";
import type { Notification, NotificationType } from "@prisma/client";

const TYPE_ICONS: Record<NotificationType, React.ElementType> = {
  APPLIED: Send,
  APPLICATION_STATUS_CHANGE: Briefcase,
  APPLICATION_OFFER: CheckCircle,
  APPLICATION_INTERVIEW: Briefcase,
  APPLICATION_REJECTED: AlertCircle,
  EMAIL_RECEIVED: Mail,
  LISTING_REMOVED: AlertCircle,
  APPLY_FAILED: AlertCircle,
  TEAM_MESSAGE: Megaphone,
  SYSTEM: Info,
};

const TYPE_ICON_COLORS: Record<NotificationType, string> = {
  APPLIED: "text-blue-400",
  APPLICATION_STATUS_CHANGE: "text-purple-400",
  APPLICATION_OFFER: "text-green-400",
  APPLICATION_INTERVIEW: "text-orange-400",
  APPLICATION_REJECTED: "text-red-400",
  EMAIL_RECEIVED: "text-zinc-400",
  LISTING_REMOVED: "text-zinc-400",
  APPLY_FAILED: "text-red-400",
  TEAM_MESSAGE: "text-violet-400",
  SYSTEM: "text-blue-400",
};

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
  onRemove,
  onClose,
}: NotificationItemProps) {
  const router = useRouter();
  const Icon = TYPE_ICONS[notification.type];
  const iconColor = TYPE_ICON_COLORS[notification.type];

  function handleClick() {
    if (!notification.isRead) onMarkRead(notification.id);
    if (notification.ctaUrl) {
      router.push(notification.ctaUrl);
      onClose();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className={[
        "group relative flex gap-3 px-4 py-3 cursor-pointer transition-colors",
        "hover:bg-white/5",
        notification.isRead ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* Unread indicator */}
      {!notification.isRead && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
      )}

      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-snug truncate">
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-zinc-600 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      {/* Remove button */}
      <button
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(notification.id);
        }}
        className="shrink-0 self-start mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
