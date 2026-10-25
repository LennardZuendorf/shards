/** "Open in" (R41) actions and hooks shared by the split button, menus and readers. */
import { toast } from "sonner";
import { taskGet } from "@/lib/api";
import { copied } from "@/lib/copy";
import { useHostStatus } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { availableTargets, OPEN_TARGET_LABEL, openFile, pickDefault, useOpenPreference, type OpenTarget } from "@/lib/open";
import { runtime } from "@/lib/transport";


export const openLabel = (t: OpenTarget) => (t === "reveal" ? "Show in Finder" : `Open in ${OPEN_TARGET_LABEL[t]}`);

/** The targets this vault and runtime offer, and the one the main button uses. */
export function useOpenTargets() {
  const status = useHostStatus();
  const pref = useOpenPreference();
  const available = availableTargets({ obsidian: !!status.data?.obsidian_vault, desktop: runtime() === "tauri" });
  return { available, primary: pickDefault(available, pref) };
}

export async function openWith(absPath: string, target: OpenTarget) {
  try {
    await openFile(absPath, target);
  } catch (e) {
    toast.error(`Could not open in ${OPEN_TARGET_LABEL[target]}`, { description: e instanceof Error ? e.message : String(e) });
  }
}

/** For rows that carry no path (task lists): fetch the task, then open its file. */
export async function openTaskWith(taskId: string, target: OpenTarget) {
  try {
    const task = await taskGet(taskId);
    if (!task.path) throw new Error("the task has no file path");
    await openWith(task.path, target);
  } catch (e) {
    toast.error("Could not open the task file", { description: e instanceof Error ? e.message : String(e) });
  }
}

export function copyPath(absPath: string) {
  void navigator.clipboard?.writeText(absPath).then(
    () => toast.success(copied("path")),
    () => toast.error("Clipboard unavailable"),
  );
}

/** ⌘⇧O opens `absPath` with the default target. Pass `null` to disable. */
export function useOpenHotkey(absPath: string | null | undefined) {
  const { primary } = useOpenTargets();
  useHotkey(
    "mod+shift+o",
    () => {
      if (absPath && primary) void openWith(absPath, primary);
    },
    { description: "Open in external editor", group: "Files" },
  );
}

