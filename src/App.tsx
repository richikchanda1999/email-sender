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
  SessionDoc,
  SessionMeta,
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
import { SessionPicker } from "./components/SessionPicker";
import { SessionMenu } from "./components/SessionMenu";
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

  // Session management
  const [sessions, setSessions] = React.useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const [activeSessionName, setActiveSessionName] = React.useState<string>("Untitled campaign");
  const [sessionStage, setSessionStage] = React.useState<"booting" | "picking" | "ready">("booting");
  // When re-applying a saved session, we want to bypass the sheet-change reset
  // effect. Pre-seed prevSheetKey before setSheet so the effect sees "no change".
  const prevSheetKeyRef = React.useRef<string | null>(null);
  // Suppress auto-save while a session is being loaded/restored.
  const suspendAutoSaveRef = React.useRef(true);

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
    // Gate: only run the reset/detect path when the sheet IDENTITY actually
    // changes (different path or sheet-name). This prevents a session-resume
    // setSheet(loaded) call from wiping the freshly-restored send state.
    const key = sheet ? `${sheet.path}::${sheet.sheetName}` : null;
    if (prevSheetKeyRef.current === key) return;
    prevSheetKeyRef.current = key;

    // Reset every send-step artifact whenever the campaign's source sheet changes.
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

  const sessionChip = activeSessionId ? (
    <SessionMenu
      activeId={activeSessionId}
      activeName={activeSessionName}
      sessions={sessions}
      onRename={(n) => void renameActiveSession(n)}
      onSwitch={(id) => void switchToSession(id)}
      onNew={() => void startNewSession()}
      onDelete={() => void deleteActiveSession()}
    />
  ) : null;

  const headerSlot = (
    <>
      {sessionChip}
      {versionPill}
      {statusPill}
    </>
  );

  // ---- Session management ----

  const buildSessionDoc = React.useCallback(
    (): SessionDoc => ({
      schemaVersion: 1,
      id: activeSessionId ?? "",
      name: activeSessionName,
      activeStep: step,
      sheetRef: sheet
        ? {
            path: sheet.path,
            sheetName: sheet.sheetName,
            availableSheets: sheet.availableSheets,
            columns: sheet.columns,
            rowCount: sheet.rows.length,
          }
        : null,
      template,
      subject,
      cc,
      rules,
      attachmentsFolder,
      fixed,
      emailColumn,
      nameColumn,
      deferMissing,
      sendStatus,
      sendErrors,
      logEntries,
      sendDupHits,
      sendDupErrors,
    }),
    [
      activeSessionId, activeSessionName, step, sheet, template, subject, cc, rules,
      attachmentsFolder, fixed, emailColumn, nameColumn, deferMissing,
      sendStatus, sendErrors, logEntries, sendDupHits, sendDupErrors,
    ]
  );

  const applySessionDoc = React.useCallback(async (doc: SessionDoc) => {
    suspendAutoSaveRef.current = true;
    setActiveSessionName(doc.name || "Untitled campaign");
    // Pre-seed prevSheetKey so the sheet-change effect treats the incoming
    // sheet as unchanged and does NOT reset send state.
    if (doc.sheetRef) {
      prevSheetKeyRef.current = `${doc.sheetRef.path}::${doc.sheetRef.sheetName}`;
    } else {
      prevSheetKeyRef.current = null;
    }
    // Apply the cheap fields first.
    setStep(doc.activeStep ?? "sheet");
    setTemplate(doc.template ?? DEFAULT_TEMPLATE);
    setSubject(doc.subject ?? DEFAULT_SUBJECT);
    setCc(doc.cc ?? []);
    setRules(doc.rules ?? {
      pattern: DEFAULT_PATTERN, caseInsensitive: true, fuzzy: true, required: false,
    });
    setAttachmentsFolder(doc.attachmentsFolder ?? null);
    setFixed(doc.fixed ?? []);
    setEmailColumn(doc.emailColumn ?? null);
    setNameColumn(doc.nameColumn ?? null);
    setDeferMissing(doc.deferMissing ?? true);
    setSendStatus(doc.sendStatus ?? []);
    setSendErrors(doc.sendErrors ?? {});
    setSendDupHits(doc.sendDupHits ?? null);
    setSendDupErrors(doc.sendDupErrors ?? []);
    setLogEntries(doc.logEntries ?? []);

    // Re-load the sheet in the background. If row count / columns diverge
    // from what the session expects, clear send state — stale indices would
    // point at different rows.
    if (doc.sheetRef) {
      try {
        const loaded = await ipc.loadSpreadsheet(doc.sheetRef.path, doc.sheetRef.sheetName);
        const rowsMatch = loaded.rows.length === doc.sheetRef.rowCount;
        const colsMatch = loaded.columns.join("|") === doc.sheetRef.columns.join("|");
        setSheet(loaded);
        if (!rowsMatch || !colsMatch) {
          setSendStatus([]);
          setSendErrors({});
          setSendDupHits(null);
          setSendDupErrors([]);
        }
      } catch {
        setSheet(null);
      }
    } else {
      setSheet(null);
    }

    // Release auto-save on the next macrotask so any cascading state updates
    // land first and don't each trigger a save.
    setTimeout(() => {
      suspendAutoSaveRef.current = false;
    }, 0);
  }, []);

  const refreshSessionList = React.useCallback(async () => {
    try {
      const list = await ipc.listSessions();
      setSessions(list);
    } catch (e) {
      console.error("list sessions:", e);
    }
  }, []);

  const openSession = React.useCallback(async (id: string) => {
    try {
      const doc = await ipc.loadSession(id);
      setActiveSessionId(id);
      await applySessionDoc(doc);
      setSessionStage("ready");
    } catch (e) {
      console.error("load session:", e);
    }
  }, [applySessionDoc]);

  const startNewSession = React.useCallback(async () => {
    try {
      suspendAutoSaveRef.current = true;
      const meta = await ipc.createSession("Untitled campaign");
      setActiveSessionId(meta.id);
      setActiveSessionName(meta.name);
      setSessions((prev) => [...prev, meta]);
      // Reset all campaign-scoped state to defaults
      prevSheetKeyRef.current = null;
      setStep("sheet");
      setSheet(null);
      setTemplate(DEFAULT_TEMPLATE);
      setSubject(DEFAULT_SUBJECT);
      setCc([]);
      setRules({ pattern: DEFAULT_PATTERN, caseInsensitive: true, fuzzy: true, required: false });
      setAttachmentsFolder(null);
      setFixed([]);
      setEmailColumn(null);
      setNameColumn(null);
      setDeferMissing(true);
      setSendStatus([]);
      setSendErrors({});
      setSendDupHits(null);
      setSendDupErrors([]);
      setLogEntries([]);
      lastSeedRef.current = {
        template: DEFAULT_TEMPLATE,
        subject: DEFAULT_SUBJECT,
        pattern: DEFAULT_PATTERN,
      };
      setSessionStage("ready");
      setTimeout(() => { suspendAutoSaveRef.current = false; }, 0);
    } catch (e) {
      console.error("create session:", e);
    }
  }, []);

  const renameActiveSession = React.useCallback(async (name: string) => {
    if (!activeSessionId) return;
    try {
      await ipc.renameSession(activeSessionId, name);
      setActiveSessionName(name);
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, name } : s)));
    } catch (e) {
      console.error("rename session:", e);
    }
  }, [activeSessionId]);

  const deleteActiveSession = React.useCallback(async () => {
    if (!activeSessionId) return;
    const id = activeSessionId;
    try {
      await ipc.deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (remaining.length === 0) {
        await startNewSession();
      } else {
        await openSession(remaining[0].id);
      }
    } catch (e) {
      console.error("delete session:", e);
    }
  }, [activeSessionId, sessions, openSession, startNewSession]);

  const switchToSession = React.useCallback(async (id: string) => {
    // Flush any pending save on the current session before switching would be
    // ideal; simpler: suspend auto-save, load new, resume.
    suspendAutoSaveRef.current = true;
    await openSession(id);
  }, [openSession]);

  // Boot: after config + currentUser rehydration, pick/create/show-picker
  React.useEffect(() => {
    if (!bootDone) return;
    if (config && !config.present) return; // SetupScreen handles this
    let cancelled = false;
    (async () => {
      try {
        const list = await ipc.listSessions();
        if (cancelled) return;
        setSessions(list);
        if (list.length === 0) {
          await startNewSession();
        } else if (list.length === 1) {
          await openSession(list[0].id);
        } else {
          setSessionStage("picking");
        }
      } catch (e) {
        console.error("boot sessions:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootDone, config, openSession, startNewSession]);

  // Debounced auto-save
  React.useEffect(() => {
    if (sessionStage !== "ready") return;
    if (!activeSessionId) return;
    if (suspendAutoSaveRef.current) return;
    const doc = buildSessionDoc();
    const timer = setTimeout(() => {
      ipc
        .saveSession(activeSessionId, doc)
        .then((meta) => {
          setSessions((prev) => {
            const next = [...prev];
            const i = next.findIndex((s) => s.id === meta.id);
            if (i >= 0) next[i] = meta;
            return next;
          });
        })
        .catch((e) => console.warn("save session:", e));
    }, 500);
    return () => clearTimeout(timer);
  }, [buildSessionDoc, sessionStage, activeSessionId]);

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

  if (sessionStage === "picking") {
    return (
      <SessionPicker
        sessions={sessions}
        onPick={(id) => void openSession(id)}
        onNew={() => void startNewSession()}
        onDelete={async (id) => {
          try {
            await ipc.deleteSession(id);
            await refreshSessionList();
          } catch (e) {
            console.error("delete session:", e);
          }
        }}
        rightSlot={
          <>
            {versionPill}
            {statusPill}
          </>
        }
      />
    );
  }

  if (sessionStage === "booting") {
    return (
      <WindowChrome rightSlot={<>{versionPill}{statusPill}</>}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
          <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>Loading your session…</div>
        </div>
      </WindowChrome>
    );
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
