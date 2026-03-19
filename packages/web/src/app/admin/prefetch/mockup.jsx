import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis, ComposedChart,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — matching Exprsn admin dark theme (globals.css)
// ═══════════════════════════════════════════════════════════════════════════════
const T = {
  bg: "#0f0f0f", surface: "#1f1f1f", surfaceHover: "#292929",
  accent: "#f83b85", accentHover: "#ff5c9e", accentDim: "#f83b8530",
  textPrimary: "#f5f5f5", textSecondary: "#a3a3a3", textMuted: "#737373",
  border: "#2e2e2e", borderHover: "#404040",
  success: "#4ade80", warning: "#fbbf24", error: "#f87171", info: "#60a5fa",
  purple: "#a78bfa", teal: "#2dd4bf", orange: "#fb923c", pink: "#f472b6",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICON LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════
const svg = (d, w = 16) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const Icons = {
  Zap: () => svg(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  Database: () => svg(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>),
  Activity: () => svg(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />),
  Settings: () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  Shield: () => svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  Brain: () => svg(<><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" /></>),
  Layers: () => svg(<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  Clock: () => svg(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  ChevDown: () => svg(<polyline points="6 9 12 15 18 9" />, 14),
  ChevRight: () => svg(<polyline points="9 18 15 12 9 6" />, 14),
  Plus: () => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 14),
  Trash: () => svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14),
  Play: () => svg(<polygon points="5 3 19 12 5 21 5 3" />, 14),
  Pause: () => svg(<><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>, 14),
  AlertTri: () => svg(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, 14),
  Check: () => svg(<polyline points="20 6 9 17 4 12" />, 14),
  Refresh: () => svg(<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>, 14),
  Globe: () => svg(<><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>),
  Bell: () => svg(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  Map: () => svg(<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>),
  Beaker: () => svg(<><path d="M4.5 3h15" /><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" /><path d="M6 14h12" /></>),
  GitBranch: () => svg(<><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>),
  Share: () => svg(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>),
  Terminal: () => svg(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  Server: () => svg(<><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></>),
  Eye: () => svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>),
  Copy: () => svg(<><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 14),
  Users: () => svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  TrendUp: () => svg(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>),
  Lock: () => svg(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  Cpu: () => svg(<><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></>),
};

// ═══════════════════════════════════════════════════════════════════════════════
// REUSABLE UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════
function Badge({ children, color = T.textMuted, size = "sm" }) {
  const s = size === "xs" ? { p: "1px 6px", fs: 10 } : { p: "2px 8px", fs: 11 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: s.p, borderRadius: 9999, fontSize: s.fs, fontWeight: 600, background: `${color}18`, color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Toggle({ checked, onChange, disabled = false, size = "md" }) {
  const w = size === "sm" ? 36 : 44;
  const h = size === "sm" ? 20 : 24;
  const dot = size === "sm" ? 14 : 18;
  return (
    <button onClick={() => !disabled && onChange(!checked)}
      style={{ width: w, height: h, borderRadius: h / 2, border: "none", cursor: disabled ? "not-allowed" : "pointer", background: checked ? T.accent : T.borderHover, transition: "all 0.2s", position: "relative", opacity: disabled ? 0.5 : 1, flexShrink: 0 }}>
      <div style={{ width: dot, height: dot, borderRadius: dot / 2, background: "#fff", position: "absolute", top: (h - dot) / 2, left: checked ? w - dot - (h - dot) / 2 : (h - dot) / 2, transition: "left 0.2s" }} />
    </button>
  );
}

function Slider({ value, onChange, min = 0, max = 100, step = 1, label, unit = "", disabled = false, color = T.accent }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {label && <span style={{ fontSize: 13, color: T.textMuted, minWidth: 90, flexShrink: 0 }}>{label}</span>}
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ height: 4, borderRadius: 2, background: T.borderHover }}>
          <div style={{ height: 4, borderRadius: 2, background: disabled ? T.textMuted : color, width: `${pct}%`, transition: "width 0.1s" }} />
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled}
          style={{ position: "absolute", top: -6, left: 0, width: "100%", height: 16, opacity: 0, cursor: disabled ? "not-allowed" : "pointer" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>{value.toLocaleString()}{unit}</span>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, unit = "", width = 100 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 8px" }}>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width, background: "transparent", border: "none", color: T.textPrimary, fontSize: 13, fontFamily: "monospace", outline: "none", textAlign: "right" }} />
      {unit && <span style={{ fontSize: 11, color: T.textMuted }}>{unit}</span>}
    </div>
  );
}

function Select({ value, onChange, options, width = "auto" }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: "none", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 28px 6px 10px", color: T.textPrimary, fontSize: 13, cursor: "pointer", outline: "none", width, minWidth: 120 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.textMuted }}><Icons.ChevDown /></div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder = "", width = "100%", mono = false }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px", color: T.textPrimary, fontSize: 13, outline: "none", fontFamily: mono ? "monospace" : "inherit" }} />
  );
}

function Btn({ children, onClick, variant = "default", size = "md", icon, disabled = false }) {
  const variants = {
    default: { bg: T.surfaceHover, color: T.textPrimary, border: T.border },
    primary: { bg: T.accent, color: "#fff", border: T.accent },
    danger: { bg: `${T.error}15`, color: T.error, border: `${T.error}40` },
    ghost: { bg: "transparent", color: T.textMuted, border: "transparent" },
    success: { bg: `${T.success}15`, color: T.success, border: `${T.success}40` },
  };
  const v = variants[variant];
  const pad = size === "sm" ? "4px 10px" : size === "lg" ? "10px 20px" : "6px 14px";
  const fs = size === "sm" ? 12 : 13;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: pad, borderRadius: 8, border: `1px solid ${v.border}`, background: v.bg, color: v.color, fontSize: fs, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.15s", whiteSpace: "nowrap" }}>
      {icon}{children}
    </button>
  );
}

function Collapsible({ title, icon, badge, children, defaultOpen = false, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: open ? T.surfaceHover : T.surface, border: "none", cursor: "pointer", color: T.textPrimary, fontSize: 14, fontWeight: 600, transition: "background 0.15s" }}>
        <span style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s", display: "flex" }}><Icons.ChevRight /></span>
        {icon && <span style={{ display: "flex", color: T.accent }}>{icon}</span>}
        <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
        {badge}
        {actions && <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>{actions}</span>}
      </button>
      {open && <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, background: T.surface }}>{children}</div>}
    </div>
  );
}

