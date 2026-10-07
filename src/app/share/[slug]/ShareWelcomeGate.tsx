"use client";

import { useEffect, useState } from "react";
import { WelcomeScreen, type WelcomeScreenProps } from "./WelcomeScreen";

type Props = Omit<WelcomeScreenProps, "onContinue"> & { slug: string };

// Shows WelcomeScreen on first visit (tracked via sessionStorage per slug).
// Dismissed state persists until the tab is closed.
//
// State strategy:
//   showWelcome=true on SSR → WelcomeScreen renders immediately (fixed inset-0 z-50),
//   covering the gallery from first paint — no flash.
//   hydrated=false on SSR → thin bg overlay (z-60) sits on top during the brief window
//   between DOM paint and React hydration completing (~16ms).
//   useEffect fires → hydrated=true (overlay gone), sessionStorage checked:
//     already seen → showWelcome=false → WelcomeScreen unmounts, gallery revealed
//     not seen    → showWelcome stays true, WelcomeScreen animation plays normally
export function ShareWelcomeGate({ slug, ...props }: Props) {
  const [showWelcome, setShowWelcome] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (sessionStorage.getItem(`welcome-seen-${slug}`)) {
      setShowWelcome(false);
    }
  }, [slug]);

  function handleContinue() {
    sessionStorage.setItem(`welcome-seen-${slug}`, "1");
    setShowWelcome(false);
  }

  return (
    <>
      {showWelcome && <WelcomeScreen {...props} onContinue={handleContinue} />}
      {/* Prevents content flash during the hydration tick before sessionStorage
          check completes — invisible to users on fast connections, eliminates
          gallery bleed-through on slow ones. */}
      {!hydrated && (
        <div
          className="fixed inset-0 z-[60]"
          style={{ backgroundColor: "var(--theme-bg)" }}
        />
      )}
    </>
  );
}
