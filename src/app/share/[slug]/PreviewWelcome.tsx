"use client";

import { WelcomeScreen, type WelcomeScreenProps } from "./WelcomeScreen";

// Thin client wrapper used in preview/page.tsx.
// onContinue is a no-op: WelcomeScreen handles its own exit animation
// and the gallery is always rendered behind the fixed overlay.
export function PreviewWelcome(
  props: Omit<WelcomeScreenProps, "onContinue">
) {
  return <WelcomeScreen {...props} onContinue={() => {}} />;
}
