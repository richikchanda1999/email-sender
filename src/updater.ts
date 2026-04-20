import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type PendingUpdate = {
  version: string;
  currentVersion: string;
  notes: string;
  install: () => Promise<void>;
};

/**
 * Poll the updater endpoint baked into tauri.conf.json.
 * Returns null if the app is up to date, offline, or the updater is misconfigured.
 */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  let update: Update | null;
  try {
    update = await check();
  } catch (e) {
    console.warn("updater check failed:", e);
    return null;
  }
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? "",
    install: async () => {
      await update!.downloadAndInstall();
      await relaunch();
    },
  };
}
