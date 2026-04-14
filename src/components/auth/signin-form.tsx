"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Mail, CheckCircle } from "lucide-react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("email", {
        email,
        callbackUrl: "/dashboard",
        redirect: false,
      });

      if (result?.error) {
        setError("Failed to send magic link. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          We sent a sign-in link to{" "}
          <span className="font-medium text-zinc-300">{email}</span>.
          Click the link to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-8">
      <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Enter your email and we&apos;ll send you a magic link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="email" className="block text-sm text-zinc-400 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="bg-black border border-white/10 text-white placeholder-zinc-600 rounded-xl px-4 py-3 w-full text-sm transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-white text-black font-semibold rounded-xl px-5 py-3 w-full hover:bg-white/90 transition-colors disabled:opacity-50 text-sm mt-1"
        >
          {loading ? "Sending..." : "Send magic link"}
        </button>
      </form>
    </div>
  );
}
