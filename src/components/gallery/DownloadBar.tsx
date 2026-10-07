'use client'
import React from 'react'
import { Download, Archive } from 'lucide-react'

interface DownloadBarProps {
  selectedCount: number
  canDownloadZip: boolean
  onDownloadSelected: () => void
  onDownloadZip: () => void
  onClearSelection: () => void
}

export function DownloadBar({
  selectedCount,
  canDownloadZip,
  onDownloadSelected,
  onDownloadZip,
  onClearSelection,
}: DownloadBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className="g-border-t fixed bottom-0 inset-x-0 z-40 p-4"
      style={{ backgroundColor: 'var(--g-surface)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="g-text font-medium text-sm">
            {selectedCount} selected
          </span>
          <button
            className="g-btn g-btn-ghost px-3 py-1.5 text-sm"
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="g-btn g-btn-secondary px-5 py-2.5 text-sm"
            onClick={onDownloadSelected}
          >
            <Download size={15} />
            Download
          </button>

          {canDownloadZip && (
            <button
              className="g-btn g-btn-primary px-5 py-2.5 text-sm"
              onClick={onDownloadZip}
            >
              <Archive size={15} />
              Download ZIP
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
