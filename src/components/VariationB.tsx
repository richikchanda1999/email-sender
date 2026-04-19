import React from "react";
import {
  StepKey,
  AuthState,
  Rules,
  FixedFile,
  Sheet,
  GoogleUser,
  ResolvedAttachment,
  LogEntry,
} from "../data";
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
