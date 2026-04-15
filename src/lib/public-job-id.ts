import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const ALPH = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** `PL` + 8 chars from ALPH (no I/O); collision-checked against DB. */
export async function generateUniquePublicJobId(): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const suffix = Array.from(randomBytes(8))
      .map((b) => ALPH[b % ALPH.length]!)
      .join("")
      .slice(0, 8);
    const publicJobId = `PL${suffix}`;
    const clash = await db.job.findUnique({ where: { publicJobId } });
    if (!clash) return publicJobId;
  }
  throw new Error("Could not allocate a unique publicJobId");
}
