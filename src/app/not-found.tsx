export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">404</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Page not found.</p>
      </div>
    </div>
  );
}
