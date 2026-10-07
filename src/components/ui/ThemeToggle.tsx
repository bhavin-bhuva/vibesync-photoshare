'use client'
import { useTheme } from '@/hooks/useTheme'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme, mounted } = useTheme()

  // Prevent hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return (
      <div className={cn(
        "w-9 h-9 rounded-lg bg-surface-subtle",
        className
      )} />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative w-9 h-9 rounded-lg",
        "flex items-center justify-center",
        "text-content-secondary hover:text-content-primary",
        "hover:bg-surface-subtle",
        "transition-colors duration-200",
        "active:scale-90 transition-transform",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-brand focus-visible:ring-offset-2",
        "focus-visible:ring-offset-surface-page",
        className
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Sun icon — visible in dark mode (click to go light) */}
      <Sun
        size={18}
        className={cn(
          "absolute transition-all duration-200",
          isDark
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 rotate-90 scale-50"
        )}
      />
      {/* Moon icon — visible in light mode (click to go dark) */}
      <Moon
        size={18}
        className={cn(
          "absolute transition-all duration-200",
          isDark
            ? "opacity-0 -rotate-90 scale-50"
            : "opacity-100 rotate-0 scale-100"
        )}
      />
    </button>
  )
}
