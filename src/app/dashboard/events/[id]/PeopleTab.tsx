"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { PhotoGrid, type PhotoWithUrl } from "./PhotoGrid";
import {
  enableFaceIndexingAction,
  startRescanAction,
  pollJobProgressAction,
  setClusterLabelAction,
  toggleClusterHiddenAction,
  getClusterPhotosAction,
  deleteEventFaceDataAction,
} from "./actions";

// ─── View state ───────────────────────────────────────────────────────────────

type ViewState =
  | { type: "PEOPLE_LIST" }
  | { type: "PERSON_PHOTOS"; clusterId: string; label: string | null; photoCount: number };

// ─── Prop types ───────────────────────────────────────────────────────────────

export type ClusterCardData = {
  id: string;
  label: string | null;
  coverCropUrl: string;
  photoCount: number;
  faceCount: number;
  isHidden: boolean;
};

export type ActiveJobData = {
  status: string;
  processedPhotos: number;
  totalPhotos: number;
  facesFound: number;
} | null;

export type PeopleTabProps = {
  eventId: string;
  faceIndexingEnabled: boolean;
  clusters: ClusterCardData[];
  activeJob: ActiveJobData;
  totalPhotoCount: number;
  stats: { people: number; photosAnalyzed: number; facesFound: number };
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="M10.748 13.93l2.523 2.523a10.01 10.01 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-12 w-12 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4 animate-spin"} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

// (ClusterPhotosModal replaced by inline PERSON_PHOTOS view in PeopleTab)

// ─── Cluster card ─────────────────────────────────────────────────────────────

