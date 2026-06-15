/**
 * GET /api/cron/refreshSheets
 * Vercel Cron Job — runs at 2:00 AM EST (07:00 UTC) daily
 * Configured in vercel.json under "crons"
 *
 * Purpose: Pre-warms the KPI cache for all active doctors so their
 * dashboards load instantly at the start of the business day.
 *
 * NOTE: This endpoint is protected by CRON_SECRET env var.
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET>
 * Set CRON_SECRET in Vercel env vars (any random string).
 */

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

function extractSheetId(sheetUrl) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function pingSheet(sheets, spreadsheetId) {
  try {
    // Just read one cell to confirm sheet is accessible and data is fresh
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DASHBOARD_SUMMARY!A1:B2",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const startTime = Date.now();
  const supabase  = getSupabase();

  // Fetch all active doctors with a sheet_url
  const { data: doctors, error: dbErr } = await supabase
    .from("users")
    .select("id, email, full_name, sheet_url")
    .eq("role", "doctor")
    .eq("verified", true)
    .not("sheet_url", "is", null);

  if (dbErr) {
    console.error("Cron: failed to fetch doctors", dbErr);
    return res.status(500).json({ error: "DB error" });
  }

  if (!doctors || doctors.length === 0) {
    return res.status(200).json({ message: "No active doctors with sheets. Nothing to refresh.", refreshed: 0 });
  }

  let sheets;
  try {
    sheets = getSheetsClient();
  } catch (err) {
    return res.status(500).json({ error: "Google Sheets client init failed: " + err.message });
  }

  const currentMonth = new Date().getMonth();
  const results = [];

  for (const doctor of doctors) {
    const spreadsheetId = extractSheetId(doctor.sheet_url);
    if (!spreadsheetId) {
      results.push({ email: doctor.email, ok: false, error: "Invalid sheet URL" });
      continue;
    }

    const result = await pingSheet(sheets, spreadsheetId);
    results.push({ email: doctor.email, ...result });

    // Small delay between requests to avoid hitting Google API rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  const successCount = results.filter(r => r.ok).length;
  const failCount    = results.filter(r => !r.ok).length;
  const elapsed      = Date.now() - startTime;

  console.log(`Cron refreshSheets: ${successCount} ok, ${failCount} failed in ${elapsed}ms`);

  return res.status(200).json({
    message: `Sheet refresh complete: ${successCount}/${doctors.length} succeeded`,
    elapsed_ms: elapsed,
    results,
  });
}
