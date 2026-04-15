import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") {
    return null
  }
  return session
}

export function isAdminRole(role: string | undefined): boolean {
  return role === "ADMIN"
}
