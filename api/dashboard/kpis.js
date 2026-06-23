/**
 * GET /api/dashboard/kpis
 * JWT-protected. Returns KPI summary + monthly chart data from doctor's Google Sheet.
 *
 * COLUMN DETECTION: Header-based, not position-based.
 * Works regardless of extra columns any doctor adds.
 *
 * HEADER KEYWORDS (case-insensitive):
 *   Billed      → "total charges", "billed", "charge"
 *   Primary Paid→ "primary paid", "primary payment", "primary amt"
 *   Sec Paid    → "sec paid", "secondary paid", "secondary payment", "sec amt"
 *   Single Paid → "collected", "paid amt", "amount paid"  (if no primary/sec split)
 *   Status      → "status", "claim status"
 *   Payer       → "insurance name", "payer", "insurance", "carrier"
 *   Claim ID    → "claim id", "claim #", "claimid"
 *
 * COLLECTED = Primary Paid + Sec Paid  (or single Collected column if that's all there is)
 *
 * STATUS LOGIC (keyword-based, self-explanatory):
 *   PAID    → contains "paid", "payment", "re-issued", "reissued"
 *   DENIED  → contains "denied", "denial", "rejected", "reject"
 *   PENDING → contains "pending", "in process", "process", "appeal",
 *             "submitted", "review", "in progress"
 */

import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../_auth.js";
import { google } from "googleapis";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

// ── Month helpers ─────────────────────────────────────────────────────────────
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

const getCurrentMonth = () => new Date().getMonth(); // 0-based
const getCurrentYear  = () => new Date().getFullYear();

// ── Tab name candidates (tries every known naming variant) ────────────────────
function getCandidateTabNames(monthIdx, year) {
  const s = MONTH_SHORT[monthIdx];
  const f = MONTH_FULL[monthIdx];
  return [
    `MCR Report - ${f} ${year}`,
    `MCR Report - ${f}`,
    `MCR Report-${f} ${year}`,
    `MCR Report-${f}`,
    `MCR - ${f} ${year}`,
    `MCR - ${f}`,
    `MCR - ${s} ${year}`,
    `MCR - ${s}`,
    `MCR-${s}`,
    `MCR-${f}`,
    `MCR ${s}`,
    `MCR ${f}`,
    f,
    s,
  ];
}

// ── Google Sheets client ──────────────────────────────────────────────────────
function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

function extractSheetId(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

// ── Get all tab names from spreadsheet metadata ───────────────────────────────
async function getAllTabNames(sheets, spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    return (meta.data.sheets || []).map(s => s.properties.title);
  } catch (e) {
    console.error("[kpis] getAllTabNames error:", e.message);
    return [];
  }
}

