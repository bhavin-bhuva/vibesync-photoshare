"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScreenPhase = "filmstrip" | "filmstrip-out" | "welcome" | "exiting";

export interface WelcomeScreenProps {
  studioName: string;
  studioLogoUrl?: string;
  welcomeMessage?: string;
  heroPhotoUrl?: string;
  brandColor: string;
  theme: string;
  introAnimation: string;
  filmstripPhotos?: string[];
  onContinue: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#0A0A0A" : "#FFFFFF";
}

const CSS_KEYFRAMES = `
@keyframes _ws_kenBurns {
  from { transform: scale(1.08); }
  to   { transform: scale(1.0); }
}
@keyframes _ws_cursorBlink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes _ws_filmScroll {
  from { transform: translateX(0); }
  to   { transform: var(--_ws_filmEnd, translateX(-60%)); }
}
`;

// ─── Filmstrip panel ──────────────────────────────────────────────────────────

function FilmstripPanel({
  photos,
  brandColor,
  onDone,
}: {
  photos: string[];
  brandColor: string;
  onDone: () => void;
}) {
  const [scrolling, setScrolling] = useState(false);
  const [fading, setFading] = useState(false);
  const strips = [...photos, ...photos].slice(0, 6);

  useEffect(() => {
    const t1 = setTimeout(() => setScrolling(true), 50);
    const t2 = setTimeout(() => setFading(true), 1800);
    const t3 = setTimeout(() => onDone(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const endTranslate = `translateX(-${(strips.length - 2) / strips.length * 100}%)`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      <div
        className="flex h-full"
        style={{
          width: `${strips.length * 45}vw`,
          transform: scrolling ? endTranslate : "translateX(0)",
          transition: scrolling ? "transform 2s cubic-bezier(0.25,0.46,0.45,0.94)" : "none",
        }}
      >
        {strips.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            aria-hidden="true"
            className="h-full object-cover"
            style={{ width: "45vw", flexShrink: 0 }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)`,
        }}
      />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="h-px w-24 mx-auto mb-4" style={{ background: brandColor }} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WelcomeScreen({
  studioName,
  studioLogoUrl,
  welcomeMessage = "",
  heroPhotoUrl,
  brandColor,
  theme,
  introAnimation,
  filmstripPhotos = [],
  onContinue,
}: WelcomeScreenProps) {
  const isPlayfair = theme === "cinematic" || theme === "warm";
  const isDark = theme === "dark" || theme === "cinematic";
  const textColor = isDark || heroPhotoUrl ? "#ffffff" : (theme === "warm" ? "#2C1810" : "#0A0A0A");
  const mutedColor = isDark || heroPhotoUrl ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.5)";

  // Phase management
  const showFilmstrip =
    introAnimation === "filmstrip" && filmstripPhotos.length >= 2;
  const [phase, setPhase] = useState<ScreenPhase>(
    showFilmstrip ? "filmstrip" : "welcome"
  );

  // Mount flag — triggers CSS enter animations.
  // Double rAF: frame 1 renders elements at opacity:0, frame 2 flips mounted=true
  // so the browser has a committed initial paint to transition FROM.
  // 'none' skips rAF entirely — instant reveal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (phase !== "welcome") return;
    if (introAnimation === "none") {
      setMounted(true);
      return;
    }
    let raf1: number;
    let raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setMounted(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, introAnimation]);

  // Typewriter — inline so we can gate start on mounted and use a re-run guard.
  const [displayedText, setDisplayedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const hasStartedTyping = useRef(false);

  useEffect(() => {
    if (!mounted) return;
    if (introAnimation !== "typewriter") return;
    if (hasStartedTyping.current) return;
    if (!welcomeMessage) { setTypingDone(true); return; }

    hasStartedTyping.current = true;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(welcomeMessage.slice(0, i));
      if (i >= welcomeMessage.length) {
        clearInterval(interval);
        setTypingDone(true);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [mounted, introAnimation, welcomeMessage]);

  // Reveal / Ken Burns trigger
  const [kenBurns, setKenBurns] = useState(false);
  useEffect(() => {
    if (phase === "welcome" && introAnimation === "reveal" && heroPhotoUrl) {
      const t = setTimeout(() => setKenBurns(true), 50);
      return () => clearTimeout(t);
    }
  }, [phase, introAnimation, heroPhotoUrl]);

  // Exit
  function handleContinue() {
    setPhase("exiting");
    setTimeout(() => onContinue(), 500);
  }

  // Filmstrip phase
  if (phase === "filmstrip") {
    return (
      <>
        <style>{CSS_KEYFRAMES}</style>
        <FilmstripPanel
          photos={filmstripPhotos}
          brandColor={brandColor}
          onDone={() => setPhase("welcome")}
        />
      </>
    );
  }

  // ── Background ──────────────────────────────────────────────────────────────

  const themeBackground: React.CSSProperties =
    heroPhotoUrl
      ? {}
      : {
          background: (() => {
            const base = {
              minimal: "#FFFFFF",
              dark: "#0A0A0A",
              cinematic: "#141414",
              warm: "#FAF7F2",
            }[theme] ?? "#0A0A0A";
            const radial = hexToRgba(brandColor, 0.18);
            return `radial-gradient(ellipse at center, ${radial} 0%, ${base} 65%)`;
          })(),
        };

  // ── Animation styles ────────────────────────────────────────────────────────
  // delayMs is ignored when introAnimation === "none" (returns {} immediately).
  // For reveal: slightly longer transitions to match Ken Burns feel.
  // For all others: 600ms uniform duration, ms-based stagger.

  function fadeStyle(delayMs: number, extraTransform?: string): React.CSSProperties {
    if (introAnimation === "none") return {};
    if (introAnimation === "reveal") {
      return {
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.8s ease ${delayMs}ms, transform 0.9s ease ${delayMs}ms`,
      };
    }
    // fade / typewriter / filmstrip
    return {
      opacity: mounted ? 1 : 0,
      transform: mounted ? "translateY(0)" : (extraTransform ?? "translateY(12px)"),
      transition: `opacity 600ms ease ${delayMs}ms, transform 600ms ease ${delayMs}ms`,
    };
  }

  const isTypewriter = introAnimation === "typewriter" && phase === "welcome";
  const displayMessage = isTypewriter ? displayedText : welcomeMessage;
  const buttonReady = isTypewriter ? typingDone : true;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{CSS_KEYFRAMES}</style>

      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-between overflow-hidden px-6 py-16 sm:py-20"
        style={{
          ...themeBackground,
          opacity: phase === "exiting" ? 0 : 1,
          transition: "opacity 0.5s ease",
        }}
      >
        {/* ── Background: hero photo ── */}
        {heroPhotoUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroPhotoUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              style={
                introAnimation === "reveal"
                  ? {
                      animation: "_ws_kenBurns 5s ease-out forwards",
                      transformOrigin: "center center",
                    }
                  : {}
              }
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)",
              }}
            />
          </>
        )}

        {/* ── Top: Studio branding — delay 0ms ── */}
        <div
          className="relative z-10 flex flex-col items-center gap-3 text-center"
          style={fadeStyle(0)}
        >
          {studioLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studioLogoUrl}
              alt={studioName}
              className="object-contain drop-shadow-md"
              style={{
                maxHeight: 80,
                maxWidth: 200,
                filter: isDark || heroPhotoUrl ? "brightness(0) invert(1)" : "none",
              }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-base font-bold tracking-wide shadow-lg"
              style={{
                background: brandColor,
                color: "#fff",
              }}
            >
              {studioName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <p
            className="text-lg font-medium tracking-widest uppercase"
            style={{ color: mutedColor, letterSpacing: "0.15em" }}
          >
            {studioName}
          </p>
        </div>

        {/* ── Center: Welcome message — delay 240ms ── */}
        <div
          className="relative z-10 max-w-xl text-center"
          style={fadeStyle(240)}
        >
          {displayMessage && (
            <p
              className="leading-relaxed"
              style={{
                color: textColor,
                fontSize: "clamp(20px, 3vw, 28px)",
                fontFamily: isPlayfair
                  ? "'Playfair Display', Georgia, serif"
                  : "Inter, system-ui, sans-serif",
                lineHeight: 1.65,
              }}
            >
              {displayMessage}
              {isTypewriter && !typingDone && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: "1em",
                    background: textColor,
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "_ws_cursorBlink 1s step-end infinite",
                  }}
                />
              )}
            </p>
          )}
        </div>

        {/* ── Bottom: CTA — delay 380ms (or held until typing done) ── */}
        <div
          className="relative z-10 flex w-full flex-col items-center gap-5"
          style={fadeStyle(buttonReady ? 380 : 9_999_000)}
        >
          {/* Decorative line */}
          <div
            className="h-px w-16"
            style={{ background: brandColor, opacity: 0.8 }}
          />

          {/* CTA button */}
          <button
            onClick={handleContinue}
            className="group flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: `var(--theme-accent, ${brandColor ?? "#4f46e5"})`,
              color: `var(--theme-accent-text, ${getContrastText(brandColor ?? "#4f46e5")})`,
              maxWidth: 320,
              width: "100%",
              justifyContent: "center",
            }}
          >
            View Your Photos
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Powered-by footer */}
          <p className="text-xs" style={{ color: mutedColor }}>
            Powered by PhotoHouse
          </p>
        </div>
      </div>
    </>
  );
}
