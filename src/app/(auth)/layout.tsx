import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-surface-page sm:flex sm:items-center sm:justify-center">
      {/* Subtle brand radial gradient — works in both themes */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 60%)' }}
        aria-hidden="true"
      />

      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="relative w-full sm:max-w-md sm:px-4">{children}</div>
    </div>
  );
}
