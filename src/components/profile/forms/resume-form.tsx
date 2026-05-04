"use client";

import { useRef, useState } from "react";
import type { UserProfile } from "@prisma/client";
import { AlertCircle, FileText, Loader2, Upload, X } from "lucide-react";
import { sectionClass, sectionTitleClass } from "./_shared/styles";

// Resume management is independent of the main profile PUT. Uploads and removals
// hit the dedicated /api/profile/resume endpoint, so this tab has no Save button —
// the file picker IS the action.

interface ResumeFormProps {
  initialData: UserProfile | null;
}

export function ResumeForm({ initialData }: ResumeFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeExists, setResumeExists] = useState<boolean>(
    !!initialData?.resumeUrl?.startsWith("https://")
  );
  const [resumeFileName, setResumeFileName] = useState<string>(
    initialData?.resumeFileName ?? ""
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file");
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    const data = new FormData();
    data.append("resume", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body: data });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setUploadError(json.error ?? "Upload failed");
    } else {
      setResumeFileName(file.name);
      setResumeExists(true);
      setUploadError(null);
    }
    setIsUploading(false);
  };

  const handleRemoveResume = async () => {
    await fetch("/api/profile/resume", { method: "DELETE" });
    setResumeExists(false);
    setResumeFileName("");
  };

  return (
    <div className="space-y-6">
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Resume</h2>
        <p className="text-sm text-zinc-500 -mt-2">
          Your resume is attached automatically when you apply. PDF only, max 8MB.
        </p>

        {resumeExists ? (
          <div className="flex items-center justify-between bg-[#111111] border border-white/8 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">
                  {resumeFileName || "resume.pdf"}
                </p>
                <a
                  href="/api/profile/resume"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  View Resume
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemoveResume}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex flex-col items-center justify-center gap-2 bg-black border-2 border-dashed border-white/10 rounded-xl py-8 hover:border-white/20 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                <span className="text-sm text-zinc-500">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-zinc-600" />
                <span className="text-sm font-medium text-zinc-400">Upload PDF</span>
                <span className="text-xs text-zinc-600">Max 8MB</span>
              </>
            )}
          </button>
        )}

        {uploadError && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {uploadError}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
