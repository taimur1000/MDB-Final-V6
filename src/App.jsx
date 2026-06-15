/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   VEKTOR SOLUTIONS LLC — PRACTICE REPORTING DASHBOARD                   ║
 * ║   VEMBOT AI · Doctor Dashboard · Admin Portal · HIPAA Compliant         ║
 * ║   React Component — Full System · v5.0 · May 2026                       ║
 * ║   Light Grey Theme · Real Logo · Minimal Landing Page                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE NOTES:
 * ─────────────────────────────────────────────────────────────────────────
 * • Auth: OTP-only via /api/auth/sendotp + /api/auth/verifyotp
 *   - Professional email validation (no gmail/yahoo/etc.)
 *   - JWT 8-hr session, stored in httpOnly cookie
 *   - Role-based routing: admin → AdminPortal, doctor → Dashboard
 *
 * • Data: Google Sheets API v4 (read-only, service account)
 *   - Sheet URL stored per-doctor in Supabase
 *   - Dashboard summary tab cached every 5 minutes
 *   - Claims tab paginated on demand
 *
 * • VEMBOT AI: Claude Sonnet API via /api/ai/query
 *   - 50 queries/day per doctor
 *   - Claims data passed as context with each query
 *   - Streaming responses (SSE)
 *
 * BACKEND ENDPOINTS:
 *   POST /api/auth/sendotp         { email }
 *   POST /api/auth/verifyotp       { email, otp }
 *   GET  /api/auth/me              (JWT)
 *   POST /api/auth/logout          (JWT)
 *   GET  /api/dashboard/kpis       (JWT)
 *   GET  /api/dashboard/claims     (JWT + pagination)
 *   GET  /api/dashboard/denials    (JWT)
 *   POST /api/ai/query             (JWT + { query })
 *   GET  /api/admin/users          (Admin JWT)
 *   POST /api/admin/addDoctor      (Admin JWT)
 *   PUT  /api/admin/approveDoctor  (Admin JWT)
 *   DELETE /api/admin/removeDoctor (Admin JWT)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── REAL VEKTOR LOGO (base64 PNG, white bg removed) ─────────────────────────
const VEKTOR_MARK_SRC = "data:image/png;base64,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";

