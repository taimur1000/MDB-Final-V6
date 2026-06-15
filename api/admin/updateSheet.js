/**
 * PUT /api/admin/updateSheet
 * Admin JWT only.
 * Body: { doctorId, sheetUrl }
 * Updates sheet_url for a doctor in Supabase.
 */

import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../_auth.js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authError } = await requireAuth(req, "admin");
  if (authError) return res.status(401).json({ error: authError });

  const { doctorId, sheetUrl } = req.body || {};
  if (!doctorId) return res.status(400).json({ error: "doctorId required." });

  const supabase = getSupabase();

  // Validate doctor exists and is not admin
  const { data: doctor } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", doctorId)
    .single();

  if (!doctor || doctor.role === "admin") {
    return res.status(404).json({ error: "Doctor not found." });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ sheet_url: sheetUrl || null })
    .eq("id", doctorId);

  if (updateErr) {
    return res.status(500).json({ error: "Failed to update sheet URL." });
  }

  return res.status(200).json({ message: "Sheet URL updated." });
}
