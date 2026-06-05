"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createSharedLinkAction,
  revokeSharedLinkAction,
  getSharedLinkPin,
} from "@/app/dashboard/events/[id]/actions";
import {
  updateSharedLink,
  type UpdateSharedLinkData,
} from "@/app/dashboard/events/[id]/settings/actions";
import {
  generateQRCardForDownload,
  generateA4SheetForDownload,
  generateQROnlyForDownload,
} from "@/app/dashboard/events/[id]/qrCardActions";
import { OtpInput } from "@/components/OtpInput";
import { generateSecurePin } from "@/lib/pin";
import { GridDensityControl, type GridDensity } from "@/components/GridDensityControl";
import dynamic from "next/dynamic";

const QRCardPreview = dynamic(
  () => import("@/components/QRCardPreview").then((m) => ({ default: m.QRCardPreview })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[127px] w-[200px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
    ),
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type AccessType = "NONE" | "PIN" | "PASSWORD";

export type SharedLinkRow = {
  id: string;
  slug: string;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  accessType: AccessType;
  faceSearchEnabled: boolean;
  downloadsEnabled: boolean;
  zipDownloadEnabled: boolean;
  selectionEnabled: boolean;
};

export type EventGroupWithCount = {
  id: string;
  name: string;
  color: string | null;
  photoCount: number;
};

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; link: SharedLinkRow };

type DrawerForm = {
  accessType: AccessType;
  pin: string;
  password: string;
  confirmPassword: string;
  showPinOnCard: boolean;
  expiryEnabled: boolean;
  expiresAt: string;
  downloadsEnabled: boolean;
  zipDownloadEnabled: boolean;
  selectionEnabled: boolean;
  faceSearchEnabled: boolean;
  groupOverrides: Record<string, boolean>;
  defaultGridDensity: GridDensity;
  cardMessage: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: DrawerForm = {
  accessType: "PASSWORD",
  pin: "",
  password: "",
  confirmPassword: "",
  showPinOnCard: true,
  expiryEnabled: false,
  expiresAt: "",
  downloadsEnabled: true,
  zipDownloadEnabled: true,
  selectionEnabled: true,
  faceSearchEnabled: false,
  groupOverrides: {},
  defaultGridDensity: "default",
  cardMessage: "Scan to view your photos",
};

function formFromLink(link: SharedLinkRow): DrawerForm {
  const expDate = link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 10) : "";
  return {
    ...DEFAULT_FORM,
    accessType: link.accessType,
    pin: "",
    password: "",
    confirmPassword: "",
    expiryEnabled: !!link.expiresAt,
    expiresAt: expDate,
    downloadsEnabled: link.downloadsEnabled,
    zipDownloadEnabled: link.zipDownloadEnabled,
    selectionEnabled: link.selectionEnabled,
    faceSearchEnabled: link.faceSearchEnabled,
    groupOverrides: {},
    cardMessage: "Scan to view your photos",
  };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateShort(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`h-5 w-9 rounded-full transition-colors ${checked && !disabled ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
        {/* Toggle knob — intentionally white on all themes */}
        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${checked && !disabled ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        {description && <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>}
      </div>
    </label>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
    >
      {copied ? (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
        </svg>
      )}
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

// ─── Section heading (inside drawer) ─────────────────────────────────────────

function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── LinkCard ─────────────────────────────────────────────────────────────────

function LinkCard({
  link,
  baseUrl,
  onEdit,
  onRevoked,
}: {
  link: SharedLinkRow;
  baseUrl: string;
  onEdit: (link: SharedLinkRow) => void;
  onRevoked: (id: string) => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState("");

  const url = `${baseUrl}/share/${link.slug}`;
  const isExpired = link.expiresAt ? new Date() > new Date(link.expiresAt) : false;

  async function handleRevoke() {
    if (!confirm("Revoke this link? Clients will lose access immediately.")) return;
    setRevoking(true);
    const result = await revokeSharedLinkAction(link.id);
    if (result.error) { setError(result.error); setRevoking(false); }
    else onRevoked(link.id);
  }

  async function handleTogglePin() {
    if (pinVisible) { setPinVisible(false); return; }
    if (pin !== null) { setPinVisible(true); return; }
    setPinLoading(true);
    const result = await getSharedLinkPin(link.id);
    setPinLoading(false);
    if (result.pin) { setPin(result.pin); setPinVisible(true); }
    else setError(result.error ?? "Could not retrieve PIN.");
  }

  const protectionLabel =
    link.accessType === "PIN" ? "PIN Protected" :
    link.accessType === "PASSWORD" ? "Password Protected" :
    "Public";

  const protectionBadgeClass =
    link.accessType === "PIN"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
      : link.accessType === "PASSWORD"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${protectionBadgeClass}`}>
            {link.accessType !== "NONE" && (
              <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
            )}
            {protectionLabel}
          </span>

          {link.accessType === "PIN" && (
            <button
              type="button"
              onClick={handleTogglePin}
              disabled={pinLoading}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
            >
              {pinLoading ? "Loading…" : pinVisible ? "Hide PIN" : "Show PIN"}
            </button>
          )}
        </div>

        {/* Status badge */}
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          isExpired
            ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isExpired ? "bg-red-500" : "bg-emerald-500"}`} />
          {isExpired ? "Expired" : "Active"}
        </span>
      </div>

      {/* PIN reveal */}
      {pinVisible && pin && (
        <p className="mt-2 font-mono text-sm font-bold tracking-[0.35em] text-blue-700 dark:text-blue-400">
          {pin}
        </p>
      )}

      {/* URL row */}
      <div className="mt-2.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {url}
        </p>
        <CopyButton text={url} />
      </div>

      {/* Meta row */}
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Created {formatDate(link.createdAt)}
        {link.expiresAt && (
          <> · {isExpired ? `Expired ${formatDateShort(link.expiresAt)}` : `Exp ${formatDateShort(link.expiresAt)}`}</>
        )}
      </p>

      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}

      {/* Action row */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            window.open(`/api/preview/${link.id}`, "_blank", "noopener,noreferrer");
          }}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd" />
          </svg>
          QR Card
        </button>

        <button
          onClick={() => onEdit(link)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
          </svg>
          Edit
        </button>

        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 disabled:opacity-40 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          {revoking ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
          )}
          Revoke
        </button>
      </div>
    </div>
  );
}

// ─── CreateEditDrawer ─────────────────────────────────────────────────────────

function CreateEditDrawer({
  drawerState,
  form,
  setField,
  onClose,
  onSaved,
  eventId,
  groups,
  plan,
  faceIndexingEnabled,
  faceIndexingDone,
  peopleIndexed,
  eventTitle,
  studioName,
  brandColor,
  baseUrl,
}: {
  drawerState: Exclude<DrawerState, { mode: "closed" }>;
  form: DrawerForm;
  setField: <K extends keyof DrawerForm>(k: K, v: DrawerForm[K]) => void;
  onClose: () => void;
  onSaved: () => void;
  eventId: string;
  groups: EventGroupWithCount[];
  plan: "FREE" | "PRO" | "STUDIO";
  faceIndexingEnabled: boolean;
  faceIndexingDone: boolean;
  peopleIndexed: number;
  eventTitle: string;
  studioName: string;
  brandColor: string;
  baseUrl: string;
}) {
  const isEdit = drawerState.mode === "edit";
  const editLink = isEdit ? drawerState.link : null;
  const isPro = plan === "PRO" || plan === "STUDIO";

  const [isPending, startSaveTransition] = useTransition();
  const [formError, setFormError] = useState("");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdPin, setCreatedPin] = useState<string | null>(null);
  const [qrGenerating, setQrGenerating] = useState<"card" | "a4" | "qr" | null>(null);
  const [qrError, setQrError] = useState("");

  // PIN state for edit mode QR card
  const [editPin, setEditPin] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && editLink?.accessType === "PIN") {
      getSharedLinkPin(editLink.id).then((r) => {
        if (r.pin) setEditPin(r.pin);
      });
    }
    setFormError("");
    setCreatedSlug(null);
    setCreatedId(null);
    setCreatedPin(null);
    setQrError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerState]);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    setFormError("");

    if (form.accessType === "PASSWORD" && !isEdit) {
      if (form.password !== form.confirmPassword) {
        setFormError("Passwords do not match.");
        return;
      }
      if (form.password.length < 4) {
        setFormError("Password must be at least 4 characters.");
        return;
      }
    }
    if (form.accessType === "PIN" && !isEdit && !/^\d{4}$/.test(form.pin)) {
      setFormError("PIN must be exactly 4 digits.");
      return;
    }

    startSaveTransition(async () => {
      const expiresAt = form.expiryEnabled ? form.expiresAt || null : null;

      if (!isEdit) {
        const credential =
          form.accessType === "PASSWORD" ? form.password :
          form.accessType === "PIN" ? form.pin : null;

        const result = await createSharedLinkAction(
          eventId,
          form.accessType,
          credential,
          expiresAt,
          form.faceSearchEnabled,
          Object.keys(form.groupOverrides).length > 0 ? form.groupOverrides : null,
          form.defaultGridDensity,
          {},
          {
            downloadsEnabled: form.downloadsEnabled,
            zipDownloadEnabled: form.zipDownloadEnabled,
            selectionEnabled: form.selectionEnabled,
            showPinOnCard: form.showPinOnCard,
            customCardMessage: form.cardMessage,
          },
        );

        if (result.error) { setFormError(result.error); return; }

        setCreatedSlug(result.slug ?? null);
        setCreatedId(result.id ?? null);
        setCreatedPin(form.accessType === "PIN" ? form.pin : null);
        onSaved(); // triggers list refresh; new link added via router.refresh
      } else {
        const credential =
          form.accessType === "PASSWORD" && form.password ? form.password :
          form.accessType === "PIN" && form.pin ? form.pin :
          null;

        const data: UpdateSharedLinkData = {
          accessType: form.accessType,
          credential,
          expiresAt,
          faceSearchEnabled: form.faceSearchEnabled,
          downloadsEnabled: form.downloadsEnabled,
          zipDownloadEnabled: form.zipDownloadEnabled,
          selectionEnabled: form.selectionEnabled,
          showPinOnCard: form.showPinOnCard,
          customCardMessage: form.cardMessage,
          groupVisibilityOverrides: Object.keys(form.groupOverrides).length > 0 ? form.groupOverrides : null,
          defaultGridDensity: form.defaultGridDensity,
          theme: "minimal",
          welcomeEnabled: false,
          welcomeMessage: null,
          welcomeHeroPhotoId: null,
          introAnimation: "fade",
          showPhotoCount: true,
          showEventDate: true,
          galleryTitle: null,
          gallerySubtitle: null,
        };

        const result = await updateSharedLink(editLink!.id, data);
        if (result.error) { setFormError(result.error); return; }
        onSaved();
        onClose();
      }
    });
  }

  function triggerQrDownload(base64: string, filename: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleQrDownload(type: "card" | "a4" | "qr") {
    if (!editLink) return;
    setQrGenerating(type);
    setQrError("");
    const opts = { showPin: form.showPinOnCard && editLink.accessType === "PIN", customMessage: form.cardMessage };
    let result: { data: string } | { error: string };
    if (type === "card")      result = await generateQRCardForDownload(editLink.id, opts, baseUrl);
    else if (type === "a4")   result = await generateA4SheetForDownload(editLink.id, opts, baseUrl);
    else                      result = await generateQROnlyForDownload(editLink.id, baseUrl);
    setQrGenerating(null);
    if ("error" in result) { setQrError(result.error); return; }
    const slug = editLink.slug;
    triggerQrDownload(result.data, type === "card" ? `qr-card-${slug}.png` : type === "a4" ? `qr-a4-${slug}.png` : `qr-${slug}.png`);
  }

  const galleryUrl = editLink ? `${baseUrl}/share/${editLink.slug}` : "";

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl dark:bg-zinc-900 sm:w-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {isEdit ? `Edit Link /${editLink!.slug.slice(0, 8)}…` : "Create Shared Link"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">

          {/* ── Success banner (create mode) ── */}
          {createdSlug && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="mb-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Link created!
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200 dark:bg-zinc-900 dark:ring-emerald-800">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200">
                  {baseUrl}/share/{createdSlug}
                </p>
                <CopyButton text={`${baseUrl}/share/${createdSlug}`} />
              </div>
              {createdPin && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">PIN for your client:</p>
                  <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200 dark:bg-zinc-900 dark:ring-emerald-800">
                    <p className="flex-1 font-mono text-xl font-bold tracking-[0.5em] text-zinc-800 dark:text-zinc-100">
                      {createdPin}
                    </p>
                    <CopyButton text={createdPin} />
                  </div>
                </div>
              )}
              {createdId && (
                <a
                  href={`/api/preview/${createdId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-400"
                >
                  Preview gallery experience →
                </a>
              )}
            </div>
          )}

          {/* ── 1. Protection ── */}
          <DrawerSection label="Protection">
            {/* Access type radio group */}
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/50">
              {(["NONE", "PIN", "PASSWORD"] as AccessType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setField("accessType", type); setFormError(""); }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                    form.accessType === type
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {type === "NONE" ? "Public" : type === "PIN" ? "PIN" : "Password"}
                </button>
              ))}
            </div>

            {form.accessType === "NONE" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-amber-700 dark:text-amber-400">Anyone with the link can view this gallery.</p>
              </div>
            )}

            {form.accessType === "PIN" && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {isEdit ? "New PIN (leave empty to keep current)" : "4-digit PIN"}
                  </p>
                  <div className="flex items-center gap-3">
                    <OtpInput
                      value={form.pin}
                      onComplete={(v) => setField("pin", v)}
                      onChange={(v) => setField("pin", v)}
                      isError={false}
                      disabled={false}
                    />
                    <button
                      type="button"
                      onClick={() => setField("pin", generateSecurePin())}
                      className="rounded-lg border border-zinc-300 p-2 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      title="Generate PIN"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Z" clipRule="evenodd" />
                        <path d="M1.23 7.303a7 7 0 0 1 11.712-3.138l.31.31V2.243a.75.75 0 0 1 1.5 0v4.243a.75.75 0 0 1-.75.75H9.759a.75.75 0 0 1 0-1.5h2.433l-.312-.311A5.5 5.5 0 0 0 2.68 7.693a.75.75 0 0 1-1.45-.39Z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <Toggle
                  checked={form.showPinOnCard}
                  onChange={(v) => setField("showPinOnCard", v)}
                  label="Show PIN on QR card"
                />
              </div>
            )}

            {form.accessType === "PASSWORD" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {isEdit ? "New password" : "Password"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder={isEdit ? "Leave blank to keep" : "Min 4 chars"}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Confirm <span className="text-red-500">{!isEdit ? "*" : ""}</span>
                  </label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setField("confirmPassword", e.target.value)}
                    placeholder={isEdit ? "Leave blank to keep" : "Repeat password"}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                  />
                </div>
              </div>
            )}
          </DrawerSection>

          {/* ── 2. Expiry ── */}
          <DrawerSection label="Expiry">
            <Toggle
              checked={form.expiryEnabled}
              onChange={(v) => setField("expiryEnabled", v)}
              label="Set expiry date"
              description="Gallery becomes inaccessible after this date"
            />
            {form.expiryEnabled && (
              <div className="mt-3">
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setField("expiresAt", e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>
            )}
          </DrawerSection>

          {/* ── 3. Permissions ── */}
          <DrawerSection label="Permissions">
            <div className="space-y-3">
              <Toggle
                checked={form.downloadsEnabled}
                onChange={(v) => setField("downloadsEnabled", v)}
                label="Allow photo downloads"
              />
              <Toggle
                checked={form.zipDownloadEnabled}
                onChange={(v) => setField("zipDownloadEnabled", v)}
                label="Allow ZIP download"
                description={!isPro ? "Available on PRO and STUDIO plans" : undefined}
                disabled={!isPro}
              />
              <Toggle
                checked={form.selectionEnabled}
                onChange={(v) => setField("selectionEnabled", v)}
                label="Allow photo selection by client"
              />
              {faceIndexingEnabled && (
                <Toggle
                  checked={form.faceSearchEnabled}
                  onChange={(v) => setField("faceSearchEnabled", v)}
                  label="Allow face search"
                  description={
                    !faceIndexingDone
                      ? "Face indexing not yet complete"
                      : peopleIndexed > 0
                      ? `${peopleIndexed} people indexed`
                      : undefined
                  }
                  disabled={!faceIndexingDone}
                />
              )}
            </div>
          </DrawerSection>

          {/* ── 4. Group Visibility ── */}
          {groups.length > 0 && (
            <DrawerSection label="Group Visibility">
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                {groups.map((g) => {
                  const visible = g.id in form.groupOverrides ? form.groupOverrides[g.id] : true;
                  return (
                    <label key={g.id} className="flex cursor-pointer items-center gap-3">
                      <div className="relative shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={visible}
                          onChange={(e) =>
                            setField("groupOverrides", { ...form.groupOverrides, [g.id]: e.target.checked })
                          }
                        />
                        <div className={`h-5 w-9 rounded-full transition-colors ${visible ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                        {/* Toggle knob — intentionally white on all themes */}
                        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${visible ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.color ?? "#6366f1" }} />
                        {g.name}
                        <span className="text-xs text-zinc-400">({g.photoCount})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </DrawerSection>
          )}

          {/* ── 5. Default View ── */}
          <DrawerSection label="Default View">
            <GridDensityControl
              value={form.defaultGridDensity}
              onChange={(v) => setField("defaultGridDensity", v)}
            />
            <p className="mt-1.5 text-xs text-zinc-400">Clients can change this themselves</p>
          </DrawerSection>

          {/* ── 6. Gallery ── */}
          <DrawerSection label="Gallery">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Gallery theme, welcome screen, and animation are configured in the{" "}
                <a
                  href="#gallery"
                  onClick={(e) => { e.preventDefault(); onClose(); setTimeout(() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" }), 50); }}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Gallery Customisation
                </a>{" "}
                section and apply to all links for this event.
              </p>
            </div>
          </DrawerSection>

          {/* ── 7. QR Card (edit mode only) ── */}
          {isEdit && editLink && (
            <DrawerSection label="QR Card">
              <div className="space-y-4">
                {/* Scale down the 300×191 card to ~200px wide */}
                <div className="flex justify-center">
                  <div style={{ width: 200, height: 127, overflow: "hidden" }}>
                    <div style={{ transform: "scale(0.667)", transformOrigin: "top left", width: 300, height: 191 }}>
                      <QRCardPreview
                        galleryUrl={galleryUrl}
                        eventTitle={eventTitle}
                        studioName={studioName}
                        brandColor={brandColor}
                        showPin={form.showPinOnCard && editLink.accessType === "PIN"}
                        pin={editPin ?? undefined}
                        customMessage={form.cardMessage}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Card message</label>
                    <span className="text-[10px] text-zinc-400">{form.cardMessage.length}/40</span>
                  </div>
                  <input
                    type="text"
                    value={form.cardMessage}
                    onChange={(e) => setField("cardMessage", e.target.value.slice(0, 40))}
                    placeholder="Custom message"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["card", "a4", "qr"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleQrDownload(type)}
                      disabled={!!qrGenerating}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {qrGenerating === type ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v7.22l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3.75 3.75a.75.75 0 0 1-1.06 0L5.72 9.56a.75.75 0 0 1 1.06-1.06l2.47 2.47V3.75A.75.75 0 0 1 10 3ZM3.75 15a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z" clipRule="evenodd" />
                        </svg>
                      )}
                      {qrGenerating === type ? "Generating…" :
                        type === "card" ? "Download PNG Card" :
                        type === "a4" ? "Download A4 Sheet" :
                        "Download QR Only"}
                    </button>
                  ))}
                </div>
                {qrError && <p className="text-xs text-red-500">{qrError}</p>}
              </div>
            </DrawerSection>
          )}

          {/* ── Error ── */}
          {formError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !!createdSlug}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isPending && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            )}
            {isPending ? "Saving…" : "Save Link"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── SharedLinksSection ───────────────────────────────────────────────────────

export function SharedLinksSection({
  eventId,
  initialLinks,
  groups,
  plan,
  faceIndexingEnabled,
  faceIndexingDone,
  peopleIndexed,
  eventTitle,
  studioName,
  brandColor,
}: {
  eventId: string;
  initialLinks: SharedLinkRow[];
  groups: EventGroupWithCount[];
  plan: "FREE" | "PRO" | "STUDIO";
  faceIndexingEnabled: boolean;
  faceIndexingDone: boolean;
  peopleIndexed: number;
  eventTitle: string;
  studioName: string;
  brandColor: string;
  eventPhotos?: { id: string; thumbnailUrl: string }[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [drawerState, setDrawerState] = useState<DrawerState>({ mode: "closed" });
  const [form, setForm] = useState<DrawerForm>(DEFAULT_FORM);
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => { setBaseUrl(window.location.origin); }, []);

  // Sync links when server data refreshes
  useEffect(() => { setLinks(initialLinks); }, [initialLinks]);

  function setField<K extends keyof DrawerForm>(k: K, v: DrawerForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function openCreate() {
    setForm(DEFAULT_FORM);
    setDrawerState({ mode: "create" });
  }

  function openEdit(link: SharedLinkRow) {
    setForm(formFromLink(link));
    setDrawerState({ mode: "edit", link });
  }

  function closeDrawer() {
    setDrawerState({ mode: "closed" });
  }

  function handleSaved() {
    router.refresh();
  }

  function handleRevoked(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    router.refresh();
  }

  const isOpen = drawerState.mode !== "closed";

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {links.length === 0
            ? "No shared links yet"
            : `${links.length} link${links.length !== 1 ? "s" : ""}`}
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Create New Link
        </button>
      </div>

      {/* Links list */}
      {links.length > 0 ? (
        <div className="mt-4 space-y-3">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              baseUrl={baseUrl}
              onEdit={openEdit}
              onRevoked={handleRevoked}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="mt-12 flex flex-col items-center justify-center gap-4 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <svg className="h-8 w-8 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">No shared links yet</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Create a link to share this gallery with clients
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Create First Link
          </button>
        </div>
      )}

      {/* Drawer */}
      {isOpen && (
        <CreateEditDrawer
          drawerState={drawerState as Exclude<DrawerState, { mode: "closed" }>}
          form={form}
          setField={setField}
          onClose={closeDrawer}
          onSaved={handleSaved}
          eventId={eventId}
          groups={groups}
          plan={plan}
          faceIndexingEnabled={faceIndexingEnabled}
          faceIndexingDone={faceIndexingDone}
          peopleIndexed={peopleIndexed}
          eventTitle={eventTitle}
          studioName={studioName}
          brandColor={brandColor}
          baseUrl={baseUrl}
        />
      )}
    </div>
  );
}
