/**
 * Atlas theme handling — presentation only.
 *
 * The user's choice ("light" | "dark" | "system") lives in localStorage
 * under THEME_STORAGE_KEY. The resolved theme is applied as a `dark`
 * class on <html>, set before first paint by THEME_INIT_SCRIPT so
 * there's no flash of the wrong theme. Atlas's original look was dark,
 * so "dark" is the default until someone chooses otherwise.
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "atlas-theme";
export const DEFAULT_THEME: ThemePreference = "dark";

/** Inlined in <head>; must stay dependency-free and tolerate blocked storage. */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var p=(s==="light"||s==="dark"||s==="system")?s:"${DEFAULT_THEME}";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){document.documentElement.classList.add("dark");}})();`;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage unavailable — fall through to default */
  }
  return DEFAULT_THEME;
}

function resolvesToDark(preference: ThemePreference): boolean {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return preference === "dark";
}

export function applyThemePreference(preference: ThemePreference, animate = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }
  const dark = resolvesToDark(preference);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — the theme still applies for this session */
  }
  applyThemePreference(preference, true);
  notify();
}

/** useSyncExternalStore plumbing */
export function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readThemePreference() === "system") applyThemePreference("system");
    listener();
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
    media.removeEventListener("change", onSystemChange);
  };
}

export function getServerThemeSnapshot(): ThemePreference {
  return DEFAULT_THEME;
}
