// Skeleton for the photographer dashboard

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Bone className="h-6 w-32" />
          <Bone className="h-9 w-9 rounded-full" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {/* Welcome row */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Bone className="h-7 w-56" />
            <Bone className="h-4 w-40" />
          </div>
          <Bone className="h-6 w-20 rounded-full" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <Bone className="h-3 w-16" />
              <Bone className="mt-3 h-9 w-20" />
            </div>
          ))}
        </div>

        {/* Events section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <Bone className="h-5 w-28" />
            <Bone className="h-9 w-28 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                <Bone className="h-44 w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Bone className="h-4 w-3/4" />
                  <Bone className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
