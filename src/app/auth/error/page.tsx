import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Authentication error</h1>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          There was a problem signing you in. Please try again.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block border border-white/10 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:border-white/25 transition-colors"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
