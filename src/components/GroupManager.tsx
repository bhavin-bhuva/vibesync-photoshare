"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
} from "@/app/dashboard/events/[id]/groups/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isVisible: boolean;
  photoCount: number;
  sortOrder: number;
};

export type GroupManagerProps = {
  eventId: string;
  initialGroups: GroupRow[];
  ungroupedCount: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function DragHandleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 4a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1ZM7 10a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1ZM7 16a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="M10.748 13.93l2.523 2.523a10.01 10.01 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  );
}

function DotsVerticalIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          className="h-5 w-5 rounded-full transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            outline: value === c ? `2px solid ${c}` : "2px solid transparent",
            outlineOffset: "2px",
          }}
          onClick={() => onChange(c)}
        >
          {value === c && (
            <svg className="m-auto h-3 w-3 text-white drop-shadow" viewBox="0 0 12 12" fill="currentColor">
              <path d="M9.5 3.5 5 8 2.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  group,
  allGroups,
  onConfirm,
  onCancel,
}: {
  group: GroupRow;
  allGroups: GroupRow[];
  onConfirm: (reassignToGroupId: string | undefined) => void;
  onCancel: () => void;
}) {
  const [reassignId, setReassignId] = useState<string>("");
  const others = allGroups.filter((g) => g.id !== group.id);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Delete &ldquo;{group.name}&rdquo;
        </h3>

        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This group contains{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {group.photoCount} {group.photoCount === 1 ? "photo" : "photos"}
          </span>
          .
        </p>

        {others.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Move photos to
            </label>
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
              value={reassignId}
              onChange={(e) => setReassignId(e.target.value)}
            >
              <option value="">Ungrouped</option>
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reassignId || undefined)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Delete group
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Row context menu ─────────────────────────────────────────────────────────

type MenuState =
  | { type: "closed" }
  | { type: "open" }
  | { type: "renaming" }
  | { type: "recoloring" };

function GroupRowMenu({
  group,
  allGroups,
  onUpdated,
  onDeleted,
}: {
  group: GroupRow;
  allGroups: GroupRow[];
  onUpdated: (patch: Partial<GroupRow>) => void;
  onDeleted: () => void;
}) {
  const [menu, setMenu] = useState<MenuState>({ type: "closed" });
  const [renameValue, setRenameValue] = useState(group.name);
  const [renameError, setRenameError] = useState("");
  const [colorValue, setColorValue] = useState(group.color ?? "#6366f1");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (menu.type !== "open") return;
    function handle(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu({ type: "closed" });
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menu.type]);

  // Auto-focus rename input
  useEffect(() => {
    if (menu.type === "renaming") renameInputRef.current?.select();
  }, [menu.type]);

  async function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === group.name) { setMenu({ type: "closed" }); return; }
    setSaving(true);
    const res = await updateGroup(group.id, { name: trimmed });
    setSaving(false);
    if ("error" in res) { setRenameError(res.error); return; }
    onUpdated({ name: trimmed });
    setMenu({ type: "closed" });
    setRenameError("");
  }

  async function submitColor() {
    setSaving(true);
    await updateGroup(group.id, { color: colorValue });
    setSaving(false);
    onUpdated({ color: colorValue });
    setMenu({ type: "closed" });
  }

  async function toggleVisible() {
    setMenu({ type: "closed" });
    const next = !group.isVisible;
    onUpdated({ isVisible: next }); // optimistic
    await updateGroup(group.id, { isVisible: next });
  }

  async function handleDelete(reassignToGroupId?: string) {
    setPendingDelete(false);
    setSaving(true);
    await deleteGroup(group.id, { reassignToGroupId });
    setSaving(false);
    onDeleted();
  }

  if (saving) {
    return (
      <div className="flex h-7 w-7 items-center justify-center text-zinc-400">
        <SpinnerIcon />
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label="Group options"
        onClick={() => setMenu(menu.type === "open" ? { type: "closed" } : { type: "open" })}
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      >
        <DotsVerticalIcon />
      </button>

      {menu.type === "open" && (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            onClick={() => { setRenameValue(group.name); setMenu({ type: "renaming" }); }}
          >
            <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
            </svg>
            Rename
          </button>

          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            onClick={() => { setColorValue(group.color ?? "#6366f1"); setMenu({ type: "recoloring" }); }}
          >
            <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: group.color ?? "#6366f1" }} />
            Change color
          </button>

          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            onClick={toggleVisible}
          >
            <EyeIcon open={!group.isVisible} />
            {group.isVisible ? "Hide from gallery" : "Show in gallery"}
          </button>

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />

          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => { setMenu({ type: "closed" }); setPendingDelete(true); }}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
        </div>
      )}

      {/* ── Inline rename form ── */}
      {menu.type === "renaming" && (
        <div className="absolute right-0 top-8 z-20 w-56 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => { setRenameValue(e.target.value); setRenameError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitRename(); }
              if (e.key === "Escape") setMenu({ type: "closed" });
            }}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          {renameError && (
            <p className="mt-1 text-xs text-red-500">{renameError}</p>
          )}
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              onClick={() => setMenu({ type: "closed" })}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={submitRename}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Inline color picker ── */}
      {menu.type === "recoloring" && (
        <div className="absolute right-0 top-8 z-20 w-52 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Choose color</p>
          <ColorPicker value={colorValue} onChange={setColorValue} />
          <div className="mt-3 flex justify-end gap-1.5">
            <button
              onClick={() => setMenu({ type: "closed" })}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={submitColor}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <DeleteModal
          group={group}
          allGroups={allGroups}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableGroupRow({
  group,
  allGroups,
  onUpdated,
  onDeleted,
}: {
  group: GroupRow;
  allGroups: GroupRow[];
  onUpdated: (id: string, patch: Partial<GroupRow>) => void;
  onDeleted: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
        isDragging
          ? "z-10 bg-zinc-100 shadow-md dark:bg-zinc-700"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="shrink-0 cursor-grab touch-none text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
      >
        <DragHandleIcon />
      </button>

      {/* Color dot */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: group.color ?? "#6366f1" }}
      />

      {/* Name */}
      <span
        className={`min-w-0 flex-1 truncate text-sm font-medium ${
          group.isVisible
            ? "text-zinc-800 dark:text-zinc-200"
            : "text-zinc-400 line-through dark:text-zinc-500"
        }`}
      >
        {group.name}
      </span>

      {/* Photo count */}
      <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
        {group.photoCount}
      </span>

      {/* Visibility toggle */}
      <button
        aria-label={group.isVisible ? "Visible" : "Hidden"}
        onClick={async () => {
          const next = !group.isVisible;
          onUpdated(group.id, { isVisible: next }); // optimistic
          await updateGroup(group.id, { isVisible: next });
        }}
        className={`shrink-0 transition-colors ${
          group.isVisible
            ? "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
        }`}
      >
        <EyeIcon open={group.isVisible} />
      </button>

      {/* ⋮ menu */}
      <GroupRowMenu
        group={group}
        allGroups={allGroups}
        onUpdated={(patch) => onUpdated(group.id, patch)}
        onDeleted={() => onDeleted(group.id)}
      />
    </div>
  );
}

// ─── Add Group Form ───────────────────────────────────────────────────────────

function AddGroupForm({
  eventId,
  existingNames,
  onAdded,
  onCancel,
}: {
  eventId: string;
  existingNames: Set<string>;
  onAdded: (group: GroupRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required."); return; }
    if (existingNames.has(trimmed.toLowerCase())) {
      setError("A group with that name already exists.");
      return;
    }
    setSaving(true);
    const res = await createGroup(eventId, { name: trimmed, color });
    setSaving(false);
    if ("error" in res) { setError(res.error); return; }
    onAdded(res.group as GroupRow);
  }

  return (
    <div className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <input
        ref={inputRef}
        type="text"
        placeholder="Group name"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(""); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      <div className="mt-2.5">
        <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div className="mt-3 flex justify-end gap-1.5">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving && <SpinnerIcon />}
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ─── GroupManager ─────────────────────────────────────────────────────────────

export function GroupManager({ eventId, initialGroups, ungroupedCount }: GroupManagerProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>(
    [...initialGroups].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [showAddForm, setShowAddForm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Callback for drag-end: optimistic reorder + background sync
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setGroups((prev) => {
        const from = prev.findIndex((g) => g.id === active.id);
        const to = prev.findIndex((g) => g.id === over.id);
        return arrayMove(prev, from, to);
      });

      // Capture the new order synchronously inside the setter
      setGroups((next) => {
        reorderGroups(eventId, next.map((g) => g.id)).then(() => router.refresh());
        return next; // no further state change
      });
    },
    [eventId, router]
  );

  function handleUpdated(id: string, patch: Partial<GroupRow>) {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
    );
  }

  function handleDeleted(id: string) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    router.refresh();
  }

  function handleAdded(group: GroupRow) {
    setGroups((prev) => [...prev, group]);
    setShowAddForm(false);
  }

  const existingNames = new Set(groups.map((g) => g.name.toLowerCase()));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Photo Groups
        </h2>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            <PlusIcon />
            Add Group
          </button>
        )}
      </div>

      <div className="p-2">
        {/* Sortable group list */}
        {groups.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={groups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {groups.map((group) => (
                <SortableGroupRow
                  key={group.id}
                  group={group}
                  allGroups={groups}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          !showAddForm && (
            <p className="py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
              No groups yet — add one to organize your photos.
            </p>
          )
        )}

        {/* Add group form */}
        {showAddForm && (
          <AddGroupForm
            eventId={eventId}
            existingNames={existingNames}
            onAdded={handleAdded}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Ungrouped row */}
        <div className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <span className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">Ungrouped</span>
          <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
            {ungroupedCount}
          </span>
        </div>
      </div>
    </div>
  );
}
