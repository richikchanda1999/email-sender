import React from "react";
import { AuthState, GoogleUser } from "../data";
import { StepShell, Pill, primaryBtn, ghostBtn } from "../primitives";
import { ArchDivider } from "./WindowChrome";
import { IconKey, IconCheck } from "../icons";
import { ipc } from "../ipc";

export function StepAuth({
  authState,
  setAuthState,
  user,
  setUser,
  density,
}: {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  user: GoogleUser | null;
  setUser: React.Dispatch<React.SetStateAction<GoogleUser | null>>;
  density: "cozy" | "compact";
}) {
  const cozy = density === "cozy";
  const [error, setError] = React.useState<string | null>(null);

  const connect = async () => {
    setError(null);
    setAuthState("connecting");
    try {
      const u = await ipc.startGoogleAuth();
      setUser(u);
      setAuthState("connected");
    } catch (e: any) {
      setAuthState("idle");
      setError(typeof e === "string" ? e : e?.message ?? "sign-in failed");
    }
  };

  const signOut = async () => {
    try {
      await ipc.signOut();
    } catch (e) {
      console.error("sign_out:", e);
    }
    setUser(null);
    setAuthState("idle");
  };

  if (authState === "connected" && user) {
    const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase() || "·";
    return (
      <StepShell title="Gmail connected" sub="Ready to send from your account." density={density}>
        <div
          style={{
            marginTop: 22,
            padding: "28px 28px",
            background: "var(--bg)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <Avatar letter={initial} picture={user.picture} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, color: "var(--ink)" }}>{user.name || user.email}</div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 3 }}>{user.email}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Pill tone="sage">
                <IconCheck size={10} />
                gmail.send
              </Pill>
              <Pill tone="sage">
                <IconCheck size={10} />
                profile · email
              </Pill>
              <Pill>oauth 2.0 · pkce</Pill>
            </div>
          </div>
          <button onClick={signOut} style={ghostBtn()}>
            Sign out
          </button>
        </div>

        <div
          style={{
            marginTop: 22,
            padding: "20px 24px",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 14,
          }}
        >
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "var(--ink)", marginBottom: 10 }}>A few things before sending</div>
          <Check text={`Emails send from ${user.email}`} done />
          <Check text="Each row pauses for your confirmation first" done />
          <Check text="Respect Gmail's 500 emails/day limit" done />
          <Check text="Failed rows can be retried at the end" />
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell title="Connect Gmail" sub="Letterpress needs permission to send email on your behalf." density={density}>
      <div
        style={{
          marginTop: 26,
          padding: cozy ? "44px 40px" : "36px 32px",
          background: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--panel)",
            border: "1px solid var(--line-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {authState === "connecting" ? <Spinner /> : <IconKey size={26} stroke="var(--terracotta)" />}
        </div>
        <ArchDivider width={120} />
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, color: "var(--ink)" }}>
          {authState === "connecting" ? "Waiting for the browser…" : "Sign in with Google"}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", maxWidth: 420, lineHeight: 1.7 }}>
          A secure window will open in your browser. Letterpress only asks for <em>gmail.send</em> plus basic profile — never reads your inbox, never stores your password.
        </div>
        <button
          onClick={connect}
          disabled={authState === "connecting"}
          style={{
            ...primaryBtn({ wide: true }),
            opacity: authState === "connecting" ? 0.6 : 1,
          }}
        >
          <GoogleG /> Continue with Google
        </button>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(196,98,63,0.08)",
              border: "1px solid rgba(196,98,63,0.35)",
              color: "var(--terracotta)",
              fontSize: 12.5,
              maxWidth: 480,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 4,
            fontSize: 11,
            color: "var(--ink-soft)",
          }}
        >
          <span>OAuth 2.0 · PKCE</span>
          <span>·</span>
          <span>Tokens stored in macOS Keychain</span>
          <span>·</span>
          <span>Revoke anytime</span>
        </div>
      </div>
    </StepShell>
  );
}

export function Avatar({ letter, picture }: { letter: string; picture?: string | null }) {
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          objectFit: "cover",
          border: "1px solid var(--line)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #C8A989 0%, #A98467 100%)",
        color: "#FBF5EA",
        fontFamily: "Fraunces, serif",
        fontSize: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {letter}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.2-2 3.4-5 3.4-8.3z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.4 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 21.4 7.5 24 12 24z" />
      <path fill="#FBBC04" d="M5.5 14.7c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2v-3H1.7C.9 8.9.5 10.4.5 12s.4 3.1 1.2 4.7l3.8-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.5 0 3.6 2.6 1.7 6.3l3.8 3C6.4 6.7 9 4.8 12 4.8z" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="11" stroke="var(--line-strong)" strokeWidth="2" fill="none" />
      <path d="M14 3 A11 11 0 0 1 25 14" stroke="var(--terracotta)" strokeWidth="2" fill="none" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 14 14" to="360 14 14" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function Check({ text, done }: { text: string; done?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          border: "1px solid " + (done ? "var(--sage)" : "var(--line-strong)"),
          background: done ? "var(--sage)" : "transparent",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 12.5, color: done ? "var(--ink)" : "var(--ink-dim)" }}>{text}</span>
    </div>
  );
}
