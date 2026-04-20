import React from "react";
import {
  STEPS,
  StepKey,
  AuthState,
  Rules,
  FixedFile,
  Sheet,
  GoogleUser,
  ResolvedAttachment,
  LogEntry,
  ConfigStatus,
  DuplicateHit,
  RowStatus,
  DEFAULT_TEMPLATE,
  DEFAULT_SUBJECT,
  DEFAULT_PATTERN,
  buildSmartDefaults,
} from "./data";
import { CanvasTopBar } from "./primitives";
import { WindowChrome } from "./components/WindowChrome";
import { Sidebar } from "./components/Sidebar";
import { StepRouter, AppState, AppSetters } from "./components/VariationB";
import { SetupScreen } from "./components/SetupScreen";
import { ipc } from "./ipc";
import {
  checkForUpdate,
  getCurrentVersion,
  fetchManifestDirectly,
  isNewerSemver,
  RELEASES_PAGE,
  UpdateCheckResult,
} from "./updater";

const DENSITY = "cozy" as const;

export default function App() {
  const [config, setConfig] = React.useState<ConfigStatus | null>(null);
  const [bootDone, setBootDone] = React.useState(false);
  const [updateState, setUpdateState] = React.useState<UpdateCheckResult | null>(null);
  const [installedVersion, setInstalledVersion] = React.useState<string>("");
  const [remoteVersion, setRemoteVersion] = React.useState<string>("");
  const [updateInstalling, setUpdateInstalling] = React.useState(false);
  const [updateInstallError, setUpdateInstallError] = React.useState<string | null>(null);
  const [updateChecking, setUpdateChecking] = React.useState(false);

  const [step, setStep] = React.useState<StepKey>("sheet");
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [template, setTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [subject, setSubject] = React.useState(DEFAULT_SUBJECT);
  const [cc, setCc] = React.useState<string[]>([]);
  const [rules, setRules] = React.useState<Rules>({
    pattern: DEFAULT_PATTERN,
    caseInsensitive: true,
    fuzzy: true,
    required: false,
  });
  const [attachmentsFolder, setAttachmentsFolder] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState<ResolvedAttachment[]>([]);
  const [fixed, setFixed] = React.useState<FixedFile[]>([]);
  const [authState, setAuthState] = React.useState<AuthState>("idle");
  const [user, setUser] = React.useState<GoogleUser | null>(null);
  const [logEntries, setLogEntries] = React.useState<LogEntry[]>([]);
  const [emailColumn, setEmailColumn] = React.useState<string | null>(null);
  const [nameColumn, setNameColumn] = React.useState<string | null>(null);

  // Send-step state — lifted here so navigating away from Send doesn't reset
  // a campaign-in-progress.
  const [sendStatus, setSendStatus] = React.useState<RowStatus[]>([]);
  const [sendErrors, setSendErrors] = React.useState<Record<number, string>>({});
  const [sendDupHits, setSendDupHits] = React.useState<Record<number, DuplicateHit[]> | null>(null);
  const [sendDupErrors, setSendDupErrors] = React.useState<string[]>([]);
  const [deferMissing, setDeferMissing] = React.useState(true);

  // Track the last smart-default values we seeded so we can detect whether the
  // user has edited them. If the current state still equals the last seed, a
  // new sheet's smart defaults will overwrite; otherwise we leave the user's
  // edits alone.
  const lastSeedRef = React.useRef<{
    template: string;
    subject: string;
    pattern: string;
  }>({
    template: DEFAULT_TEMPLATE,
    subject: DEFAULT_SUBJECT,
    pattern: DEFAULT_PATTERN,
  });

  React.useEffect(() => {
    // Reset every send-step artifact whenever the campaign's source sheet changes.
    // Not triggered by emailColumn/nameColumn tweaks — those don't invalidate prior sends.
    setSendStatus([]);
    setSendErrors({});
    setSendDupHits(null);
    setSendDupErrors([]);
    if (!sheet) {
      setEmailColumn(null);
      setNameColumn(null);
      return;
    }
    const cols = sheet.columns;
    const detectedEmail =
      cols.find((c) => /^email$/i.test(c)) ??
      cols.find((c) => /email/i.test(c)) ??
      cols[0] ??
      null;
    const detectedName =
      cols.find((c) => /^(client\s*name|full\s*name|name)$/i.test(c)) ??
      cols.find((c) => /name/i.test(c) && c !== detectedEmail) ??
      cols.find((c) => c !== detectedEmail) ??
      null;
    setEmailColumn(detectedEmail);
    setNameColumn(detectedName);

    // Swap in column-aware smart defaults — but only for fields the user
    // hasn't touched since the last seed.
    const def = buildSmartDefaults(cols);
    const seed = lastSeedRef.current;
    if (template === seed.template) setTemplate(def.template);
    if (subject === seed.subject) setSubject(def.subject);
    if (rules.pattern === seed.pattern) {
      setRules((r) => ({ ...r, pattern: def.pattern }));
    }
    lastSeedRef.current = def;
  }, [sheet]);

  const boot = React.useCallback(async () => {
    try {
      const cs = await ipc.configStatus();
      setConfig(cs);
      if (cs.present) {
        try {
          const u = await ipc.currentUser();
          if (u) {
            setUser(u);
            setAuthState("connected");
          }
        } catch {
          // ignore — unauthenticated
        }
      }
    } catch (e) {
      console.error("boot:", e);
    } finally {
      setBootDone(true);
    }
  }, []);

  React.useEffect(() => {
    void boot();
  }, [boot]);

  // Boot-time check for a newer release. Runs the plugin's check() AND a
  // direct fetch of latest.json in parallel, so we can detect the case where
  // the plugin silently says "no update" but the remote actually advertises
  // a newer version (which has happened in the wild).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await getCurrentVersion();
      if (!cancelled) setInstalledVersion(v);
      const [u, m] = await Promise.all([checkForUpdate(), fetchManifestDirectly()]);
      if (!cancelled) {
        setUpdateState(u);
        if (m) setRemoteVersion(m.version);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recheck = React.useCallback(async () => {
    setUpdateChecking(true);
    setUpdateInstallError(null);
    try {
      const [u, m] = await Promise.all([checkForUpdate(), fetchManifestDirectly()]);
      setUpdateState(u);
      if (m) setRemoteVersion(m.version);
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  const openReleasesPage = React.useCallback(async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(RELEASES_PAGE);
    } catch (e) {
      console.error("open releases page:", e);
    }
  }, []);

  const installUpdate = React.useCallback(async () => {
    if (updateState?.kind !== "pending") return;
    setUpdateInstalling(true);
    setUpdateInstallError(null);
    try {
      await updateState.pending.install();
    } catch (e: any) {
      setUpdateInstallError(typeof e === "string" ? e : e?.message ?? "install failed");
      setUpdateInstalling(false);
    }
  }, [updateState]);

  const pillBase: React.CSSProperties = {
    all: "unset",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.2,
  };

  // Has the plugin failed to notice a newer version the endpoint is advertising?
  const pluginStuck =
    updateState?.kind === "none" &&
    !!remoteVersion &&
    !!installedVersion &&
    isNewerSemver(remoteVersion, installedVersion);

  const versionTooltip = (() => {
    const parts = [
      `Running: v${installedVersion || "?"}`,
      remoteVersion ? `Endpoint advertises: v${remoteVersion}` : "Endpoint: unreachable",
    ];
    if (updateState?.kind === "error") {
      parts.push(`Plugin error: ${updateState.message}`);
    } else if (updateState?.kind === "pending") {
      parts.push(`Plugin: update to v${updateState.pending.version} ready`);
    } else if (updateState?.kind === "none") {
      parts.push(
        pluginStuck ? "Plugin: says up-to-date (disagrees with endpoint)" : "Plugin: up to date"
      );
    }
    parts.push("", "Click to re-check.");
    return parts.join("\n");
  })();

  // Version pill — always visible. Click to re-run the updater check.
  const versionPill = (
    <button
      onClick={() => void recheck()}
      disabled={updateChecking || updateInstalling}
      title={updateChecking ? "Checking for updates…" : versionTooltip}
      style={{
        ...pillBase,
        cursor: updateChecking || updateInstalling ? "wait" : "pointer",
        background: "rgba(59,50,43,0.06)",
        border: "1px solid rgba(59,50,43,0.15)",
        color: "var(--ink-dim)",
        fontFamily: "JetBrains Mono, monospace",
        marginRight: 8,
      }}
    >
      {updateChecking ? "checking…" : installedVersion ? `v${installedVersion}` : "…"}
    </button>
  );

  // Secondary pill — only if an update is pending OR the last check errored.
  let statusPill: React.ReactNode = null;
  if (updateState?.kind === "pending") {
    const notes = updateState.pending.notes;
    statusPill = (
      <button
        onClick={() => void installUpdate()}
        disabled={updateInstalling}
        title={
          updateInstallError
            ? `Install failed: ${updateInstallError}`
            : notes
            ? `Release notes:\n\n${notes}`
            : `Update to v${updateState.pending.version}, then relaunch.`
        }
        style={{
          ...pillBase,
          cursor: updateInstalling ? "wait" : "pointer",
          background: updateInstallError ? "rgba(196,98,63,0.14)" : "rgba(127,145,114,0.18)",
          border: `1px solid ${updateInstallError ? "rgba(196,98,63,0.45)" : "rgba(127,145,114,0.45)"}`,
          color: updateInstallError ? "var(--terracotta)" : "var(--sage-dark)",
        }}
      >
        {updateInstalling
          ? "updating…"
          : updateInstallError
          ? "install failed — retry"
          : `update to v${updateState.pending.version} · restart`}
      </button>
    );
  } else if (updateState?.kind === "error") {
    statusPill = (
      <span
        title={updateState.message}
        style={{
          ...pillBase,
          background: "rgba(196,98,63,0.10)",
          border: "1px solid rgba(196,98,63,0.35)",
          color: "var(--terracotta)",
          cursor: "help",
        }}
      >
        ⚠ update check failed
      </span>
    );
  } else if (pluginStuck) {
    // Plugin says "no update" but the endpoint clearly advertises a newer version.
    // Give the user an escape hatch — click to open the releases page in the browser.
    statusPill = (
      <button
        onClick={() => void openReleasesPage()}
        title={`Plugin reports up-to-date, but latest.json advertises v${remoteVersion}. Click to open the releases page and download manually.`}
        style={{
          ...pillBase,
          cursor: "pointer",
          background: "rgba(196,98,63,0.10)",
          border: "1px solid rgba(196,98,63,0.35)",
          color: "var(--terracotta)",
        }}
      >
        ⚠ v{remoteVersion} at GitHub — download
      </button>
    );
  }

  const headerSlot = (
    <>
      {versionPill}
      {statusPill}
    </>
  );

  const resetAll = () => {
    setStep("sheet");
    setSheet(null);
    setTemplate(DEFAULT_TEMPLATE);
    setSubject(DEFAULT_SUBJECT);
    setCc([]);
    setRules((r) => ({ ...r, pattern: DEFAULT_PATTERN }));
    setAttachmentsFolder(null);
    setResolved([]);
    setFixed([]);
    setLogEntries([]);
    setSendStatus([]);
    setSendErrors({});
    setSendDupHits(null);
    setSendDupErrors([]);
    lastSeedRef.current = {
      template: DEFAULT_TEMPLATE,
      subject: DEFAULT_SUBJECT,
      pattern: DEFAULT_PATTERN,
    };
  };

  const stepState: Record<StepKey, "done" | ""> = {
    sheet: sheet ? "done" : "",
    template: sheet ? "done" : "",
    attachments: sheet ? "done" : "",
    auth: authState === "connected" ? "done" : "",
    send: "",
  };

  const idx = STEPS.findIndex((s) => s.key === step);
  const canNext = (() => {
    if (step === "sheet") return !!sheet;
    if (step === "auth") return authState === "connected";
    return true;
  })();
  const goNext = () => {
    const nextIdx = Math.min(STEPS.length - 1, idx + 1);
    setStep(STEPS[nextIdx].key);
  };
  const goBack = () => setStep(STEPS[Math.max(0, idx - 1)].key);

  const state: AppState = {
    step,
    sheet,
    template,
    subject,
    cc,
    rules,
    attachmentsFolder,
    resolved,
    fixed,
    authState,
    user,
    logEntries,
    emailColumn,
    nameColumn,
    sendStatus,
    sendErrors,
    sendDupHits,
    sendDupErrors,
    deferMissing,
  };
  const setters: AppSetters = {
    setStep,
    setSheet,
    setTemplate,
    setSubject,
    setCc,
    setRules,
    setAttachmentsFolder,
    setResolved,
    setFixed,
    setAuthState,
    setUser,
    setLogEntries,
    setEmailColumn,
    setNameColumn,
    setSendStatus,
    setSendErrors,
    setSendDupHits,
    setSendDupErrors,
    setDeferMissing,
    resetAll,
  };

  if (!bootDone) {
    return (
      <WindowChrome rightSlot={headerSlot}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
          <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>Loading…</div>
        </div>
      </WindowChrome>
    );
  }

  if (config && !config.present) {
    return <SetupScreen configPath={config.path} onRetry={() => void boot()} />;
  }

  return (
    <WindowChrome rightSlot={headerSlot}>
      <Sidebar currentStep={step} goTo={setStep} stepState={stepState} density={DENSITY} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <CanvasTopBar
          step={step}
          totalSteps={STEPS.length}
          onNext={goNext}
          onBack={goBack}
          canNext={canNext}
          nextLabel={step === "send" ? "Finish" : step === "auth" ? "Continue to send" : "Continue"}
        />
        <StepRouter state={state} setters={setters} density={DENSITY} />
      </div>
    </WindowChrome>
  );
}
