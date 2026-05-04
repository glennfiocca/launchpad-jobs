import Link from "next/link";

// Route-level 404 — matches root and job-detail not-found.tsx aesthetic.
// Triggered when loadCompany() returns null and the page calls notFound().
export default function CompanyNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-xs uppercase tracking-wider text-violet-400 font-semibold">
          404
        </p>
        <h1 className="text-2xl font-bold text-white mt-2">Company not found</h1>
        <p className="text-zinc-400 text-sm mt-2">
          We couldn&apos;t find that company on Pipeline.
        </p>
        <Link
          href="/companies"
          className="inline-flex items-center justify-center bg-white text-black font-semibold rounded-xl px-5 py-2.5 text-sm hover:bg-zinc-100 transition-colors mt-6"
        >
          Browse companies
        </Link>
      </div>
    </div>
  );
}
