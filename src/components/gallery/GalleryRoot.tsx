'use client'
import React, { useState, useEffect } from 'react'
import './gallery.css'
import {
  ThemeKey, CustomThemeInput, GalleryThemeTokens,
  resolveGalleryTheme, themeToCssVars,
  PREDEFINED_THEMES
} from '@/lib/gallery-theme'

const CUSTOMER_THEME_KEY = (slug: string) =>
  `gallery-theme-${slug}`

interface GalleryRootProps {
  slug: string
  // From photographer settings (database)
  photographerTheme: ThemeKey
  customThemeInput: CustomThemeInput | null
  brandColor: string | null
  // Whether customer can override
  allowCustomerTheme: boolean
  children: React.ReactNode
}

export function GalleryRoot({
  slug,
  photographerTheme,
  customThemeInput,
  brandColor,
  allowCustomerTheme,
  children,
}: GalleryRootProps) {

  interface ThemeState { activeTheme: ThemeKey; tokens: GalleryThemeTokens }

  const [themeState, setThemeState] = useState<ThemeState>(() => ({
    activeTheme: photographerTheme,
    tokens: resolveGalleryTheme(photographerTheme, customThemeInput, brandColor),
  }))

  // On mount: apply customer's saved preference (single setState call)
  useEffect(() => {
    if (!allowCustomerTheme) return
    try {
      const saved = localStorage.getItem(CUSTOMER_THEME_KEY(slug))
      if (saved && saved !== photographerTheme) {
        const savedKey = saved as ThemeKey
        // Customer overrides use predefined themes only (not custom — photographer-only)
        if (savedKey !== 'custom' && PREDEFINED_THEMES[savedKey as Exclude<ThemeKey, 'custom'>]) {
          setThemeState({
            activeTheme: savedKey,
            tokens: resolveGalleryTheme(savedKey, null, brandColor),
          })
        }
      }
    } catch {}
  }, [slug, allowCustomerTheme, photographerTheme, brandColor])

  function handleThemeChange(newTheme: ThemeKey) {
    if (newTheme === 'custom') return // customers can't use custom
    setThemeState({
      activeTheme: newTheme,
      tokens: resolveGalleryTheme(newTheme, null, brandColor),
    })
    try {
      localStorage.setItem(CUSTOMER_THEME_KEY(slug), newTheme)
    } catch {}
  }

  const { activeTheme, tokens } = themeState
  const cssVars = themeToCssVars(tokens)

  return (
    <div
      style={{
        ...cssVars,
        minHeight: '100vh',
        backgroundColor: 'var(--g-bg)',
        color: 'var(--g-text)',
      }}
    >
      {/* Inject a style tag with gallery-scoped CSS */}
      {/* This avoids fighting Tailwind's global styles */}
      <style>{`
        .gallery-root * {
          box-sizing: border-box;
        }
        .gallery-root ::selection {
          background: var(--g-accent);
          color: var(--g-accent-text);
        }
        .gallery-root input::placeholder,
        .gallery-root textarea::placeholder {
          color: var(--g-text-muted);
        }
        .gallery-root ::-webkit-scrollbar {
          width: 6px;
        }
        .gallery-root ::-webkit-scrollbar-track {
          background: transparent;
        }
        .gallery-root ::-webkit-scrollbar-thumb {
          background: var(--g-border);
          border-radius: 100px;
        }
      `}</style>

      <div className="gallery-root">
        {/* Pass theme state down via context */}
        <GalleryThemeContext.Provider value={{
          activeTheme,
          tokens,
          onThemeChange: allowCustomerTheme ? handleThemeChange : undefined,
          allowCustomerTheme,
        }}>
          {children}
        </GalleryThemeContext.Provider>
      </div>
    </div>
  )
}

// Context for child components to access theme
interface GalleryThemeContextValue {
  activeTheme: ThemeKey
  tokens: GalleryThemeTokens
  onThemeChange?: (theme: ThemeKey) => void
  allowCustomerTheme: boolean
}

export const GalleryThemeContext =
  React.createContext<GalleryThemeContextValue>({
    activeTheme: 'dark',
    tokens: PREDEFINED_THEMES.dark,
    allowCustomerTheme: false,
  })

export function useGalleryTheme() {
  return React.useContext(GalleryThemeContext)
}
