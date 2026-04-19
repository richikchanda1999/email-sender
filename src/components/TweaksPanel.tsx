import React from "react";

export function TweaksPanel({
  density,
  setDensity,
  layout,
  setLayout,
}: {
  density: "cozy" | "compact";
  setDensity: (v: "cozy" | "compact") => void;
  layout: "sidebar" | "stepper";
  setLayout: (v: "sidebar" | "stepper") => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 999,
        width: 260,
        padding: "18px 20px",
        background: "#FBF5EA",
        border: "1px solid rgba(59,50,43,0.2)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(59,50,43,0.25)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 15,
          color: "#3B322B",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Tweaks
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#A89682", textTransform: "uppercase", letterSpacing: 1 }}>live</span>
      </div>

      <TweakGroup label="Density">
        <TweakSegment
          value={density}
          onChange={(v) => setDensity(v as "cozy" | "compact")}
          options={[
            { value: "compact", label: "Compact" },
            { value: "cozy", label: "Cozy" },
          ]}
        />
      </TweakGroup>

      <TweakGroup label="Layout variation">
        <TweakSegment
          value={layout}
          onChange={(v) => setLayout(v as "sidebar" | "stepper")}
          options={[
            { value: "sidebar", label: "Sidebar" },
            { value: "stepper", label: "Stepper" },
          ]}
        />
      </TweakGroup>
    </div>
  );
}

function TweakGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "#7A6A59", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function TweakSegment({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        padding: 3,
        borderRadius: 999,
        background: "#F2E9D8",
        border: "1px solid rgba(59,50,43,0.1)",
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            all: "unset",
            cursor: "pointer",
            flex: 1,
            padding: "6px 10px",
            textAlign: "center",
            background: value === o.value ? "#FBF5EA" : "transparent",
            borderRadius: 999,
            fontSize: 12,
            color: value === o.value ? "#3B322B" : "#7A6A59",
            fontWeight: value === o.value ? 500 : 400,
            boxShadow: value === o.value ? "0 1px 2px rgba(59,50,43,0.08)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
