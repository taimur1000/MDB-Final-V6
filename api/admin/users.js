/**
 * GET /api/admin/users
 * Admin JWT only. Returns all users from Supabase.
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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { user, error } = await requireAuth(req, "admin");
  if (error) return res.status(401).json({ error });

  const supabase = getSupabase();
  const { data: users, error: dbErr } = await supabase
    .from("users")
    .select("id, email, full_name, title, specialty, practice, city, state, role, verified, sheet_url, created_at")
    .order("created_at", { ascending: false });

  if (dbErr) {
    return res.status(500).json({ error: "Failed to fetch users." });
  }

  return res.status(200).json({ users });
}
