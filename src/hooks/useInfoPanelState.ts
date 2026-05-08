"use client";

import { useEffect, useState } from "react";

export function useInfoPanelState(): [boolean, () => void] {
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("lightbox-info-panel");
      if (stored === "true") setShowInfo(true);
    } catch { /* SSR safe */ }
  }, []);

  function toggleInfo() {
    setShowInfo((prev) => {
      const next = !prev;
      try { localStorage.setItem("lightbox-info-panel", String(next)); }
      catch { /* ignore */ }
      return next;
    });
  }

  return [showInfo, toggleInfo];
}
