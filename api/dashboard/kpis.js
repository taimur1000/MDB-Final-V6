/**
 * GET /api/dashboard/kpis
 * JWT-protected. Returns KPI summary + monthly chart data from doctor's Google Sheet.
 *
 * SHEET STRUCTURE (per doctor):
 *   - MCR-Jan, MCR-Feb, ... MCR-Dec  → monthly claims tabs
 *   - 2025 DATA                       → prior year monthly summary
 *   - DASHBOARD_SUMMARY               → auto-calculated KPI cells
 *
 * MONTHLY CHART LOGIC:
 *   - Always shows at least 5 months of bar chart data
 *   - Months 1-3 of current year: backfills from "2025 DATA" tab
 *   - Month 4+ of current year: current year tabs only (enough data)
 *   - Labels format: "MCR-Jan", "MCR-Feb", etc. (or "2025-Dec" for prior year bars)
 *
 * KPI DEFINITIONS:
 *   - MTD        = current month's MCR tab total (collected)
 *   - YTD        = sum of all MCR tabs Jan → current month (current year)
 *   - Monthly Recovery Rate = from each MCR tab: collected / billed
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
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getCurrentMonthIndex() {
  return new Date().getMonth(); // 0-based: Jan=0, Dec=11
}

function getCurrentYear() {
  return new Date().getFullYear();
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

function extractSheetId(sheetUrl) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Read a named range from a sheet tab ──────────────────────────────────────
// Returns flat array of row arrays, or null on error
async function readTab(sheets, spreadsheetId, tabName, range = "A1:Z200") {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!${range}`,
    });
    return res.data.values || [];
  } catch {
    return null; // tab doesn't exist yet or permission error
  }
}

// ── Parse MCR tab → { billed, collected, claimsCount, denialCount, pendingCount } ──
// Expected MCR tab columns (row 1 = headers):
//   A: Claim ID | B: DOS | C: Patient | D: CPT | E: Payer
//   F: Billed   | G: Allowed | H: Collected | I: Status | J: Denial Reason
function parseMCRTab(rows) {
  if (!rows || rows.length < 2) return null;

  let billed = 0, collected = 0, claimsCount = 0;
  let denialCount = 0, pendingCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue; // skip empty rows

    const billedAmt    = parseFloat((row[5] || "0").replace(/[$,]/g, "")) || 0;
    const collectedAmt = parseFloat((row[7] || "0").replace(/[$,]/g, "")) || 0;
    const status       = (row[8] || "").toUpperCase().trim();

    billed    += billedAmt;
    collected += collectedAmt;
    claimsCount++;

    if (status === "DENIED")        denialCount++;
    if (status === "PENDING")       pendingCount++;
  }

  const recoveryRate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;

  return { billed, collected, claimsCount, denialCount, pendingCount, recoveryRate };
}

// ── Parse 2025 DATA tab → array of { month, collected, billed, recoveryRate } ──
// Expected columns: A: Month | B: Billed | C: Collected | D: Recovery% | E: Claims | F: Denials | G: Pending
function parsePriorYearTab(rows) {
  if (!rows || rows.length < 2) return [];
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const monthLabel = (row[0] || "").trim();                                      // e.g. "Jan" or "January"
    const billed     = parseFloat((row[1] || "0").replace(/[$,]/g, "")) || 0;
    const collected  = parseFloat((row[2] || "0").replace(/[$,]/g, "")) || 0;
    const recovery   = parseFloat((row[3] || "0").replace(/%/g, ""))    || (billed > 0 ? Math.round(collected/billed*1000)/10 : 0);
    result.push({ monthLabel, billed, collected, recoveryRate: recovery });
  }
  return result;
}

// ── Build monthly chart data with backfill logic ──────────────────────────────
// currentMonthIdx: 0-based (Jan=0)
// mcrData: array indexed 0-11, each element null or parsed MCR object
// priorYearData: array from parsePriorYearTab (2025 DATA tab)
function buildChartData(currentMonthIdx, mcrData, priorYearData) {
  const chartPoints = [];
  const MIN_POINTS  = 5;

  // Build current year points (months 0 → currentMonthIdx)
  for (let m = 0; m <= currentMonthIdx; m++) {
    const mcr = mcrData[m];
    chartPoints.push({
      month:        `MCR-${MONTH_NAMES[m]}`,
      mtd:          mcr ? mcr.collected : 0,
      recoveryRate: mcr ? mcr.recoveryRate : 0,
      source:       "current",
    });
  }

  // If we don't have MIN_POINTS yet, backfill from prior year (right-to-left)
  const needed = MIN_POINTS - chartPoints.length;
  if (needed > 0 && priorYearData.length > 0) {
    // Take the last `needed` months from prior year data
    const backfill = priorYearData.slice(-needed);
    const prefill  = backfill.map(d => ({
      month:        `2025-${d.monthLabel.slice(0,3)}`,
      mtd:          d.collected,
      recoveryRate: d.recoveryRate,
      source:       "prior",
    }));
    // Prepend prior year data before current year data
    chartPoints.unshift(...prefill);
  }

  return chartPoints;
}

// ── Dummy fallback (no sheet configured) ─────────────────────────────────────
function getDummyResponse() {
  const currentMonth = getCurrentMonthIndex();
  const monthName    = MONTH_NAMES[currentMonth];

  const allMonths = [
    { month:"MCR-Aug", mtd:28400, recoveryRate:93.2, source:"prior" },
    { month:"MCR-Sep", mtd:31200, recoveryRate:94.0, source:"prior" },
    { month:"MCR-Oct", mtd:34800, recoveryRate:94.5, source:"prior" },
    { month:"MCR-Nov", mtd:33900, recoveryRate:93.8, source:"prior" },
    { month:"MCR-Dec", mtd:36100, recoveryRate:94.1, source:"prior" },
    { month:"MCR-Jan", mtd:37200, recoveryRate:94.6, source:"current" },
    { month:"MCR-Feb", mtd:35100, recoveryRate:93.9, source:"current" },
    { month:"MCR-Mar", mtd:38420, recoveryRate:94.8, source:"current" },
  ];

  // Simulate the backfill logic using dummy data for demo
  // Show 5 months ending at current month simulation
  const demoPoints = allMonths.slice(-5);

  return {
    kpis: {
      recoveryRate:      94.8,
      recoveryRateDelta: "+0.9%",
      mtdRevenue:        38420,
      mtdLabel:          `MCR-${monthName}`,
      mtdRevenueDelta:   "+$3,100",
      ytdRevenue:        187650,
      ytdRevenueDelta:   "+22%",
      claimsProcessed:   276,
      claimsDelta:       "+8 vs target",
      billingAccuracy:   93.8,
      accuracyDelta:     "Above 92% threshold",
      outstandingAR:     6840,
      arDelta:           "Actively worked",
      source:            "demo",
    },
    monthlyChart: demoPoints,
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

  // No sheet → demo mode
  if (!dbUser?.sheet_url) {
    return res.status(200).json(getDummyResponse());
  }

  const spreadsheetId = extractSheetId(dbUser.sheet_url);
  if (!spreadsheetId) {
    return res.status(200).json(getDummyResponse());
  }

  try {
    const sheets         = getSheetsClient();
    const currentMonth   = getCurrentMonthIndex(); // 0-based
    const currentYear    = getCurrentYear();

    // ── Read all MCR tabs for current year ──────────────────────────────────
    const mcrData = new Array(12).fill(null);

    for (let m = 0; m <= currentMonth; m++) {
      const tabName = `MCR-${MONTH_NAMES[m]}`;
      const rows    = await readTab(sheets, spreadsheetId, tabName);
      if (rows) mcrData[m] = parseMCRTab(rows);
    }

    // ── Read prior year tab (only needed for months 0-2) ───────────────────
    let priorYearData = [];
    if (currentMonth < 3) {
      const priorRows = await readTab(sheets, spreadsheetId, "2025 DATA");
      if (priorRows) priorYearData = parsePriorYearTab(priorRows);
    }

    // ── Compute KPIs ────────────────────────────────────────────────────────
    const currentMCR = mcrData[currentMonth];

    // MTD = current month collected
    const mtdRevenue = currentMCR?.collected || 0;
    const mtdLabel   = `MCR-${MONTH_NAMES[currentMonth]}`;

    // YTD = sum of all current-year MCR collected amounts
    let ytdRevenue = 0;
    let ytdClaims  = 0;
    let ytdDenials = 0;
    let ytdPending = 0;
    let ytdBilled  = 0;

    for (let m = 0; m <= currentMonth; m++) {
      if (mcrData[m]) {
        ytdRevenue += mcrData[m].collected;
        ytdBilled  += mcrData[m].billed;
        ytdClaims  += mcrData[m].claimsCount;
        ytdDenials += mcrData[m].denialCount;
        ytdPending += mcrData[m].pendingCount;
      }
    }

    // Recovery rate = current month collected / billed
    const recoveryRate = currentMCR?.recoveryRate || 0;

    // Billing accuracy = YTD collected / YTD billed
    const billingAccuracy = ytdBilled > 0
      ? Math.round((ytdRevenue / ytdBilled) * 1000) / 10
      : 0;

    // Outstanding AR = YTD billed - YTD collected (simplified)
    const outstandingAR = Math.max(0, ytdBilled - ytdRevenue);

    // ── Build chart data ────────────────────────────────────────────────────
    const monthlyChart = buildChartData(currentMonth, mcrData, priorYearData);

    return res.status(200).json({
      kpis: {
        recoveryRate,
        recoveryRateDelta: "",       // delta vs prior month — add if DASHBOARD_SUMMARY has it
        mtdRevenue,
        mtdLabel,
        mtdRevenueDelta:   "",
        ytdRevenue,
        ytdRevenueDelta:   "",
        claimsProcessed:   ytdClaims,
        claimsDelta:       "",
        billingAccuracy,
        accuracyDelta:     billingAccuracy >= 92 ? "Above 92% threshold" : "Below 92% threshold",
        outstandingAR,
        arDelta:           "Actively worked",
        source:            "sheet",
      },
      monthlyChart,
    });

  } catch (err) {
    console.error("Sheets fetch error:", err);
    // Graceful fallback to demo if sheets fail
    return res.status(200).json(getDummyResponse());
  }
}
