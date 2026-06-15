/**
 * POST /api/admin/testSheet
 * Admin JWT only.
 * Body: { doctorId } — tests if the doctor's sheet_url is readable by service account
 * Returns: { connected: bool, message: string, serviceAccountEmail: string }
 */

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { requireAuth } from "../_auth.js";

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authError } = await requireAuth(req, "admin");
  if (authError) return res.status(401).json({ error: authError });

  const { doctorId } = req.body || {};
  if (!doctorId) return res.status(400).json({ error: "doctorId required." });

  // Get service account email for display
  let serviceAccountEmail = "not configured";
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
    serviceAccountEmail = creds.client_email || "not configured";
  } catch {
    return res.status(200).json({
      connected: false,
      message: "GOOGLE_SERVICE_ACCOUNT_JSON is not configured in environment variables.",
      serviceAccountEmail: "not set",
    });
  }

  // Fetch doctor's sheet_url from Supabase
  const supabase = getSupabase();
  const { data: doctor, error: dbErr } = await supabase
    .from("users")
    .select("email, full_name, sheet_url")
    .eq("id", doctorId)
    .single();

  if (dbErr || !doctor) {
    return res.status(404).json({ error: "Doctor not found." });
  }

  if (!doctor.sheet_url) {
    return res.status(200).json({
      connected: false,
      message: `No sheet URL set. Add the sheet URL and share it with: ${serviceAccountEmail}`,
      serviceAccountEmail,
    });
  }

  const spreadsheetId = extractSheetId(doctor.sheet_url);
  if (!spreadsheetId) {
    return res.status(200).json({
      connected: false,
      message: "Sheet URL format is invalid. Use the full Google Sheets URL.",
      serviceAccountEmail,
    });
  }

  // Try to read sheet metadata
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabNames = meta.data.sheets.map(s => s.properties.title);

    // Check for required tabs
    const hasDashboard = tabNames.includes("DASHBOARD_SUMMARY");
    const hasMCR       = tabNames.some(t => t.startsWith("MCR-"));
    const hasPriorYear = tabNames.includes("2025 DATA");

    const warnings = [];
    if (!hasMCR)       warnings.push("No MCR-Month tabs found");
    if (!hasDashboard) warnings.push("No DASHBOARD_SUMMARY tab found");
    if (!hasPriorYear) warnings.push("No 2025 DATA tab (needed Jan–Mar backfill)");

    return res.status(200).json({
      connected: true,
      message: warnings.length > 0
        ? `Connected — but missing: ${warnings.join("; ")}`
        : `Connected ✓ — tabs: ${tabNames.join(", ")}`,
      tabNames,
      warnings,
      serviceAccountEmail,
      sheetTitle: meta.data.properties.title,
    });
  } catch (err) {
    const isPermission = err.message?.includes("403") || err.message?.includes("PERMISSION_DENIED");
    return res.status(200).json({
      connected: false,
      message: isPermission
        ? `Sheet exists but access denied. Share the sheet with: ${serviceAccountEmail}`
        : `Cannot reach sheet: ${err.message}`,
      serviceAccountEmail,
    });
  }
}
