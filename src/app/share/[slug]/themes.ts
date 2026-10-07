function getContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#0A0A0A" : "#FFFFFF";
}

export interface GalleryTheme {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  gridGap: string;
  headerStyle: string;
  fontHeading: string;
  accentColor?: string;
}

export const GALLERY_THEMES: Record<string, GalleryTheme> = {
  minimal: {
    background: "#FFFFFF",
    surface: "#F8F8F8",
    text: "#0A0A0A",
    textMuted: "#71717A",
    border: "rgba(0,0,0,0.08)",
    gridGap: "4px",
    headerStyle: "light",
    fontHeading: "Inter",
  },
  dark: {
    background: "#0A0A0A",
    surface: "#141414",
    text: "#FAFAFA",
    textMuted: "#71717A",
    border: "rgba(255,255,255,0.08)",
    gridGap: "2px",
    headerStyle: "dark",
    fontHeading: "Inter",
  },
  cinematic: {
    background: "#141414",
    surface: "#1C1C1C",
    text: "#F5F0E8",
    textMuted: "#9C9484",
    border: "rgba(201,168,76,0.15)",
    gridGap: "6px",
    headerStyle: "cinematic",
    fontHeading: "Playfair Display",
    accentColor: "#C9A84C",
  },
  warm: {
    background: "#FAF7F2",
    surface: "#F3EDE4",
    text: "#2C1810",
    textMuted: "#8B6355",
    border: "rgba(196,98,45,0.12)",
    gridGap: "6px",
    headerStyle: "warm",
    fontHeading: "Playfair Display",
    accentColor: "#C4622D",
  },
};

export function resolveTheme(themeKey: string | null | undefined): GalleryTheme {
  return GALLERY_THEMES[themeKey ?? "minimal"] ?? GALLERY_THEMES.minimal;
}

export function buildCssVars(
  theme: GalleryTheme,
  brandColor: string | null | undefined
): React.CSSProperties {
  return {
    "--theme-bg": theme.background,
    "--theme-surface": theme.surface,
    "--theme-text": theme.text,
    "--theme-text-muted": theme.textMuted,
    "--theme-border": theme.border,
    "--theme-gap": theme.gridGap,
    "--theme-accent": brandColor ?? theme.accentColor ?? "#4f46e5",
    "--theme-accent-text": getContrastText(brandColor ?? theme.accentColor ?? "#4f46e5"),
    // References CSS vars set by next/font on <body> — avoids inline <link> tags
    "--theme-font-heading": theme.fontHeading === "Playfair Display"
      ? "var(--font-playfair, 'Playfair Display', Georgia, serif)"
      : "var(--font-geist-sans, Inter, system-ui, sans-serif)",
  } as React.CSSProperties;
}
