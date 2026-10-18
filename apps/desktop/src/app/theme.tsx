/**
 * Theme: `.dark` class on <html>, following the system by default, with a manual override
 * persisted in localStorage (`shards-theme`). index.html applies the class before first paint.
 */
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const THEME_STORAGE_KEY = "shards-theme";

export type ThemeMode = "system" | "light" | "dark";
const ORDER: readonly ThemeMode[] = ["system", "light", "dark"];

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let mode: ThemeMode = typeof window !== "undefined" ? readMode() : "system";
let systemDark = media?.matches ?? false;
const listeners = new Set<() => void>();

function apply() {
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const root = document.documentElement;
  // Suppress transitions while swapping palettes.
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
  listeners.forEach((l) => l());
}

export function setTheme(next: ThemeMode) {
  mode = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable: still apply for this session */
  }
  apply();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `{ theme, resolvedTheme, setTheme }` — same shape as next-themes for drop-in use. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => mode);
  const resolvedTheme = useSyncExternalStore(subscribe, () => (mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light"));
  return { theme, resolvedTheme, setTheme };
}

/** Mount once at the root: applies the theme and follows OS changes in system mode. */
export function ThemeSync() {
  useEffect(() => {
    apply();
    if (!media) return;
    const on = () => {
      systemDark = media.matches;
      apply();
    };
    media.addEventListener("change", on);
    // Other windows (Tauri multi-window, other tabs) changing the preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        mode = readMode();
        apply();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

/** Cycle system → light → dark (sidebar button, palette). */
export function useThemeCycle() {
  const { theme, resolvedTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return { mode: theme, resolved: resolvedTheme, next, cycle: () => setTheme(next), setTheme };
}

export function ThemeToggle() {
  const { mode: m, next, cycle } = useThemeCycle();
  const Icon = m === "system" ? MonitorIcon : m === "light" ? SunIcon : MoonIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={cycle} aria-label={`Theme: ${m}. Switch to ${next}`}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        Theme: {m} <span className="opacity-60">→ {next}</span>
      </TooltipContent>
    </Tooltip>
  );
}
