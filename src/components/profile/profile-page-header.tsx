import { pageHeaderTitleClass, pageHeaderSubtitleClass } from "./forms/_shared/styles";

interface ProfilePageHeaderProps {
  completionPercent: number | null;
  profileName?: string | null;
}

export function ProfilePageHeader({ completionPercent, profileName }: ProfilePageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <h1 className={pageHeaderTitleClass}>
          {profileName ? `${profileName}'s Profile` : "Your Profile"}
        </h1>
        <p className={pageHeaderSubtitleClass}>
          Fill this out once. We&apos;ll auto-apply for you.
        </p>
      </div>
      {completionPercent != null && (
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Profile {completionPercent}%
          </span>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, completionPercent))}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
