import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getOrCreateStripeCustomer, STRIPE_PRICE_ID } from "@/lib/stripe";
import type { ApiResponse } from "@/types";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const customerId = await getOrCreateStripeCustomer(
    session.user.id,
    session.user.email
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true`,
    cancel_url: `${appUrl}/billing`,
    metadata: { userId: session.user.id },
    subscription_data: { metadata: { userId: session.user.id } },
  });

  return NextResponse.json<ApiResponse<{ url: string }>>({
    success: true,
    data: { url: checkoutSession.url! },
  });
}
