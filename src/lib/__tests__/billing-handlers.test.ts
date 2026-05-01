import { describe, it, expect, vi, beforeEach } from "vitest"
import type Stripe from "stripe"
import {
  handleSubscriptionUpsert,
  handleSubscriptionDeleted,
  handlePaymentFailed,
  handlePaymentSucceeded,
  WebhookValidationError,
} from "../billing-handlers"

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { db } from "@/lib/db"

// Typed mock surface
const mockDb = db as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  subscription: {
    findUnique: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

// --- Fixtures ---

const TEST_USER_ID = "user_abc123"
const TEST_CUSTOMER_ID = "cus_test_xyz"
const TEST_SUB_ID = "sub_test_123"
const TEST_PRICE_ID = "price_test_pro"
const TEST_PERIOD_END_SECONDS = 1_900_000_000 // far future timestamp
const TEST_EVENT_ID = "evt_test_001"

function makeSubscription(
  overrides: Partial<{
    metadata: Record<string, string>
    customer: string | null
    status: string
    cancelAtPeriodEnd: boolean
    items: { data: Array<{ price: { id: string }; current_period_end?: number }> }
    currentPeriodEnd: number | undefined
    id: string
  }> = {}
): Stripe.Subscription {
  const defaults = {
    metadata: { userId: TEST_USER_ID },
    customer: TEST_CUSTOMER_ID,
    status: "active",
    cancelAtPeriodEnd: false,
    items: {
      data: [
        {
          price: { id: TEST_PRICE_ID },
          current_period_end: TEST_PERIOD_END_SECONDS,
        },
      ],
    },
    currentPeriodEnd: undefined as number | undefined,
    id: TEST_SUB_ID,
  }
  const merged = { ...defaults, ...overrides }
  return {
    id: merged.id,
    status: merged.status,
    customer: merged.customer,
    cancel_at_period_end: merged.cancelAtPeriodEnd,
    metadata: merged.metadata,
    items: merged.items,
    current_period_end: merged.currentPeriodEnd,
  } as unknown as Stripe.Subscription
}

function makeInvoice(
  overrides: Partial<{
    customer: string | null
    billingReason: string
    id: string
  }> = {}
): Stripe.Invoice {
  const defaults = {
    customer: TEST_CUSTOMER_ID,
    billingReason: "subscription_cycle",
    id: "in_test_001",
  }
  const merged = { ...defaults, ...overrides }
  return {
    id: merged.id,
    customer: merged.customer,
    billing_reason: merged.billingReason,
  } as unknown as Stripe.Invoice
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks()
  // Default: $transaction passes through (executes the array sequentially)
  mockDb.$transaction.mockImplementation(async (ops: unknown[]) => ops)
})

// --- handleSubscriptionUpsert ---

