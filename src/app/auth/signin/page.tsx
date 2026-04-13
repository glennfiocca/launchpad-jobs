import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignInForm } from "@/components/auth/signin-form";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-lg font-bold text-white tracking-tight">Pipeline</p>
          <p className="text-zinc-400 text-sm mt-1">Apply to your dream jobs in one click</p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
