"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsContext } from "@/components/settings/SettingsContext";
import {
  IconEventDetails, IconSharedLink, IconGallery, IconGroups,
  IconFaceDetection, IconCulling, IconWatermark, IconDanger,
  ICON_MD, ICON_COLOR,
} from "@/components/ui/icons";

export type NavItem = {
  id: string;
  label: string;
  icon: string;
  badge?: string | null;
  badgeVariant?: "default" | "success" | "muted";
};

type IconComponent = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const ICON_MAP: Record<string, IconComponent> = {
  "event-details":  IconEventDetails,
  "shared-links":   IconSharedLink,
  "gallery":        IconGallery,
  "photo-groups":   IconGroups,
  "face-detection": IconFaceDetection,
  "ai-culling":     IconCulling,
  "watermark":      IconWatermark,
  "danger-zone":    IconDanger,
};

interface Props {
  eventName: string;
  navItems: NavItem[];
  backHref: string;
  brandColor: string;
}

const DANGER_ITEM: NavItem = { id: "danger-zone", label: "Danger Zone", icon: "danger-zone" };

export function SettingsSidebar({ eventName, navItems, backHref, brandColor }: Props) {
  const router = useRouter();
  const { requestNavigation } = useSettingsContext();
  const [activeId, setActiveId] = useState("event-details");
  const mobileNavRef = useRef<HTMLDivElement>(null);

  function handleBack() {
    requestNavigation(() => router.push(backHref));
  }

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) startTransition(() => setActiveId(hash));
  }, []);

  useEffect(() => {
    const allIds = [...navItems.map((n) => n.id), "danger-zone"];
    const visible = new Set<string>();
    const observers: IntersectionObserver[] = [];

    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
          const first = allIds.find((sid) => visible.has(sid));
          if (first) {
            setActiveId(first);
            window.history.replaceState(null, "", `#${first}`);
          }
        },
        { rootMargin: "-10% 0px -60% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [navItems]);

  // Scroll active mobile pill into view when activeId changes
  useEffect(() => {
    if (!mobileNavRef.current) return;
    const pill = mobileNavRef.current.querySelector(`[data-section="${activeId}"]`) as HTMLElement | null;
    pill?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  function scrollTo(id: string) {
    const doScroll = () => {
      setActiveId(id);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    };
    requestNavigation(doScroll);
  }

  const allItems = [...navItems, DANGER_ITEM];

  return (
    <>
      {/* ── Mobile: sticky horizontal pill tabs ── */}
      <nav
        ref={mobileNavRef}
        aria-label="Settings sections"
        className="sticky top-0 z-30 -mx-4 flex gap-2 overflow-x-auto border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 md:hidden"
      >
        {allItems.map((item) => {
          const active = activeId === item.id;
          const isDanger = item.id === "danger-zone";
          return (
            <button
              key={item.id}
              data-section={item.id}
              onClick={() => scrollTo(item.id)}
              style={active ? { backgroundColor: brandColor, borderColor: brandColor, color: "#fff" } : {}}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? ""
                  : isDanger
                    ? "border-transparent text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {(() => { const Icon = ICON_MAP[item.id]; return Icon ? <Icon size={ICON_MD} aria-hidden /> : null; })()}
              <span>{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-black/10 px-1.5 py-px text-[10px] leading-none dark:bg-white/20">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Desktop: sticky 240px left sidebar ── */}
      <aside className="hidden w-60 shrink-0 md:block">
        <div className="sticky top-6">
          {/* Back button — navigates directly to event page, bypasses history stack */}
          <button
            onClick={handleBack}
            className="group flex items-center gap-2 text-left"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-150 group-hover:-translate-x-0.5 dark:text-zinc-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{eventName}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Event Settings</p>
            </div>
          </button>

          <nav aria-label="Settings sections" className="mt-5 space-y-px">
            {navItems.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-r-lg py-2 pl-3 pr-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${
                    active ? "" : "text-zinc-400 dark:text-zinc-500"
                  }`}
                  style={
                    active
                      ? {
                          borderLeft: `2px solid ${brandColor}`,
                          backgroundColor: `${brandColor}26`,
                        }
                      : { borderLeft: "2px solid transparent" }
                  }
                >
                  {(() => {
                    const Icon = ICON_MAP[item.id];
                    return Icon ? (
                      <Icon
                        size={ICON_MD}
                        aria-hidden
                        className={active ? "text-[var(--content-primary)]" : "text-zinc-400 dark:text-zinc-500"}
                      />
                    ) : null;
                  })()}
                  <span
                    className={active ? "flex-1 truncate font-medium text-[var(--content-primary)]" : "flex-1 truncate text-zinc-600 dark:text-zinc-400"}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${
                        active
                          ? "bg-white/20 text-[var(--content-primary)]"
                          : item.badgeVariant === "success"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : item.badgeVariant === "muted"
                              ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <hr className="!my-2 border-zinc-200 dark:border-zinc-700" />

            <button
              onClick={() => scrollTo("danger-zone")}
              className="flex w-full items-center gap-2.5 rounded-r-lg py-2 pl-3 pr-2 text-left text-sm transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              style={
                activeId === "danger-zone"
                  ? {
                      borderLeft: `2px solid ${brandColor}`,
                      backgroundColor: `${brandColor}26`,
                    }
                  : { borderLeft: "2px solid transparent" }
              }
            >
              <IconDanger
                size={ICON_MD}
                aria-hidden
                className={ICON_COLOR.destructive}
              />
              <span className="flex-1 truncate font-medium text-red-600 dark:text-red-400">
                Danger Zone
              </span>
            </button>
          </nav>
        </div>
      </aside>
    </>
  );
}
