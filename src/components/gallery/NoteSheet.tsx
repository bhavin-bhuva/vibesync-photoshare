'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface NoteSheetProps {
  photoId: string
  initialNote: string
  onSave: (photoId: string, note: string) => void
  onClose: () => void
}

export function NoteSheet({ photoId, initialNote, onSave, onClose }: NoteSheetProps) {
  const [value, setValue] = useState(initialNote)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleSave() {
    onSave(photoId, value.trim())
    onClose()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.40)' }} onClick={onClose} />
      <div className="g-sheet fixed bottom-0 inset-x-0 p-4 z-50">
        {/* Drag handle */}
        <div
          style={{
            backgroundColor: 'var(--g-border)',
            width: '40px',
            height: '4px',
            borderRadius: '100px',
            margin: '0 auto 16px',
          }}
        />

        <p className="g-text font-medium mb-3">Add a note</p>

        <textarea
          ref={textareaRef}
          className="g-input p-3 min-h-[100px] resize-none"
          placeholder="Type a note for this photo…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
          }}
        />

        <button className="g-btn g-btn-primary w-full py-3 mt-3" onClick={handleSave}>
          Save note
        </button>
        <button className="g-btn g-btn-ghost w-full py-2" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>,
    document.body
  )
}
