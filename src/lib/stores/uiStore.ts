import { create } from "zustand";
import { getSetting, setSetting } from "../db/repository";

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

interface UiState {
  sidebarCollapsed: boolean;
  /** Persists to the SQLite settings table; never throws. */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Reads persisted prefs once at app start. */
  loadPreferences: () => Promise<void>;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    void setSetting(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0").catch((error) => {
      console.warn("Could not persist sidebar preference:", error);
    });
  },

  loadPreferences: async () => {
    try {
      const stored = await getSetting(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) {
        set({ sidebarCollapsed: stored === "1" });
      }
    } catch (error) {
      console.warn("Could not load preferences:", error);
    }
  },
}));
