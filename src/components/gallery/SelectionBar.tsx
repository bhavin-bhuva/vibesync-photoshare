'use client'
import React, { useState } from 'react'
import { CheckSquare, X, Send } from 'lucide-react'

interface SelectionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onSubmit: (name: string, email: string) => void
  isSubmitting: boolean
}

export function SelectionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onSubmit,
  isSubmitting,
}: SelectionBarProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    onSubmit(name.trim(), email.trim())
  }

  return (
    <div
      className="g-border-t fixed bottom-0 inset-x-0 z-40"
      style={{ backgroundColor: 'var(--g-surface)', backdropFilter: 'blur(12px)' }}
    >
      {showForm ? (
        <form onSubmit={handleSubmit} className="max-w-7xl mx-auto p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <p className="g-text font-medium text-sm">Submit your selection</p>
            <button
              type="button"
              className="g-btn g-btn-ghost w-8 h-8"
              onClick={() => setShowForm(false)}
            >
              <X size={16} />
            </button>
          </div>

          <input
            className="g-input p-3"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <input
            className="g-input p-3"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="g-btn g-btn-ghost px-4 py-2.5 flex-1"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="g-btn g-btn-primary px-5 py-2.5 flex-1"
              disabled={isSubmitting || !name.trim() || !email.trim()}
            >
              {isSubmitting ? 'Submitting…' : (
                <>
                  <Send size={15} />
                  Submit
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="max-w-7xl mx-auto p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="g-text-2 text-sm">
              {selectedCount} of {totalCount} selected
            </span>
            <button
              className="g-btn g-btn-ghost px-3 py-1.5 text-sm"
              onClick={selectedCount === totalCount ? onClearSelection : onSelectAll}
            >
              {selectedCount === totalCount ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                className="g-btn g-btn-ghost px-4 py-2.5 text-sm"
                onClick={onClearSelection}
              >
                <X size={15} />
                Clear
              </button>
            )}
            <button
              className="g-btn g-btn-primary px-5 py-2.5 text-sm"
              disabled={selectedCount === 0}
              onClick={() => setShowForm(true)}
            >
              <Send size={15} />
              Submit selection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
