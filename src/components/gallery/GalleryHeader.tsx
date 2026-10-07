'use client'
import React from 'react'
import { Download, Grid3x3, Sun, Moon, Palette } from 'lucide-react'
import { useGalleryTheme } from './GalleryRoot'
import { ThemeKey, THEME_LABELS, PREDEFINED_THEMES } from '@/lib/gallery-theme'

interface GalleryHeaderProps {
  studioName: string | null
  logoUrl: string | null
  eventTitle: string
  canDownloadZip: boolean
  onDownloadZip?: () => void
  onToggleLightbox?: () => void
}

export function GalleryHeader({
  studioName,
  logoUrl,
  eventTitle,
  canDownloadZip,
  onDownloadZip,
}: GalleryHeaderProps) {
  const { activeTheme, onThemeChange, allowCustomerTheme } = useGalleryTheme()
  const [showThemePicker, setShowThemePicker] = React.useState(false)

  const themeKeys = Object.keys(PREDEFINED_THEMES) as Exclude<ThemeKey, 'custom'>[]

  return (
    <header
      className="g-border-b sticky top-0 z-40"
      style={{ backgroundColor: 'var(--g-bg)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Studio identity */}
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={studioName ?? ''}
              className="h-8 w-8 rounded-full object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            {studioName && (
              <p className="g-text font-semibold text-sm truncate leading-tight">
                {studioName}
              </p>
            )}
            <p className="g-text-2 text-sm truncate leading-tight">{eventTitle}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {allowCustomerTheme && onThemeChange && (
            <div className="relative">
              <button
                className="g-btn g-btn-ghost w-9 h-9"
                onClick={() => setShowThemePicker(v => !v)}
                aria-label="Change theme"
              >
                <Palette size={16} />
              </button>

              {showThemePicker && (
                <div
                  className="g-modal absolute right-0 top-11 p-3 flex flex-col gap-1 min-w-[140px]"
                  style={{ zIndex: 50 }}
                >
                  {themeKeys.map(key => (
                    <button
                      key={key}
                      className={`g-btn g-btn-ghost w-full justify-start px-3 py-2 text-sm${activeTheme === key ? ' g-accent-text font-medium' : ''}`}
                      onClick={() => { onThemeChange(key); setShowThemePicker(false) }}
                    >
                      {THEME_LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {canDownloadZip && onDownloadZip && (
            <button
              className="g-btn g-btn-primary px-4 py-2 text-sm"
              onClick={onDownloadZip}
            >
              <Download size={15} />
              Download all
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