// ── Read a tab by exact name ──────────────────────────────────────────────────
async function readTab(sheets, spreadsheetId, tabName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A1:AZ2000`,
    });
    return res.data.values || [];
  } catch {
    return null;
  }
}

// ── Find best-matching tab for a given month ──────────────────────────────────
async function findAndReadMCRTab(sheets, spreadsheetId, allTabNames, monthIdx, year) {
  const candidates = getCandidateTabNames(monthIdx, year);
  for (const candidate of candidates) {
    const match = allTabNames.find(
      t => t.trim().toLowerCase() === candidate.toLowerCase()
    );
    if (match) {
      const rows = await readTab(sheets, spreadsheetId, match);
      if (rows && rows.length > 1) return { rows, tabFound: match };
    }
  }
  return { rows: null, tabFound: null };
}

// ── Parse dollar value from any cell format ───────────────────────────────────
function parseDollar(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[$,\s]/g, "").trim());
  return isNaN(n) ? 0 : n;
}

// ── Detect column indices from header row ─────────────────────────────────────
function detectColumns(headerRow) {
  const cols = {
    claimId:      -1,
    payer:        -1,
    billed:       -1,
    primaryPaid:  -1,
    secPaid:      -1,
    collected:    -1,
    status:       -1,
  };

  headerRow.forEach((cell, i) => {
    const h = (cell || "").toLowerCase().trim();

    if (h.includes("claim id") || h === "claim #" || h === "claimid" || h === "claim no")
      if (cols.claimId === -1) cols.claimId = i;

    if (h.includes("insurance name") || h === "payer" || h === "insurance" ||
        h.includes("carrier") || h.includes("payer name"))
      if (cols.payer === -1) cols.payer = i;

    if (h.includes("total charge") || h === "billed" || h.includes("billed amt") ||
        h.includes("charge amount") || h === "charges")
      if (cols.billed === -1) cols.billed = i;

    if (h.includes("primary paid") || h.includes("primary payment") ||
        h.includes("primary amt") || h === "primary")
      if (cols.primaryPaid === -1) cols.primaryPaid = i;

    if (h.includes("sec paid") || h.includes("secondary paid") ||
        h.includes("secondary payment") || h.includes("sec amt") ||
        h === "secondary" || h === "sec payment")
      if (cols.secPaid === -1) cols.secPaid = i;

    if ((h === "collected" || h.includes("paid amt") || h.includes("amount paid") ||
         h.includes("amount collected") || h === "payment") &&
        !h.includes("primary") && !h.includes("sec") && !h.includes("secondary"))
      if (cols.collected === -1) cols.collected = i;

    if (h === "status" || h === "claim status" || h.includes("claim status"))
      if (cols.status === -1) cols.status = i;
  });

  return cols;
}

// ── Classify claim status from plain English cell value ───────────────────────
function classifyStatus(raw) {
  const s = (raw || "").toUpperCase().trim();
  if (!s) return "unknown";

  if (s.includes("DENIED") || s.includes("DENIAL") ||
      s.includes("REJECT") || s.includes("NOT PAID") || s.includes("WRITE OFF"))
    return "denied";

  if (s.includes("PAID") || s.includes("PAYMENT") ||
      s.includes("RE-ISSUED") || s.includes("REISSUED") || s.includes("RE ISSUED"))
    return "paid";

  if (s.includes("PENDING") || s.includes("IN PROCESS") || s.includes("IN PROGRESS") ||
      s.includes("PROCESS") || s.includes("APPEAL") || s.includes("SUBMITTED") ||
      s.includes("REVIEW") || s.includes("SENT") || s.includes("OPEN"))
    return "pending";

  return "other";
}

// ── Normalize payer name to display category ──────────────────────────────────
function normalizePayer(raw) {
  const s = (raw || "").toUpperCase();
  if (s.includes("MEDICARE"))                                           return "Medicare";
  if (s.includes("MEDICAID"))                                           return "Medicaid";
  if (s.includes("BCBS") || s.includes("BLUE CROSS") ||
      s.includes("BLUECROSS") || s.includes("ANTHEM"))                 return "BlueCross/Anthem";
  if (s.includes("UNITED") || s.includes("UHC") ||
      s.includes("UNITEDHEALTHCARE"))                                   return "UnitedHealth";
  if (s.includes("AETNA"))                                              return "Aetna";
  if (s.includes("CIGNA"))                                              return "Cigna";
  if (s.includes("HUMANA"))                                             return "Humana";
  if (s.includes("AMBETTER"))                                           return "Ambetter";
  if (s.includes("VA ") || s.includes("VETERAN") ||
      s.includes("TRICARE"))                                            return "VA/Tricare";
  if (s.includes("RAILROAD"))                                           return "Railroad Medicare";
  return "Other";
}

// ── Parse one MCR tab into KPI numbers ───────────────────────────────────────
function parseMCRTab(rows) {
  if (!rows || rows.length < 2) return null;

  let headerRowIdx = -1;
  let cols = null;

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const candidate = detectColumns(rows[i]);
    const hasMoney  = candidate.billed >= 0 || candidate.primaryPaid >= 0 || candidate.collected >= 0;
    const hasStatus = candidate.status >= 0;
    if (hasMoney || hasStatus) {
      headerRowIdx = i;
      cols = candidate;
      break;
    }
  }

  if (!cols || headerRowIdx === -1) {
    console.warn("[kpis] Header not detected — using fallback column positions");
    cols = {
      claimId:     0,
      payer:       3,
      billed:      7,
      primaryPaid: 9,
      secPaid:     10,
      collected:   -1,
      status:      19,
    };
    headerRowIdx = 0;
  }

  console.log("[kpis] Columns detected:", JSON.stringify(cols));

  let billed = 0, collected = 0, claimsCount = 0;
  let denialCount = 0, pendingCount = 0, paidCount = 0;
  const payerTotals = {};

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || String(row[0]).trim() === "") continue;

    const billedAmt = cols.billed >= 0 ? parseDollar(row[cols.billed]) : 0;

    let collectedAmt = 0;
    if (cols.primaryPaid >= 0 || cols.secPaid >= 0) {
      const pri = cols.primaryPaid >= 0 ? parseDollar(row[cols.primaryPaid]) : 0;
      const sec = cols.secPaid     >= 0 ? parseDollar(row[cols.secPaid])     : 0;
      collectedAmt = pri + sec;
    } else if (cols.collected >= 0) {
      collectedAmt = parseDollar(row[cols.collected]);
    }

    if (billedAmt === 0 && collectedAmt === 0) continue;

    const statusRaw  = cols.status >= 0 ? (row[cols.status] || "") : "";
    const statusType = classifyStatus(statusRaw);
    const payerRaw   = cols.payer  >= 0 ? (row[cols.payer]  || "Other") : "Other";
    const payerKey   = normalizePayer(payerRaw);

    billed    += billedAmt;
    collected += collectedAmt;
    claimsCount++;

    if (statusType === "denied")  denialCount++;
    if (statusType === "pending") pendingCount++;
    if (statusType === "paid")    paidCount++;

    payerTotals[payerKey] = (payerTotals[payerKey] || 0) + collectedAmt;
  }

  const recoveryRate = billed > 0
    ? Math.round((collected / billed) * 1000) / 10 : 0;

  return {
    billed, collected, claimsCount,
    denialCount, pendingCount, paidCount,
    recoveryRate, payerTotals,
  };
}

// ── Build payer mix array from all monthly data ───────────────────────────────
function buildPayerMix(mcrDataArray) {
  const COLORS = {
    "Medicare":          "#1A8F55",
    "Medicaid":          "#0099BB",
    "BlueCross/Anthem":  "#1E4DB7",
    "UnitedHealth":      "#C07800",
    "Aetna":             "#B8962E",
    "Cigna":             "#6A4C9C",
    "Humana":            "#CC334A",
    "Ambetter":          "#2E66E5",
    "VA/Tricare":        "#5A6475",
    "Railroad Medicare": "#7A5230",
    "Other":             "#8A929E",
  };

  const totals = {};
  for (const mcr of mcrDataArray) {
    if (!mcr?.payerTotals) continue;
    for (const [payer, amt] of Object.entries(mcr.payerTotals)) {
      totals[payer] = (totals[payer] || 0) + amt;
    }
  }

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grand === 0) return [];

  return Object.entries(totals)
    .map(([name, value]) => ({
      name,
      value: Math.round((value / grand) * 100),
      color: COLORS[name] || "#8A929E",
    }))
    .sort((a, b) => b.value - a.value);
}

// ── Build monthly bar chart ───────────────────────────────────────────────────
function buildChartData(currentMonthIdx, mcrData, priorYearData) {
  const points  = [];
  const MIN_PTS = 5;

  for (let m = 0; m <= currentMonthIdx; m++) {
    const mcr = mcrData[m];
    points.push({
      month:        `MCR-${MONTH_SHORT[m]}`,
      mtd:          mcr?.collected   || 0,
      recoveryRate: mcr?.recoveryRate || 0,
      source:       "current",
    });
  }

  const needed = MIN_PTS - points.length;
  if (needed > 0 && priorYearData.length > 0) {
    const prefill = priorYearData.slice(-needed).map(d => ({
      month:        `${getCurrentYear() - 1}-${d.monthLabel.slice(0, 3)}`,
      mtd:          d.collected,
      recoveryRate: d.recoveryRate,
      source:       "prior",
    }));
    points.unshift(...prefill);
  }

  return points;
}

// ── Parse a prior-year summary tab ───────────────────────────────────────────
function parsePriorYearTab(rows) {
  if (!rows || rows.length < 2) return [];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const billed    = parseDollar(row[1]);
    const collected = parseDollar(row[2]);
    const recovery  = parseDollar(String(row[3] || "").replace(/%/g, "")) ||
                      (billed > 0 ? Math.round(collected / billed * 1000) / 10 : 0);
    out.push({ monthLabel: String(row[0]).trim(), billed, collected, recoveryRate: recovery });
  }
  return out;
}

// ── Demo fallback ─────────────────────────────────────────────────────────────
function getDummyResponse() {
  const mn = MONTH_SHORT[getCurrentMonth()];
  return {
    kpis: {
      recoveryRate: 94.8,    recoveryRateDelta: "+0.9%",
      mtdRevenue:   38420,   mtdLabel: `MCR-${mn}`, mtdRevenueDelta: "+$3,100",
      ytdRevenue:   187650,  ytdRevenueDelta: "+22%",
      claimsProcessed: 276,  claimsDelta: "+8 vs target",
      billingAccuracy: 93.8, accuracyDelta: "Above 92% threshold",
      outstandingAR:   6840, arDelta: "Actively worked",
      denialRate: 4.2,
      source: "demo",
    },
    monthlyChart: [
      { month: "MCR-Feb",    mtd: 35100, recoveryRate: 93.9, source: "prior"   },
      { month: "MCR-Mar",    mtd: 38420, recoveryRate: 94.8, source: "prior"   },
      { month: "MCR-Apr",    mtd: 34100, recoveryRate: 93.2, source: "prior"   },
      { month: "MCR-May",    mtd: 36800, recoveryRate: 94.1, source: "current" },
      { month: `MCR-${mn}`, mtd: 38420, recoveryRate: 94.8, source: "current" },
    ],
    payerMix: [
      { name: "BlueCross/Anthem", value: 31, color: "#1E4DB7" },
      { name: "Medicare",         value: 24, color: "#1A8F55" },
      { name: "Aetna",            value: 18, color: "#B8962E" },
      { name: "UnitedHealth",     value: 15, color: "#C07800" },
      { name: "Other",            value: 12, color: "#8A929E" },
    ],
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const { user, error } = await requireAuth(req);
  if (error) return res.status(401).json({ error });

  const supabase = getSupabase();
  const { data: dbUser } = await supabase
    .from("users")
    .select("sheet_url")
    .eq("id", user.id)
    .single();

  if (!dbUser?.sheet_url) {
    console.log("[kpis] No sheet_url for user", user.id, "→ demo");
    return res.status(200).json(getDummyResponse());
  }

  const spreadsheetId = extractSheetId(dbUser.sheet_url);
  if (!spreadsheetId) {
    console.error("[kpis] Cannot extract sheet ID from:", dbUser.sheet_url);
    return res.status(200).json(getDummyResponse());
  }

  try {
    const sheets       = getSheetsClient();
    const currentMonth = getCurrentMonth();
    const currentYear  = getCurrentYear();

    const allTabNames = await getAllTabNames(sheets, spreadsheetId);
    console.log("[kpis] Sheet tabs:", allTabNames);

    const mcrData = new Array(12).fill(null);
    for (let m = 0; m <= currentMonth; m++) {
      const { rows, tabFound } = await findAndReadMCRTab(
        sheets, spreadsheetId, allTabNames, m, currentYear
      );
      if (rows) {
        mcrData[m] = parseMCRTab(rows);
        const d = mcrData[m];
        console.log(
          `[kpis] ${MONTH_SHORT[m]}: tab="${tabFound}"`,
          `claims=${d?.claimsCount}`,
          `billed=$${d?.billed?.toFixed(0)}`,
          `collected=$${d?.collected?.toFixed(0)}`,
          `recovery=${d?.recoveryRate}%`
        );
      } else {
        console.log(`[kpis] ${MONTH_SHORT[m]}: no tab matched`);
      }
    }

    let priorYearData = [];
    if (currentMonth < 3) {
      const priorCandidates = [
        `${currentYear - 1} DATA`, `${currentYear - 1} Summary`,
        `${currentYear - 1} SUMMARY`, "PRIOR YEAR DATA", "2025 DATA",
      ];
      for (const name of priorCandidates) {
        const match = allTabNames.find(
          t => t.trim().toLowerCase() === name.toLowerCase()
        );
        if (match) {
          const rows = await readTab(sheets, spreadsheetId, match);
          if (rows?.length > 1) { priorYearData = parsePriorYearTab(rows); break; }
        }
      }
    }

    const currentMCR = mcrData[currentMonth];
    let ytdRevenue = 0, ytdBilled = 0, ytdClaims = 0, ytdDenials = 0, ytdPending = 0;

    for (let m = 0; m <= currentMonth; m++) {
      if (mcrData[m]) {
        ytdRevenue += mcrData[m].collected;
        ytdBilled  += mcrData[m].billed;
        ytdClaims  += mcrData[m].claimsCount;
        ytdDenials += mcrData[m].denialCount;
        ytdPending += mcrData[m].pendingCount;
      }
    }

    const mtdRevenue      = currentMCR?.collected   || 0;
    const mtdLabel        = `MCR-${MONTH_SHORT[currentMonth]}`;
    const recoveryRate    = currentMCR?.recoveryRate || 0;
    const billingAccuracy = ytdBilled > 0
      ? Math.round((ytdRevenue / ytdBilled) * 1000) / 10 : 0;
    const outstandingAR   = Math.max(0, ytdBilled - ytdRevenue);
    const denialRate      = ytdClaims > 0
      ? Math.round((ytdDenials / ytdClaims) * 1000) / 10 : 0;

    const monthlyChart = buildChartData(currentMonth, mcrData, priorYearData);
    const payerMix     = buildPayerMix(mcrData.filter(Boolean));

    console.log(
      `[kpis] FINAL: YTD=$${ytdRevenue.toFixed(0)}`,
      `MTD=$${mtdRevenue.toFixed(0)}`,
      `claims=${ytdClaims}`,
      `denials=${ytdDenials}(${denialRate}%)`,
      `recovery=${recoveryRate}%`,
      `accuracy=${billingAccuracy}%`
    );

    return res.status(200).json({
      kpis: {
        recoveryRate,
        recoveryRateDelta: "",
        mtdRevenue,
        mtdLabel,
        mtdRevenueDelta: "",
        ytdRevenue,
        ytdRevenueDelta: "",
        claimsProcessed: ytdClaims,
        claimsDelta: "",
        billingAccuracy,
        accuracyDelta: billingAccuracy >= 92
          ? "Above 92% threshold" : "Below 92% threshold",
        outstandingAR,
        arDelta: "Actively worked",
        denialRate,
        source: "sheet",
      },
      monthlyChart,
      payerMix,
    });

  } catch (err) {
    console.error("[kpis] Fatal error:", err.message);
    return res.status(200).json(getDummyResponse());
  }
}
