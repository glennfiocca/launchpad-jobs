import { redirect } from "next/navigation";

export default async function LegacyBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const target = qs.toString()
    ? `/settings/billing?${qs.toString()}`
    : "/settings/billing";
  redirect(target);
}
