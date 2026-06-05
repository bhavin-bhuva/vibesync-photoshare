export type ThemeKey =
  'minimal' | 'dark' | 'cinematic' | 'ocean' | 'forest' | 'custom'

export interface GalleryThemeTokens {
  bg:          string  // page background
  surface:     string  // cards, modals, sheets
  surface2:    string  // elevated, dropdowns
  text:        string  // primary text
  text2:       string  // secondary text
  textMuted:   string  // placeholder, disabled
  accent:      string  // buttons, active states
  accentText:  string  // text ON accent background
  border:      string  // standard borders
  border2:     string  // subtle borders
  overlay:     string  // always dark, over photos
}

export interface CustomThemeInput {
  bg:      string
  surface: string
  text:    string
  accent:  string
}

// ─── Predefined themes ───────────────────────────────

export const PREDEFINED_THEMES: Record<
  Exclude<ThemeKey, 'custom'>, GalleryThemeTokens
> = {
  minimal: {
    bg:          '#FFFFFF',
    surface:     '#F8F8F6',
    surface2:    '#F0F0EE',
    text:        '#0A0A0A',
    text2:       '#52525B',
    textMuted:   '#A1A1AA',
    accent:      '#6366F1',
    accentText:  '#FFFFFF',
    border:      '#E4E4E7',
    border2:     '#F4F4F5',
    overlay:     'rgba(0,0,0,0.55)',
  },
  dark: {
    bg:          '#0A0A0A',
    surface:     '#141414',
    surface2:    '#1C1C1C',
    text:        '#FAFAFA',
    text2:       '#A1A1AA',
    textMuted:   '#71717A',
    accent:      '#6366F1',
    accentText:  '#FFFFFF',
    border:      'rgba(255,255,255,0.10)',
    border2:     'rgba(255,255,255,0.06)',
    overlay:     'rgba(0,0,0,0.65)',
  },
  cinematic: {
    bg:          '#0F0E0C',
    surface:     '#1A1814',
    surface2:    '#221F1A',
    text:        '#F0EAD6',
    text2:       '#B8A98A',
    textMuted:   '#6B5D47',
    accent:      '#C9A84C',
    accentText:  '#0F0E0C',
    border:      'rgba(201,168,76,0.18)',
    border2:     'rgba(201,168,76,0.08)',
    overlay:     'rgba(0,0,0,0.70)',
  },
  ocean: {
    bg:          '#0A1628',
    surface:     '#0F2040',
    surface2:    '#152A55',
    text:        '#E8F4FD',
    text2:       '#93C5D4',
    textMuted:   '#4A7A8A',
    accent:      '#38BDF8',
    accentText:  '#0A1628',
    border:      'rgba(56,189,248,0.15)',
    border2:     'rgba(56,189,248,0.07)',
    overlay:     'rgba(0,0,0,0.65)',
  },
  forest: {
    bg:          '#0D1F0F',
    surface:     '#152817',
    surface2:    '#1C3420',
    text:        '#E8F0E4',
    text2:       '#8FB88A',
    textMuted:   '#4A6B46',
    accent:      '#4ADE80',
    accentText:  '#0D1F0F',
    border:      'rgba(74,222,128,0.15)',
    border2:     'rgba(74,222,128,0.07)',
    overlay:     'rgba(0,0,0,0.65)',
  },
}

// ─── Custom theme builder ────────────────────────────

export function buildCustomTheme(
  input: CustomThemeInput
): GalleryThemeTokens {
  const accentText = getContrastText(input.accent)

  const text2 = blendColors(input.text, input.bg, 0.45)
  const textMuted = blendColors(input.text, input.bg, 0.25)

  const textRgb = hexToRgb(input.text)
  const border = textRgb
    ? `rgba(${textRgb.r},${textRgb.g},${textRgb.b},0.12)`
    : 'rgba(128,128,128,0.12)'
  const border2 = textRgb
    ? `rgba(${textRgb.r},${textRgb.g},${textRgb.b},0.06)`
    : 'rgba(128,128,128,0.06)'

  return {
    bg:         input.bg,
    surface:    input.surface,
    surface2:   blendColors(input.surface, input.bg, 0.5),
    text:       input.text,
    text2,
    textMuted,
    accent:     input.accent,
    accentText,
    border,
    border2,
    overlay:    'rgba(0,0,0,0.60)',
  }
}

// ─── Apply brand color override ──────────────────────

export function applyBrandAccent(
  tokens: GalleryThemeTokens,
  brandColor: string | null | undefined
): GalleryThemeTokens {
  if (!brandColor) return tokens
  return {
    ...tokens,
    accent:     brandColor,
    accentText: getContrastText(brandColor),
  }
}

// ─── Resolve final tokens ────────────────────────────

export function resolveGalleryTheme(
  themeKey: ThemeKey,
  customInput: CustomThemeInput | null,
  brandColor: string | null | undefined
): GalleryThemeTokens {
  let tokens: GalleryThemeTokens

  if (themeKey === 'custom' && customInput) {
    tokens = buildCustomTheme(customInput)
  } else if (themeKey === 'custom') {
    tokens = PREDEFINED_THEMES.minimal
  } else {
    tokens = PREDEFINED_THEMES[themeKey]
  }

  // Cinematic keeps gold accent — don't override
  if (themeKey !== 'cinematic' && themeKey !== 'custom') {
    tokens = applyBrandAccent(tokens, brandColor)
  }

  return tokens
}

// ─── CSS variables map ───────────────────────────────

export function themeToCssVars(
  tokens: GalleryThemeTokens
): React.CSSProperties {
  return {
    '--g-bg':           tokens.bg,
    '--g-surface':      tokens.surface,
    '--g-surface-2':    tokens.surface2,
    '--g-text':         tokens.text,
    '--g-text-2':       tokens.text2,
    '--g-text-muted':   tokens.textMuted,
    '--g-accent':       tokens.accent,
    '--g-accent-text':  tokens.accentText,
    '--g-border':       tokens.border,
    '--g-border-2':     tokens.border2,
    '--g-overlay':      tokens.overlay,
  } as React.CSSProperties
}

// ─── Helper utilities ────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null
}

function getContrastText(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#FFFFFF'
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#0A0A0A' : '#FFFFFF'
}

function blendColors(hex1: string, hex2: string, ratio: number): string {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  if (!c1 || !c2) return hex1
  const r = Math.round(c1.r * ratio + c2.r * (1 - ratio))
  const g = Math.round(c1.g * ratio + c2.g * (1 - ratio))
  const b = Math.round(c1.b * ratio + c2.b * (1 - ratio))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

export const THEME_LABELS: Record<ThemeKey, string> = {
  minimal:   'Minimal',
  dark:      'Dark',
  cinematic: 'Cinematic',
  ocean:     'Ocean',
  forest:    'Forest',
  custom:    'Custom',
}

export const THEME_PREVIEW_COLORS: Record<ThemeKey, { bg: string; accent: string }> = {
  minimal:   { bg: '#FFFFFF', accent: '#6366F1' },
  dark:      { bg: '#0A0A0A', accent: '#6366F1' },
  cinematic: { bg: '#0F0E0C', accent: '#C9A84C' },
  ocean:     { bg: '#0A1628', accent: '#38BDF8' },
  forest:    { bg: '#0D1F0F', accent: '#4ADE80' },
  custom:    { bg: '#6366F1', accent: '#FFFFFF' },
}
