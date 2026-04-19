import React from "react";
import { STEPS, StepKey } from "./data";

export function StepShell({
  title,
  sub,
  children,
  density,
  wide,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  density: "cozy" | "compact";
  wide?: boolean;
}) {
  const cozy = density === "cozy";
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: cozy ? "36px 44px 60px" : "26px 32px 48px",
      }}
    >
      <div style={{ maxWidth: wide ? 1020 : 780, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: cozy ? 32 : 28,
            fontWeight: 400,
            letterSpacing: -0.5,
            color: "var(--ink)",
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "var(--ink-dim)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {sub}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function primaryBtn({ wide = false }: { wide?: boolean } = {}): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: wide ? "12px 22px" : "10px 18px",
    background: "var(--terracotta)",
    color: "#FBF5EA",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: 0.1,
  };
}

export function ghostBtn(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    border: "1px solid var(--line-strong)",
    color: "var(--ink)",
    borderRadius: 999,
    fontSize: 12.5,
    background: "var(--bg)",
  };
}

export function linkBtn(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    color: "var(--terracotta)",
    fontSize: 12.5,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    textDecorationColor: "rgba(169,132,103,0.4)",
  };
}

type Tone = "sand" | "sage" | "terra" | "ink";

export function Pill({ children, tone = "sand" }: { children: React.ReactNode; tone?: Tone }) {
  const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
    sand: { bg: "rgba(212,163,115,0.18)", fg: "#7A5A3C", border: "rgba(212,163,115,0.45)" },
    sage: { bg: "rgba(127,145,114,0.18)", fg: "#4F5F43", border: "rgba(127,145,114,0.45)" },
    terra: { bg: "rgba(169,132,103,0.18)", fg: "var(--terracotta)", border: "rgba(169,132,103,0.45)" },
    ink: { bg: "rgba(59,50,43,0.08)", fg: "var(--ink)", border: "rgba(59,50,43,0.2)" },
  };
  const t = tones[tone] || tones.sand;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

export function CanvasTopBar({
  step,
  totalSteps,
  onNext,
  onBack,
  canNext,
  nextLabel = "Continue",
}: {
  step: StepKey;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  nextLabel?: string;
}) {
  const idx = STEPS.findIndex((s) => s.key === step);
  return (
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          color: "var(--ink-soft)",
        }}
      >
        Step {idx + 1} <span style={{ opacity: 0.4, margin: "0 6px" }}>/</span> {totalSteps}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {idx > 0 && (
          <button onClick={onBack} style={ghostBtn()}>
            Back
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!canNext}
          style={{
            ...primaryBtn(),
            opacity: canNext ? 1 : 0.4,
            cursor: canNext ? "pointer" : "not-allowed",
          }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