function VektorLogoMark({ size = 36 }) {
  return (
    <img
      src={VEKTOR_MARK_SRC}
      width={size}
      height={size}
      alt="Vektor"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

function VektorLogoFull({ height = 32, darkBg = false }) {
  const nameColor = darkBg ? "#E8E8F0" : C.textPrimary;
  const subColor  = darkBg ? "#6A7080" : C.textMuted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <VektorLogoMark size={height} />
      <div>
        <div style={{ color: nameColor, fontWeight: 800, fontSize: Math.max(11, height * 0.38), letterSpacing: 1.5 }}>VEKTOR</div>
        <div style={{ color: subColor, fontSize: Math.max(7, height * 0.22), letterSpacing: 2 }}>SOLUTIONS LLC</div>
      </div>
    </div>
  );
}

// ─── COLOR PALETTE ────────────────────────────────────────────────────────────
const C = {
  bgPrimary:    "#F0F2F6",
  bgCard:       "#CDCED3",
  bgCardAlt:    "#C6C8CD",
  bgCardDark:   "#C0C1C6",
  border:       "#B6B9C0",
  borderLight:  "#C8CAD1",
  borderAccent: "#A5ABBB",
  textPrimary:  "#1A1C20",
  textSecond:   "#3A4252",
  textMuted:    "#5A6475",
  bgSecondary:  "#1A1C22",
  cyan:         "#0099BB",
  cyanHUD:      "#00D4FF",
  gold:         "#B8962E",
  goldLight:    "#C9A84C",
  green:        "#1A8F55",
  red:          "#CC334A",
  orange:       "#C07800",
  blue:         "#1E4DB7",
  blueBright:   "#2E66E5",
};

// Sidebar uses its own dark constants so it stays readable
const S = {
  bg:     "#1A1C22",
  border: "#2C2E36",
  cardBg: "#242730",
  text:   "#E8E8F0",
  muted:  "#7A8799",
  cyan:   "#00D4FF",
  active: "rgba(0,212,255,0.10)",
};

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .vk-btn { transition: all 0.18s; cursor: pointer; }
  .vk-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .vk-row-hover:hover { background: #B9BCC3 !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
`;

// ─── CONSTANTS & DUMMY DATA ───────────────────────────────────────────────────
const CONSUMER_DOMAINS = [
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com",
  "aol.com","msn.com","live.com","me.com","mac.com",
];

const DUMMY_DOCTOR = {
  id: "doc_001",
  name: "Thomas Miller",
  title: "Dr. Thomas Miller MD",
  specialty: "Internal Medicine",
  practice: "Miller Medical Group",
  city: "Chicago",
  state: "IL",
  email: "dr.miller@millermedicine.com",
  sheetUrl: "https://docs.google.com/spreadsheets/d/example",
  role: "doctor",
  verified: true,
};

const DUMMY_KPIS = {
  recoveryRate: 94.8,
  recoveryRateDelta: "+0.9%",
  mtdRevenue: 38420,
  mtdRevenueDelta: "+$3,100",
  ytdRevenue: 187650,
  ytdRevenueDelta: "+22%",
  claimsProcessed: 276,
  claimsDelta: "+8 vs target",
  billingAccuracy: 93.8,
  accuracyDelta: "Above 92% threshold",
  outstandingAR: 6840,
  arDelta: "Actively worked",
};

const MONTHLY_DATA = [
  { month: "Oct", mtd: 28400 },
  { month: "Nov", mtd: 31200 },
  { month: "Dec", mtd: 34800 },
  { month: "Jan", mtd: 36100 },
  { month: "Feb", mtd: 33900 },
  { month: "Mar", mtd: 37200 },
  { month: "Apr", mtd: 35100 },
  { month: "May*", mtd: 38420 },
];

const CLAIMS_DATA = [
  { id: "CV-3201", patient: "D. Reynolds", payer: "BlueCross Shield", cpt: "99214", dos: "May 19", billed: 420, collected: 378, status: "PAID" },
  { id: "CV-3200", patient: "A. Kim", payer: "Aetna", cpt: "99213", dos: "May 19", billed: 380, collected: null, status: "PENDING" },
  { id: "CV-3199", patient: "M. Patel", payer: "UnitedHealth", cpt: "99215", dos: "May 18", billed: 510, collected: 461, status: "PAID" },
  { id: "CV-3198", patient: "S. Garcia", payer: "Medicare", cpt: "99212", dos: "May 17", billed: 290, collected: null, status: "IN APPEAL" },
  { id: "CV-3197", patient: "T. Johnson", payer: "Cigna", cpt: "99214", dos: "May 16", billed: 640, collected: null, status: "DENIED" },
  { id: "CV-3196", patient: "L. Williams", payer: "BlueCross Shield", cpt: "99213", dos: "May 15", billed: 360, collected: 324, status: "PAID" },
  { id: "CV-3195", patient: "R. Chen", payer: "Humana", cpt: "99215", dos: "May 14", billed: 480, collected: 432, status: "PAID" },
  { id: "CV-3194", patient: "J. Martinez", payer: "Medicare", cpt: "99214", dos: "May 13", billed: 420, collected: null, status: "PENDING" },
];

const DENIAL_DATA = [
  { reason: "CO-4: Late Submission", count: 8, pct: 32 },
  { reason: "CO-97: Auth Required", count: 6, pct: 24 },
  { reason: "CO-16: Missing Info", count: 5, pct: 20 },
  { reason: "CO-50: Not Covered", count: 4, pct: 16 },
  { reason: "CO-22: Coordination", count: 2, pct: 8 },
];

const PAYER_MIX = [
  { name: "BlueCross", value: 31, color: "#0099BB" },
  { name: "Medicare", value: 24, color: "#1A8F55" },
  { name: "Aetna", value: 18, color: "#B8962E" },
  { name: "UnitedHealth", value: 15, color: "#C07800" },
  { name: "Other", value: 12, color: "#5A6475" },
];

const ADMIN_DOCTORS = [
  { id: 1, name: "Dr. Thomas Miller MD", email: "dr.miller@millermedicine.com", practice: "Miller Medical", specialty: "Internal Medicine", location: "Chicago, IL", status: "VERIFIED", lastSync: "2 min ago" },
  { id: 2, name: "Dr. Sarah Chen MD", email: "schen@mhclinic.com", practice: "MH Clinic", specialty: "Mental Health", location: "Los Angeles, CA", status: "VERIFIED", lastSync: "7 min ago" },
  { id: 3, name: "Dr. Robert Martinez MD", email: "rmartinez@paincare.com", practice: "PainCare Center", specialty: "Pain Mgmt", location: "Chicago, IL", status: "VERIFIED", lastSync: "12 min ago" },
  { id: 4, name: "Dr. Emily Park MD", email: "park@ortho.com", practice: "Park Orthopedics", specialty: "Orthopedics", location: "Houston, TX", status: "PENDING", lastSync: "Not set" },
  { id: 5, name: "Dr. James Wilson DC", email: "wilson@chirocenter.com", practice: "Wilson Chiro", specialty: "Chiropractic", location: "Phoenix, AZ", status: "PENDING", lastSync: "Not set" },
  { id: 6, name: "Dr. Priya Sharma MD", email: "psharma@primarycare.com", practice: "Sharma Primary", specialty: "Primary Care", location: "Dallas, TX", status: "VERIFIED", lastSync: "1 hr ago" },
  { id: 7, name: "Dr. Michael Brown MD", email: "mbrown@rehab.com", practice: "Brown Rehab Ctr", specialty: "Rehab Medicine", location: "Miami, FL", status: "VERIFIED", lastSync: "2 hr ago" },
];

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
const SoundEngine = {
  ctx: null,
  getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  },
  playLoginSurge() {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = i % 2 === 0 ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(200 + i * 80, now + i * 0.06);
        osc.frequency.exponentialRampToValueAtTime(800 + i * 200, now + i * 0.06 + 0.3);
        gain.gain.setValueAtTime(0, now + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.06 + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.06 + 0.4);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.5);
      }
      const chord = ctx.createOscillator();
      const chordGain = ctx.createGain();
      chord.connect(chordGain); chordGain.connect(ctx.destination);
      chord.type = "sine";
      chord.frequency.setValueAtTime(880, now + 0.35);
      chordGain.gain.setValueAtTime(0.2, now + 0.35);
      chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      chord.start(now + 0.35);
      chord.stop(now + 1.0);
    } catch (e) { /* Audio not available */ }
  },
  playLogoutSequence(name, onDone) {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(600 - i * 100, now + i * 0.15);
        osc.frequency.exponentialRampToValueAtTime(80, now + i * 0.15 + 0.4);
        gain.gain.setValueAtTime(0.18, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.5);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.6);
      }
      setTimeout(() => {
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(`Good Bye, Dr. ${name}. Session terminated.`);
          utter.rate = 0.88; utter.pitch = 0.75; utter.volume = 0.9;
          utter.onend = onDone;
          window.speechSynthesis.speak(utter);
        } else { setTimeout(onDone, 1200); }
      }, 700);
    } catch (e) { onDone(); }
  },
};

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────
const fmtUSD = (n) => n == null ? "—" : `$${Number(n).toLocaleString()}`;
const fmtPct = (n) => `${n}%`;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
};

const isConsumerEmail = (email) => {
  const domain = email.split("@")[1]?.toLowerCase();
  return CONSUMER_DOMAINS.includes(domain);
};

const validateProfessionalEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return "Please enter a valid email address.";
  if (isConsumerEmail(email)) return "Please use a professional work email address.";
  return null;
};

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  PAID:        { bg: "#1A8F55", text: "#fff", label: "PAID" },
  PENDING:     { bg: "#C07800", text: "#fff", label: "PENDING" },
  DENIED:      { bg: "#CC334A", text: "#fff", label: "DENIED" },
  "IN APPEAL": { bg: "#0099BB", text: "#fff", label: "IN APPEAL" },
  VERIFIED:    { bg: "#1A8F55", text: "#fff", label: "VERIFIED" },
  PENDING_A:   { bg: "#C07800", text: "#fff", label: "PENDING" },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CFG[status] || { bg: C.textMuted, text: "#fff", label: status };
  return (
    <span style={{
      background: cfg.bg, color: cfg.text,
      padding: "2px 8px", borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
      whiteSpace: "nowrap", display: "inline-block",
    }}>
      {cfg.label}
    </span>
  );
};

// ─── CHART TOOLTIP ────────────────────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
      <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</p>
      <p style={{ color: C.blue, fontSize: 13, fontWeight: 700 }}>{fmtUSD(payload[0].value)}</p>
    </div>
  );
};

// ─── SESSION CHECKING SCREEN ──────────────────────────────────────────────────
function CheckingSession() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.bgPrimary, fontFamily: "system-ui, sans-serif",
    }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 48, height: 48, border: `3px solid ${C.border}`,
          borderTop: `3px solid ${C.blue}`, borderRadius: "50%",
          margin: "0 auto 20px", animation: "spin 1s linear infinite",
        }} />
        <p style={{ color: C.textMuted, fontSize: 11, letterSpacing: 2 }}>INITIALIZING SECURE SESSION</p>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function VektorBillingPortal() {
  const [screen, setScreen] = useState("checking");
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [liveKpis, setLiveKpis] = useState(DUMMY_KPIS);
  const [liveMonthlyData, setLiveMonthlyData] = useState(MONTHLY_DATA);

  // Fetch live KPIs from backend whenever dashboard is shown
  useEffect(() => {
    if (screen !== "dashboard") return;
    fetch("/api/dashboard/kpis", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.kpis)         setLiveKpis(data.kpis);
        if (data.monthlyChart) setLiveMonthlyData(data.monthlyChart);
      })
      .catch(() => {/* keep dummy data on network error */});
  }, [screen]);

  // Check for existing valid session on mount
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          if (data.user.role === "admin") setScreen("admin");
          else if (data.user.verified) setScreen("dashboard");
          else setScreen("waiting");
        } else {
          setScreen("landing");
        }
      })
      .catch(() => setScreen("landing"));
  }, []);

  const handleSendOTP = async () => {
    const err = validateProfessionalEmail(email);
    if (err) { setEmailError(err); return; }
    setEmailError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/sendotp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Failed to send code. Please try again.");
      } else {
        setScreen("otp");
      }
    } catch {
      setEmailError("Network error. Please check your connection and try again.");
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async () => {
    const code = otp.join("");
    if (code.length < 6) { setOtpError("Please enter the full 6-digit code."); return; }
    setOtpError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verifyotp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Verification failed. Please try again.");
      } else {
        SoundEngine.playLoginSurge();
        setUser(data.user);
        if (data.user.role === "admin") setScreen("admin");
        else if (data.user.verified) setScreen("dashboard");
        else setScreen("waiting");
      }
    } catch {
      setOtpError("Network error. Please check your connection and try again.");
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    setLoggingOut(true);
    SoundEngine.playLogoutSequence(user?.name?.split(" ").slice(-1)[0] || "Doctor", async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      setUser(null); setScreen("landing"); setLoggingOut(false);
      setEmail(""); setOtp(["","","","","",""]);
    });
  };

  if (screen === "checking")  return <CheckingSession />;
  if (screen === "landing")   return <LandingPage onAccess={() => setScreen("email")} />;
  if (screen === "email")   return <EmailEntry email={email} setEmail={setEmail} error={emailError} isLoading={isLoading} onSubmit={handleSendOTP} onBack={() => setScreen("landing")} />;
  if (screen === "otp")     return <OTPVerify otp={otp} setOtp={setOtp} error={otpError} isLoading={isLoading} onSubmit={handleVerifyOTP} onBack={() => setScreen("email")} email={email} />;
  if (screen === "waiting") return <WaitingScreen user={user} onLogout={handleLogout} />;
  if (screen === "admin")   return <AdminPortal user={user} onLogout={handleLogout} />;
  if (screen === "dashboard") return (
    <DoctorDashboard
      user={user} kpis={liveKpis} claims={CLAIMS_DATA}
      monthlyData={liveMonthlyData} denialData={DENIAL_DATA} payerMix={PAYER_MIX}
      activeTab={activeTab} setActiveTab={setActiveTab}
      onLogout={handleLogout} loggingOut={loggingOut}
    />
  );
  return null;
}

// ─── LANDING PAGE (minimal — no marketing) ───────────────────────────────────
function LandingPage({ onAccess }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bgPrimary,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, \'Segoe UI\', sans-serif",
      padding: "32px 24px",
    }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ marginBottom: 28 }}>
        <VektorLogoMark size={80} />
      </div>
      <h1 style={{
        color: C.textPrimary, fontSize: "clamp(18px,3vw,28px)", fontWeight: 800,
        letterSpacing: 3, textAlign: "center", marginBottom: 6, textTransform: "uppercase",
      }}>
        VEKTOR
      </h1>
      <p style={{
        color: C.textSecond, fontSize: "clamp(10px,1.8vw,13px)", letterSpacing: 4,
        textAlign: "center", marginBottom: 52, textTransform: "uppercase", fontWeight: 500,
      }}>
        PRACTICE REPORTING DASHBOARD
      </p>

      <button
        onClick={onAccess}
        className="vk-btn"
        style={{
          background: C.blue, color: "#FFFFFF", padding: "14px 52px",
          borderRadius: 6, fontWeight: 700, fontSize: 14, border: "none",
          cursor: "pointer", letterSpacing: 1.5,
          boxShadow: "0 4px 18px rgba(30,77,183,0.28)",
          marginBottom: 16,
        }}
      >
        Access Portal
      </button>

      <div style={{ marginBottom: 48 }} />

      <p style={{ color: C.textMuted, fontSize: 10, letterSpacing: 1, textAlign: "center" }}>
        © 2026 Vektor Solutions LLC · Contractual clients only
      </p>
    </div>
  );
}

// ─── AUTH SHELL ───────────────────────────────────────────────────────────────
function AuthShell({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px", background: C.bgPrimary,
      fontFamily: "system-ui, -apple-system, \'Segoe UI\', sans-serif",
    }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{
          background: C.bgCard, borderRadius: 12, padding: "36px 32px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)", border: `1px solid ${C.border}`,
        }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "inline-flex", marginBottom: 14 }}>
              <VektorLogoMark size={52} />
            </div>
            <p style={{
              color: C.textPrimary, fontSize: 13, fontWeight: 700,
              letterSpacing: 2, marginBottom: 4, textTransform: "uppercase",
            }}>{title}</p>
            <p style={{ color: C.textMuted, fontSize: 11 }}>{subtitle}</p>
          </div>
          {children}
        </div>
        <p style={{ textAlign: "center", color: C.textMuted, fontSize: 9, marginTop: 16, letterSpacing: 1 }}>
          🔒 TLS 1.3 · HIPAA · Invite-only
        </p>
      </div>
    </div>
  );
}

// ─── AUTH BUTTON ──────────────────────────────────────────────────────────────
function AuthButton({ children, onClick, loading }) {
  return (
    <button
      onClick={onClick} disabled={loading}
      style={{
        width: "100%", background: loading ? C.textMuted : C.blue, color: "#FFFFFF",
        padding: "12px", borderRadius: 6, fontWeight: 700, fontSize: 13, border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: loading ? "none" : "0 4px 14px rgba(30,77,183,0.25)",
        transition: "all 0.2s", letterSpacing: 0.5,
      }}
    >
      {children}
    </button>
  );
}

// ─── EMAIL ENTRY ──────────────────────────────────────────────────────────────
function EmailEntry({ email, setEmail, error, isLoading, onSubmit, onBack }) {
  return (
    <AuthShell title="SECURE PORTAL LOGIN" subtitle="Professional email only · No passwords">
      <div style={{ marginBottom: 12 }}>
        <label style={{ color: C.textSecond, fontSize: 11, display: "block", marginBottom: 6 }}>
          Professional Email Address
        </label>
        <input
          type="email" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          placeholder="dr.name@yourpractice.com"
          style={{
            width: "100%", background: C.bgCardAlt,
            border: `1px solid ${error ? C.red : C.border}`,
            borderRadius: 6, padding: "10px 14px",
            color: C.textPrimary, fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
        {error && <p style={{ color: C.red, fontSize: 11, marginTop: 4 }}>{error}</p>}
        <p style={{ color: C.textMuted, fontSize: 10, marginTop: 6 }}>
          We'll send a 6-digit secure code. No passwords required.
        </p>
      </div>
      <AuthButton onClick={onSubmit} loading={isLoading}>
        {isLoading ? "Sending Secure Code..." : "Send Secure Access Code"}
      </AuthButton>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: C.textMuted,
        fontSize: 11, cursor: "pointer", marginTop: 8, width: "100%",
      }}>← Back</button>
    </AuthShell>
  );
}

// ─── OTP VERIFY ───────────────────────────────────────────────────────────────
function OTPVerify({ otp, setOtp, error, isLoading, onSubmit, onBack, email }) {
  const refs = useRef([]);

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val;
    setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <AuthShell title="VERIFY SECURE CODE" subtitle={`Code sent to ${email}`}>
      <p style={{ color: C.textSecond, fontSize: 11, marginBottom: 12 }}>
        Enter the 6-digit code from your email
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        {otp.map((d, i) => (
          <input
            key={i} ref={el => refs.current[i] = el}
            maxLength={1} value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            style={{
              width: 42, height: 52, textAlign: "center", fontSize: 22, fontWeight: 700,
              background: C.bgCardAlt,
              border: `1px solid ${error ? C.red : d ? C.blue : C.border}`,
              borderRadius: 8, color: C.textPrimary, outline: "none", fontFamily: "monospace",
            }}
          />
        ))}
      </div>
      {error && <p style={{ color: C.red, fontSize: 11, marginBottom: 8, textAlign: "center" }}>{error}</p>}
      <p style={{ color: C.textMuted, fontSize: 10, marginBottom: 12, textAlign: "center" }}>
        Code expires in 10 minutes · Max 5 attempts
      </p>
      <AuthButton onClick={onSubmit} loading={isLoading}>
        {isLoading ? "Verifying..." : "Verify & Access Portal"}
      </AuthButton>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: C.textMuted,
        fontSize: 11, cursor: "pointer", marginTop: 8, width: "100%",
      }}>← Request new code</button>
    </AuthShell>
  );
}

// ─── WAITING SCREEN ───────────────────────────────────────────────────────────
function WaitingScreen({ user, onLogout }) {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.bgPrimary, fontFamily: "system-ui, sans-serif",
    }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
        <div style={{
          width: 60, height: 60, border: `3px solid ${C.border}`,
          borderTop: `3px solid ${C.blue}`, borderRadius: "50%",
          margin: "0 auto 24px", animation: "spin 1s linear infinite",
        }} />
        <h2 style={{ color: C.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Access Pending Approval
        </h2>
        <p style={{ color: C.textSecond, fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>
          Your account is being reviewed by the Vektor team. You'll receive an email at{" "}
          <span style={{ color: C.blue }}>{user?.email}</span> once approved.
        </p>
        <div style={{
          textAlign: "left", background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 20, marginBottom: 24,
        }}>
          {[
            ["1", "Admin verifies your practice details"],
            ["2", "Google Sheet access is configured"],
            ["3", "You receive a confirmation email"],
          ].map(([n, t]) => (
            <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
              <span style={{
                background: C.blue, color: "#fff", borderRadius: "50%",
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{n}</span>
              <p style={{ color: C.textSecond, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{t}</p>
            </div>
          ))}
        </div>
        <p style={{ color: C.textMuted, fontSize: 12 }}>
          Questions? Contact <a href="mailto:support@veksol.com" style={{ color: C.blue }}>support@veksol.com</a>
        </p>
        <button onClick={onLogout} className="vk-btn" style={{
          marginTop: 16, background: "none", border: `1px solid ${C.border}`,
          color: C.textMuted, padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 12,
        }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── DOCTOR DASHBOARD ─────────────────────────────────────────────────────────
function DoctorDashboard({ user, kpis, claims, monthlyData, denialData, payerMix, activeTab, setActiveTab, onLogout, loggingOut }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  const tabs = ["overview", "claims", "denials", "revenue", "vembot"];

  return (
    <div style={{ minHeight: "100vh", background: C.bgPrimary, display: "flex", fontFamily: "system-ui, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>

      {/* SIDEBAR */}
      <aside style={{
        width: 210, background: S.bg, borderRight: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        {/* Logo + Doctor info */}
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ marginBottom: 14 }}>
            <VektorLogoFull height={34} darkBg />
          </div>
          <div style={{ fontSize: 11, color: S.text, fontWeight: 600, lineHeight: 1.4 }}>{user.title}</div>
          <div style={{ fontSize: 10, color: S.muted, marginTop: 2 }}>{user.specialty}</div>
          <div style={{ fontSize: 9, color: S.muted, marginTop: 2, opacity: 0.7 }}>{user.practice}</div>

          {/* Weather */}
          <div style={{
            marginTop: 10, background: S.cardBg, border: `1px solid ${S.border}`,
            borderRadius: 6, padding: "6px 8px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>☀️</span>
            <div>
              <div style={{ color: S.text, fontSize: 10, fontWeight: 600 }}>{user.city}, {user.state}</div>
              <div style={{ color: S.muted, fontSize: 9 }}>68°F · Sunny</div>
            </div>
          </div>

          {/* Clock */}
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <div style={{ color: S.cyan, fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{timeStr}</div>
            <div style={{ color: S.muted, fontSize: 9 }}>{dateStr}</div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ flex: 1, paddingTop: 8 }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 16px",
                background: activeTab === tab ? S.active : "transparent",
                color: activeTab === tab ? S.cyan : S.muted,
                fontSize: 11, fontWeight: activeTab === tab ? 700 : 400,
                border: "none",
                borderLeft: activeTab === tab ? `2px solid ${S.cyan}` : "2px solid transparent",
                cursor: "pointer", letterSpacing: 1, transition: "all 0.15s",
                textTransform: "uppercase",
              }}
            >
              {tab === "vembot" ? "⚡ VEMBOT AI" : {
                overview: "◉ OVERVIEW",
                claims:   "≡ CLAIMS",
                denials:  "✕ DENIALS",
                revenue:  "$ REVENUE",
              }[tab]}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${S.border}` }}>
          <button
            onClick={() => setSettingsOpen(true)}
            className="vk-btn"
            style={{
              width: "100%", background: S.cardBg, border: `1px solid ${S.border}`,
              color: S.muted, padding: 7, borderRadius: 6, fontSize: 11, cursor: "pointer", letterSpacing: 1,
            }}
          >
            ⚙ SETTINGS
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {/* Top bar */}
        <header style={{
          background: C.bgCard, borderBottom: `1px solid ${C.border}`,
          padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700 }}>
              VEKTOR — PRACTICE REPORTING DASHBOARD
            </span>
            <span style={{ color: C.border }}>·</span>
            <span style={{ color: C.textMuted, fontSize: 11 }}>
              {getGreeting()}, Dr. {user.name.split(" ").slice(-1)[0]}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              background: "#1A8F5520", border: "1px solid #1A8F5540",
              color: C.green, fontSize: 9, padding: "3px 8px", borderRadius: 4, fontFamily: "monospace",
            }}>■ HIPAA</span>
            <span style={{ color: C.textMuted, fontSize: 10 }}>Last sync: 2 min ago</span>
            <button className="vk-btn" style={{
              background: C.bgCardDark, border: `1px solid ${C.border}`,
              color: C.textSecond, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600,
            }}>
              ↓ Export
            </button>
          </div>
        </header>

        {/* Page content */}
        <div style={{ padding: "20px 24px", flex: 1 }}>
          {activeTab === "overview" && <OverviewTab kpis={kpis} claims={claims} monthlyData={monthlyData} payerMix={payerMix} user={user} />}
          {activeTab === "claims"   && <ClaimsTab claims={claims} />}
          {activeTab === "denials"  && <DenialsTab denialData={denialData} />}
          {activeTab === "revenue"  && <RevenueTab kpis={kpis} monthlyData={monthlyData} payerMix={payerMix} />}
          {activeTab === "vembot"   && <VembotFullTab user={user} kpis={kpis} />}
        </div>
      </main>

      {settingsOpen && <SettingsPanel user={user} onClose={() => setSettingsOpen(false)} onLogout={() => { setSettingsOpen(false); onLogout(); }} />}

      {loggingOut && (
        <div style={{
          position: "fixed", inset: 0, background: "#000000CC", zIndex: 100,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
        }}>
          <div style={{
            width: 60, height: 60, border: `3px solid ${C.border}`,
            borderTop: `3px solid ${C.red}`, borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>TERMINATING SESSION</p>
          <p style={{ color: "#CCCCCC", fontSize: 12 }}>Good Bye, Dr. {user.name.split(" ").slice(-1)[0]}.</p>
        </div>
      )}
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ kpis, claims, monthlyData, payerMix, user }) {
  const [vembotOpen, setVembotOpen] = useState(true);
  return (
    <div>
      {/* KPI Cards row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
        <KPICard value={`${kpis.recoveryRate}%`} label="Recovery Rate" delta={kpis.recoveryRateDelta} color={C.blue} />
        <KPICard value={fmtUSD(kpis.mtdRevenue)} label={`${kpis.mtdLabel || "MTD"} Revenue`} delta={kpis.mtdRevenueDelta} color={C.blue} />
        <KPICard value={fmtUSD(kpis.ytdRevenue)} label="YTD Revenue (Jan–May)" delta={kpis.ytdRevenueDelta} note="Jan 1 – May 22, 2026" color={C.gold} gold />
      </div>

      {/* KPI Cards row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
        <KPICard value={String(kpis.claimsProcessed)} label="Claims Processed" delta={kpis.claimsDelta} color={C.blue} />
        <KPICard value={`${kpis.billingAccuracy}%`} label="Billing Accuracy" delta={kpis.accuracyDelta} color={C.blue} />
        <KPICard value={fmtUSD(kpis.outstandingAR)} label="In Pipeline (A/R)" delta={kpis.arDelta} color={C.orange} />
      </div>

      {/* Revenue note */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`,
        borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 11, color: C.textSecond, lineHeight: 1.6,
      }}>
        <strong style={{ color: C.gold }}>Revenue Note:</strong> MAY MTD ($38,420) = collected approved claims for May 1–19 only.
        YTD ($187,650) = all collected revenue Jan–May 2026. Bar chart shows each month's MTD, not cumulative YTD.
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 200px", gap: 12, marginBottom: 12 }}>
        {/* Donut */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>COLLECTIONS</p>
          <ResponsiveContainer width="100%" height={110}>
            <PieChart>
              <Pie data={[{value:95},{value:5}]} cx="50%" cy="50%" innerRadius={30} outerRadius={48}
                startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                <Cell fill={C.blue} />
                <Cell fill={C.border} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <p style={{ textAlign: "center", color: C.blue, fontSize: 20, fontWeight: 800, marginTop: -16 }}>95%</p>
          <p style={{ textAlign: "center", color: C.textMuted, fontSize: 9, marginTop: 2 }}>RECOVERED</p>
        </div>

        {/* Bar chart */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 8 }}>
            <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>MONTHLY MTD PERFORMANCE</p>
            <div style={{ display:"flex", gap:10, fontSize:9, color:C.textMuted }}>
              <span><span style={{color:C.textMuted}}>■</span> Prior year</span>
              <span><span style={{color:C.blue}}>■</span> Current year</span>
              <span><span style={{color:C.gold}}>■</span> This month</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={monthlyData} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: `${C.border}40` }} />
              <Bar dataKey="mtd" radius={[3,3,0,0]}>
                {monthlyData.map((d,i) => (
                  <Cell key={i} fill={
                    d.source === "prior" ? C.textMuted :
                    i === monthlyData.length-1 ? C.gold : C.blue
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payer mix */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>PAYER MIX</p>
          <ResponsiveContainer width="100%" height={80}>
            <PieChart>
              <Pie data={payerMix} cx="50%" cy="50%" innerRadius={22} outerRadius={38} dataKey="value" stroke="none">
                {payerMix.map((d,i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                formatter={(v) => [`${v}%`]}
                contentStyle={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 10 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 4 }}>
            {payerMix.map(p => (
              <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textSecond, marginBottom: 1 }}>
                <span><span style={{ color: p.color }}>■</span> {p.name}</span>
                <span>{p.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Claims snapshot + VEMBOT */}
      <div style={{ display: "grid", gridTemplateColumns: vembotOpen ? "1fr 300px" : "1fr", gap: 12 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: C.textPrimary, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>CLAIMS SNAPSHOT</span>
            <button
              onClick={() => setVembotOpen(v => !v)}
              style={{ background: "none", border: "none", color: C.textMuted, fontSize: 10, cursor: "pointer" }}
            >
              {vembotOpen ? "Hide VEMBOT" : "Show VEMBOT"}
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.bgCardDark }}>
                {["CLAIM ID","PATIENT","PAYER","BILLED","COLLECTED","STATUS"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.gold, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.slice(0,6).map((c,i) => (
                <tr key={c.id} className="vk-row-hover" style={{ background: i%2===0 ? C.bgCard : C.bgCardAlt, borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ padding: "6px 10px", color: C.blue, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{c.id}</td>
                  <td style={{ padding: "6px 10px", color: C.textSecond, fontSize: 11 }}>{c.patient}</td>
                  <td style={{ padding: "6px 10px", color: C.textSecond, fontSize: 11 }}>{c.payer}</td>
                  <td style={{ padding: "6px 10px", color: C.textPrimary, fontSize: 11, fontWeight: 600 }}>{fmtUSD(c.billed)}</td>
                  <td style={{ padding: "6px 10px", color: c.collected ? C.green : C.textMuted, fontSize: 11 }}>{fmtUSD(c.collected)}</td>
                  <td style={{ padding: "6px 10px" }}><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vembotOpen && <VembotPanel user={user} compact />}
      </div>
    </div>
  );
}

// ─── VEMBOT PANEL ─────────────────────────────────────────────────────────────
function VembotPanel({ user, compact }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: `${getGreeting()}, Dr. ${user.name.split(" ").slice(-1)[0]}. Your recovery rate is 94.8% — above your 92% target. YTD revenue: $187,650. How can I help?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const quickChips = ["Performance this month?","Top denial reasons","Claim CV-3198","Outstanding A/R breakdown"];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (text) => {
    const q = text || input;
    if (!q.trim()) return;
    setMessages(m => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await response.json();
      const reply = data?.reply || "I'm processing your billing data. Please try again.";
      setMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Unable to reach AI engine. Please check your connection." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.cyan}44`,
      borderRadius: 8, display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
        <span style={{ color: C.textPrimary, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>VEMBOT</span>
        <span style={{ color: C.green, fontSize: 9, marginLeft: 2 }}>AI ONLINE</span>
        <span style={{ marginLeft: "auto", color: C.textMuted, fontSize: 9, fontFamily: "monospace" }}>50q/day</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, maxHeight: compact ? 220 : 400 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ maxWidth: "90%", alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              background: m.role === "user" ? C.bgCardDark : C.bgCardAlt,
              border: `1px solid ${C.border}`,
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "8px 12px", color: C.textSecond, fontSize: 11, lineHeight: 1.6,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start" }}>
            <div style={{
              background: C.bgCardAlt, border: `1px solid ${C.border}`,
              borderRadius: "12px 12px 12px 2px", padding: "8px 12px",
              color: C.blue, fontSize: 11,
            }}>
              Analyzing billing data<span style={{ animation: "blink 1s infinite" }}>...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "6px 14px", display: "flex", gap: 4, flexWrap: "wrap", borderTop: `1px solid ${C.borderLight}` }}>
        {quickChips.map(chip => (
          <button key={chip} onClick={() => sendMessage(chip)} className="vk-btn" style={{
            background: C.bgCardDark, border: `1px solid ${C.border}`,
            color: C.blue, fontSize: 9, padding: "3px 8px", borderRadius: 10, cursor: "pointer",
          }}>{chip}</button>
        ))}
      </div>
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Ask VEMBOT about your claims..."
          style={{
            flex: 1, background: C.bgCardAlt, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "7px 10px", color: C.textPrimary,
            fontSize: 11, outline: "none",
          }}
        />
        <button onClick={() => sendMessage()} className="vk-btn" style={{
          background: C.blue, color: "#fff", border: "none",
          borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 11,
        }}>↑</button>
      </div>
    </div>
  );
}

// ─── CLAIMS TAB ───────────────────────────────────────────────────────────────
function ClaimsTab({ claims }) {
  const [filter, setFilter] = useState("ALL");
  const statuses = ["ALL","PAID","PENDING","DENIED","IN APPEAL"];
  const filtered = filter === "ALL" ? claims : claims.filter(c => c.status === filter);

  return (
    <div>
      <SectionHeader title="CLAIMS MANAGEMENT" sub="All billing claims for this period" />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)} className="vk-btn" style={{
            background: filter === s ? C.blue : C.bgCard,
            color: filter === s ? "#fff" : C.textMuted,
            border: `1px solid ${filter === s ? C.blue : C.border}`,
            padding: "5px 14px", borderRadius: 6, fontSize: 11,
            cursor: "pointer", fontWeight: filter === s ? 700 : 400,
          }}>{s}</button>
        ))}
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bgCardDark }}>
              {["CLAIM ID","PATIENT","PAYER","CPT","DOS","BILLED","COLLECTED","STATUS"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: C.gold, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c,i) => (
              <tr key={c.id} className="vk-row-hover" style={{ background: i%2===0 ? C.bgCard : C.bgCardAlt, borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: "8px 12px", color: C.blue, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{c.id}</td>
                <td style={{ padding: "8px 12px", color: C.textSecond, fontSize: 11 }}>{c.patient}</td>
                <td style={{ padding: "8px 12px", color: C.textSecond, fontSize: 11 }}>{c.payer}</td>
                <td style={{ padding: "8px 12px", color: C.textMuted, fontSize: 10, fontFamily: "monospace" }}>{c.cpt}</td>
                <td style={{ padding: "8px 12px", color: C.textMuted, fontSize: 10 }}>{c.dos}</td>
                <td style={{ padding: "8px 12px", color: C.textPrimary, fontSize: 11, fontWeight: 600 }}>{fmtUSD(c.billed)}</td>
                <td style={{ padding: "8px 12px", color: c.collected ? C.green : C.textMuted, fontSize: 11, fontWeight: c.collected ? 600 : 400 }}>{fmtUSD(c.collected)}</td>
                <td style={{ padding: "8px 12px" }}><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DENIALS TAB ──────────────────────────────────────────────────────────────
function DenialsTab({ denialData }) {
  return (
    <div>
      <SectionHeader title="DENIAL PARETO ANALYSIS" sub="Top 5 denial reasons this billing period" />
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bgCardDark }}>
              {["RANK","REASON","COUNT","SHARE","BAR"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: C.gold, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {denialData.map((d,i) => (
              <tr key={i} className="vk-row-hover" style={{ background: i%2===0 ? C.bgCard : C.bgCardAlt, borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: "10px 12px", color: C.gold, fontSize: 13, fontWeight: 700 }}>#{i+1}</td>
                <td style={{ padding: "10px 12px", color: C.textPrimary, fontSize: 11 }}>{d.reason}</td>
                <td style={{ padding: "10px 12px", color: C.blue, fontSize: 13, fontWeight: 700 }}>{d.count}</td>
                <td style={{ padding: "10px 12px", color: C.textSecond, fontSize: 11 }}>{d.pct}%</td>
                <td style={{ padding: "10px 12px", width: 200 }}>
                  <div style={{ height: 8, background: C.borderLight, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${d.pct}%`, background: C.red, borderRadius: 4, transition: "width 0.6s" }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── REVENUE TAB ──────────────────────────────────────────────────────────────
function RevenueTab({ kpis, monthlyData, payerMix }) {
  return (
    <div>
      <SectionHeader title="REVENUE INTELLIGENCE" sub="MTD + YTD breakdown · Trend analysis" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: 20, textAlign: "center" }}>
          <p style={{ color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>{kpis.mtdLabel || "MTD"} REVENUE</p>
          <p style={{ color: C.gold, fontSize: 36, fontWeight: 800 }}>{fmtUSD(kpis.mtdRevenue)}</p>
          <p style={{ color: C.green, fontSize: 11, marginTop: 4 }}>{kpis.mtdRevenueDelta}</p>
          <p style={{ color: C.textMuted, fontSize: 9, marginTop: 6 }}>Current month · Approved/Collected only</p>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.blue}44`, borderRadius: 8, padding: 20, textAlign: "center" }}>
          <p style={{ color: C.blue, fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>YTD REVENUE (2026)</p>
          <p style={{ color: C.blue, fontSize: 36, fontWeight: 800 }}>{fmtUSD(kpis.ytdRevenue)}</p>
          <p style={{ color: C.green, fontSize: 11, marginTop: 4 }}>{kpis.ytdRevenueDelta} vs full-year 2025</p>
          <p style={{ color: C.textMuted, fontSize: 9, marginTop: 6 }}>Jan 1 – May 22, 2026 · All collected payments</p>
        </div>
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>MONTHLY MTD PERFORMANCE — OCT 2025 TO MAY 2026</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthlyData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={v => `$${v/1000}k`} />
            <Tooltip content={<CustomBarTooltip />} cursor={{ fill: `${C.border}40` }} />
            <Bar dataKey="mtd" radius={[4,4,0,0]}>
              {monthlyData.map((d,i) => (
                <Cell key={i} fill={
                  d.source === "prior" ? C.textMuted :
                  i === monthlyData.length-1 ? C.gold : C.blue
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 10 }}>PAYER MIX BREAKDOWN</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {payerMix.map(p => (
            <div key={p.name} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: C.bgCardAlt, borderRadius: 6, padding: "8px 12px",
            }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.textPrimary, fontSize: 11, fontWeight: 600 }}>{p.name}</div>
                <div style={{ height: 4, background: C.borderLight, borderRadius: 2, marginTop: 3 }}>
                  <div style={{ height: "100%", width: `${p.value}%`, background: p.color, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ color: p.color, fontSize: 12, fontWeight: 700 }}>{p.value}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── VEMBOT FULL TAB ──────────────────────────────────────────────────────────
function VembotFullTab({ user, kpis }) {
  return (
    <div>
      <SectionHeader title="VEMBOT AI AGENT" sub="Natural language billing intelligence · 50 queries/day" />
      <div style={{ maxWidth: 680 }}>
        <VembotPanel user={user} />
      </div>
    </div>
  );
}

// ─── ADMIN PORTAL ─────────────────────────────────────────────────────────────
function AdminPortal({ user, onLogout }) {
  const [doctors, setDoctors]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm]             = useState({ name:"",email:"",specialty:"",practice:"",city:"",state:"",sheetUrl:"" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError]     = useState("");
  // Sheet status: { [doctorId]: { testing, connected, message, serviceAccountEmail } }
  const [sheetStatus, setSheetStatus] = useState({});
  // Inline sheet URL editing: { [doctorId]: string }
  const [editingSheet, setEditingSheet] = useState({});

  // ── Fetch doctors from Supabase on mount ──────────────────────────────────
  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (data.users) {
        setDoctors(data.users.map(u => ({
          id:       u.id,
          name:     u.full_name,
          title:    u.title,
          email:    u.email,
          practice: u.practice || "—",
          specialty:u.specialty || "—",
          location: u.city && u.state ? `${u.city}, ${u.state}` : "—",
          status:   u.verified ? "VERIFIED" : "PENDING",
          sheetUrl: u.sheet_url || "",
          lastSync: u.sheet_url ? "Sheet set" : "No sheet",
        })));
      }
    } catch { /* keep empty */ }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    try {
      await fetch("/api/admin/approveDoctor", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDoctors(d => d.map(doc => doc.id === id ? { ...doc, status:"VERIFIED" } : doc));
    } catch { /* silent */ }
  };

  const handleRemove = async (id) => {
    if (!window.confirm("Remove this doctor? This cannot be undone.")) return;
    try {
      await fetch("/api/admin/approveDoctor", {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDoctors(d => d.filter(doc => doc.id !== id));
    } catch { /* silent */ }
  };

  const handleAdd = async () => {
    if (!form.email || !form.name) { setAddError("Email and name are required."); return; }
    setAddLoading(true); setAddError("");
    try {
      const res = await fetch("/api/admin/addDoctor", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email, full_name: form.name,
          title: form.name, specialty: form.specialty,
          practice: form.practice, city: form.city,
          state: form.state, sheet_url: form.sheetUrl || null,
          verified: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || "Failed to add doctor."); }
      else {
        setForm({ name:"",email:"",specialty:"",practice:"",city:"",state:"",sheetUrl:"" });
        setShowAdd(false);
        fetchDoctors();
      }
    } catch { setAddError("Network error. Please try again."); }
    setAddLoading(false);
  };

  // ── Sheet URL: save inline edit ───────────────────────────────────────────
  const handleSaveSheetUrl = async (id) => {
    const url = editingSheet[id] ?? "";
    try {
      await fetch("/api/admin/updateSheet", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: id, sheetUrl: url }),
      });
      setDoctors(d => d.map(doc => doc.id === id ? { ...doc, sheetUrl: url, lastSync: url ? "Sheet set" : "No sheet" } : doc));
      setEditingSheet(e => { const n = {...e}; delete n[id]; return n; });
      // Clear previous status so it shows as untested after URL change
      setSheetStatus(s => { const n = {...s}; delete n[id]; return n; });
    } catch { /* silent */ }
  };

  // ── Test sheet connection ─────────────────────────────────────────────────
  const handleTestSheet = async (id) => {
    setSheetStatus(s => ({ ...s, [id]: { testing: true } }));
    try {
      const res = await fetch("/api/admin/testSheet", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: id }),
      });
      const data = await res.json();
      setSheetStatus(s => ({ ...s, [id]: { testing: false, connected: data.connected, message: data.message, serviceAccountEmail: data.serviceAccountEmail } }));
    } catch {
      setSheetStatus(s => ({ ...s, [id]: { testing: false, connected: false, message: "Network error testing sheet." } }));
    }
  };

  const verified   = doctors.filter(d => d.status === "VERIFIED").length;
  const pending    = doctors.filter(d => d.status === "PENDING").length;
  const sheetReady = doctors.filter(d => d.sheetUrl).length;

  return (
    <div style={{ minHeight: "100vh", background: C.bgPrimary, fontFamily: "system-ui, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      <header style={{
        background: C.bgCard, borderBottom: `1px solid ${C.border}`,
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <VektorLogoFull height={28} />
          <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
            ADMIN — PRACTICE REPORTING DASHBOARD
          </span>
          <span style={{
            background: `${C.red}20`, border: `1px solid ${C.red}44`,
            color: C.red, fontSize: 9, padding: "2px 8px", borderRadius: 4,
          }}>ADMIN ONLY</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: C.textMuted, fontSize: 11 }}>support@veksol.com</span>
          <button onClick={() => setShowAdd(true)} className="vk-btn" style={{
            background: C.blue, color: "#fff", border: "none",
            padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>+ Add Doctor</button>
          <button onClick={() => setSettingsOpen(true)} className="vk-btn" style={{
            background: "transparent", border: `1px solid ${C.border}`,
            color: C.textMuted, padding: "6px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
          }}>⚙</button>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 20 }}>
          <KPICard value="20"              label="Max Capacity"      color={C.textMuted} />
          <KPICard value={String(verified)} label="Active Doctors"   color={C.green} />
          <KPICard value={String(pending)}  label="Pending Approval" color={C.orange} />
          <KPICard value={String(sheetReady)} label="Sheets Connected" color={C.blue} />
          <KPICard value={String(20 - doctors.length)} label="Available Slots" color={C.blue} />
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding: 40 }}>
            <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.blue}`, borderRadius:"50%", margin:"0 auto 12px", animation:"spin 1s linear infinite" }} />
            <p style={{ color: C.textMuted, fontSize:11 }}>Loading doctors from Supabase...</p>
          </div>
        ) : (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.bgCardDark }}>
                {["DOCTOR / EMAIL","PRACTICE","SPECIALTY","STATUS","SHEET CONNECTION","ACTIONS"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.gold, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doctors.filter(d => d.email !== "support@veksol.com").map((doc,i) => {
                const ss = sheetStatus[doc.id];
                const isEditing = doc.id in editingSheet;
                return (
                  <tr key={doc.id} className="vk-row-hover" style={{ background: i%2===0 ? C.bgCard : C.bgCardAlt, borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ color: C.textPrimary, fontSize: 11, fontWeight: 600 }}>{doc.name}</div>
                      <div style={{ color: C.textMuted, fontSize: 9, fontFamily: "monospace" }}>{doc.email}</div>
                      <div style={{ color: C.textMuted, fontSize: 9 }}>{doc.location}</div>
                    </td>
                    <td style={{ padding: "10px 14px", color: C.textSecond, fontSize: 11 }}>{doc.practice}</td>
                    <td style={{ padding: "10px 14px", color: C.textSecond, fontSize: 11 }}>{doc.specialty}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <StatusBadge status={doc.status === "PENDING" ? "PENDING_A" : "VERIFIED"} />
                    </td>

                    {/* SHEET CONNECTION CELL */}
                    <td style={{ padding: "10px 14px", minWidth: 280 }}>
                      {/* URL input row */}
                      <div style={{ display:"flex", gap:4, marginBottom:4, alignItems:"center" }}>
                        <input
                          value={isEditing ? editingSheet[doc.id] : (doc.sheetUrl || "")}
                          onChange={e => setEditingSheet(ed => ({ ...ed, [doc.id]: e.target.value }))}
                          onFocus={() => { if (!isEditing) setEditingSheet(ed => ({ ...ed, [doc.id]: doc.sheetUrl || "" })); }}
                          placeholder="Paste Google Sheet URL..."
                          style={{
                            flex:1, background: C.bgCardDark, border:`1px solid ${C.border}`,
                            borderRadius:4, padding:"4px 7px", color: C.textPrimary, fontSize:9,
                            outline:"none", fontFamily:"monospace",
                          }}
                        />
                        {isEditing && (
                          <button onClick={() => handleSaveSheetUrl(doc.id)} className="vk-btn" style={{
                            background: C.blue, color:"#fff", border:"none",
                            borderRadius:4, padding:"4px 8px", fontSize:9, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap",
                          }}>SAVE</button>
                        )}
                      </div>

                      {/* Status row */}
                      {!doc.sheetUrl && !ss && (
                        <div style={{ fontSize:9, color: C.orange }}>
                          ⚠ No sheet set — add URL above then test
                        </div>
                      )}
                      {doc.sheetUrl && !ss && (
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:9, color: C.textMuted }}>● Not tested yet</span>
                          <button onClick={() => handleTestSheet(doc.id)} className="vk-btn" style={{
                            background:`${C.blue}15`, border:`1px solid ${C.border}`,
                            color: C.blue, fontSize:9, padding:"2px 7px", borderRadius:4, cursor:"pointer",
                          }}>TEST</button>
                        </div>
                      )}
                      {ss?.testing && (
                        <span style={{ fontSize:9, color: C.textMuted, animation:"blink 1s infinite", display:"inline-block" }}>Testing connection...</span>
                      )}
                      {ss && !ss.testing && (
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                            <span style={{ fontSize:10, color: ss.connected ? C.green : C.red, fontWeight:700 }}>
                              {ss.connected ? "✓ CONNECTED" : "✕ NOT CONNECTED"}
                            </span>
                            <button onClick={() => handleTestSheet(doc.id)} className="vk-btn" style={{
                              background:"transparent", border:`1px solid ${C.border}`,
                              color: C.textMuted, fontSize:8, padding:"1px 5px", borderRadius:3, cursor:"pointer",
                            }}>RETEST</button>
                          </div>
                          <div style={{ fontSize:9, color: C.textMuted, lineHeight:1.5 }}>{ss.message}</div>
                          {!ss.connected && ss.serviceAccountEmail && ss.serviceAccountEmail !== "not set" && (
                            <div style={{
                              marginTop:4, background:`${C.blue}10`, border:`1px solid ${C.blue}33`,
                              borderRadius:4, padding:"4px 6px",
                            }}>
                              <div style={{ fontSize:8, color: C.textMuted, marginBottom:1 }}>Share sheet with:</div>
                              <div style={{ fontSize:9, color: C.blue, fontFamily:"monospace", wordBreak:"break-all" }}>{ss.serviceAccountEmail}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6, flexDirection:"column" }}>
                        <div style={{ display:"flex", gap:4 }}>
                          {doc.status === "PENDING" && (
                            <button onClick={() => handleApprove(doc.id)} className="vk-btn" style={{
                              background: `${C.green}20`, border: `1px solid ${C.green}44`,
                              color: C.green, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontWeight: 700,
                            }}>APPROVE</button>
                          )}
                          <button onClick={() => handleRemove(doc.id)} className="vk-btn" style={{
                            background: `${C.red}10`, border: `1px solid ${C.red}33`,
                            color: C.red, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                          }}>REMOVE</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", background: C.bgCardDark, borderTop: `1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ color: C.textMuted, fontSize: 10, fontFamily: "monospace" }}>
              Portal Capacity: {doctors.length - 1} / 20 Doctors · {20 - (doctors.length - 1)} slots remaining
            </span>
            <span style={{ color: C.textMuted, fontSize: 9 }}>
              Sheet data auto-refreshes daily at 2:00 AM EST
            </span>
          </div>
        </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "#000000BB", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: "100%", maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 700 }}>Add New Doctor</p>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <p style={{ color: C.textMuted, fontSize: 10, marginBottom: 16 }}>Admin-controlled · No self-registration · Invite email sent automatically</p>
            {addError && <div style={{ background:`${C.red}15`, border:`1px solid ${C.red}44`, borderRadius:6, padding:"8px 12px", marginBottom:12, color:C.red, fontSize:11 }}>{addError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Professional Email *","email","dr.name@practice.com"],
                ["Full Name *","name","Dr. Jane Smith MD"],
                ["Specialty *","specialty","Physical Therapy"],
                ["Practice Name *","practice","Western PT"],
                ["City *","city","Los Angeles"],
                ["State (2-char) *","state","CA"],
              ].map(([label, key, placeholder]) => (
                <div key={key} style={{ gridColumn: key === "email" ? "1/-1" : undefined }}>
                  <label style={{ color: C.textSecond, fontSize: 10, display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: "100%", background: C.bgCardAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", color: C.textPrimary, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: C.textSecond, fontSize: 10, display: "block", marginBottom: 4 }}>Google Sheet URL <span style={{color:C.textMuted}}>(optional — can add later)</span></label>
                <input
                  value={form.sheetUrl} onChange={e => setForm(f => ({ ...f, sheetUrl: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ width: "100%", background: C.bgCardAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", color: C.textPrimary, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={handleAdd} disabled={addLoading} className="vk-btn" style={{
                flex: 1, background: addLoading ? C.textMuted : C.blue, color: "#fff", border: "none",
                padding: 11, borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: addLoading ? "not-allowed" : "pointer",
              }}>{addLoading ? "Adding..." : "Add Doctor & Send Invite"}</button>
              <button onClick={() => setShowAdd(false)} className="vk-btn" style={{
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.textMuted, padding: "11px 18px", borderRadius: 6, cursor: "pointer", fontSize: 12,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsPanel user={user} onClose={() => setSettingsOpen(false)} onLogout={onLogout} />}
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({ user, onClose, onLogout }) {
  const [tab, setTab] = useState("about");
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000AA", zIndex: 40 }} onClick={onClose}>
      <div
        style={{ position: "absolute", right: 0, top: 0, height: "100%", width: 320, background: C.bgCard, border: `1px solid ${C.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>SETTINGS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {[["about","About"],["help","Help"],["logout","Sign Out"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: 10,
              background: tab === t ? C.bgCardAlt : "transparent",
              color: tab === t ? C.blue : C.textMuted,
              border: "none", borderBottom: tab === t ? `2px solid ${C.blue}` : "2px solid transparent",
              cursor: "pointer", fontSize: 11, letterSpacing: 1,
            }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {tab === "about" && (
            <div>
              <p style={{ color: C.gold, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Vektor Solutions LLC</p>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  ["Version","v5.0 · May 2026"],
                  ["Portal","VEKTOR — PRACTICE REPORTING DASHBOARD"],
                  ["Company","Vektor Solutions LLC"],
                  ["Location","Claymont, Delaware, USA"],
                  ["Email","support@veksol.com"],
                ].map(([k,v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: C.textMuted }}>{k}</span>
                    <span style={{ color: C.textSecond }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, background: C.bgCardAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <p style={{ color: C.textMuted, fontSize: 9, lineHeight: 1.6 }}>
                  © 2026 Vektor Solutions LLC. Patent Pending. All rights reserved.
                  Proprietary software. Unauthorized reproduction prohibited.
                </p>
              </div>
            </div>
          )}
          {tab === "help" && (
            <div>
              <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Help & Support</p>
              <div style={{ display: "grid", gap: 10 }}>
                {[["Email Support","support@veksol.com"],["Portal URL","portal.veksol.com"]].map(([k,v]) => (
                  <div key={k} style={{
                    display: "flex", justifyContent: "space-between",
                    background: C.bgCardAlt, border: `1px solid ${C.border}`,
                    padding: "10px 14px", borderRadius: 6,
                  }}>
                    <span style={{ color: C.textSecond, fontSize: 11 }}>{k}</span>
                    <span style={{ color: C.blue, fontSize: 11 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "logout" && (
            <div style={{ textAlign: "center", paddingTop: 20 }}>
              <p style={{ color: C.textSecond, fontSize: 12, marginBottom: 20, lineHeight: 1.7 }}>
                You will be securely signed out.<br />Your JWT session will be invalidated.
              </p>
              <button onClick={onLogout} className="vk-btn" style={{
                background: C.red, color: "#fff", border: "none",
                padding: "12px 28px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                cursor: "pointer", width: "100%",
                boxShadow: `0 4px 16px ${C.red}44`,
              }}>Sign Out — Terminate Session</button>
              <p style={{ color: C.textMuted, fontSize: 9, marginTop: 12 }}>
                Good Bye, Dr. {user?.name?.split(" ").slice(-1)[0]}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function KPICard({ value, label, delta, note, color = C.blue, gold }) {
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${gold ? `${C.gold}44` : C.border}`,
      borderTop: `2px solid ${gold ? C.gold : color}`,
      borderRadius: 8, padding: "14px 16px",
    }}>
      <p style={{ color: gold ? C.gold : color, fontSize: 22, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ color: C.textMuted, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginBottom: delta ? 4 : 0 }}>{label}</p>
      {delta && <p style={{ color: C.green, fontSize: 10 }}>{delta}</p>}
      {note  && <p style={{ color: C.textMuted, fontSize: 9, marginTop: 2 }}>{note}</p>}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>{title}</p>
      {sub && <p style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

/*
 * ══════════════════════════════════════════════════════════════════════════════
 *  BACKEND INTEGRATION GUIDE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. SUPABASE SCHEMA (users table):
 *    id, email, full_name, specialty, practice, city, state,
 *    role ('doctor'|'admin'), verified (bool), sheet_url, created_at
 *
 * 2. GOOGLE SHEETS INTEGRATION:
 *    - Tab 1: CLAIMS (Claim ID, DOS, Patient, CPT, Payer, Billed, Collected, Status, Denial Reason)
 *    - Tab 2: DASHBOARD_SUMMARY (auto-calculated formulas)
 *    - Access: Service account JSON, read-only, per-doctor sheet URL
 *    - Cache: 5-minute Redis/Upstash cache per doctor
 *
 * 3. AUTH FLOW:
 *    - /api/auth/sendotp: validate email, check supabase, send OTP via Resend
 *    - /api/auth/verifyotp: verify code, issue JWT (httpOnly cookie, 8hr)
 *    - middleware.ts: protect /dashboard/* and /admin/* routes
 *
 * 4. VEMBOT AI:
 *    - /api/ai/query: JWT auth + rate limit (50/day via Redis counter)
 *    - Pass full sheet summary + recent claims as context to Claude Sonnet
 *    - Stream response with Server-Sent Events
 *
 * 5. DEPLOYMENT: Vite + Vercel (frontend) + Supabase (OTP auth + DB) + Anthropic API (VEMBOT)
 * ══════════════════════════════════════════════════════════════════════════════
 */
