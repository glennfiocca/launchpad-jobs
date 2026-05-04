import type { LucideIcon } from "lucide-react";
import {
  User,
  Shield,
  Bell,
  CreditCard,
  Gift,
  Lock,
} from "lucide-react";

// Order matters — this is the visible order of the settings sidenav.
// `disabled` rows render greyed out; `comingSoon` adds the "Soon" pill.
export interface SettingsNavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly disabled?: boolean;
  readonly comingSoon?: boolean;
}

export const SETTINGS_NAV: ReadonlyArray<SettingsNavItem> = [
  { label: "Account", href: "/settings", icon: User },
  {
    label: "Security",
    href: "/settings/security",
    icon: Shield,
    disabled: true,
    comingSoon: true,
  },
  {
    label: "Notifications",
    href: "/settings/notifications",
    icon: Bell,
  },
  {
    label: "Billing",
    href: "/settings/billing",
    icon: CreditCard,
    disabled: true,
    comingSoon: true,
  },
  {
    label: "Referrals",
    href: "/settings/referrals",
    icon: Gift,
  },
  {
    label: "Privacy & data",
    href: "/settings/privacy",
    icon: Lock,
  },
];
