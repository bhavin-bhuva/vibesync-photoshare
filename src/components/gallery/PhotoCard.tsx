'use client'
import React, { useState } from 'react'
import { Download, StickyNote, Check } from 'lucide-react'

export interface GalleryPhoto {
  id: string
  url: string
  width: number
  height: number
  groupColor?: string
  note?: string | null
}

interface PhotoCardProps {
  photo: GalleryPhoto
  selectionMode: boolean
  selected: boolean
  onSelect: (id: string) => void
  onDownload: (id: string) => void
  onNote: (id: string) => void
  onClick: (id: string) => void
}

export function PhotoCard({
  photo,
  selectionMode,
  selected,
  onSelect,
  onDownload,
  onNote,
  onClick,
}: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className="relative overflow-hidden rounded-lg cursor-pointer group"
      style={{ breakInside: 'avoid', marginBottom: '8px' }}
      role="button"
      tabIndex={0}
      onClick={() => selectionMode ? onSelect(photo.id) : onClick(photo.id)}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (selectionMode ? onSelect(photo.id) : onClick(photo.id))}
    >
      {/* Shimmer while loading */}
      {!loaded && (
        <div
          className="g-shimmer absolute inset-0"
          style={{ aspectRatio: `${photo.width}/${photo.height}` }}
        />
      )}

      <img
        src={photo.url}
        alt=""
        className="w-full block"
        style={{ display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />

      {/* Hover overlay */}
      <div className="g-photo-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <div
            className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: selected ? 'var(--g-accent)' : 'rgba(255,255,255,0.8)',
              backgroundColor: selected ? 'var(--g-accent)' : 'rgba(0,0,0,0.3)',
            }}
          >
            {selected && <Check size={11} color="var(--g-accent-text)" strokeWidth={3} />}
          </div>
        </div>
      )}

      {/* Group dot */}
      {photo.groupColor && (
        <div
          className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full z-10"
          style={{ backgroundColor: photo.groupColor }}
        />
      )}

      {/* Note indicator */}
      {photo.note && (
        <div className="absolute bottom-2 left-2 z-10" style={{ color: 'var(--g-accent)' }}>
          <StickyNote size={14} />
        </div>
      )}

      {/* Action buttons — shown on hover */}
      {!selectionMode && (
        <div className="absolute bottom-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="g-btn g-btn-ghost w-7 h-7"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff' }}
            onClick={e => { e.stopPropagation(); onNote(photo.id) }}
            aria-label="Add note"
          >
            <StickyNote size={13} />
          </button>
          <button
            className="g-btn g-btn-ghost w-7 h-7"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff' }}
            onClick={e => { e.stopPropagation(); onDownload(photo.id) }}
            aria-label="Download"
          >
            <Download size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
