import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { db } from "@/lib/db";
import {
  requireOwnedRow,
  requireProfile,
  type ProfileChildModel,
} from "@/lib/api/require-profile";

// Shared building blocks for the 6 profile sub-resources. The 12 route files
// all do the same dance: authenticate → validate → ownership-check → mutate.
// Centralizing here keeps each route file under ~50 lines of pure config.

// Prisma generates a delegate per model; the methods we need have the same
// shape across all profile children. We keep the signatures permissive (input
// types as `unknown`) because each schema infers its own narrower shape and
// we don't gain anything by reproducing 6 generic parameter walls.
interface ChildDelegate {
  findMany: (args: {
    where: { profileId: string };
    orderBy: Array<Record<string, "asc" | "desc">>;
  }) => Promise<unknown[]>;
  findFirst: (args: {
    where: { profileId: string };
    orderBy: { order: "desc" };
    select: { order: true };
  }) => Promise<{ order: number } | null>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  update: (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
}

function getDelegate(model: ProfileChildModel): ChildDelegate {
  return (db as unknown as Record<ProfileChildModel, ChildDelegate>)[model];
}

// `P2002` = Prisma unique-constraint violation. Skill and SpokenLanguage have
// composite (profileId, name) uniques — surface that as a friendly 409.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

function zodErrorResponse(err: ZodError): NextResponse {
  return NextResponse.json(
    { error: err.issues[0]?.message ?? "Invalid request body" },
    { status: 400 }
  );
}

function unexpectedErrorResponse(err: unknown): NextResponse {
  console.error("Profile child route error:", err);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

interface CollectionRouteConfig<TCreate extends ZodTypeAny> {
  model: ProfileChildModel;
  createSchema: TCreate;
  uniqueResource?: boolean; // true → translate P2002 to 409
}

// GET /api/profile/<resource> — list rows for the authenticated user's
// profile, ordered the way the UI expects (manual order first, then insertion).
// POST /api/profile/<resource> — validate + create. Auto-assigns `order`.
export function buildCollectionRoute<TCreate extends ZodTypeAny>(
  cfg: CollectionRouteConfig<TCreate>
): {
  GET: () => Promise<NextResponse>;
  POST: (request: Request) => Promise<NextResponse>;
} {
  const delegate = () => getDelegate(cfg.model);

  return {
    async GET() {
      try {
        const auth = await requireProfile();
        if (!auth.ok) return auth.response;

        const rows = await delegate().findMany({
          where: { profileId: auth.profileId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        });
        return NextResponse.json({ data: rows });
      } catch (err) {
        return unexpectedErrorResponse(err);
      }
    },

    async POST(request: Request) {
      try {
        const auth = await requireProfile();
        if (!auth.ok) return auth.response;

        const body = await request.json();
        const parsed = cfg.createSchema.safeParse(body);
        if (!parsed.success) return zodErrorResponse(parsed.error);

        // `order` defaults to MAX(order)+1 if the client didn't pin a value
        // (or pinned 0, which is the schema default). Lets the UI append
        // without computing positions itself.
        const input = parsed.data as z.infer<TCreate> & { order?: number };
        const wantsAutoOrder = input.order === undefined || input.order === 0;
        const nextOrder = wantsAutoOrder
          ? ((
              await delegate().findFirst({
                where: { profileId: auth.profileId },
                orderBy: { order: "desc" },
                select: { order: true },
              })
            )?.order ?? -1) + 1
          : input.order;

        const row = await delegate().create({
          data: {
            ...(input as Record<string, unknown>),
            order: nextOrder,
            profileId: auth.profileId,
          },
        });

        return NextResponse.json({ data: row }, { status: 201 });
      } catch (err) {
        if (cfg.uniqueResource && isUniqueViolation(err)) {
          return NextResponse.json(
            { error: "An entry with that name already exists" },
            { status: 409 }
          );
        }
        return unexpectedErrorResponse(err);
      }
    },
  };
}

interface ItemRouteConfig<TUpdate extends ZodTypeAny> {
  model: ProfileChildModel;
  updateSchema: TUpdate;
  uniqueResource?: boolean;
}

// PUT/DELETE /api/profile/<resource>/[id] — validate body, ownership-check,
// mutate. Always returns 404 (not 403) when the row is owned by another
// profile so we don't leak existence of foreign IDs.
export function buildItemRoute<TUpdate extends ZodTypeAny>(
  cfg: ItemRouteConfig<TUpdate>
): {
  PUT: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<NextResponse>;
  DELETE: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<NextResponse>;
} {
  const delegate = () => getDelegate(cfg.model);

  return {
    async PUT(request, ctx) {
      try {
        const { id } = await ctx.params;
        const auth = await requireProfile();
        if (!auth.ok) return auth.response;

        const owned = await requireOwnedRow(cfg.model, id, auth.profileId);
        if (!owned) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const body = await request.json();
        const parsed = cfg.updateSchema.safeParse(body);
        if (!parsed.success) return zodErrorResponse(parsed.error);

        const row = await delegate().update({
          where: { id },
          data: parsed.data as Record<string, unknown>,
        });

        return NextResponse.json({ data: row });
      } catch (err) {
        if (cfg.uniqueResource && isUniqueViolation(err)) {
          return NextResponse.json(
            { error: "An entry with that name already exists" },
            { status: 409 }
          );
        }
        return unexpectedErrorResponse(err);
      }
    },

    async DELETE(_request, ctx) {
      try {
        const { id } = await ctx.params;
        const auth = await requireProfile();
        if (!auth.ok) return auth.response;

        const owned = await requireOwnedRow(cfg.model, id, auth.profileId);
        if (!owned) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        await delegate().delete({ where: { id } });

        // Match resume DELETE shape: { success: true } @ 200.
        return NextResponse.json({ success: true });
      } catch (err) {
        return unexpectedErrorResponse(err);
      }
    },
  };
}
