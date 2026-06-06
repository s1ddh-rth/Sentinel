/* SENTINEL — shared auth page shell (navy split panel + form card) */
import React, { useState, useEffect } from "react";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export function AuthShell({ title, subtitle, children }) {
  const isMobile = useIsMobile(768);
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      {/* Brand panel — hidden on narrow screens so the form gets the full width */}
      {!isMobile && (
      <div style={{
        flex: "0 0 42%", background: "var(--color-bg-primary)", color: "var(--color-text-inverse)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "48px 44px", minWidth: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L20 6 L20 13 C20 17.5 16.5 21 12 22 C7.5 21 4 17.5 4 13 L4 6 Z"
              stroke="var(--color-accent)" strokeWidth="1.8" fill="rgba(42,127,142,0.18)" />
            <path d="M9 12 L11 14 L15 10" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "0.06em" }}>
            SENTINEL
          </div>
        </div>

        <div style={{ maxWidth: 380 }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, lineHeight: 1.25,
            margin: 0, letterSpacing: "-0.01em",
          }}>
            Fairness-aware recidivism risk assessment.
          </h2>
          <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.65, color: "var(--color-text-inverse-muted)" }}>
            Calibrated risk scoring and continuous fairness auditing — designed to support human
            decision-making, never to replace it.
          </p>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-inverse-muted)", letterSpacing: "0.04em" }}>
          Open-source · Apache 2.0 · all inference runs locally
        </div>
      </div>
      )}

      {/* Form panel */}
      <div style={{
        flex: 1, background: "var(--color-bg-content)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 32,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1 className="page-title" style={{ marginBottom: 6 }}>{title}</h1>
          {subtitle && <div className="label-secondary" style={{ marginBottom: 24 }}>{subtitle}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthField({ label, children }) {
  const autoId = React.useId();
  // Associate the label with the control for screen readers and click-to-focus.
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { id: children.props.id || autoId })
    : children;
  const htmlFor = React.isValidElement(child) ? child.props.id : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} style={{
        display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 6,
      }}>{label}</label>
      {child}
    </div>
  );
}
