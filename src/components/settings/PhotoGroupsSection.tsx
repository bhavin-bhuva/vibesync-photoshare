"use client";

import { GroupManager, type GroupRow } from "@/components/GroupManager";

export type { GroupRow };

interface Props {
  eventId: string;
  initialGroups: GroupRow[];
  ungroupedCount: number;
}

export function PhotoGroupsSection({ eventId, initialGroups, ungroupedCount }: Props) {
  const totalGrouped = initialGroups.reduce((s, g) => s + g.photoCount, 0);
  const groupCount = initialGroups.length;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {groupCount} {groupCount === 1 ? "group" : "groups"}
        </span>
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span>{totalGrouped} photos grouped</span>
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span>{ungroupedCount} ungrouped</span>
      </div>

      {/* GroupManager handles creation, reorder, edit, delete */}
      <GroupManager
        eventId={eventId}
        initialGroups={initialGroups}
        ungroupedCount={ungroupedCount}
      />
    </div>
  );
}
