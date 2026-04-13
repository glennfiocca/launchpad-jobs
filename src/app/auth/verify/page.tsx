export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-white/8 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Check your email</h1>
        <p className="text-zinc-400 leading-relaxed">
          We sent a sign-in link to your email address. Click the link to sign in.
        </p>
      </div>
    </div>
  );
}
