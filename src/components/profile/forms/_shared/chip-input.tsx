"use client";

import { useState, type KeyboardEvent } from "react";
import { inputClass } from "./styles";

// Generic chip / tag input — used for targetRoles, targetIndustries,
// relocationCities, eligibleCountries, project technologies, etc.
//
// Keyboard model:
//   Enter  → commit current draft as a chip
//   ,      → commit current draft as a chip
//   Bksp   → remove last chip (only when input is empty)
//
// The component is intentionally controlled — `value` lives on the parent so
// it integrates cleanly with both legacy form-state forms (preferences-form)
// and the optimistic `useChildResource` patches in the new list editors.

export interface ChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /**
   * Optional per-chip validator — return a string to reject the chip with
   * that message, or `null` to accept. Failed chips are NOT committed but
   * the draft is preserved so the user can fix it.
   */
  validate?: (chip: string) => string | null;
  disabled?: boolean;
  /**
   * Optional max-chip cap — when reached, further commits are no-ops.
   */
  maxChips?: number;
  /**
   * Optional value normalizer applied before validation/dedupe.
   * E.g. uppercase trimming for ISO codes.
   */
  normalize?: (raw: string) => string;
}

export function ChipInput({
  value,
  onChange,
  placeholder,
  validate,
  disabled,
  maxChips,
  normalize,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const cleaned = (normalize ?? ((s: string) => s.trim()))(draft);
    if (!cleaned) return;
    if (maxChips !== undefined && value.length >= maxChips) {
      setError(`Maximum ${maxChips} entries`);
      return;
    }
    if (value.includes(cleaned)) {
      // Silent dedupe — clear draft, keep existing chips.
      setDraft("");
      setError(null);
      return;
    }
    if (validate) {
      const validationError = validate(cleaned);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onChange([...value, cleaned]);
    setDraft("");
    setError(null);
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`${inputClass} flex flex-wrap items-center gap-1.5 ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {value.map((chip, idx) => (
          <span
            key={`${chip}-${idx}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-xs text-white"
          >
            {chip}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeAt(idx)}
              aria-label={`Remove ${chip}`}
              className="text-zinc-400 hover:text-white transition-colors disabled:hover:text-zinc-400"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-white placeholder:text-zinc-700 disabled:cursor-not-allowed"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
