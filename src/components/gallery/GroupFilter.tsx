'use client'
import React from 'react'

export interface PhotoGroup {
  id: string
  label: string
  count: number
}

interface GroupFilterProps {
  groups: PhotoGroup[]
  activeGroup: string | null
  onSelect: (id: string | null) => void
}

export function GroupFilter({ groups, activeGroup, onSelect }: GroupFilterProps) {
  if (groups.length === 0) return null

  return (
    <div
      className="g-border-b overflow-x-auto"
      style={{ backgroundColor: 'var(--g-bg)' }}
    >
      <div className="flex gap-2 px-4 py-3 max-w-7xl mx-auto">
        <button
          className={`g-pill${activeGroup === null ? ' g-pill-active' : ''}`}
          onClick={() => onSelect(null)}
        >
          All
        </button>
        {groups.map(group => (
          <button
            key={group.id}
            className={`g-pill${activeGroup === group.id ? ' g-pill-active' : ''} whitespace-nowrap`}
            onClick={() => onSelect(group.id)}
          >
            {group.label}
            <span className="ml-1.5 opacity-70">{group.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