function StatCard({ label, value, trend, icon, color = T.accent, subtitle }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <span style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}15`, color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.textPrimary, fontFamily: "monospace" }}>{value}</div>
      {trend !== undefined && <span style={{ fontSize: 12, color: trend >= 0 ? T.success : T.error, display: "block", marginTop: 2 }}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs. last hour</span>}
      {subtitle && <span style={{ fontSize: 11, color: T.textMuted, display: "block", marginTop: 2 }}>{subtitle}</span>}
    </div>
  );
}

function Tabs({ tabs: items, active, onChange, size = "md" }) {
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {items.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: size === "sm" ? "6px 12px" : "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: size === "sm" ? 12 : 13, fontWeight: 500, background: active === tab.id ? T.surface : "transparent", color: active === tab.id ? T.textPrimary : T.textMuted, borderBottom: active === tab.id ? `2px solid ${T.accent}` : "2px solid transparent", transition: "all 0.15s" }}>
          {tab.icon} {tab.label}
          {tab.count !== undefined && <Badge color={T.accent} size="xs">{tab.count}</Badge>}
        </button>
      ))}
    </div>
  );
}

function InfoBox({ children, variant = "info" }) {
  const colors = { info: T.info, warning: T.warning, success: T.success, error: T.error, accent: T.accent };
  const c = colors[variant];
  return (
    <div style={{ fontSize: 12, color: T.textMuted, padding: "10px 14px", background: `${c}10`, border: `1px solid ${c}30`, borderRadius: 8, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Card({ children, padding = 20 }) {
  return <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding }}>{children}</div>;
}

function SectionTitle({ children, description }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 14, fontWeight: 600, display: "block" }}>{children}</span>
      {description && <span style={{ fontSize: 13, color: T.textMuted, marginTop: 2, display: "block" }}>{description}</span>}
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, display: "block" }}>{label}</span>
        {description && <span style={{ fontSize: 12, color: T.textMuted }}>{description}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function MiniChart({ data, dataKey, color, height = 32, width = 80 }) {
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} /></LineChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════
function makeTimeSeries(points = 24) {
  const d = []; let base = 85;
  for (let i = 0; i < points; i++) {
    base += (Math.random() - 0.48) * 5; base = Math.max(60, Math.min(99, base));
    d.push({ time: `${String(i).padStart(2, "0")}:00`, hitRate: Math.round(base * 10) / 10, hotHits: ~~(Math.random() * 4000 + 2000), warmHits: ~~(Math.random() * 1500 + 500), coldHits: ~~(Math.random() * 400 + 100), misses: ~~(Math.random() * 600 + 200), prefetched: ~~(Math.random() * 800 + 400), latency: ~~(Math.random() * 40 + 10), p95: ~~(Math.random() * 80 + 30), p99: ~~(Math.random() * 150 + 60) });
  }
  return d;
}
function makeQueueData() { return Array.from({ length: 12 }, (_, i) => ({ time: `${String(i * 2).padStart(2, "0")}:00`, waiting: ~~(Math.random() * 80 + 10), active: ~~(Math.random() * 50 + 5), completed: ~~(Math.random() * 500 + 200), failed: ~~(Math.random() * 15) })); }

const EDGE_NODES = [
  { id: "us-east-1", name: "US East (Virginia)", lat: 39, lng: -77, status: "healthy", hitRate: 94.2, latency: 12, keys: 45200, load: 62 },
  { id: "us-west-2", name: "US West (Oregon)", lat: 44, lng: -120, status: "healthy", hitRate: 91.8, latency: 18, keys: 38100, load: 55 },
  { id: "eu-west-1", name: "EU West (Ireland)", lat: 53, lng: -8, status: "healthy", hitRate: 89.5, latency: 24, keys: 31400, load: 48 },
  { id: "eu-central-1", name: "EU Central (Frankfurt)", lat: 50, lng: 9, status: "degraded", hitRate: 78.3, latency: 45, keys: 28900, load: 81 },
  { id: "ap-southeast-1", name: "Asia Pacific (Singapore)", lat: 1, lng: 104, status: "healthy", hitRate: 86.1, latency: 32, keys: 22600, load: 43 },
  { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)", lat: 36, lng: 140, status: "healthy", hitRate: 92.0, latency: 15, keys: 35800, load: 58 },
  { id: "sa-east-1", name: "South America (São Paulo)", lat: -23, lng: -47, status: "warning", hitRate: 72.4, latency: 67, keys: 12300, load: 38 },
];

const MOCK_EXPERIMENTS = [
  { id: "exp-001", name: "Aggressive HLS Lookahead", status: "running", allocation: 15, startedAt: "2026-03-08", variant: { segmentLookahead: 6, videoConcurrency: 20 }, control: { segmentLookahead: 3, videoConcurrency: 10 }, metrics: { hitRate: { control: 91.2, variant: 94.8 }, latency: { control: 22, variant: 18 }, bandwidthMB: { control: 840, variant: 1260 } } },
  { id: "exp-002", name: "Predictive Strategy vs Activity", status: "running", allocation: 20, startedAt: "2026-03-10", variant: { strategy: "predictive" }, control: { strategy: "activity_based" }, metrics: { hitRate: { control: 91.2, variant: 88.9 }, latency: { control: 22, variant: 28 }, staleFeedPct: { control: 8.4, variant: 3.1 } } },
  { id: "exp-003", name: "Shorter Hot TTL + Larger Warm", status: "concluded", allocation: 25, startedAt: "2026-02-28", winner: "variant", variant: { hotTTL: 180, warmMaxKeys: 200000 }, control: { hotTTL: 300, warmMaxKeys: 100000 }, metrics: { hitRate: { control: 91.2, variant: 93.1 }, memoryMB: { control: 512, variant: 480 } } },
];

const MOCK_ALERTS = [
  { id: 1, name: "Hit Rate Below Threshold", metric: "cache.hitRate", condition: "lt", threshold: 80, window: "5m", severity: "critical", channels: ["slack", "pagerduty"], enabled: true, lastTriggered: "2026-03-12T14:32:00Z" },
  { id: 2, name: "Queue Backlog Growing", metric: "queue.waiting", condition: "gt", threshold: 200, window: "3m", severity: "warning", channels: ["slack"], enabled: true, lastTriggered: null },
  { id: 3, name: "Circuit Breaker Opened", metric: "circuit.state", condition: "eq", threshold: "open", window: "instant", severity: "critical", channels: ["slack", "pagerduty", "email"], enabled: true, lastTriggered: "2026-03-11T08:15:00Z" },
  { id: 4, name: "Video CDN Latency Spike", metric: "cdn.latency.p95", condition: "gt", threshold: 200, window: "2m", severity: "warning", channels: ["slack"], enabled: true, lastTriggered: "2026-03-13T03:41:00Z" },
  { id: 5, name: "Memory Usage High", metric: "redis.memory.pct", condition: "gt", threshold: 85, window: "5m", severity: "warning", channels: ["email"], enabled: false, lastTriggered: null },
];

const MOCK_LOGS = [
  { ts: "14:32:18.042", level: "info", source: "worker:timeline", msg: "Prefetched 20 posts for did:plc:abc123 → hot tier (12ms)" },
  { ts: "14:32:18.108", level: "info", source: "worker:video", msg: "Cached 3 HLS segments for at://did:plc:xyz789/io.exprsn.video/abc (45ms)" },
  { ts: "14:32:18.215", level: "warn", source: "circuit-breaker", msg: "Timeline service latency elevated: 245ms (threshold: 200ms)" },
  { ts: "14:32:18.312", level: "info", source: "strategy:activity", msg: "Cycle complete: 47 high, 123 medium, 891 low priority users queued" },
  { ts: "14:32:18.401", level: "debug", source: "cache:hot", msg: "Promoted key timeline:did:plc:def456 from warm → hot (3 hits in 60s)" },
  { ts: "14:32:18.520", level: "info", source: "worker:timeline", msg: "Prefetched 20 posts for did:plc:ghi789 → warm tier (18ms)" },
  { ts: "14:32:18.683", level: "error", source: "worker:video", msg: "Failed to parse HLS manifest: HTTP 503 from cdn.exprsn.io/v/jkl012.m3u8" },
  { ts: "14:32:18.750", level: "info", source: "metrics", msg: "Snapshot persisted: hitRate=92.4% queueDepth=42 avgLatency=18ms" },
  { ts: "14:32:18.891", level: "info", source: "rule-engine", msg: "Rule 'Power Users → Aggressive Prefetch' matched 47 users → batch_prefetch" },
  { ts: "14:32:19.012", level: "warn", source: "cache:cold", msg: "Evicting 1,204 keys (LRU) — cold tier at 98.2% capacity" },
  { ts: "14:32:19.145", level: "info", source: "federation", msg: "Syncing prefetch hints with relay: 12 new subscriptions from remote PDS" },
  { ts: "14:32:19.280", level: "debug", source: "adaptive", msg: "Adjusting fetch limit: hitRate=92.4% > 90% → reducing limit from 20 → 15" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RULES ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const COND_TYPES = [
  { value: "user_activity", label: "User Activity Score" }, { value: "time_since_last", label: "Time Since Last Visit" },
  { value: "follower_count", label: "Follower Count" }, { value: "content_type", label: "Content Type" },
  { value: "geo_region", label: "Geographic Region" }, { value: "device_type", label: "Device Type" },
  { value: "network_quality", label: "Network Quality" }, { value: "engagement_rate", label: "Engagement Rate" },
  { value: "time_of_day", label: "Time of Day" }, { value: "feed_staleness", label: "Feed Staleness (sec)" },
  { value: "pds_instance", label: "PDS Instance" }, { value: "content_language", label: "Content Language" },
  { value: "user_tier", label: "User Subscription Tier" }, { value: "video_duration", label: "Video Duration (sec)" },
];
const OPS = [{ value: "gt", label: ">" }, { value: "gte", label: ">=" }, { value: "lt", label: "<" }, { value: "lte", label: "<=" }, { value: "eq", label: "=" }, { value: "neq", label: "!=" }, { value: "in", label: "in" }, { value: "between", label: "between" }, { value: "matches", label: "matches (regex)" }];
const ACTIONS = [
  { value: "prefetch_timeline", label: "Prefetch Timeline" }, { value: "prefetch_video_segments", label: "Prefetch Video Segments" },
  { value: "promote_cache_tier", label: "Promote Cache Tier" }, { value: "increase_ttl", label: "Increase TTL" },
  { value: "skip_prefetch", label: "Skip Prefetch" }, { value: "prefetch_profile", label: "Prefetch User Profile" },
  { value: "prefetch_comments", label: "Prefetch Comments" }, { value: "batch_prefetch", label: "Batch Prefetch (aggressive)" },
  { value: "edge_replicate", label: "Replicate to Edge Nodes" }, { value: "warm_federation", label: "Warm Federation Cache" },
];

function RuleBuilder({ rules, onUpdate }) {
  const addRule = () => onUpdate([...rules, { id: Date.now(), name: `Rule ${rules.length + 1}`, enabled: true, priority: "medium", conditions: [{ type: "user_activity", operator: "gt", value: "50" }], action: "prefetch_timeline", actionParams: { limit: 20, priority: "medium" }, logic: "AND" }]);
  const removeRule = (id) => onUpdate(rules.filter((r) => r.id !== id));
  const toggleRule = (id) => onUpdate(rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const addCond = (rId) => onUpdate(rules.map((r) => r.id === rId ? { ...r, conditions: [...r.conditions, { type: "follower_count", operator: "gt", value: "100" }] } : r));
  const rmCond = (rId, idx) => onUpdate(rules.map((r) => r.id === rId ? { ...r, conditions: r.conditions.filter((_, i) => i !== idx) } : r));
  const upCond = (rId, idx, f, v) => onUpdate(rules.map((r) => r.id === rId ? { ...r, conditions: r.conditions.map((c, i) => i === idx ? { ...c, [f]: v } : c) } : r));
  const upRule = (id, f, v) => onUpdate(rules.map((r) => r.id === id ? { ...r, [f]: v } : r));
  const priCol = (p) => p === "high" ? T.error : p === "medium" ? T.warning : T.info;
  const moveRule = (idx, dir) => {
    const newRules = [...rules];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= newRules.length) return;
    [newRules[idx], newRules[swapIdx]] = [newRules[swapIdx], newRules[idx]];
    onUpdate(newRules);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rules.map((rule, rIdx) => (
        <div key={rule.id} style={{ border: `1px solid ${rule.enabled ? T.border : T.borderHover}`, borderRadius: 10, background: rule.enabled ? T.bg : `${T.bg}80`, opacity: rule.enabled ? 1 : 0.6, transition: "all 0.2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginRight: 2 }}>
              <button onClick={() => moveRule(rIdx, -1)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▲</button>
              <button onClick={() => moveRule(rIdx, 1)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▼</button>
            </div>
            <Toggle checked={rule.enabled} onChange={() => toggleRule(rule.id)} size="sm" />
            <input value={rule.name} onChange={(e) => upRule(rule.id, "name", e.target.value)} style={{ flex: 1, background: "transparent", border: "none", color: T.textPrimary, fontSize: 13, fontWeight: 600, outline: "none" }} />
            <Badge color={priCol(rule.priority)}>{rule.priority}</Badge>
            <Select value={rule.priority} onChange={(v) => upRule(rule.id, "priority", v)} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
            <button onClick={() => removeRule(rule.id)} style={{ background: "none", border: "none", color: T.error, cursor: "pointer", display: "flex", padding: 4 }}><Icons.Trash /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              IF {rule.conditions.length > 1 && <Select value={rule.logic} onChange={(v) => upRule(rule.id, "logic", v)} options={[{ value: "AND", label: "ALL (AND)" }, { value: "OR", label: "ANY (OR)" }]} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rule.conditions.map((c, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {idx > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, minWidth: 32, textAlign: "center" }}>{rule.logic}</span>}
                  <Select value={c.type} onChange={(v) => upCond(rule.id, idx, "type", v)} options={COND_TYPES} />
                  <Select value={c.operator} onChange={(v) => upCond(rule.id, idx, "operator", v)} options={OPS} />
                  <input value={c.value} onChange={(e) => upCond(rule.id, idx, "value", e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px", color: T.textPrimary, fontSize: 13, fontFamily: "monospace", outline: "none", width: 100 }} />
                  {rule.conditions.length > 1 && <button onClick={() => rmCond(rule.id, idx)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", display: "flex" }}><Icons.Trash /></button>}
                </div>
              ))}
            </div>
            <button onClick={() => addCond(rule.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, background: "none", border: `1px dashed ${T.border}`, borderRadius: 6, padding: "4px 10px", color: T.textMuted, fontSize: 12, cursor: "pointer" }}><Icons.Plus /> Add Condition</button>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>THEN</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <Select value={rule.action} onChange={(v) => upRule(rule.id, "action", v)} options={ACTIONS} />
                <span style={{ fontSize: 12, color: T.textMuted }}>limit</span>
                <NumberInput value={rule.actionParams.limit} onChange={(v) => upRule(rule.id, "actionParams", { ...rule.actionParams, limit: v })} min={0} max={200} width={50} />
                <span style={{ fontSize: 12, color: T.textMuted }}>at</span>
                <Select value={rule.actionParams.priority} onChange={(v) => upRule(rule.id, "actionParams", { ...rule.actionParams, priority: v })} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
              </div>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRule}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 16px", border: `2px dashed ${T.border}`, borderRadius: 10, background: "transparent", color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
        onMouseOver={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
        onMouseOut={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}>
        <Icons.Plus /> Add Prefetch Rule
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
function SimulationPanel({ rules, strategyType, cacheTiers }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [simConfig, setSimConfig] = useState({ userCount: 1000, duration: 60, peakMultiplier: 2.5, networkMix: { fast: 60, moderate: 30, slow: 10 } });

  const runSim = () => {
    setRunning(true);
    setTimeout(() => {
      const activeRules = rules.filter(r => r.enabled);
      const totalUsers = simConfig.userCount;
      const ruleMatches = activeRules.map(r => ({ name: r.name, matches: ~~(Math.random() * totalUsers * 0.3 + 10), action: r.action }));
      const unmatched = totalUsers - ruleMatches.reduce((a, r) => a + r.matches, 0);

      setResults({
        ruleMatches,
        unmatched: Math.max(0, unmatched),
        estimatedOps: ~~(totalUsers * 1.4 * simConfig.duration / 60),
        peakOps: ~~(totalUsers * 1.4 * simConfig.peakMultiplier),
        estimatedMemoryMB: ~~(totalUsers * 0.42),
        estimatedBandwidthGB: +(totalUsers * 0.018 * simConfig.duration / 60).toFixed(2),
        cacheFillTime: ~~(totalUsers * 0.8 / 50),
        hitRateProjection: +(75 + Math.random() * 18).toFixed(1),
        latencyProjection: { p50: ~~(12 + Math.random() * 8), p95: ~~(35 + Math.random() * 30), p99: ~~(80 + Math.random() * 70) },
        tierDistribution: [
          { name: "Hot", pct: ~~(25 + Math.random() * 15), color: T.error },
          { name: "Warm", pct: ~~(30 + Math.random() * 15), color: T.warning },
          { name: "Cold", pct: ~~(20 + Math.random() * 15), color: T.info },
          { name: "Miss", pct: ~~(5 + Math.random() * 10), color: T.textMuted },
        ],
        costEstimate: { redisGB: +(simConfig.userCount * 0.00042).toFixed(2), bandwidthGB: +(simConfig.userCount * 0.018).toFixed(2), workerHours: +(simConfig.duration / 60 * 0.12).toFixed(2) },
      });
      setRunning(false);
    }, 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle description="Test your prefetch configuration against simulated traffic patterns before deploying.">Dry-Run Simulator</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Simulated Users</span>
            <NumberInput value={simConfig.userCount} onChange={(v) => setSimConfig(p => ({ ...p, userCount: v }))} min={100} max={100000} step={100} width={80} />
          </div>
          <div>
            <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Duration (min)</span>
            <NumberInput value={simConfig.duration} onChange={(v) => setSimConfig(p => ({ ...p, duration: v }))} min={1} max={1440} width={60} unit="min" />
          </div>
          <div>
            <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Peak Multiplier</span>
            <NumberInput value={simConfig.peakMultiplier} onChange={(v) => setSimConfig(p => ({ ...p, peakMultiplier: v }))} min={1} max={10} step={0.5} width={50} unit="×" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Btn variant="primary" onClick={runSim} disabled={running} icon={running ? <Icons.Refresh /> : <Icons.Play />}>
              {running ? "Simulating..." : "Run Simulation"}
            </Btn>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 6 }}>Network Distribution</span>
          <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ flex: simConfig.networkMix.fast, background: T.success }} title={`Fast 4G/5G: ${simConfig.networkMix.fast}%`} />
            <div style={{ flex: simConfig.networkMix.moderate, background: T.warning }} title={`Moderate 3G: ${simConfig.networkMix.moderate}%`} />
            <div style={{ flex: simConfig.networkMix.slow, background: T.error }} title={`Slow 2G: ${simConfig.networkMix.slow}%`} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: T.textMuted }}>
            <span>Fast ({simConfig.networkMix.fast}%)</span>
            <span>Moderate ({simConfig.networkMix.moderate}%)</span>
            <span>Slow ({simConfig.networkMix.slow}%)</span>
          </div>
        </div>
      </Card>

      {results && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard label="Projected Hit Rate" value={`${results.hitRateProjection}%`} icon={<Icons.TrendUp />} color={results.hitRateProjection > 90 ? T.success : T.warning} />
            <StatCard label="Est. Operations" value={results.estimatedOps.toLocaleString()} subtitle={`Peak: ${results.peakOps.toLocaleString()}/min`} icon={<Icons.Zap />} color={T.accent} />
            <StatCard label="Memory Estimate" value={`${results.estimatedMemoryMB} MB`} icon={<Icons.Database />} color={T.info} />
            <StatCard label="Bandwidth" value={`${results.estimatedBandwidthGB} GB`} icon={<Icons.Globe />} color={T.purple} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <SectionTitle>Rule Match Distribution</SectionTitle>
              {results.ruleMatches.map((rm, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, minWidth: 200, color: T.textPrimary }}>{rm.name}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.borderHover, overflow: "hidden" }}>
                    <div style={{ width: `${(rm.matches / simConfig.userCount) * 100}%`, height: "100%", borderRadius: 3, background: T.accent }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: T.textMuted, minWidth: 50, textAlign: "right" }}>{rm.matches}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                <span style={{ fontSize: 12, minWidth: 200, color: T.textMuted }}>Unmatched (default strategy)</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.borderHover, overflow: "hidden" }}>
                  <div style={{ width: `${(results.unmatched / simConfig.userCount) * 100}%`, height: "100%", borderRadius: 3, background: T.textMuted }} />
                </div>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: T.textMuted, minWidth: 50, textAlign: "right" }}>{results.unmatched}</span>
              </div>
            </Card>

            <Card>
              <SectionTitle>Latency Projection</SectionTitle>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                {[["p50", T.success], ["p95", T.warning], ["p99", T.error]].map(([k, c]) => (
                  <div key={k} style={{ flex: 1, textAlign: "center", padding: 12, background: `${c}10`, borderRadius: 8, border: `1px solid ${c}30` }}>
                    <span style={{ fontSize: 11, color: T.textMuted, display: "block" }}>{k.toUpperCase()}</span>
                    <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: c }}>{results.latencyProjection[k]}</span>
                    <span style={{ fontSize: 11, color: T.textMuted }}>ms</span>
                  </div>
                ))}
              </div>

              <SectionTitle>Cost Estimate</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Redis Memory", `${results.costEstimate.redisGB} GB`, `~$${(results.costEstimate.redisGB * 6.5).toFixed(2)}/hr`],
                  ["Bandwidth (egress)", `${results.costEstimate.bandwidthGB} GB`, `~$${(results.costEstimate.bandwidthGB * 0.09).toFixed(2)}`],
                  ["Worker Compute", `${results.costEstimate.workerHours} hr`, `~$${(results.costEstimate.workerHours * 0.034).toFixed(3)}`],
                ].map(([name, usage, cost]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ color: T.textMuted }}>{name}</span>
                    <span style={{ color: T.textSecondary }}>{usage}</span>
                    <span style={{ fontFamily: "monospace", color: T.success }}>{cost}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function PrefetchConfigMockup() {
  const [activeTab, setActiveTab] = useState("overview");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [metricsData] = useState(makeTimeSeries);
  const [queueData] = useState(makeQueueData);

  // Global
  const [globalEnabled, setGlobalEnabled] = useState(true);

  // Cache
  const [cacheTiers, setCacheTiers] = useState([
    { name: "hot", ttl: 300, maxKeys: 50000, db: 0, size: 32400 },
    { name: "warm", ttl: 900, maxKeys: 100000, db: 1, size: 67200 },
    { name: "cold", ttl: 3600, maxKeys: 500000, db: 2, size: 245800 },
  ]);
  const [cacheEviction, setCacheEviction] = useState("lru");
  const [autoPromotion, setAutoPromotion] = useState(true);
  const [compression, setCompression] = useState(true);
  const [compressionThreshold, setCompressionThreshold] = useState(1024);

  // Queue
  const [timelineConcurrency, setTimelineConcurrency] = useState(50);
  const [videoConcurrency, setVideoConcurrency] = useState(10);
  const [maxRetries, setMaxRetries] = useState(3);
  const [retryBackoff, setRetryBackoff] = useState("exponential");
  const [retryBaseDelay, setRetryBaseDelay] = useState(2000);
  const [jobTimeout, setJobTimeout] = useState(30000);
  const [rateLimitPerMin, setRateLimitPerMin] = useState(1000);
  const [batchSize, setBatchSize] = useState(50);

  // Strategy
  const [strategyType, setStrategyType] = useState("activity_based");
  const [activityInterval, setActivityInterval] = useState(60);
  const [inactivityTimeout, setInactivityTimeout] = useState(300);
  const [topUserCount, setTopUserCount] = useState(10);
  const [mediumUserCount, setMediumUserCount] = useState(40);
  const [defaultFetchLimit, setDefaultFetchLimit] = useState(20);
  const [videoSegmentLookahead, setVideoSegmentLookahead] = useState(3);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);

  // Rules
  const [rules, setRules] = useState([
    { id: 1, name: "Power Users → Aggressive Prefetch", enabled: true, priority: "high", conditions: [{ type: "user_activity", operator: "gt", value: "80" }, { type: "follower_count", operator: "gt", value: "1000" }], action: "batch_prefetch", actionParams: { limit: 50, priority: "high" }, logic: "AND" },
    { id: 2, name: "Stale Feed Recovery", enabled: true, priority: "medium", conditions: [{ type: "feed_staleness", operator: "gt", value: "600" }], action: "prefetch_timeline", actionParams: { limit: 30, priority: "high" }, logic: "AND" },
    { id: 3, name: "Low Network → Skip Video", enabled: true, priority: "high", conditions: [{ type: "network_quality", operator: "eq", value: "2g" }], action: "skip_prefetch", actionParams: { limit: 0, priority: "low" }, logic: "AND" },
    { id: 4, name: "Peak Hours Boost", enabled: false, priority: "low", conditions: [{ type: "time_of_day", operator: "between", value: "18:00-22:00" }, { type: "engagement_rate", operator: "gt", value: "0.15" }], action: "prefetch_video_segments", actionParams: { limit: 5, priority: "medium" }, logic: "AND" },
    { id: 5, name: "Federation Remote Content", enabled: true, priority: "medium", conditions: [{ type: "pds_instance", operator: "neq", value: "local" }], action: "warm_federation", actionParams: { limit: 10, priority: "low" }, logic: "AND" },
  ]);

  // Resilience
  const [circuitBreaker, setCircuitBreaker] = useState(true);
  const [failureThreshold, setFailureThreshold] = useState(5);
  const [resetTimeout, setResetTimeout] = useState(60);
  const [halfOpenMax, setHalfOpenMax] = useState(3);
  const [metricsRetention, setMetricsRetention] = useState(30);
  const [snapshotInterval, setSnapshotInterval] = useState(60);

  // Edge
  const [edgeEnabled, setEdgeEnabled] = useState(true);
  const [edgeReplicationMode, setEdgeReplicationMode] = useState("selective");
  const [edgeConsistency, setEdgeConsistency] = useState("eventual");
  const [edgeSyncInterval, setEdgeSyncInterval] = useState(30);

  // Alerts
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  // Experiments
  const [experiments] = useState(MOCK_EXPERIMENTS);

  // Federation
  const [fedPrefetchEnabled, setFedPrefetchEnabled] = useState(true);
  const [relaySubscriptions, setRelaySubscriptions] = useState(true);
  const [remotePDSCacheTTL, setRemotePDSCacheTTL] = useState(1800);
  const [blobSyncEnabled, setBlobSyncEnabled] = useState(true);

  // Logs
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");

  const mc = useCallback((fn) => (...args) => { fn(...args); setHasChanges(true); }, []);
  const handleSave = () => { setSaving(true); setTimeout(() => { setSaving(false); setHasChanges(false); }, 1200); };

  const tabs = [
    { id: "overview", label: "Overview", icon: <Icons.Activity /> },
    { id: "cache", label: "Cache Tiers", icon: <Icons.Layers /> },
    { id: "queue", label: "Queue & Workers", icon: <Icons.Zap /> },
    { id: "strategy", label: "Strategy", icon: <Icons.Brain /> },
    { id: "rules", label: "Rules Engine", icon: <Icons.Settings />, count: rules.filter(r => r.enabled).length },
    { id: "simulation", label: "Simulation", icon: <Icons.Beaker /> },
    { id: "edge", label: "Edge / CDN", icon: <Icons.Globe /> },
    { id: "federation", label: "Federation", icon: <Icons.Share /> },
    { id: "experiments", label: "A/B Tests", icon: <Icons.GitBranch />, count: experiments.filter(e => e.status === "running").length },
    { id: "alerts", label: "Alerts", icon: <Icons.Bell />, count: alerts.filter(a => a.enabled).length },
    { id: "resilience", label: "Resilience", icon: <Icons.Shield /> },
    { id: "logs", label: "Live Logs", icon: <Icons.Terminal /> },
  ];

  const cacheDistData = cacheTiers.map((t, i) => ({ name: t.name.toUpperCase(), value: t.size, color: [T.error, T.warning, T.info][i] }));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.textPrimary, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* ─── HEADER ─── */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: "20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Prefetch Configuration</h1>
              <Badge color={T.success}>● Worker Online</Badge>
              <Badge color={T.info} size="xs">v2.4.1</Badge>
            </div>
            <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Configure caching, queues, strategies, edge distribution, federation sync, and intelligent prefetch rules.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: T.textMuted }}>Prefetch Engine</span>
            <Toggle checked={globalEnabled} onChange={mc(setGlobalEnabled)} />
            <Btn variant="primary" onClick={handleSave} disabled={!hasChanges || saving}>{saving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}</Btn>
          </div>
        </div>
        <div style={{ marginTop: 20 }}><Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} /></div>
      </div>

      {/* ─── CONTENT ─── */}
      <div style={{ padding: "24px 32px", maxWidth: 1280, opacity: globalEnabled ? 1 : 0.4, pointerEvents: globalEnabled ? "auto" : "none", transition: "opacity 0.3s" }}>

        {/* ═════ OVERVIEW ═════ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label="Cache Hit Rate" value="92.4%" trend={2.1} icon={<Icons.Database />} color={T.success} />
              <StatCard label="Active Users" value="1,247" trend={8.3} icon={<Icons.Users />} color={T.accent} />
              <StatCard label="Queue Depth" value="42" trend={-12} icon={<Icons.Zap />} color={T.warning} />
              <StatCard label="Avg Latency" value="18ms" trend={-5.2} icon={<Icons.Clock />} color={T.info} />
              <StatCard label="Videos Cached" value="8,921" trend={3.7} icon={<Icons.Globe />} color={T.purple} />
              <StatCard label="Edge Nodes" value="7 / 7" subtitle="All regions healthy" icon={<Icons.Map />} color={T.teal} />
            </div>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Cache Performance (24h)</span>
                <div style={{ display: "flex", gap: 12 }}>
                  {[["Hot", T.error], ["Warm", T.warning], ["Cold", T.info], ["Miss", T.textMuted]].map(([l, c]) => (
                    <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textMuted }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} /> {l}
                    </span>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={metricsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="time" stroke={T.textMuted} fontSize={11} />
                  <YAxis stroke={T.textMuted} fontSize={11} />
                  <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="hotHits" stackId="1" stroke={T.error} fill={`${T.error}40`} />
                  <Area type="monotone" dataKey="warmHits" stackId="1" stroke={T.warning} fill={`${T.warning}30`} />
                  <Area type="monotone" dataKey="coldHits" stackId="1" stroke={T.info} fill={`${T.info}20`} />
                  <Area type="monotone" dataKey="misses" stackId="1" stroke={T.textMuted} fill={`${T.textMuted}15`} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 16 }}>Queue Throughput</span>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={queueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                    <XAxis dataKey="time" stroke={T.textMuted} fontSize={11} /><YAxis stroke={T.textMuted} fontSize={11} />
                    <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="completed" fill={T.success} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="failed" fill={T.error} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 16 }}>Latency Percentiles (ms)</span>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={metricsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                    <XAxis dataKey="time" stroke={T.textMuted} fontSize={11} /><YAxis stroke={T.textMuted} fontSize={11} />
                    <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="latency" stroke={T.accent} strokeWidth={2} dot={false} name="p50" />
                    <Line type="monotone" dataKey="p95" stroke={T.warning} strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="p95" />
                    <Line type="monotone" dataKey="p99" stroke={T.error} strokeWidth={1} dot={false} strokeDasharray="2 2" name="p99" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {/* ═════ CACHE TIERS ═════ */}
        {activeTab === "cache" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <SectionTitle>Cache Distribution</SectionTitle>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart><Pie data={cacheDistData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>{cacheDistData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} /></PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 2, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
                  {cacheTiers.map((tier, i) => {
                    const colors = [T.error, T.warning, T.info];
                    const pct = ((tier.size / tier.maxKeys) * 100).toFixed(1);
                    return (
                      <div key={tier.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i] }} />
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 50, textTransform: "uppercase" }}>{tier.name}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.borderHover, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: colors[i] }} /></div>
                        <span style={{ fontSize: 12, fontFamily: "monospace", color: T.textMuted, minWidth: 140, textAlign: "right" }}>{tier.size.toLocaleString()} / {tier.maxKeys.toLocaleString()} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {cacheTiers.map((tier, i) => {
              const colors = [T.error, T.warning, T.info];
              const labels = ["Hot Tier", "Warm Tier", "Cold Tier"];
              const descs = ["Fastest access — active users & trending content.", "Balanced — moderate activity within 15 minutes.", "Long-tail — infrequent access, large capacity."];
              return (
                <Collapsible key={tier.name} title={labels[i]} icon={<Icons.Database />} badge={<Badge color={colors[i]}>Redis DB {tier.db}</Badge>} defaultOpen={i === 0}>
                  <p style={{ fontSize: 13, color: T.textMuted, marginTop: 0, marginBottom: 16 }}>{descs[i]}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <Slider label="TTL" value={tier.ttl} min={30} max={i === 0 ? 600 : i === 1 ? 1800 : 7200} step={30} unit="s" color={colors[i]} onChange={mc((v) => setCacheTiers(t => t.map((x, j) => j === i ? { ...x, ttl: v } : x)))} />
                    <Slider label="Max Keys" value={tier.maxKeys} min={1000} max={i === 0 ? 200000 : i === 1 ? 500000 : 2000000} step={1000} color={colors[i]} onChange={mc((v) => setCacheTiers(t => t.map((x, j) => j === i ? { ...x, maxKeys: v } : x)))} />
                  </div>
                </Collapsible>
              );
            })}

            <Collapsible title="Cache Policies" icon={<Icons.Settings />} badge={<Badge color={T.info}>Advanced</Badge>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Row label="Eviction Policy" description="How keys are removed when capacity is reached"><Select value={cacheEviction} onChange={mc(setCacheEviction)} options={[{ value: "lru", label: "LRU (Least Recently Used)" }, { value: "lfu", label: "LFU (Least Frequently Used)" }, { value: "ttl", label: "TTL (Nearest Expiry)" }, { value: "random", label: "Random Sampling" }]} /></Row>
                <Row label="Auto-Promotion on Hit" description="Promote cold/warm keys to hot tier on cache hit"><Toggle checked={autoPromotion} onChange={mc(setAutoPromotion)} /></Row>
                <Row label="Response Compression" description="Compress cached payloads above threshold (gzip)">
                  <Toggle checked={compression} onChange={mc(setCompression)} />
                  {compression && <NumberInput value={compressionThreshold} onChange={mc(setCompressionThreshold)} min={256} max={10240} step={256} unit="B" width={60} />}
                </Row>
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═════ QUEUE & WORKERS ═════ */}
        {activeTab === "queue" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Icons.Zap /><span style={{ fontSize: 14, fontWeight: 600 }}>Timeline Worker</span><Badge color={T.success}>Active</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Slider label="Concurrency" value={timelineConcurrency} min={1} max={200} onChange={mc(setTimelineConcurrency)} />
                  <Slider label="Max Retries" value={maxRetries} min={0} max={10} onChange={mc(setMaxRetries)} />
                  <Slider label="Job Timeout" value={jobTimeout} min={5000} max={120000} step={1000} unit="ms" onChange={mc(setJobTimeout)} />
                  <Row label="Retry Backoff"><Select value={retryBackoff} onChange={mc(setRetryBackoff)} options={[{ value: "exponential", label: "Exponential" }, { value: "linear", label: "Linear" }, { value: "fixed", label: "Fixed Delay" }]} /></Row>
                  <Slider label="Base Delay" value={retryBaseDelay} min={500} max={10000} step={500} unit="ms" onChange={mc(setRetryBaseDelay)} />
                </div>
              </Card>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Icons.Globe /><span style={{ fontSize: 14, fontWeight: 600 }}>Video Segment Worker</span><Badge color={T.success}>Active</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Slider label="Concurrency" value={videoConcurrency} min={1} max={50} onChange={mc(setVideoConcurrency)} />
                  <Slider label="Lookahead" value={videoSegmentLookahead} min={1} max={10} unit=" segs" onChange={mc(setVideoSegmentLookahead)} />
                  <InfoBox variant="info">Parses HLS manifests (.m3u8) and pre-caches the next <strong style={{ color: T.textPrimary }}>{videoSegmentLookahead}</strong> .ts segments per active viewer for instant playback start.</InfoBox>
                </div>
              </Card>
            </div>
            <Collapsible title="Throughput & Rate Limiting" icon={<Icons.Activity />} defaultOpen>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Slider label="Rate Limit" value={rateLimitPerMin} min={100} max={5000} step={100} unit="/min" onChange={mc(setRateLimitPerMin)} />
                <Slider label="Batch Size" value={batchSize} min={10} max={200} step={10} onChange={mc(setBatchSize)} />
                <InfoBox variant="info"><strong style={{ color: T.info }}>Throughput estimate:</strong> {timelineConcurrency} concurrency × {rateLimitPerMin}/min = ~{Math.min(timelineConcurrency * 60, rateLimitPerMin).toLocaleString()} prefetches/min in {batchSize}-user batches.</InfoBox>
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═════ STRATEGY ═════ */}
        {activeTab === "strategy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <SectionTitle>Prefetch Strategy</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { id: "activity_based", name: "Activity-Based", desc: "Prioritize by real-time user engagement signals.", icon: <Icons.Activity /> },
                  { id: "predictive", name: "Predictive (ML)", desc: "Use historical patterns to anticipate user needs.", icon: <Icons.Brain /> },
                  { id: "hybrid", name: "Hybrid", desc: "Combine activity signals with predictive scoring.", icon: <Icons.Zap /> },
                ].map((s) => (
                  <button key={s.id} onClick={() => { setStrategyType(s.id); setHasChanges(true); }}
                    style={{ padding: 16, borderRadius: 10, cursor: "pointer", textAlign: "left", border: `2px solid ${strategyType === s.id ? T.accent : T.border}`, background: strategyType === s.id ? `${T.accent}10` : T.bg, transition: "all 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: strategyType === s.id ? T.accent : T.textPrimary }}>{s.icon}<span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span></div>
                    <span style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.4 }}>{s.desc}</span>
                  </button>
                ))}
              </div>
            </Card>
            <Collapsible title="Activity Tracking" icon={<Icons.Activity />} defaultOpen>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Slider label="Check Interval" value={activityInterval} min={10} max={300} step={5} unit="s" onChange={mc(setActivityInterval)} />
                <Slider label="Inactivity Timeout" value={inactivityTimeout} min={60} max={900} step={30} unit="s" onChange={mc(setInactivityTimeout)} />
                <Slider label="Fetch Limit" value={defaultFetchLimit} min={5} max={100} step={5} onChange={mc(setDefaultFetchLimit)} />
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 10 }}>Priority Bucketing</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { label: "HIGH", color: T.error, desc: "Top", val: topUserCount, set: mc(setTopUserCount) },
                      { label: "MEDIUM", color: T.warning, desc: "Next", val: mediumUserCount, set: mc(setMediumUserCount) },
                      { label: "LOW", color: T.info, desc: null },
                    ].map((b) => (
                      <div key={b.label} style={{ padding: 12, background: `${b.color}10`, borderRadius: 8, border: `1px solid ${b.color}30` }}>
                        <span style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.label} PRIORITY</span>
                        <div style={{ marginTop: 4 }}>
                          {b.desc ? (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                              <span style={{ fontSize: 11, color: T.textMuted }}>{b.desc}</span>
                              <NumberInput value={b.val} onChange={b.set} min={1} max={500} width={40} />
                              <span style={{ fontSize: 11, color: T.textMuted }}>users</span>
                            </div>
                          ) : <span style={{ fontSize: 12, color: T.textMuted }}>All remaining active</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Collapsible>
            <Collapsible title="Adaptive Intelligence" icon={<Icons.Brain />} badge={<Badge color={T.accent}>Beta</Badge>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Row label="Adaptive Prefetch Depth" description="Dynamically adjust fetch limits based on hit rate and queue pressure"><Toggle checked={adaptiveEnabled} onChange={mc(setAdaptiveEnabled)} /></Row>
                {adaptiveEnabled && (
                  <div style={{ padding: 14, background: T.bg, borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: T.textMuted }}>
                    <strong style={{ color: T.textPrimary }}>Decision Matrix:</strong><br />
                    <span style={{ color: T.success }}>●</span> Hit rate &gt; 95% → reduce fetch limit by 25% <span style={{ color: T.textMuted }}>(already well-cached)</span><br />
                    <span style={{ color: T.error }}>●</span> Hit rate &lt; 70% → increase fetch limit by 50% <span style={{ color: T.textMuted }}>(aggressive caching)</span><br />
                    <span style={{ color: T.warning }}>●</span> Queue depth &gt; 500 → throttle new jobs <span style={{ color: T.textMuted }}>(prevent backpressure)</span><br />
                    <span style={{ color: T.info }}>●</span> Avg latency &gt; 100ms → reduce concurrency by 20% <span style={{ color: T.textMuted }}>(relieve upstream)</span><br />
                    <span style={{ color: T.purple }}>●</span> Error rate &gt; 5% → open circuit breaker <span style={{ color: T.textMuted }}>(protect upstream services)</span>
                  </div>
                )}
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═════ RULES ENGINE ═════ */}
        {activeTab === "rules" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Prefetch Rules</span>
                <Badge color={T.success}>{rules.filter(r => r.enabled).length} active / {rules.length} total</Badge>
              </div>
              <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
                Rules are evaluated top-to-bottom. The first matching rule's action is applied. Drag rules to reorder priority. Unmatched users fall through to the default strategy.
              </p>
              <RuleBuilder rules={rules} onUpdate={(r) => { setRules(r); setHasChanges(true); }} />
            </Card>

            <Card>
              <SectionTitle>Evaluation Flow</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {rules.filter(r => r.enabled).map((rule, i, arr) => (
                  <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: T.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.textMuted }}>{i + 1}</span>
                    <div style={{ flex: 1, padding: "8px 12px", background: T.bg, borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                      <span><span style={{ fontWeight: 600 }}>{rule.name}</span><span style={{ color: T.textMuted }}> → </span><span style={{ color: T.accent }}>{ACTIONS.find(a => a.value === rule.action)?.label}</span></span>
                      <span style={{ color: T.textMuted, fontSize: 11 }}>{rule.conditions.length} condition{rule.conditions.length > 1 ? "s" : ""}</span>
                    </div>
                    {i < arr.length - 1 && <span style={{ fontSize: 10, color: T.textMuted }}>else↓</span>}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: T.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.textMuted }}>∅</span>
                  <div style={{ flex: 1, padding: "8px 12px", background: T.bg, borderRadius: 6, border: `1px dashed ${T.border}`, fontSize: 12, color: T.textMuted }}>
                    No match → default strategy ({strategyType.replace("_", " ")})
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═════ SIMULATION ═════ */}
        {activeTab === "simulation" && <SimulationPanel rules={rules} strategyType={strategyType} cacheTiers={cacheTiers} />}

        {/* ═════ EDGE / CDN ═════ */}
        {activeTab === "edge" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle description="Distribute cached content to edge nodes worldwide for low-latency delivery.">Edge Cache Network</SectionTitle>
                <Toggle checked={edgeEnabled} onChange={mc(setEdgeEnabled)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Replication Mode</span>
                  <Select value={edgeReplicationMode} onChange={mc(setEdgeReplicationMode)} options={[{ value: "selective", label: "Selective (hot tier only)" }, { value: "tiered", label: "Tiered (hot + warm)" }, { value: "full", label: "Full (all tiers)" }]} />
                </div>
                <div>
                  <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Consistency Model</span>
                  <Select value={edgeConsistency} onChange={mc(setEdgeConsistency)} options={[{ value: "eventual", label: "Eventual (fastest)" }, { value: "bounded", label: "Bounded Staleness" }, { value: "strong", label: "Strong (slowest)" }]} />
                </div>
                <div>
                  <span style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Sync Interval</span>
                  <NumberInput value={edgeSyncInterval} onChange={mc(setEdgeSyncInterval)} min={5} max={300} unit="s" width={60} />
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle>Edge Nodes</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "8px 14px", background: T.surfaceHover, fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase" }}>
                  <span>Node</span><span>Status</span><span>Hit Rate</span><span>Latency</span><span>Keys</span><span>Load</span>
                </div>
                {EDGE_NODES.map((node) => {
                  const sc = node.status === "healthy" ? T.success : node.status === "degraded" ? T.warning : T.error;
                  return (
                    <div key={node.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "10px 14px", background: T.surface, alignItems: "center", fontSize: 13 }}>
                      <div><span style={{ fontWeight: 600 }}>{node.name}</span><span style={{ fontSize: 11, color: T.textMuted, marginLeft: 6 }}>{node.id}</span></div>
                      <Badge color={sc}>{node.status}</Badge>
                      <span style={{ fontFamily: "monospace", color: node.hitRate > 90 ? T.success : node.hitRate > 80 ? T.warning : T.error }}>{node.hitRate}%</span>
                      <span style={{ fontFamily: "monospace", color: node.latency < 30 ? T.success : node.latency < 50 ? T.warning : T.error }}>{node.latency}ms</span>
                      <span style={{ fontFamily: "monospace", color: T.textSecondary }}>{node.keys.toLocaleString()}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.borderHover, overflow: "hidden" }}>
                          <div style={{ width: `${node.load}%`, height: "100%", background: node.load > 80 ? T.error : node.load > 60 ? T.warning : T.success }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textMuted }}>{node.load}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ═════ FEDERATION ═════ */}
        {activeTab === "federation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <SectionTitle description="Configure how prefetch interacts with AT Protocol federation — remote PDS instances, relay firehose subscriptions, and blob synchronization.">AT Protocol Federation Prefetch</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Row label="Federation-Aware Prefetch" description="Pre-cache content from remote PDS instances that local users follow"><Toggle checked={fedPrefetchEnabled} onChange={mc(setFedPrefetchEnabled)} /></Row>
                <Row label="Relay Subscription Sync" description="Subscribe to firehose events from federated relays to trigger prefetch"><Toggle checked={relaySubscriptions} onChange={mc(setRelaySubscriptions)} /></Row>
                <Row label="Blob Sync Prefetch" description="Pre-fetch media blobs from remote PDS during federation sync"><Toggle checked={blobSyncEnabled} onChange={mc(setBlobSyncEnabled)} /></Row>
                <Slider label="Remote PDS TTL" value={remotePDSCacheTTL} min={300} max={7200} step={300} unit="s" onChange={mc(setRemotePDSCacheTTL)} />
              </div>
            </Card>

            <Card>
              <SectionTitle>Federation Pipeline</SectionTitle>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "20px 0", flexWrap: "wrap" }}>
                {[
                  { name: "Remote PDS", icon: <Icons.Server />, color: T.purple },
                  null,
                  { name: "Relay Firehose", icon: <Icons.Activity />, color: T.accent },
                  null,
                  { name: "Prefetch Queue", icon: <Icons.Zap />, color: T.warning },
                  null,
                  { name: "Tiered Cache", icon: <Icons.Layers />, color: T.info },
                  null,
                  { name: "Edge Nodes", icon: <Icons.Globe />, color: T.teal },
                ].map((item, i) =>
                  item ? (
                    <div key={item.name} style={{ textAlign: "center", padding: "12px 18px", borderRadius: 10, border: `1px solid ${item.color}40`, background: `${item.color}08`, minWidth: 100 }}>
                      <div style={{ color: item.color, display: "flex", justifyContent: "center", marginBottom: 6 }}>{item.icon}</div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{item.name}</span>
                    </div>
                  ) : <span key={i} style={{ fontSize: 14, color: T.textMuted }}>→</span>
                )}
              </div>
              <InfoBox variant="accent">
                <strong style={{ color: T.accent }}>Federation Flow:</strong> When a local user follows a remote account, the relay firehose subscription detects new posts from that account's PDS. The prefetch engine then queues the content for caching, placing it in the warm tier with a {remotePDSCacheTTL}s TTL. Media blobs are synced via BlobSync protocol{blobSyncEnabled ? "" : " (currently disabled)"}.
              </InfoBox>
            </Card>

            <Collapsible title="Remote PDS Health" icon={<Icons.Server />} defaultOpen>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { host: "bsky.social", status: "healthy", latency: 45, subscriptions: 892, lastSync: "2s ago" },
                  { host: "pds.exprsn.io", status: "healthy", latency: 8, subscriptions: 4521, lastSync: "1s ago" },
                  { host: "fed.example.com", status: "degraded", latency: 180, subscriptions: 34, lastSync: "45s ago" },
                ].map(pds => (
                  <div key={pds.host} style={{ padding: 14, background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: pds.status === "healthy" ? T.success : T.warning }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pds.host}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
                      Latency: <span style={{ color: T.textPrimary, fontFamily: "monospace" }}>{pds.latency}ms</span><br />
                      Subscriptions: <span style={{ color: T.textPrimary, fontFamily: "monospace" }}>{pds.subscriptions}</span><br />
                      Last sync: <span style={{ color: T.textPrimary }}>{pds.lastSync}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═════ A/B TESTS ═════ */}
        {activeTab === "experiments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle description="Run controlled experiments to validate prefetch configuration changes before full rollout.">Experiments</SectionTitle>
                <Btn variant="primary" icon={<Icons.Plus />}>New Experiment</Btn>
              </div>

              {experiments.map((exp) => {
                const statusColor = exp.status === "running" ? T.success : exp.status === "concluded" ? T.info : T.textMuted;
                return (
                  <div key={exp.id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.surfaceHover }}>
                      <Icons.GitBranch />
                      <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{exp.name}</span>
                      <Badge color={statusColor}>{exp.status}</Badge>
                      <Badge color={T.accent} size="xs">{exp.allocation}% traffic</Badge>
                      {exp.winner && <Badge color={T.success}>Winner: {exp.winner}</Badge>}
                      <span style={{ fontSize: 11, color: T.textMuted }}>Started {exp.startedAt}</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
                        <div style={{ padding: 12, background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase" }}>Control</span>
                          <div style={{ marginTop: 6, fontSize: 12, fontFamily: "monospace", color: T.textSecondary }}>
                            {Object.entries(exp.control).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
                          </div>
                        </div>
                        <div style={{ padding: 12, background: `${T.accent}08`, borderRadius: 8, border: `1px solid ${T.accent}30` }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.accent, textTransform: "uppercase" }}>Variant</span>
                          <div style={{ marginTop: 6, fontSize: 12, fontFamily: "monospace", color: T.textSecondary }}>
                            {Object.entries(exp.variant).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
                          </div>
                        </div>
                      </div>

                      <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Results</span>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(exp.metrics).length}, 1fr)`, gap: 8 }}>
                        {Object.entries(exp.metrics).map(([metric, vals]) => {
                          const diff = ((vals.variant - vals.control) / vals.control * 100).toFixed(1);
                          const improved = metric === "latency" || metric === "staleFeedPct" ? diff < 0 : diff > 0;
                          return (
                            <div key={metric} style={{ padding: 10, background: T.bg, borderRadius: 8, textAlign: "center" }}>
                              <span style={{ fontSize: 11, color: T.textMuted, display: "block" }}>{metric}</span>
                              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4, fontSize: 13, fontFamily: "monospace" }}>
                                <span style={{ color: T.textSecondary }}>{vals.control}</span>
                                <span style={{ color: T.textMuted }}>→</span>
                                <span style={{ color: improved ? T.success : T.error, fontWeight: 600 }}>{vals.variant}</span>
                              </div>
                              <span style={{ fontSize: 11, color: improved ? T.success : T.error }}>{diff > 0 ? "+" : ""}{diff}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {/* ═════ ALERTS ═════ */}
        {activeTab === "alerts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle description="Configure threshold-based alerts for prefetch health metrics.">Alert Rules</SectionTitle>
                <Btn variant="primary" icon={<Icons.Plus />}>Add Alert</Btn>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 2fr 1fr 1fr 1fr 1fr auto", padding: "8px 14px", background: T.surfaceHover, fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", gap: 12 }}>
                  <span>On</span><span>Name</span><span>Condition</span><span>Severity</span><span>Channels</span><span>Last Triggered</span><span></span>
                </div>
                {alerts.map((alert) => {
                  const sevColor = alert.severity === "critical" ? T.error : T.warning;
                  return (
                    <div key={alert.id} style={{ display: "grid", gridTemplateColumns: "auto 2fr 1fr 1fr 1fr 1fr auto", padding: "10px 14px", background: T.surface, alignItems: "center", fontSize: 13, gap: 12, opacity: alert.enabled ? 1 : 0.5 }}>
                      <Toggle checked={alert.enabled} onChange={() => { const n = alerts.map(a => a.id === alert.id ? { ...a, enabled: !a.enabled } : a); setAlerts(n); setHasChanges(true); }} size="sm" />
                      <span style={{ fontWeight: 500 }}>{alert.name}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: T.textSecondary }}>{alert.metric} {alert.condition} {alert.threshold}</span>
                      <Badge color={sevColor}>{alert.severity}</Badge>
                      <div style={{ display: "flex", gap: 4 }}>{alert.channels.map(c => <Badge key={c} color={T.textMuted} size="xs">{c}</Badge>)}</div>
                      <span style={{ fontSize: 12, color: T.textMuted }}>{alert.lastTriggered ? new Date(alert.lastTriggered).toLocaleString() : "Never"}</span>
                      <Btn variant="ghost" size="sm" icon={<Icons.Settings />} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ═════ RESILIENCE ═════ */}
        {activeTab === "resilience" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Collapsible title="Circuit Breaker" icon={<Icons.Shield />} badge={<Badge color={T.success}>Closed</Badge>} defaultOpen>
              <p style={{ fontSize: 13, color: T.textMuted, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>Protects upstream services from cascading failures. Opens the circuit when failures reach threshold.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Row label="Enable Circuit Breaker"><Toggle checked={circuitBreaker} onChange={mc(setCircuitBreaker)} /></Row>
                <Slider label="Failure Threshold" value={failureThreshold} min={1} max={20} onChange={mc(setFailureThreshold)} disabled={!circuitBreaker} />
                <Slider label="Reset Timeout" value={resetTimeout} min={10} max={300} step={10} unit="s" onChange={mc(setResetTimeout)} disabled={!circuitBreaker} />
                <Slider label="Half-Open Probes" value={halfOpenMax} min={1} max={10} onChange={mc(setHalfOpenMax)} disabled={!circuitBreaker} />
                <div style={{ padding: 16, background: T.bg, borderRadius: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 12 }}>State Machine</span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {[{ s: "CLOSED", c: T.success, d: `< ${failureThreshold} fails` }, null, { s: "OPEN", c: T.error, d: `≥ ${failureThreshold} fails` }, null, { s: "HALF-OPEN", c: T.warning, d: `After ${resetTimeout}s` }].map((item, i) =>
                      item ? (
                        <div key={item.s} style={{ textAlign: "center", padding: "10px 16px", borderRadius: 8, border: `2px solid ${item.c}`, background: `${item.c}10`, minWidth: 110 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: item.c, display: "block" }}>{item.s}</span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>{item.d}</span>
                        </div>
                      ) : <span key={i} style={{ fontSize: 16, color: T.textMuted }}>→</span>
                    )}
                  </div>
                  <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: T.textMuted }}>Half-Open sends {halfOpenMax} probe{halfOpenMax > 1 ? "s" : ""}. Pass → Closed. Fail → Open.</div>
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Telemetry & Retention" icon={<Icons.Clock />}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Slider label="Retention" value={metricsRetention} min={1} max={90} unit=" days" onChange={mc(setMetricsRetention)} />
                <Slider label="Snapshot Interval" value={snapshotInterval} min={10} max={300} step={10} unit="s" onChange={mc(setSnapshotInterval)} />
                <InfoBox variant="warning"><strong style={{ color: T.warning }}>Storage estimate:</strong> ~{(metricsRetention * 24 * (3600 / snapshotInterval) * 0.5 / 1024).toFixed(1)} MB in Redis DB 3 ({Math.round(3600 / snapshotInterval)} snapshots/hr × {metricsRetention} days).</InfoBox>
              </div>
            </Collapsible>

            <Collapsible title="Health Checks" icon={<Icons.Activity />} defaultOpen>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { name: "Redis Cache", status: "healthy", latency: "2ms", details: "All 3 tiers responsive" },
                  { name: "Timeline Service", status: "healthy", latency: "45ms", details: "http://localhost:3002" },
                  { name: "Video CDN", status: "degraded", latency: "230ms", details: "Elevated latency detected" },
                ].map(svc => {
                  const sc = svc.status === "healthy" ? T.success : svc.status === "degraded" ? T.warning : T.error;
                  return (
                    <div key={svc.name} style={{ padding: 14, background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: sc }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{svc.name}</span>
                      </div>
                      <span style={{ fontSize: 12, color: T.textMuted, display: "block" }}>{svc.details}</span>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <Badge color={sc}>{svc.status}</Badge>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textMuted }}>{svc.latency}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═════ LIVE LOGS ═════ */}
        {activeTab === "logs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle description="Real-time log stream from all prefetch components.">Live Log Stream</SectionTitle>
                <div style={{ display: "flex", gap: 8 }}>
                  <TextInput value={logSearch} onChange={setLogSearch} placeholder="Filter logs..." width={200} mono />
                  <Select value={logFilter} onChange={setLogFilter} options={[{ value: "all", label: "All Levels" }, { value: "error", label: "Errors Only" }, { value: "warn", label: "Warnings" }, { value: "info", label: "Info" }, { value: "debug", label: "Debug" }]} />
                </div>
              </div>

              <div style={{ background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`, fontFamily: "monospace", fontSize: 12, maxHeight: 500, overflow: "auto" }}>
                {MOCK_LOGS
                  .filter(l => logFilter === "all" || l.level === logFilter)
                  .filter(l => !logSearch || l.msg.toLowerCase().includes(logSearch.toLowerCase()) || l.source.includes(logSearch))
                  .map((log, i) => {
                    const lc = { error: T.error, warn: T.warning, info: T.success, debug: T.textMuted }[log.level];
                    return (
                      <div key={i} style={{ display: "flex", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${T.border}`, alignItems: "flex-start" }}>
                        <span style={{ color: T.textMuted, minWidth: 90, flexShrink: 0 }}>{log.ts}</span>
                        <span style={{ color: lc, minWidth: 40, fontWeight: 600, textTransform: "uppercase", flexShrink: 0 }}>{log.level}</span>
                        <span style={{ color: T.accent, minWidth: 140, flexShrink: 0 }}>[{log.source}]</span>
                        <span style={{ color: T.textSecondary, lineHeight: 1.4 }}>{log.msg}</span>
                      </div>
                    );
                  })}
              </div>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
