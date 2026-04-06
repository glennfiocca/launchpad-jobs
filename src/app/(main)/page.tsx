import Link from "next/link";
import { ArrowRight, Zap, BarChart3, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="text-center py-24">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          One-click applications powered by AI
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
          Apply to your dream job
          <br />
          <span className="text-blue-600">in one click.</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10">
          Fill your profile once. Apply everywhere instantly. AI tracks your applications
          and keeps you informed — no more spreadsheets.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/jobs"
            className="flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-lg"
          >
            Browse Jobs
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/auth/signin"
            className="flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:border-slate-300 hover:bg-white transition-colors text-lg"
          >
            Create Profile
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-24">
        {[
          {
            icon: <Zap className="w-6 h-6 text-blue-600" />,
            title: "One-Click Apply",
            desc: "Your profile auto-fills every application. What used to take 20 minutes takes 1 second.",
          },
          {
            icon: <BarChart3 className="w-6 h-6 text-green-600" />,
            title: "Smart Tracking",
            desc: "AI reads your recruiting emails and automatically updates your application status.",
          },
          {
            icon: <MessageSquare className="w-6 h-6 text-purple-600" />,
            title: "In-App Messaging",
            desc: "All recruiter communications live in one place. Never lose track of a conversation.",
          },
        ].map((feature) => (
          <div key={feature.title} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
