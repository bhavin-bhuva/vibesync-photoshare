"use client";

import { createContext, useContext } from "react";

export type SettingsContextValue = {
  /** Track dirty state per section. sectionName is the display label shown in warning dialog. */
  setDirty: (sectionId: string, isDirty: boolean, sectionName?: string) => void;
  /** Show a bottom-right success toast. */
  showToast: (message: string) => void;
  /** Map of sectionId → display name for all dirty sections. */
  dirtyMap: Record<string, string>;
  /**
   * Called by sidebar/back-button before navigating.
   * Returns true if navigation should proceed immediately (no dirty state).
   * Returns false if navigation is blocked (shell will show dialog and handle it).
   */
  requestNavigation: (action: () => void, hint?: string) => boolean;
};

const defaultValue: SettingsContextValue = {
  setDirty: () => {},
  showToast: () => {},
  dirtyMap: {},
  requestNavigation: () => true,
};

export const SettingsContext = createContext<SettingsContextValue>(defaultValue);

export function useSettingsContext(): SettingsContextValue {
  return useContext(SettingsContext);
}