describe("handleSubscriptionUpsert", () => {
  it("happy path: subscription.created with valid metadata.userId updates status to ACTIVE", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "FREE" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    const result = await handleSubscriptionUpsert(makeSubscription(), TEST_EVENT_ID)

    expect(result).toBe(true)
    expect(mockDb.$transaction).toHaveBeenCalledOnce()
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "ACTIVE" },
    })
    expect(mockDb.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
      create: expect.objectContaining({
        userId: TEST_USER_ID,
        stripeSubscriptionId: TEST_SUB_ID,
        stripePriceId: TEST_PRICE_ID,
        cancelAtPeriodEnd: false,
      }),
      update: expect.objectContaining({
        stripeSubscriptionId: TEST_SUB_ID,
        stripePriceId: TEST_PRICE_ID,
        cancelAtPeriodEnd: false,
      }),
    })
  })

  it("maps trialing status to ACTIVE", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "FREE" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    await handleSubscriptionUpsert(makeSubscription({ status: "trialing" }), TEST_EVENT_ID)

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "ACTIVE" },
    })
  })

  it("maps past_due status to PAST_DUE", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "ACTIVE" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    await handleSubscriptionUpsert(makeSubscription({ status: "past_due" }), TEST_EVENT_ID)

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "PAST_DUE" },
    })
  })

  it("maps unpaid status to CANCELED", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "ACTIVE" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    await handleSubscriptionUpsert(makeSubscription({ status: "unpaid" }), TEST_EVENT_ID)

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "CANCELED" },
    })
  })

  it("malformed event (missing items.data) throws WebhookValidationError and does NOT mutate DB", async () => {
    const broken = makeSubscription()
    ;(broken as unknown as { items: { data: unknown[] } }).items = { data: [] }

    await expect(handleSubscriptionUpsert(broken, TEST_EVENT_ID)).rejects.toThrow(
      WebhookValidationError
    )

    expect(mockDb.$transaction).not.toHaveBeenCalled()
    expect(mockDb.user.update).not.toHaveBeenCalled()
    expect(mockDb.subscription.upsert).not.toHaveBeenCalled()
  })

  it("throws when neither metadata.userId nor stripeCustomerId resolves a user", async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.subscription.findUnique.mockResolvedValue(null)

    await expect(
      handleSubscriptionUpsert(
        makeSubscription({ metadata: {}, customer: TEST_CUSTOMER_ID }),
        TEST_EVENT_ID
      )
    ).rejects.toThrow(WebhookValidationError)

    expect(mockDb.$transaction).not.toHaveBeenCalled()
    expect(mockDb.user.update).not.toHaveBeenCalled()
  })

  it("falls back to stripeCustomerId lookup when metadata.userId missing", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId === TEST_CUSTOMER_ID) {
          return Promise.resolve({ id: TEST_USER_ID })
        }
        if (args.select) return Promise.resolve({ subscriptionStatus: "FREE" })
        return Promise.resolve(null)
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    const result = await handleSubscriptionUpsert(
      makeSubscription({ metadata: {} }),
      TEST_EVENT_ID
    )

    expect(result).toBe(true)
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "ACTIVE" },
    })
  })

  it("rejects payloads with empty stripePriceId (no silent corruption)", async () => {
    const broken = makeSubscription()
    ;(broken as unknown as { items: { data: Array<{ price: { id: string } }> } }).items.data[0].price.id =
      ""

    await expect(handleSubscriptionUpsert(broken, TEST_EVENT_ID)).rejects.toThrow(
      WebhookValidationError
    )

    expect(mockDb.subscription.upsert).not.toHaveBeenCalled()
  })

  it("idempotency: applying the same event twice yields the same final state", async () => {
    let userStatus: "FREE" | "ACTIVE" = "FREE"
    let subRow: {
      stripeSubscriptionId: string
      stripePriceId: string
      stripeCurrentPeriodEnd: Date
      cancelAtPeriodEnd: boolean
    } | null = null

    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: userStatus })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockImplementation(() => Promise.resolve(subRow))

    // Simulate the transaction actually applying state.
    mockDb.$transaction.mockImplementation(async () => {
      userStatus = "ACTIVE"
      subRow = {
        stripeSubscriptionId: TEST_SUB_ID,
        stripePriceId: TEST_PRICE_ID,
        stripeCurrentPeriodEnd: new Date(TEST_PERIOD_END_SECONDS * 1000),
        cancelAtPeriodEnd: false,
      }
      return []
    })

    const sub = makeSubscription()

    const first = await handleSubscriptionUpsert(sub, TEST_EVENT_ID)
    expect(first).toBe(true)

    // Second apply with identical payload — should be a no-op
    const second = await handleSubscriptionUpsert(sub, TEST_EVENT_ID)
    expect(second).toBe(false)

    // $transaction was only called once — second call short-circuited
    expect(mockDb.$transaction).toHaveBeenCalledOnce()
    expect(userStatus).toBe("ACTIVE")
    expect(subRow).not.toBeNull()
  })
})

// --- handleSubscriptionDeleted ---