function ClusterCard({
  cluster: initial,
  onShowPhotos,
}: {
  cluster: ClusterCardData;
  onShowPhotos: (id: string, label: string | null, photoCount: number) => void;
}) {
  const t = useT();
  const [cluster, setCluster] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [labelInput, setLabelInput] = useState(initial.label ?? "");
  const [savingLabel, setSavingLabel] = useState(false);
  const [togglingHidden, setTogglingHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync if parent re-renders with new data
  useEffect(() => { setCluster(initial); }, [initial]);

  function startEditing() {
    setLabelInput(cluster.label ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function saveLabel() {
    if (savingLabel) return;
    setEditing(false);
    const trimmed = labelInput.trim();
    // Optimistic update
    setCluster((c) => ({ ...c, label: trimmed || null }));
    setSavingLabel(true);
    await setClusterLabelAction(cluster.id, trimmed);
    setSavingLabel(false);
  }

  async function toggleHidden() {
    if (togglingHidden) return;
    // Optimistic update
    setCluster((c) => ({ ...c, isHidden: !c.isHidden }));
    setTogglingHidden(true);
    const result = await toggleClusterHiddenAction(cluster.id);
    if (result.isHidden !== undefined) {
      setCluster((c) => ({ ...c, isHidden: result.isHidden! }));
    }
    setTogglingHidden(false);
  }

  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-xl bg-white ring-1 transition-shadow hover:shadow-md dark:bg-zinc-800 ${cluster.isHidden ? "ring-zinc-200 opacity-60 dark:ring-zinc-700" : "ring-zinc-200 dark:ring-zinc-700"}`}>
      {/* Cover image — click opens photos modal */}
      <button
        className="relative block overflow-hidden bg-zinc-100 dark:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
        style={{ height: 180 }}
        onClick={() => onShowPhotos(cluster.id, cluster.label, cluster.photoCount)}
        aria-label={`View photos of ${cluster.label ?? "this person"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cluster.coverCropUrl}
          alt={cluster.label ?? "Person"}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {cluster.isHidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
              {t.peoplePage.hiddenBadge}
            </span>
          </div>
        )}
      </button>

      {/* Metadata */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        {/* Label row */}
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel();
                if (e.key === "Escape") { setEditing(false); setLabelInput(cluster.label ?? ""); }
              }}
              placeholder={t.peoplePage.addNamePlaceholder}
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
            />
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 text-left"
            aria-label="Edit name"
          >
            <span className={`text-xs font-medium ${cluster.label ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}`}>
              {savingLabel ? <SpinnerIcon className="h-3 w-3 animate-spin" /> : (cluster.label ?? t.peoplePage.addNamePlaceholder)}
            </span>
            <PencilIcon />
          </button>
        )}

        {/* Photo count */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t.peoplePage.photoCount(cluster.photoCount)}
        </p>

        {/* Show / Hide toggle */}
        <button
          onClick={toggleHidden}
          disabled={togglingHidden}
          className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        >
          {togglingHidden ? (
            <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
          ) : cluster.isHidden ? (
            <EyeSlashIcon />
          ) : (
            <EyeIcon />
          )}
          {cluster.isHidden ? t.peoplePage.showLabel : t.peoplePage.hideLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Main PeopleTab ───────────────────────────────────────────────────────────

export function PeopleTab({
  eventId,
  faceIndexingEnabled: initialEnabled,
  clusters: initialClusters,
  activeJob: initialJob,
  totalPhotoCount,
  stats: initialStats,
}: PeopleTabProps) {
  const t = useT();
  const router = useRouter();

  const [enabled, setEnabled] = useState(initialEnabled);
  const [clusters, setClusters] = useState(initialClusters);
  const [activeJob, setActiveJob] = useState(initialJob);
  const [stats] = useState(initialStats);
  const [enabling, setEnabling] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Navigation state
  const [viewState, setViewState] = useState<ViewState>({ type: "PEOPLE_LIST" });
  const [personPhotos, setPersonPhotos] = useState<PhotoWithUrl[]>([]);
  const [personPhotosLoading, setPersonPhotosLoading] = useState(false);
  // Tracks whether PhotoGrid's lightbox is open (so Escape knows what to do)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Keep local state in sync when parent page re-renders (after router.refresh())
  useEffect(() => { setEnabled(initialEnabled); }, [initialEnabled]);
  useEffect(() => { setClusters(initialClusters); }, [initialClusters]);
  useEffect(() => { setActiveJob(initialJob); }, [initialJob]);

  // Fetch photos when entering PERSON_PHOTOS view
  const personClusterId = viewState.type === "PERSON_PHOTOS" ? viewState.clusterId : null;
  useEffect(() => {
    if (!personClusterId) return;
    setPersonPhotosLoading(true);
    setPersonPhotos([]);
    getClusterPhotosAction(personClusterId).then(({ photos }) => {
      setPersonPhotos(photos);
      setPersonPhotosLoading(false);
    });
  }, [personClusterId]);

  // Escape: in PERSON_PHOTOS with no lightbox open → go back to people list
  useEffect(() => {
    if (viewState.type !== "PERSON_PHOTOS") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isLightboxOpen) {
        setViewState({ type: "PEOPLE_LIST" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewState.type, isLightboxOpen]);

  // Poll for job progress every 3 s while a job is running
  useEffect(() => {
    const runningStatuses = ["PENDING", "RUNNING", "CLUSTERING"];
    if (!activeJob || !runningStatuses.includes(activeJob.status)) return;

    const interval = setInterval(async () => {
      const { job } = await pollJobProgressAction(eventId);
      if (!job || !runningStatuses.includes(job.status)) {
        setActiveJob(null);
        router.refresh();
        clearInterval(interval);
      } else {
        setActiveJob(job);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeJob, eventId, router]);

  async function handleEnable() {
    setEnabling(true);
    const result = await enableFaceIndexingAction(eventId);
    if (result.error) {
      setEnabling(false);
      return;
    }
    setEnabled(true);
    router.refresh();
    setEnabling(false);
  }

  async function handleRescan() {
    setRescanning(true);
    setRescanError("");
    const result = await startRescanAction(eventId);
    if (result.error) {
      setRescanError(result.error);
      setRescanning(false);
      return;
    }
    router.refresh();
    setRescanning(false);
  }

  async function handleDeleteFaceData() {
    setDeleting(true);
    setDeleteError("");
    const result = await deleteEventFaceDataAction(eventId);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    setConfirmingDelete(false);
    setDeleting(false);
    setEnabled(false);
    setClusters([]);
    setActiveJob(null);
    setViewState({ type: "PEOPLE_LIST" });
    router.refresh();
  }

  function goBackToPeople() {
    setViewState({ type: "PEOPLE_LIST" });
    setPersonPhotos([]);
    setIsLightboxOpen(false);
  }

  const isJobRunning = !!activeJob && ["PENDING", "RUNNING", "CLUSTERING"].includes(activeJob.status);
  const showClusters = enabled && !isJobRunning && clusters.length > 0;
  const showEmpty    = enabled && !isJobRunning && clusters.length === 0;

  return (
    <div className="min-h-[400px]">

      {/* ── Person photos view ── */}
      {viewState.type === "PERSON_PHOTOS" && (
        <div>
          {/* Breadcrumb */}
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={goBackToPeople}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              <ChevronLeftIcon />
              {t.peoplePage.backToPeople}
            </button>
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
              <PersonIcon />
              {viewState.label ?? t.peoplePage.unknownPerson}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">
              · {t.peoplePage.photoCount(viewState.photoCount)}
            </span>
          </div>

          {/* Loading */}
          {personPhotosLoading && (
            <div className="flex items-center justify-center py-24">
              <SpinnerIcon className="h-8 w-8 animate-spin text-zinc-300 dark:text-zinc-600" />
            </div>
          )}

          {/* Empty state */}
          {!personPhotosLoading && personPhotos.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mx-auto mb-4 flex justify-center text-zinc-300 dark:text-zinc-600">
                <PersonIcon />
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t.peoplePage.noPhotosInCluster}
              </p>
              <button
                onClick={goBackToPeople}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <ChevronLeftIcon />
                {t.peoplePage.backToPeople}
              </button>
            </div>
          )}

          {/* Photo grid — identical to main Photos tab */}
          {!personPhotosLoading && personPhotos.length > 0 && (
            <PhotoGrid
              photos={personPhotos}
              eventId={eventId}
              onLightboxChange={setIsLightboxOpen}
            />
          )}
        </div>
      )}

      {/* ── People list view ── */}
      {viewState.type === "PEOPLE_LIST" && (
        <>
          {/* ── Disabled state ── */}
          {!enabled && (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mx-auto mb-4 flex justify-center">
                <UsersIcon />
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t.peoplePage.disabledTitle}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                {t.peoplePage.disabledInfo}
              </p>
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {enabling && <SpinnerIcon />}
                {enabling ? t.peoplePage.enabling : t.peoplePage.enableToggleLabel}
              </button>
            </div>
          )}

          {/* ── Job running: progress bar ── */}
          {isJobRunning && activeJob && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mx-auto mb-3 flex justify-center">
                <SpinnerIcon className="h-8 w-8 animate-spin text-zinc-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {activeJob.status === "CLUSTERING"
                  ? t.peoplePage.clusteringTitle
                  : t.peoplePage.analyzingTitle}
              </p>
              {activeJob.status !== "CLUSTERING" && (
                <>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {t.peoplePage.analyzingProgress(
                      activeJob.processedPhotos,
                      activeJob.totalPhotos || totalPhotoCount
                    )}
                  </p>
                  <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-200"
                      style={{
                        width: `${activeJob.totalPhotos > 0
                          ? Math.round((activeJob.processedPhotos / activeJob.totalPhotos) * 100)
                          : 0}%`,
                      }}
                    />
                  </div>
                  {activeJob.facesFound > 0 && (
                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                      {t.peoplePage.facesFoundSoFar(activeJob.facesFound)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Enabled but no clusters ── */}
          {showEmpty && (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mx-auto mb-4 flex justify-center">
                <UsersIcon />
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t.peoplePage.emptyTitle}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                {t.peoplePage.emptySubtitle}
              </p>
              <button
                onClick={handleRescan}
                disabled={rescanning}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {rescanning && <SpinnerIcon />}
                {rescanning ? t.peoplePage.rescanning : t.peoplePage.scanButton}
              </button>
              {rescanError && <p className="mt-2 text-xs text-red-500">{rescanError}</p>}
            </div>
          )}

          {/* ── Clusters ── */}
          {showClusters && (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t.peoplePage.statsBar(stats.people, stats.photosAnalyzed, stats.facesFound)}
                </p>
                <button
                  onClick={handleRescan}
                  disabled={rescanning}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {rescanning && <SpinnerIcon />}
                  {rescanning ? t.peoplePage.rescanning : t.peoplePage.rescanButton}
                </button>
              </div>
              {rescanError && <p className="mb-3 text-xs text-red-500">{rescanError}</p>}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {clusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    onShowPhotos={(id, label, photoCount) =>
                      setViewState({ type: "PERSON_PHOTOS", clusterId: id, label, photoCount })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Danger zone: Delete all face data ── */}
      {enabled && (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          {!confirmingDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {t.peoplePage.deleteFaceDataButton}
                </p>
                <p className="mt-0.5 text-xs text-red-500/80 dark:text-red-500/60">
                  {t.peoplePage.deleteFaceDataBody}
                </p>
              </div>
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={isJobRunning}
                className="shrink-0 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t.peoplePage.deleteFaceDataButton}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {t.peoplePage.deleteFaceDataTitle}
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-500/70">
                {t.peoplePage.deleteFaceDataBody}
              </p>
              {deleteError && (
                <p className="text-xs text-red-500">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteFaceData}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting && <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />}
                  {deleting ? t.peoplePage.deleteFaceDataDeleting : t.peoplePage.deleteFaceDataConfirm}
                </button>
                <button
                  onClick={() => { setConfirmingDelete(false); setDeleteError(""); }}
                  disabled={deleting}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300"
                >
                  {t.peoplePage.deleteFaceDataCancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
