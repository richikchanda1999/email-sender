import React from "react";
import { STEPS, StepKey } from "../data";
import { ArchDivider } from "./WindowChrome";

export function Sidebar({
  currentStep,
  goTo,
  stepState,
  density,
}: {
  currentStep: StepKey;
  goTo: (k: StepKey) => void;
  stepState: Record<StepKey, "done" | "">;
  density: "cozy" | "compact";
}) {
  const cozy = density === "cozy";
  return (
    <div
      style={{
        width: cozy ? 260 : 220,
        background: "var(--panel)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        padding: cozy ? "28px 22px" : "22px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: cozy ? 22 : 19,
          fontWeight: 400,
          letterSpacing: -0.3,
          color: "var(--ink)",
        }}
      >
        New campaign
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 4 }}>April · invoices</div>
      <div style={{ margin: cozy ? "22px 0 18px" : "16px 0 12px" }}>
        <ArchDivider width={cozy ? 216 : 184} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: cozy ? 4 : 2 }}>
        {STEPS.map((s, i) => {
          const active = s.key === currentStep;
          const done = stepState[s.key] === "done";
          return (
            <button
              key={s.key}
              onClick={() => goTo(s.key)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: cozy ? "10px 10px" : "8px 8px",
                borderRadius: 8,
                background: active ? "var(--panel-hi)" : "transparent",
              }}
            >
              <StepDot index={i + 1} active={active} done={done} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    fontSize: cozy ? 14 : 13,
                    fontWeight: active ? 500 : 400,
                    color: active ? "var(--ink)" : "var(--ink-dim)",
                    fontFamily: "Fraunces, serif",
                    letterSpacing: 0.1,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{s.hint}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ margin: cozy ? "0 0 14px" : "0 0 10px" }}>
        <ArchDivider width={cozy ? 216 : 184} />
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-soft)",
          lineHeight: 1.6,
          fontStyle: "italic",
          fontFamily: "Fraunces, serif",
        }}
      >
        "Sent slowly, one by one —<br />
        so every name keeps its weight."
      </div>
    </div>
  );
}

function StepDot({ index, active, done }: { index: number; active: boolean; done: boolean }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        border: "1px solid " + (active || done ? "var(--terracotta)" : "var(--line-strong)"),
        background: done ? "var(--terracotta)" : active ? "var(--bg)" : "transparent",
        color: done ? "#fff" : active ? "var(--terracotta)" : "var(--ink-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontFamily: "Fraunces, serif",
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      {done ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5L20 6" />
        </svg>
      ) : (
        index
      )}
    </div>
  );
}
