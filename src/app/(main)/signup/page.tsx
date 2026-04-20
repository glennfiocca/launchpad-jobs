import { redirect } from "next/navigation"

// The middleware captures the ?ref= query param into a signed cookie before this runs.
// We just redirect to the actual sign-in page — the cookie persists through the redirect.
export default function SignupPage() {
  redirect("/auth/signin")
}
