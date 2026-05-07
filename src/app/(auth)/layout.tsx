export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 sm:flex sm:items-center sm:justify-center">
      <div className="w-full sm:max-w-md sm:px-4">{children}</div>
    </div>
  );
}
