"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GridDensity = "comfortable" | "default" | "compact" | "dense";

// ─── Column counts ────────────────────────────────────────────────────────────

export function getColumnCount(density: GridDensity): {
  mobile: number;
  tablet: number;
  desktop: number;
} {
  switch (density) {
    case "comfortable": return { mobile: 1, tablet: 2, desktop: 2 };
    case "default":     return { mobile: 2, tablet: 2, desktop: 3 };
    case "compact":     return { mobile: 2, tablet: 3, desktop: 4 };
    case "dense":       return { mobile: 3, tablet: 4, desktop: 6 };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGridDensity(
  storageKey: string,
  defaultValue: GridDensity = "default"
): [GridDensity, (d: GridDensity) => void] {
  const [density, setDensityState] = useState<GridDensity>(defaultValue);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) as GridDensity | null;
      const valid: GridDensity[] = ["comfortable", "default", "compact", "dense"];
      if (stored && valid.includes(stored)) setDensityState(stored);
    } catch {
      // localStorage unavailable (SSR safety)
    }
  }, [storageKey]);

  function setDensity(d: GridDensity) {
    setDensityState(d);
    try {
      localStorage.setItem(storageKey, d);
    } catch {
      // ignore
    }
  }

  return [density, setDensity];
}

// ─── Grid icons ───────────────────────────────────────────────────────────────

function DotsGrid({ size }: { size: 2 | 3 | 4 | 5 }) {
  const gap = size === 2 ? 4 : size === 3 ? 3 : size === 4 ? 2.5 : 2;
  const dot = size === 2 ? 4 : size === 3 ? 3 : size === 4 ? 2.5 : 2;
  const total = dot * size + gap * (size - 1);
  const offset = (16 - total) / 2;

  const dots: { x: number; y: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      dots.push({
        x: offset + col * (dot + gap),
        y: offset + row * (dot + gap),
      });
    }
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {dots.map((d, i) => (
        <rect key={i} x={d.x} y={d.y} width={dot} height={dot} rx={0.5} />
      ))}
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const OPTIONS: { value: GridDensity; gridSize: 2 | 3 | 4 | 5; label: string }[] = [
  { value: "comfortable", gridSize: 2, label: "Comfortable" },
  { value: "default",     gridSize: 3, label: "Default" },
  { value: "compact",     gridSize: 4, label: "Compact" },
  { value: "dense",       gridSize: 5, label: "Dense" },
];

export function GridDensityControl({
  value,
  onChange,
  hideMobile = [],
}: {
  value: GridDensity;
  onChange: (density: GridDensity) => void;
  hideMobile?: GridDensity[];
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
      role="group"
      aria-label="Grid density"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        const hideOnMobile = hideMobile.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${hideOnMobile ? "hidden sm:flex" : "flex"} ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <DotsGrid size={opt.gridSize} />
          </button>
        );
      })}
    </div>
  );
}
