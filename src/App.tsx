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
  DEFAULT_TEMPLATE,
  DEFAULT_SUBJECT,
} from "./data";
import { CanvasTopBar } from "./primitives";
import { WindowChrome } from "./components/WindowChrome";
import { Sidebar } from "./components/Sidebar";
import { StepRouter, AppState, AppSetters } from "./components/VariationB";
import { SetupScreen } from "./components/SetupScreen";
import { ipc } from "./ipc";

const DENSITY = "cozy" as const;

export default function App() {
  const [config, setConfig] = React.useState<ConfigStatus | null>(null);
  const [bootDone, setBootDone] = React.useState(false);

  const [step, setStep] = React.useState<StepKey>("sheet");
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [template, setTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [subject, setSubject] = React.useState(DEFAULT_SUBJECT);
  const [cc, setCc] = React.useState<string[]>([]);
  const [rules, setRules] = React.useState<Rules>({
    pattern: "Invoice-{{InvoiceNumber}}-{{ClientName}}.pdf",
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

  // Auto-detect recipient columns when the sheet (or its columns) changes.
  React.useEffect(() => {
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

  const resetAll = () => {
    setStep("sheet");
    setSheet(null);
    setTemplate(DEFAULT_TEMPLATE);
    setSubject(DEFAULT_SUBJECT);
    setCc([]);
    setAttachmentsFolder(null);
    setResolved([]);
    setFixed([]);
    setLogEntries([]);
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
    resetAll,
  };

  if (!bootDone) {
    return (
      <WindowChrome>
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
    <WindowChrome>
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
