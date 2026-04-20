import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/** Must stay in sync with `plugins.updater.endpoints[0]` in tauri.conf.json. */
export const MANIFEST_URL =
  "https://github.com/richikchanda1999/email-sender/releases/latest/download/latest.json";

export const RELEASES_PAGE = "https://github.com/richikchanda1999/email-sender/releases/latest";

/** Direct GET of the update manifest, bypassing the updater plugin.
 * Lets us independently confirm what the endpoint advertises and diagnose
 * cases where the plugin's internal version check disagrees with reality. */
export async function fetchManifestDirectly(): Promise<{
  version: string;
  platforms: string[];
} | null> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      version: String(data.version ?? ""),
      platforms: Object.keys(data.platforms ?? {}),
    };
  } catch {
    return null;
  }
}

export function isNewerSemver(remote: string, current: string): boolean {
  const parse = (s: string) =>
    s.split(".").map((n) => parseInt(n, 10)).map((n) => (Number.isFinite(n) ? n : 0));
  const r = parse(remote);
  const c = parse(current);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const a = r[i] ?? 0;
    const b = c[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

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
