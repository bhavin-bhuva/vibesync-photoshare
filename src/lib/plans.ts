export type PlanTier = "FREE" | "PRO" | "STUDIO";

export const THEME_ACCESS: Record<PlanTier, string[]> = {
  FREE: ["minimal", "dark"],
  PRO: ["minimal", "dark", "cinematic", "warm", "custom"],
  STUDIO: ["minimal", "dark", "cinematic", "warm", "custom"],
};

export const ANIMATION_ACCESS: Record<PlanTier, string[]> = {
  FREE: ["none", "fade"],
  PRO: ["none", "fade", "reveal", "typewriter", "filmstrip"],
  STUDIO: ["none", "fade", "reveal", "typewriter", "filmstrip"],
};

export function canUseTheme(plan: PlanTier, theme: string): boolean {
  return THEME_ACCESS[plan].includes(theme);
}

export function canUseAnimation(plan: PlanTier, animation: string): boolean {
  return ANIMATION_ACCESS[plan].includes(animation);
}