describe("handleSubscriptionDeleted", () => {
  it("subscription.deleted sets subscriptionStatus = CANCELED", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "ACTIVE" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: TEST_SUB_ID,
    })

    const result = await handleSubscriptionDeleted(
      makeSubscription({ status: "canceled" }),
      TEST_EVENT_ID
    )

    expect(result).toBe(true)
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { subscriptionStatus: "CANCELED" },
    })
    expect(mockDb.subscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
    })
  })

  it("idempotency: re-deleting an already canceled user is a no-op", async () => {
    mockDb.user.findUnique.mockImplementation(
      (args: { where: { id?: string; stripeCustomerId?: string }; select?: unknown }) => {
        if (args.where.stripeCustomerId) return Promise.resolve({ id: TEST_USER_ID })
        if (args.select) return Promise.resolve({ subscriptionStatus: "CANCELED" })
        return Promise.resolve({ id: TEST_USER_ID })
      }
    )
    mockDb.subscription.findUnique.mockResolvedValue(null)

    const result = await handleSubscriptionDeleted(
      makeSubscription({ status: "canceled" }),
      TEST_EVENT_ID
    )

    expect(result).toBe(false)
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it("malformed payload throws WebhookValidationError and does NOT mutate", async () => {
    const broken = makeSubscription()
    ;(broken as unknown as { items: unknown }).items = undefined

    await expect(handleSubscriptionDeleted(broken, TEST_EVENT_ID)).rejects.toThrow(
      WebhookValidationError
    )

    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it("throws when no user can be resolved", async () => {
    mockDb.user.findUnique.mockResolvedValue(null)

    await expect(
      handleSubscriptionDeleted(
        makeSubscription({ metadata: {}, customer: TEST_CUSTOMER_ID }),
        TEST_EVENT_ID
      )
    ).rejects.toThrow(WebhookValidationError)

    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })
})

// --- handlePaymentFailed ---

describe("handlePaymentFailed", () => {
  it("marks PAST_DUE for matching customer", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: TEST_USER_ID, subscriptionStatus: "ACTIVE" },
    ])

    const result = await handlePaymentFailed(makeInvoice(), TEST_EVENT_ID)

    expect(result).toBe(true)
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: TEST_CUSTOMER_ID },
      data: { subscriptionStatus: "PAST_DUE" },
    })
  })

  it("idempotency: no-op when all matching users are already PAST_DUE", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: TEST_USER_ID, subscriptionStatus: "PAST_DUE" },
    ])

    const result = await handlePaymentFailed(makeInvoice(), TEST_EVENT_ID)

    expect(result).toBe(false)
    expect(mockDb.user.updateMany).not.toHaveBeenCalled()
  })

  it("throws when invoice has no customer", async () => {
    await expect(
      handlePaymentFailed(makeInvoice({ customer: null }), TEST_EVENT_ID)
    ).rejects.toThrow(WebhookValidationError)
  })
})

// --- handlePaymentSucceeded ---

describe("handlePaymentSucceeded", () => {
  it("flips PAST_DUE → ACTIVE on subscription_cycle", async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: TEST_USER_ID }])

    const result = await handlePaymentSucceeded(
      makeInvoice({ billingReason: "subscription_cycle" }),
      TEST_EVENT_ID
    )

    expect(result).toBe(true)
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: {
        stripeCustomerId: TEST_CUSTOMER_ID,
        subscriptionStatus: "PAST_DUE",
      },
      data: { subscriptionStatus: "ACTIVE" },
    })
  })

  it("skips non-subscription_cycle invoices", async () => {
    const result = await handlePaymentSucceeded(
      makeInvoice({ billingReason: "subscription_create" }),
      TEST_EVENT_ID
    )

    expect(result).toBe(false)
    expect(mockDb.user.updateMany).not.toHaveBeenCalled()
  })

  it("idempotency: no-op when no users are PAST_DUE", async () => {
    mockDb.user.findMany.mockResolvedValue([])

    const result = await handlePaymentSucceeded(makeInvoice(), TEST_EVENT_ID)

    expect(result).toBe(false)
    expect(mockDb.user.updateMany).not.toHaveBeenCalled()
  })
})
