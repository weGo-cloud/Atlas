"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Loader2, Maximize2, Minimize2, Minus, Mountain, PanelLeft, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getEverestOverviewAction } from "../actions/everest-actions";
import {
  PANEL_STORAGE_KEY,
  PANEL_WIDTH_PX,
  parsePanelPreferences,
  serializePanelPreferences,
  type PanelPreferences,
} from "../domain/panel-preferences";
import type { EverestOverview } from "../service/everest-service";
import { EverestChat } from "./everest-chat";

/**
 * Everest as a floating button on every page that opens a side panel.
 * The panel is non-modal (the page behind stays usable), can be
 * minimized back to the button (Escape also does it), switched between
 * a compact and a wide width, and moved to the left or right. Those
 * choices are remembered on this device. Nothing is fetched until the
 * first time it is opened; after that it stays mounted (just hidden) so
 * the conversation survives navigating between pages.
 */
// Saved preferences live in localStorage. They are read with useSyncExternalStore so the server render and
// the first client render agree (the server snapshot is "nothing saved") with no setState-in-effect.
const storageListeners = new Set<() => void>();

function subscribeToStorage(listener: () => void) {
  storageListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storageListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStoredPreferences(): string | null {
  try {
    return window.localStorage.getItem(PANEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function EverestLauncher({ everestName }: { everestName: string }) {
  const stored = useSyncExternalStore(subscribeToStorage, readStoredPreferences, () => null);
  // If storage is unavailable (private mode, full), choices still apply for this visit through this in-memory copy.
  const [inMemory, setInMemory] = useState<PanelPreferences | null>(null);
  const preferences = useMemo(() => inMemory ?? parsePanelPreferences(stored), [inMemory, stored]);

  const [overview, setOverview] = useState<EverestOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hasOpened, setHasOpened] = useState(false);

  const mounted = hasOpened || preferences.open;
  const shouldLoad = preferences.open && !overview && !loadError;

  const update = useCallback(
    (patch: Partial<PanelPreferences>) => {
      const next = { ...preferences, ...patch };
      setInMemory(next);
      try {
        window.localStorage.setItem(PANEL_STORAGE_KEY, serializePanelPreferences(next));
        storageListeners.forEach((listener) => listener());
      } catch {
        // Not saved, but the in-memory copy above keeps the panel working for this visit.
      }
    },
    [preferences]
  );

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    void getEverestOverviewAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setOverview(result.overview);
      else setLoadError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoad, attempt]);

  useEffect(() => {
    if (!preferences.open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") update({ open: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preferences.open, update]);

  function open() {
    setHasOpened(true);
    update({ open: true });
  }

  function retry() {
    setLoadError(null);
    setAttempt((value) => value + 1);
  }

  const sideClass = preferences.side === "left" ? "left-0 border-r" : "right-0 border-l";
  const buttonSideClass = preferences.side === "left" ? "left-4" : "right-4";

  return (
    <>
      {!preferences.open ? (
        <Button
          type="button"
          onClick={open}
          aria-label={`Open ${everestName}`}
          className={`fixed bottom-4 z-40 h-12 rounded-full px-4 shadow-lg ${buttonSideClass}`}
        >
          <Mountain className="h-5 w-5" aria-hidden />
          <span className="text-sm font-medium">{everestName}</span>
        </Button>
      ) : null}

      {mounted ? (
        <aside
          role="complementary"
          aria-label={everestName}
          hidden={!preferences.open}
          style={{ width: `min(100vw, ${PANEL_WIDTH_PX[preferences.width]}px)` }}
          className={`fixed inset-y-0 z-50 flex flex-col border-border bg-surface shadow-2xl ${sideClass}`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Mountain className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">{everestName}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => update({ width: preferences.width === "compact" ? "wide" : "compact" })}
                aria-label={preferences.width === "compact" ? "Make the panel wider" : "Make the panel narrower"}
              >
                {preferences.width === "compact" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => update({ side: preferences.side === "right" ? "left" : "right" })}
                aria-label={preferences.side === "right" ? "Move the panel to the left" : "Move the panel to the right"}
              >
                {preferences.side === "right" ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => update({ open: false })} aria-label={`Minimize ${everestName}`}>
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            {overview ? (
              <EverestChat everestName={everestName} overview={overview} />
            ) : loadError ? (
              <div className="space-y-3 p-4 text-sm">
                <p className="text-destructive">{loadError}</p>
                <Button size="sm" variant="outline" onClick={retry}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting {everestName} ready…
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
