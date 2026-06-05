'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Theme, ResolvedTheme, getStoredTheme,
  resolveTheme, applyTheme, saveTheme, getSystemTheme
} from '@/lib/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = getStoredTheme()
    const resolved = resolveTheme(stored)
    setThemeState(stored)
    setResolvedTheme(resolved)
    applyTheme(resolved, false)  // no animation on page load
    setMounted(true)

    // Listen for OS theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const current = getStoredTheme()
      if (current === 'system') {
        const newResolved = getSystemTheme()
        setResolvedTheme(newResolved)
        applyTheme(newResolved, false)  // OS change — instant, not user-triggered
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    const resolved = resolveTheme(newTheme)
    setThemeState(newTheme)
    setResolvedTheme(resolved)
    applyTheme(resolved)
    saveTheme(newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    // Simple toggle: always switches between light and dark
    // Saves explicit preference (not system)
    const next: ResolvedTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }, [resolvedTheme, setTheme])

  return { theme, resolvedTheme, setTheme, toggleTheme, mounted }
}
