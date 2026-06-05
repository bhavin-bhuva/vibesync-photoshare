"use client";

import { useEffect, useState, memo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function QRCardPreviewInner({
  galleryUrl,
  eventTitle,
  studioName,
  studioLogoUrl,
  brandColor,
  pin,
  showPin,
  customMessage,
}: {
  galleryUrl: string;
  eventTitle: string;
  studioName: string;
  studioLogoUrl?: string;
  brandColor: string;
  pin?: string;
  showPin: boolean;
  customMessage: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Fetch QR from /api/qr route (server-side generation).
  // qrcode package must NOT be imported client-side — its pngjs dependency
  // has a browser bundle that breaks React 19's /_global-error prerender.
  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);

    const params = new URLSearchParams({
      url: galleryUrl,
      color: brandColor,
      size: "100",
    });

    fetch(`/api/qr?${params}`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [galleryUrl, brandColor]);

  // ── Card dimensions ──────────────────────────────────────────────────────────
  // 300 × 191 px (business card proportions at screen resolution)
  // Left content panel: 155px | 1px divider | Right QR panel: remaining | 6px strip
  const CARD_W = 300;
  const CARD_H = 191;
  const STRIP_H = 6;
  const LEFT_W = 155;
  const DIVIDER_W = 1;

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {/* ── Main row ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left: branding + text ── */}
        {/* QR print card — always white for printing, intentionally not theme-aware */}
        <div
          style={{
            width: LEFT_W,
            flexShrink: 0,
            background: "#ffffff",
            padding: "14px 14px 10px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Studio mark */}
          {studioLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studioLogoUrl}
              alt={studioName}
              style={{
                height: 32,
                maxWidth: 80,
                objectFit: "contain",
                objectPosition: "left center",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: brandColor,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {studioName.slice(0, 1).toUpperCase()}
            </div>
          )}

          {/* Studio name */}
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              fontWeight: 700,
              color: "#0a0a0a",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              lineHeight: 1.2,
            }}
          >
            {studioName}
          </p>

          {/* Event title */}
          <p
            style={
              {
                marginTop: 4,
                fontSize: 14,
                fontWeight: 600,
                color: "#1a1a1a",
                fontFamily: "Georgia, 'Times New Roman', serif",
                lineHeight: 1.3,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties
            }
          >
            {eventTitle}
          </p>

          {/* Custom message */}
          {customMessage && (
            <p
              style={{
                marginTop: 6,
                fontSize: 9,
                color: "#71717a",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                lineHeight: 1.3,
              }}
            >
              {customMessage}
            </p>
          )}

          {/* Push PIN pill to bottom */}
          <div style={{ flex: 1 }} />

          {/* PIN pill */}
          {showPin && pin && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "flex-start",
                padding: "3px 8px",
                borderRadius: 100,
                border: `1px solid ${brandColor}`,
                background: hexToRgba(brandColor, 0.1),
                fontSize: 9,
                fontWeight: 700,
                color: brandColor,
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}
            >
              PIN: {pin}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div
          style={{
            width: DIVIDER_W,
            flexShrink: 0,
            background: hexToRgba(brandColor, 0.2),
          }}
        />

        {/* ── Right: QR code ── */}
        <div
          style={{
            flex: 1,
            background: hexToRgba(brandColor, 0.05),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Gallery QR code"
              style={{ width: 100, height: 100, display: "block" }}
            />
          ) : (
            <div
              style={{
                width: 100,
                height: 100,
                background: "#f4f4f5",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "#a1a1aa",
                textAlign: "center",
              }}
            >
              Generating…
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom brand strip ── */}
      <div style={{ height: STRIP_H, background: brandColor, flexShrink: 0 }} />
    </div>
  );
}

// memo applied here rather than at the module-level export to avoid
// React API calls during Next.js static prerender initialisation.
export const QRCardPreview = memo(QRCardPreviewInner);
