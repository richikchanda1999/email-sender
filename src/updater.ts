import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type PendingUpdate = {
  version: string;
  currentVersion: string;
  notes: string;
  install: () => Promise<void>;
};

/**
 * Discriminated result from a single updater check.
 * - `none`: check succeeded, endpoint reports no newer version available.
 *   `plugin-updater`'s `check()` returns `null` in this case.
 * - `pending`: check succeeded and a newer version exists.
 * - `error`: anything broke — network, signature verification, malformed
 *   manifest, unreachable endpoint. `message` carries whatever the plugin
 *   gave us so the UI can surface it.
 */
export type UpdateCheckResult =
  | { kind: "none"; currentVersion: string }
  | { kind: "pending"; pending: PendingUpdate }
  | { kind: "error"; message: string; currentVersion: string };

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}

/**
 * Poll the updater endpoint baked into tauri.conf.json. Never throws —
 * always resolves to an UpdateCheckResult so the UI can render both states
 * ("no update" and "check failed") without special-casing.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getCurrentVersion();
  let update: Update | null;
  try {
    update = await check();
  } catch (e: any) {
    const message = typeof e === "string" ? e : e?.message ?? String(e);
    console.warn("updater check failed:", e);
    return { kind: "error", message, currentVersion };
  }
  if (!update) {
    return { kind: "none", currentVersion };
  }
  return {
    kind: "pending",
    pending: {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? "",
      install: async () => {
        await update!.downloadAndInstall();
        await relaunch();
      },
    },
  };
}
