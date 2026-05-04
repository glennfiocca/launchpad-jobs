"use client";

import { submitButtonClass } from "./styles";

interface SaveButtonProps {
  saving: boolean;
}

export function SaveButton({ saving }: SaveButtonProps) {
  return (
    <div className="flex justify-end">
      <button type="submit" disabled={saving} className={submitButtonClass}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
