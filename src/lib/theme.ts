export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'photohouse-theme'

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? 'system'
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return getSystemTheme()
  return theme
}

export function applyTheme(resolved: ResolvedTheme, animate: boolean = true) {
  const root = document.documentElement

  if (!animate) {
    root.classList.add('no-transitions')
  }

  root.setAttribute('data-theme', resolved)
  // Also set class for any libraries that use .dark class
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)

  if (!animate) {
    // Two rAF frames: first lets the DOM update, second lets paint happen
    // before re-enabling transitions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transitions')
      })
    })
  }
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
