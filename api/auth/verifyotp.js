/**
 * POST /api/auth/verifyotp
 * Body: { email, otp }
 *
 * 1. Finds active OTP in Supabase
 * 2. Checks attempts (<= 5), expiry, match
 * 3. Marks OTP used, fetches user record
 * 4. Issues JWT in httpOnly cookie (8hr)
 * 5. Returns sanitized user object
 */

import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(secret);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, otp } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = getSupabase();

  // ── Find latest unused OTP for this email ─────────────────────────────────
  const { data: record, error: fetchErr } = await supabase
    .from("otp_codes")
    .select("id, code, expires_at, attempts, used")
    .eq("email", normalizedEmail)
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchErr || !record) {
    return res.status(401).json({ error: "No active access code found. Please request a new one." });
  }

  // ── Check expiry ──────────────────────────────────────────────────────────
  if (new Date() > new Date(record.expires_at)) {
    await supabase.from("otp_codes").update({ used: true }).eq("id", record.id);
    return res.status(401).json({ error: "Access code expired. Please request a new one." });
  }

  // ── Increment attempt counter ─────────────────────────────────────────────
  const newAttempts = (record.attempts || 0) + 1;
  await supabase.from("otp_codes").update({ attempts: newAttempts }).eq("id", record.id);

  if (newAttempts > 5) {
    await supabase.from("otp_codes").update({ used: true }).eq("id", record.id);
    return res.status(401).json({ error: "Too many failed attempts. Please request a new code." });
  }

  // ── Verify code ───────────────────────────────────────────────────────────
  if (record.code !== String(otp).trim()) {
    const remaining = 5 - newAttempts;
    return res.status(401).json({
      error: `Invalid code. ${remaining > 0 ? `${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` : "No attempts remaining — please request a new code."}`,
    });
  }

  // ── Mark OTP used ─────────────────────────────────────────────────────────
  await supabase.from("otp_codes").update({ used: true, attempts: newAttempts }).eq("id", record.id);

  // ── Fetch full user record ────────────────────────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, email, full_name, title, specialty, practice, city, state, role, verified")
    .eq("email", normalizedEmail)
    .single();

  if (userErr || !user) {
    return res.status(500).json({ error: "Failed to load user profile." });
  }

  // ── Sign JWT ──────────────────────────────────────────────────────────────
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    verified: user.verified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getJwtSecret());

  // ── Set httpOnly cookie ───────────────────────────────────────────────────
  res.setHeader(
    "Set-Cookie",
    `vk_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
  );

  // ── Return sanitized user ─────────────────────────────────────────────────
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name,
      title: user.title || user.full_name,
      specialty: user.specialty || "",
      practice: user.practice || "",
      city: user.city || "",
      state: user.state || "",
      role: user.role,
      verified: user.verified,
    },
  });
}
