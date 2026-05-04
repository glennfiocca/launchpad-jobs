"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
} from "@/lib/settings/constants";
import { initialsFromSeed, seedToHue } from "@/lib/settings/avatar-seed";

interface AvatarUploaderProps {
  value: string | null;
  fallbackSeed: string; // typically email — drives gradient initials
  onChange: (url: string) => void;
}

export function AvatarUploader({
  value,
  fallbackSeed,
  onChange,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const hue = seedToHue(fallbackSeed);
  const initials = initialsFromSeed(fallbackSeed);

  function pickFile() {
    if (uploading) return;
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use a PNG, JPEG, or WEBP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Upload failed");
      }
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("Upload returned no URL");
      onChange(json.url);
      toast.success("Avatar uploaded");
    } catch (err) {
      console.error("[avatar-uploader] upload failed:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="relative w-20 h-20 rounded-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed group"
        aria-label="Change avatar"
      >
        {value ? (
          <Image
            src={value}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xl font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 70% 35%), hsl(${(hue + 40) % 360} 70% 25%))`,
            }}
          >
            {initials}
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </div>
      </button>
      <div className="text-sm text-zinc-400">
        <p className="text-zinc-300 font-medium">Profile photo</p>
        <p className="text-xs">PNG, JPEG, or WEBP. Up to 2 MB.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ALLOWED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
