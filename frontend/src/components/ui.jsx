/* SENTINEL — Shared UI components (ported from prototype components.jsx) */
import React, { useState, useEffect } from "react";

// Inline SVG icon set (lucide-style strokes)
const ICON_PATHS = {
  FileSearch: '<circle cx="11.5" cy="14.5" r="2.5"/><path d="m13.5 16.5 2.5 2.5"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  BarChart3: '<path d="M3 3v18h18"/><path d="M7 16V8"/><path d="M12 16v-5"/><path d="M17 16v-9"/>',
  MessageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  ScrollText: '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  ChevronLeft: '<path d="m15 18-6-6 6-6"/>',
  ChevronUp: '<path d="m18 15-6-6-6 6"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  ChevronsUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  CheckCircle2: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  Info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  AlertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  Download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  Calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  Columns3: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  SlidersHorizontal: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  Bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  GitCompare: '<circle cx="5" cy="6" r="3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/><circle cx="19" cy="18" r="3"/><path d="M12 18H7a2 2 0 0 1-2-2V9"/>',
  Loader2: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  FileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  ExternalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  Share2: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  Settings2: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  ThumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.5-9c.83 0 1.5.67 1.5 1.5z"/>',
  ThumbsDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.5 9c-.83 0-1.5-.67-1.5-1.5z"/>',
  Copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  HelpCircle: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  LogOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  Menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  RefreshCw: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  Eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  EyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  LogIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
};

export const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.75, style, className }) => {
  const d = ICON_PATHS[name] || ICON_PATHS.HelpCircle;
  // Loader2 always spins; icons are decorative (buttons that use them carry their own label).
  const cls = [name === "Loader2" ? "spin" : "", className].filter(Boolean).join(" ") || undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
      className={cls}
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
      dangerouslySetInnerHTML={{ __html: d }} />
  );
};

// ---------- Risk Badge ----------
export function RiskBadge({ band, size = "sm" }) {
  const cls = band ? band.toLowerCase() : "neutral";
  const style = size === "lg" ? { fontSize: 12, padding: "3px 10px" } : null;
  return <span className={`risk-badge ${cls}`} style={style}>{band}</span>;
}

// ---------- MetricCard ----------
export function MetricCard({ label, value, delta, deltaDir, suffix, context, mono = true, large = false }) {
  const deltaColor = deltaDir === "up" ? "var(--color-risk-low)" :
    deltaDir === "down" ? "var(--color-risk-high)" :
    "var(--color-text-tertiary)";
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--color-text-secondary)"
        }}>{label}</div>
        {delta != null && (
          <div style={{ fontSize: 12, color: deltaColor, fontWeight: 500, fontFamily: "var(--font-mono)" }}>
            {deltaDir === "up" ? "▲" : deltaDir === "down" ? "▼" : "·"} {delta}
          </div>
        )}
      </div>
      <div className="mono" style={{
        fontSize: large ? 32 : 26, fontWeight: 600,
        color: "var(--color-text-primary)", marginTop: 6, letterSpacing: "-0.01em",
      }}>
        {value}{suffix && <span style={{ fontSize: large ? 18 : 14, color: "var(--color-text-secondary)", marginLeft: 2 }}>{suffix}</span>}
      </div>
      {context && (
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
          {context}
        </div>
      )}
    </div>
  );
}

