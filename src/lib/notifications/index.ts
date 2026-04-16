export {
  createNotification,
  createBroadcastNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "./service";

export { getOrCreatePreferences } from "./preferences";
export { maybeSendDigest } from "./digest";
export type {
  NotificationType,
  NotificationPriority,
  EmailFrequency,
  NotificationData,
  CreateNotificationInput,
  NotificationListOptions,
} from "./types";
