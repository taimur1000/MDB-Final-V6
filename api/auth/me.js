/**
 * GET /api/auth/me
 * Reads vk_session cookie, verifies JWT, returns user from Supabase
 */

import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

function getJwtSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    cookies[k.trim()] = v.join("=");
  });
  return cookies;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["vk_session"];

  if (!token) return res.status(200).json({ user: null });

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, full_name, title, specialty, practice, city, state, role, verified")
      .eq("id", payload.sub)
      .single();

    if (error || !user) return res.status(200).json({ user: null });

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
  } catch {
    // JWT expired or invalid
    res.setHeader("Set-Cookie", "vk_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
    return res.status(200).json({ user: null });
  }
}
