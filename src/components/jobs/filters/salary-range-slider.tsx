"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const SALARY_MIN = 0;
const SALARY_MAX = 400_000;
const SALARY_STEP = 5_000;

function fmtK(n: number): string {
  if (n === 0) return "Any";
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

interface SalaryRangeSliderProps {
  min: number | undefined;
  max: number | undefined;
  onChange: (min: number | undefined, max: number | undefined) => void;
}

export function SalaryRangeSlider({ min, max, onChange }: SalaryRangeSliderProps) {
  const [localMin, setLocalMin] = useState(min ?? SALARY_MIN);
  const [localMax, setLocalMax] = useState(max ?? SALARY_MAX);
  // Track which thumb should be on top based on pointer proximity
  const [topThumb, setTopThumb] = useState<"min" | "max">("max");
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync from URL when filters are cleared externally
  useEffect(() => { setLocalMin(min ?? SALARY_MIN); }, [min]);
  useEffect(() => { setLocalMax(max ?? SALARY_MAX); }, [max]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const val = pct * SALARY_MAX;
      const distMin = Math.abs(val - localMin);
      const distMax = Math.abs(val - localMax);
      setTopThumb(distMin <= distMax ? "min" : "max");
    },
    [localMin, localMax]
  );

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.min(Number(e.target.value), localMax - SALARY_STEP);
      setLocalMin(val);
    },
    [localMax]
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(Number(e.target.value), localMin + SALARY_STEP);
      setLocalMax(val);
    },
    [localMin]
  );

  // Push to URL only on pointer release to avoid URL thrashing while dragging
  const handleRelease = useCallback(() => {
    onChange(
      localMin === SALARY_MIN ? undefined : localMin,
      localMax === SALARY_MAX ? undefined : localMax
    );
  }, [localMin, localMax, onChange]);

  const isActive = min !== undefined || max !== undefined;
  const minPct = (localMin / SALARY_MAX) * 100;
  const maxPct = (localMax / SALARY_MAX) * 100;

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{fmtK(localMin)}</span>
        <span>{localMax >= SALARY_MAX ? "Any" : fmtK(localMax) + "+"}</span>
      </div>

      {/* Dual-thumb range slider */}
      <div
        ref={containerRef}
        className="relative h-5 flex items-center"
        onPointerDown={handlePointerDown}
      >
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
        {/* Active range highlight */}
        <div
          className="absolute h-1.5 rounded-full bg-indigo-500/60"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        {/* Min thumb input */}
        <input
          type="range"
          min={SALARY_MIN}
          max={SALARY_MAX}
          step={SALARY_STEP}
          value={localMin}
          onChange={handleMinChange}
          onPointerUp={handleRelease}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: topThumb === "min" ? 3 : 1 }}
        />
        {/* Max thumb input */}
        <input
          type="range"
          min={SALARY_MIN}
          max={SALARY_MAX}
          step={SALARY_STEP}
          value={localMax}
          onChange={handleMaxChange}
          onPointerUp={handleRelease}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: topThumb === "max" ? 3 : 1 }}
        />
        {/* Visual thumb indicators (pointer-events-none) */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-indigo-400 border-2 border-black shadow pointer-events-none"
          style={{ left: `calc(${minPct}% - 7px)`, zIndex: 4 }}
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-indigo-400 border-2 border-black shadow pointer-events-none"
          style={{ left: `calc(${maxPct}% - 7px)`, zIndex: 4 }}
        />
      </div>

      {isActive && (
        <button
          type="button"
          onClick={() => {
            setLocalMin(SALARY_MIN);
            setLocalMax(SALARY_MAX);
            onChange(undefined, undefined);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear salary filter
        </button>
      )}
    </div>
  );
}
