'use client'
import React from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Archive } from 'lucide-react'

interface ZipModalProps {
  photoCount: number
  isDownloading: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ZipModal({ photoCount, isDownloading, onConfirm, onClose }: ZipModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.60)' }}>
      <div className="g-modal p-6 w-full max-w-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--g-surface-2)' }}
            >
              <Archive size={20} style={{ color: 'var(--g-accent)' }} />
            </div>
            <h2 className="g-text text-lg font-semibold">Download all photos</h2>
          </div>
          <button className="g-btn g-btn-ghost w-8 h-8" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="g-text-2 text-sm mb-6">
          This will download {photoCount} photo{photoCount !== 1 ? 's' : ''} as a ZIP archive.
          Large galleries may take a moment to prepare.
        </p>

        <div className="flex gap-3">
          <button
            className="g-btn g-btn-secondary px-4 py-2.5 flex-1"
            onClick={onClose}
            disabled={isDownloading}
          >
            Cancel
          </button>
          <button
            className="g-btn g-btn-primary px-4 py-2.5 flex-1"
            onClick={onConfirm}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                />
                Preparing…
              </>
            ) : (
              <>
                <Download size={15} />
                Download ZIP
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