// ---------- Risk Gauge ----------
export function RiskGauge({ score, ci }) {
  const W = 320, H = 200;
  const cx = W / 2, cy = 170, r = 130;
  const angle = (s) => -180 + s * 180;
  const polar = (deg, rad = r) => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  };
  const arcPath = (a0, a1, rr = r) => {
    const [x0, y0] = polar(a0, rr);
    const [x1, y1] = polar(a1, rr);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1}`;
  };

  const segs = [
    { from: -180, to: -126, color: "var(--color-risk-low)" },
    { from: -126, to: -54, color: "var(--color-risk-medium)" },
    { from: -54, to: 0, color: "var(--color-risk-high)" },
  ];

  const ciA0 = angle(ci[0]);
  const ciA1 = angle(ci[1]);

  const needleA = angle(score);
  const [nx, ny] = polar(needleA, r - 10);
  const band = score < 0.3 ? "LOW" : score < 0.6 ? "MEDIUM" : "HIGH";
  const bandColor = band === "LOW" ? "var(--color-risk-low)" :
    band === "MEDIUM" ? "var(--color-risk-medium)" : "var(--color-risk-high)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={arcPath(-180, 0)} fill="none" stroke="var(--color-bg-elevated)" strokeWidth="22" strokeLinecap="butt" />
        {segs.map((s, i) => (
          <path key={i} d={arcPath(s.from, s.to)} fill="none" stroke={s.color} strokeWidth="22" strokeLinecap="butt" opacity={0.85} />
        ))}
        <path d={arcPath(ciA0, ciA1)} fill="none" stroke="var(--color-text-primary)" strokeWidth="22" strokeLinecap="butt" opacity={0.12} />
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const a = angle(t);
          const [x0, y0] = polar(a, r - 14);
          const [x1, y1] = polar(a, r - 24);
          const [lx, ly] = polar(a, r - 38);
          return (
            <g key={i}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-text-tertiary)" strokeWidth="1" />
              <text x={lx} y={ly + 4} textAnchor="middle" fontSize="10" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--color-text-primary)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="var(--color-text-primary)" />
        <circle cx={cx} cy={cy} r="2.5" fill="var(--color-bg-card)" />
      </svg>
      <div style={{ marginTop: -28, textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {score.toFixed(2)}
        </div>
        <div style={{ marginTop: 4, color: bandColor, fontWeight: 600, fontSize: 13, letterSpacing: "0.08em" }}>
          {band} RISK
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-tertiary)" }}>
          90% conformal interval: <span className="mono">{ci[0].toFixed(2)} – {ci[1].toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- SHAP horizontal bars ----------
export function ShapChart({ data }) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.contribution)));
  const sorted = [...data].sort((a, b) => b.contribution - a.contribution);
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6,
        fontFamily: "var(--font-mono)", letterSpacing: "0.04em"
      }}>
        <span>← decreases risk</span>
        <span>increases risk →</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((d, i) => {
          const pos = d.contribution >= 0;
          const widthPct = (Math.abs(d.contribution) / maxAbs) * 48;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr 50px", alignItems: "center", gap: 10, height: 22 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.feature}
              </div>
              <div style={{ position: "relative", height: 16, display: "flex" }}>
                <div style={{ width: "50%", display: "flex", justifyContent: "flex-end", paddingRight: 0 }}>
                  {!pos && (
                    <div style={{
                      width: `${widthPct / 0.48}%`, height: "100%",
                      background: "var(--color-risk-low)", opacity: 0.65,
                      borderRight: `1.5px solid var(--color-risk-low)`,
                    }} />
                  )}
                </div>
                <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--color-border-strong)" }} />
                <div style={{ width: "50%" }}>
                  {pos && (
                    <div style={{
                      width: `${widthPct / 0.48}%`, height: "100%",
                      background: "var(--color-risk-high)", opacity: 0.65,
                      borderLeft: `1.5px solid var(--color-risk-high)`,
                    }} />
                  )}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "right" }}>
                {pos ? "+" : ""}{d.contribution.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Line chart ----------
export function LineChart({ data, xKey, series, width = 600, height = 220, yDomain, yTicks = 4, xTicksEvery = 1, areaKey, refLines = [] }) {
  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const xs = data.map(d => d[xKey]);
  const isNumX = typeof xs[0] === "number";
  const allY = series.flatMap(s => data.map(d => d[s.key])).filter(v => v != null);
  const yMin = yDomain ? yDomain[0] : Math.min(...allY);
  const yMax = yDomain ? yDomain[1] : Math.max(...allY);
  const yRange = yMax - yMin || 1;
  const xPos = (i) => (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const yPos = (v) => h - ((v - yMin) / yRange) * h;

  const lineFor = (key) => data.map((d, i) => `${i === 0 ? "M" : "L"} ${xPos(i)} ${yPos(d[key])}`).join(" ");
  const areaFor = (key) => `${lineFor(key)} L ${xPos(data.length - 1)} ${h} L ${xPos(0)} ${h} Z`;

  const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * yRange);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: "visible" }}>
      <g transform={`translate(${padding.left}, ${padding.top})`}>
        {yGrid.map((v, i) => (
          <g key={i}>
            <line x1={0} x2={w} y1={yPos(v)} y2={yPos(v)} stroke="var(--color-divider)" strokeDasharray="3 3" />
            <text x={-8} y={yPos(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-secondary)" fontFamily="var(--font-mono)">
              {Number.isInteger(v) ? v : v.toFixed(2)}
            </text>
          </g>
        ))}
        {refLines.map((r, i) => (
          <g key={i}>
            <line x1={0} x2={w} y1={yPos(r.value)} y2={yPos(r.value)} stroke={r.color || "var(--color-warning)"} strokeDasharray="4 4" strokeWidth="1.2" />
            {r.label && (
              <text x={w - 4} y={yPos(r.value) - 4} textAnchor="end" fontSize="10" fill={r.color || "var(--color-warning)"} fontFamily="var(--font-mono)">
                {r.label}
              </text>
            )}
          </g>
        ))}
        {data.map((d, i) => (
          (i % xTicksEvery === 0) && (
            <text key={i} x={xPos(i)} y={h + 18} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">
              {isNumX ? d[xKey].toFixed(2) : d[xKey]}
            </text>
          )
        ))}
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--color-border-strong)" />
        <line x1={0} x2={0} y1={0} y2={h} stroke="var(--color-border-strong)" />
        {series.map((s, i) => (
          <g key={i}>
            {areaKey === s.key && (
              <path d={areaFor(s.key)} fill={s.color} opacity="0.12" />
            )}
            <path d={lineFor(s.key)}
              fill="none" stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : "none"} />
            {s.label && (
              <text
                x={xPos(data.length - 1) + 6}
                y={yPos(data[data.length - 1][s.key]) + 4}
                fontSize="11" fill={s.color} fontFamily="var(--font-mono)">
                {s.label}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

// ---------- Grouped Bar Chart ----------
export function GroupedBarChart({ data, groups, width = 600, height = 240 }) {
  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const allVals = data.flatMap(d => groups.map(g => d[g.key]));
  const yMax = Math.max(...allVals) * 1.15;
  const groupWidth = w / data.length;
  const barWidth = (groupWidth - 16) / groups.length;
  const yPos = (v) => h - (v / yMax) * h;
  const yTicks = 4;
  const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => (i / yTicks) * yMax);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <g transform={`translate(${padding.left}, ${padding.top})`}>
        {yGrid.map((v, i) => (
          <g key={i}>
            <line x1={0} x2={w} y1={yPos(v)} y2={yPos(v)} stroke="var(--color-divider)" strokeDasharray="3 3" />
            <text x={-8} y={yPos(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-secondary)" fontFamily="var(--font-mono)">
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = i * groupWidth + 8;
          return (
            <g key={i}>
              {groups.map((g, j) => {
                const v = d[g.key];
                const bx = x0 + j * barWidth;
                return (
                  <g key={j}>
                    <rect x={bx} y={yPos(v)} width={barWidth - 4} height={h - yPos(v)}
                      fill={g.color} opacity="0.7" stroke={g.color} strokeWidth="1.2" />
                    <text x={bx + (barWidth - 4) / 2} y={yPos(v) - 4} textAnchor="middle"
                      fontSize="10" fill="var(--color-text-secondary)" fontFamily="var(--font-mono)">
                      {v.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text x={x0 + groupWidth / 2 - 8} y={h + 18} textAnchor="middle"
                fontSize="11" fill="var(--color-text-primary)">
                {d.group}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ---------- Graph Minimap ----------
export function GraphMinimap({ graph, height = 240 }) {
  const colors = {
    offender: "var(--color-accent)",
    offence: "var(--color-risk-high)",
    condition: "var(--color-risk-medium)",
    area: "var(--color-text-secondary)",
  };
  const W = 440;
  const H = height;
  const nodeMap = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ background: "var(--color-bg-elevated)", borderRadius: "var(--radius-sm)" }}>
      {graph.edges.map((e, i) => {
        const a = nodeMap[e.from], b = nodeMap[e.to];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-border-strong)" strokeWidth="1" />
            <text x={mx} y={my - 3} fontSize="9" fill="var(--color-text-tertiary)"
              textAnchor="middle" fontFamily="var(--font-mono)" style={{ pointerEvents: "none" }}>
              {e.label}
            </text>
          </g>
        );
      })}
      {graph.nodes.map((n, i) => {
        const isHub = n.type === "offender";
        const r = isHub ? 22 : 14;
        return (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={r} fill={colors[n.type]} opacity={isHub ? 1 : 0.85} stroke="var(--color-bg-card)" strokeWidth="2" />
            <text x={n.x} y={n.y + r + 12} textAnchor="middle" fontSize="11" fill="var(--color-text-primary)">
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Number count-up ----------
export function CountUp({ to, duration = 400, format = (v) => v.toFixed(2) }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return format(val);
}

// ---------- Avatar ----------
export function Avatar({ initials = "MA" }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: "var(--color-accent-subtle)", color: "var(--color-accent)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, fontSize: 12, letterSpacing: "0.04em",
      border: "1px solid var(--color-border)",
    }}>{initials}</div>
  );
}
