'use client'
import { useMemo } from 'react'
import type { ReactNode } from 'react'

interface MasonryItem {
  id: string
  width?: number | null
  height?: number | null
}

interface MasonryGridProps<T extends MasonryItem> {
  items: T[]
  columns: number
  gap: number
  renderItem: (item: T, index: number) => ReactNode
}

export function MasonryGrid<T extends MasonryItem>({
  items,
  columns,
  gap,
  renderItem,
}: MasonryGridProps<T>) {
  const columnItems = useMemo(() => {
    const cols: Array<{ item: T; originalIndex: number }[]> = Array.from(
      { length: columns },
      () => []
    )
    const heights = new Array<number>(columns).fill(0)

    items.forEach((item, originalIndex) => {
      const shortestCol = heights.indexOf(Math.min(...heights))
      cols[shortestCol].push({ item, originalIndex })
      heights[shortestCol] +=
        item.width && item.height
          ? (item.height / item.width) * 300
          : 300
    })
    return cols
  }, [items, columns])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
        alignItems: 'start',
      }}
    >
      {columnItems.map((col, colIndex) => (
        <div
          key={colIndex}
          style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}
        >
          {col.map(({ item, originalIndex }) => (
            <div key={item.id}>{renderItem(item, originalIndex)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
