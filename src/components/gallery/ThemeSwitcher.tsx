'use client'
import React, { useState } from 'react'
import { useGalleryTheme } from './GalleryRoot'
import { PREDEFINED_THEMES, THEME_PREVIEW_COLORS, ThemeKey, THEME_LABELS } from '@/lib/gallery-theme'

export function ThemeSwitcher() {
  const { activeTheme, onThemeChange, allowCustomerTheme } = useGalleryTheme()
  const [open, setOpen] = useState(false)

  if (!allowCustomerTheme || !onThemeChange) return null

  const themes: Exclude<ThemeKey, 'custom'>[] =
    ['minimal', 'dark', 'cinematic', 'ocean', 'forest']

  return (
    <div className="fixed bottom-6 right-6 z-40">

      {/* Theme picker panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[-1]"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="g-card absolute bottom-14 right-0 p-3 w-52">
            <p className="g-text-muted text-xs uppercase tracking-wider mb-2 px-1">
              Gallery theme
            </p>
            <div className="flex flex-col gap-1">
              {themes.map(key => {
                const preview = THEME_PREVIEW_COLORS[key]
                const isActive = activeTheme === key
                return (
                  <button
                    key={key}
                    onClick={() => {
                      onThemeChange(key)
                      setOpen(false)
                    }}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-all g-hover w-full"
                  >
                    {/* Theme colour preview swatch */}
                    <div className="flex gap-0.5 shrink-0">
                      <div style={{
                        width: 12, height: 20,
                        borderRadius: '3px 0 0 3px',
                        backgroundColor: preview.bg,
                        border: '1px solid var(--g-border)',
                      }} />
                      <div style={{
                        width: 8, height: 20,
                        borderRadius: '0 3px 3px 0',
                        backgroundColor: preview.accent,
                      }} />
                    </div>

                    {/* Theme name */}
                    <span
                      className="text-sm flex-1"
                      style={{ color: isActive ? 'var(--g-accent)' : 'var(--g-text)' }}
                    >
                      {THEME_LABELS[key]}
                    </span>

                    {/* Active checkmark */}
                    {isActive && (
                      <svg width="14" height="14" viewBox="0 0 14 14" style={{ color: 'var(--g-accent)' }}>
                        <path d="M2 7l4 4 6-6" stroke="currentColor"
                              fill="none" strokeWidth="2"
                              strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Toggle FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className="g-btn g-btn-secondary w-10 h-10 rounded-full shadow-lg"
        aria-label="Change gallery theme"
        title="Change gallery theme"
      >
        {/* Palette icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
          <path d="M7 16c1-2 7-2 10 0" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
