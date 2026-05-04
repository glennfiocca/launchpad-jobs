import { describe, it, expect } from "vitest";
import { SETTINGS_NAV } from "../nav-config";

describe("SETTINGS_NAV", () => {
  it("renders the six known sections in order", () => {
    expect(SETTINGS_NAV.map((i) => i.label)).toEqual([
      "Account",
      "Security",
      "Notifications",
      "Billing",
      "Referrals",
      "Privacy & data",
    ]);
  });

  it("uses /settings (not /settings/account) for Account", () => {
    expect(SETTINGS_NAV[0].href).toBe("/settings");
  });

  it("Security is enabled in Phase 4", () => {
    const security = SETTINGS_NAV.find((i) => i.label === "Security");
    expect(security?.disabled).toBeFalsy();
    expect(security?.comingSoon).toBeFalsy();
    expect(security?.href).toBe("/settings/security");
  });

  it("Billing is enabled and points at /settings/billing (Phase 2)", () => {
    const billing = SETTINGS_NAV.find((i) => i.label === "Billing");
    expect(billing?.disabled).toBeFalsy();
    expect(billing?.comingSoon).toBeFalsy();
    expect(billing?.href).toBe("/settings/billing");
  });

  it("all rows are enabled in Phase 4", () => {
    for (const label of [
      "Account",
      "Security",
      "Notifications",
      "Billing",
      "Referrals",
      "Privacy & data",
    ]) {
      const item = SETTINGS_NAV.find((i) => i.label === label);
      expect(item?.disabled).toBeFalsy();
    }
  });

  it("each item has a non-empty label, href starting with /settings, and an icon", () => {
    for (const item of SETTINGS_NAV) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/settings")).toBe(true);
      expect(typeof item.icon).toBe("object");
    }
  });

  it("hrefs are unique", () => {
    const hrefs = SETTINGS_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("zero rows are disabled in Phase 4", () => {
    expect(SETTINGS_NAV.filter((i) => i.disabled).length).toBe(0);
  });
});
