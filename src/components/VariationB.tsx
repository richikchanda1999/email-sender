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
  rowRecord,
  resolveTokens,
} from "../data";
import { Pill } from "../primitives";
import { ArchDivider } from "./WindowChrome";
import { IconPaperclip } from "../icons";
import { StepSheet } from "./StepSheet";
import { StepTemplate } from "./StepTemplate";
import { StepAttachments } from "./StepAttachments";
import { StepAuth } from "./StepAuth";
import { StepSend } from "./StepSend";

export type AppState = {
  step: StepKey;
  sheet: Sheet | null;
  template: string;
  subject: string;
  cc: string[];
  rules: Rules;
  attachmentsFolder: string | null;
  resolved: ResolvedAttachment[];
  fixed: FixedFile[];
  authState: AuthState;
  user: GoogleUser | null;
  logEntries: LogEntry[];
  emailColumn: string | null;
  nameColumn: string | null;
};

export type AppSetters = {
  setStep: React.Dispatch<React.SetStateAction<StepKey>>;
  setSheet: React.Dispatch<React.SetStateAction<Sheet | null>>;
  setTemplate: React.Dispatch<React.SetStateAction<string>>;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  setCc: React.Dispatch<React.SetStateAction<string[]>>;
  setRules: React.Dispatch<React.SetStateAction<Rules>>;
  setAttachmentsFolder: React.Dispatch<React.SetStateAction<string | null>>;
  setResolved: React.Dispatch<React.SetStateAction<ResolvedAttachment[]>>;
  setFixed: React.Dispatch<React.SetStateAction<FixedFile[]>>;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  setUser: React.Dispatch<React.SetStateAction<GoogleUser | null>>;
  setLogEntries: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  setEmailColumn: React.Dispatch<React.SetStateAction<string | null>>;
  setNameColumn: React.Dispatch<React.SetStateAction<string | null>>;
  resetAll: () => void;
};

export function VariationB({ state, setters, density }: { state: AppState; setters: AppSetters; density: "cozy" | "compact" }) {
  const { step } = state;
  const { setStep } = setters;
  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div
        style={{
          padding: "20px 40px 0",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16 }}>
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const done = i < idx;
            return (
              <React.Fragment key={s.key}>
                <button
                  onClick={() => setStep(s.key)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 4px",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      border: "1px solid " + (active || done ? "var(--terracotta)" : "var(--line-strong)"),
                      background: done ? "var(--terracotta)" : "var(--bg)",
                      color: done ? "#fff" : active ? "var(--terracotta)" : "var(--ink-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Fraunces, serif",
                      fontSize: 12,
                    }}
                  >
                    {done ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "Fraunces, serif",
                      fontSize: 14,
                      color: active ? "var(--ink)" : "var(--ink-dim)",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {s.label}
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      margin: "0 16px",
                      background: i < idx ? "var(--terracotta)" : "var(--line-strong)",
                      opacity: i < idx ? 0.5 : 1,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          <StepRouter state={state} setters={setters} density={density} />
        </div>
        <LivePreviewPane state={state} />
      </div>
    </div>
  );
}

function LivePreviewPane({ state }: { state: AppState }) {
  const row = state.sheet ? rowRecord(state.sheet, 0) : null;
  const resolve = (t: string) => (row ? resolveTokens(t, row) : t);
  return (
    <div
      style={{
        width: 380,
        borderLeft: "1px solid var(--line)",
        background: "var(--panel-soft)",
        padding: "24px 22px",
        overflow: "auto",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)", marginBottom: 4 }}>
        Live preview {row ? "· row 1" : ""}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
        {row ? `${row.ClientName ?? ""} · ${row.CompanyName ?? ""}` : "Load a spreadsheet to preview"}
      </div>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1 }}>Subject</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "var(--ink)", marginTop: 4 }}>{resolve(state.subject)}</div>
        <div style={{ margin: "14px 0" }}>
          <ArchDivider width={120} />
        </div>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 13,
            lineHeight: 1.75,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
          }}
        >
          {resolve(state.template).slice(0, 360)}…
        </div>
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px dashed var(--line-strong)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <Pill tone="sand">
            <IconPaperclip size={10} />
            {resolve(state.rules.pattern).slice(0, 24)}…
          </Pill>
          {state.fixed.slice(0, 2).map((f) => (
            <Pill key={f.path}>{f.name.slice(0, 18)}…</Pill>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StepRouter({ state, setters, density }: { state: AppState; setters: AppSetters; density: "cozy" | "compact" }) {
  const { step } = state;

  if (step === "sheet")
    return <StepSheet sheet={state.sheet} setSheet={setters.setSheet} density={density} />;
  if (step === "template")
    return (
      <StepTemplate
        sheet={state.sheet}
        template={state.template}
        setTemplate={setters.setTemplate}
        subject={state.subject}
        setSubject={setters.setSubject}
        cc={state.cc}
        setCc={setters.setCc}
        emailColumn={state.emailColumn}
        setEmailColumn={setters.setEmailColumn}
        nameColumn={state.nameColumn}
        setNameColumn={setters.setNameColumn}
        density={density}
      />
    );
  if (step === "attachments")
    return (
      <StepAttachments
        sheet={state.sheet}
        rules={state.rules}
        setRules={setters.setRules}
        folder={state.attachmentsFolder}
        setFolder={setters.setAttachmentsFolder}
        resolved={state.resolved}
        setResolved={setters.setResolved}
        fixed={state.fixed}
        setFixed={setters.setFixed}
        density={density}
      />
    );
  if (step === "auth")
    return (
      <StepAuth
        authState={state.authState}
        setAuthState={setters.setAuthState}
        user={state.user}
        setUser={setters.setUser}
        density={density}
      />
    );
  if (step === "send")
    return (
      <StepSend
        sheet={state.sheet}
        template={state.template}
        subject={state.subject}
        cc={state.cc}
        rules={state.rules}
        resolved={state.resolved}
        fixed={state.fixed}
        user={state.user}
        setUser={setters.setUser}
        setAuthState={setters.setAuthState}
        emailColumn={state.emailColumn}
        nameColumn={state.nameColumn}
        logEntries={state.logEntries}
        setLogEntries={setters.setLogEntries}
        onRestart={setters.resetAll}
        density={density}
      />
    );
  return null;
}
