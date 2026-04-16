"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { searchFaceInGallery } from "./actions";
import { FacePrivacyNotice } from "@/components/FacePrivacyNotice";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "capture" | "preview" | "searching" | "results" | "no-face";

interface Props {
  slug: string;
  totalPhotos: number;
  onFilter: (photoIds: string[] | null) => void;
  onClose: () => void;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FindMyPhotosModal({ slug, totalPhotos, onFilter, onClose }: Props) {
  const t = useT();
  const fs = t.faceSearch;

  const [step, setStep] = useState<Step>("capture");
  const [agreed, setAgreed] = useState(false);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL when file changes or modal unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelfieFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setAgreed(false);
    setStep("capture"); // stay on capture to agree, then proceed to preview
  }

  function handleAgreeAndContinue() {
    if (!selfieFile) return;
    setAgreed(true);
    setStep("preview");
  }

  async function handleSearch() {
    if (!selfieFile) return;
    setError(null);
    setStep("searching");

    const result = await searchFaceInGallery(slug, selfieFile);

    if (result.error === "NO_FACE_DETECTED") {
      setStep("no-face");
      return;
    }

    if (result.error) {
      setError(result.error);
      setStep("preview");
      return;
    }

    const photoIds = result.matchedPhotoIds ?? [];
    setMatchCount(photoIds.length);
    // Pass matched IDs to parent even when empty so gallery clears any prior filter
    onFilter(photoIds.length > 0 ? photoIds : null);
    setStep("results");
  }

  function handleTryAgain() {
    setSelfieFile(null);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setAgreed(false);
    setError(null);
    setStep("capture");
    // Reset file inputs so the same file can be re-selected
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleViewAll() {
    onFilter(null);
    onClose();
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {fs.modalTitle}
          </h2>
          <button
            onClick={onClose}
            aria-label={t.common.close_aria}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">

          {/* ── Step 1: Capture ── */}
          {step === "capture" && (
            <div className="space-y-5">
              {/* Selfie preview (if already picked a file) */}
              {previewUrl && (
                <div className="overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Your selfie"
                    className="h-48 w-full object-cover"
                  />
                </div>
              )}

              {/* Camera / Upload buttons */}
              {!previewUrl && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 px-4 py-5 text-sm font-medium text-zinc-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                  >
                    <CameraIcon />
                    {fs.cameraButton}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 px-4 py-5 text-sm font-medium text-zinc-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                  >
                    <UploadIcon />
                    {fs.uploadButton}
                  </button>
                </div>
              )}

              {/* Privacy notice + consent checkbox */}
              <FacePrivacyNotice checked={agreed} onChange={setAgreed} />

              {/* Agree button — only shown after a file is selected; disabled until checkbox ticked */}
              {selfieFile && (
                <button
                  onClick={handleAgreeAndContinue}
                  disabled={!agreed}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {fs.agreeButton}
                </button>
              )}

              {/* Change photo link if file already selected */}
              {previewUrl && (
                <button
                  onClick={handleTryAgain}
                  className="w-full text-center text-xs text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {fs.changePhoto}
                </button>
              )}
            </div>
          )}

          {/* ── Step 2: Preview / Confirm ── */}
          {step === "preview" && previewUrl && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {fs.previewTitle}
              </p>
              <div className="overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Your selfie preview"
                  className="h-52 w-full object-cover"
                />
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{fs.previewHint}</p>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {error}
                </p>
              )}
              <button
                onClick={handleSearch}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {fs.searchButton}
              </button>
              <button
                onClick={handleTryAgain}
                className="w-full text-center text-xs text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                {fs.changePhoto}
              </button>
            </div>
          )}

          {/* ── Step 3: Searching ── */}
          {step === "searching" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <SpinnerIcon />
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {fs.searching}
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {fs.searchingMessage(totalPhotos)}
                </p>
              </div>
            </div>
          )}

          {/* ── Step 4: Results (found or empty) ── */}
          {step === "results" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-2xl">
                  {matchCount > 0 ? "\uD83C\uDF89" : "\uD83D\uDD0D"}
                </p>
                <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {fs.resultsTitle(matchCount)}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {fs.resultsSubtitle(matchCount)}
                </p>
              </div>
              {matchCount > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={onClose}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    {fs.viewMatched}
                  </button>
                  <button
                    onClick={handleViewAll}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {fs.viewAll}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleTryAgain}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  {fs.tryAgain}
                </button>
              )}
            </div>
          )}

          {/* ── No face detected ── */}
          {step === "no-face" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-2xl">\u274C</p>
                <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {fs.noFaceTitle}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {fs.noFaceBody}
                </p>
              </div>
              <button
                onClick={handleTryAgain}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {fs.tryAgain}
              </button>
            </div>
          )}

        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
