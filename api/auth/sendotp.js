/**
 * POST /api/auth/sendotp
 * Body: { email }
 *
 * 1. Validates it's a professional email (no Gmail etc.)
 * 2. Checks the email exists in Supabase users table
 * 3. Generates a 6-digit OTP, stores it in otp_codes (expires 10 min)
 * 4. Sends via nodemailer → Hostinger SMTP → noreply@veksol.com
 */

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";

// ── Consumer domain blocklist ─────────────────────────────────────────────────
const CONSUMER_DOMAINS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com",
  "aol.com","msn.com","live.com","me.com","mac.com","googlemail.com",
]);

function isProfessionalEmail(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && !CONSUMER_DOMAINS.has(domain);
}

// ── Supabase client (service role — bypasses RLS) ─────────────────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

// ── Nodemailer transporter (Hostinger SMTP) ───────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: true,               // SSL on port 465
    auth: {
      user: process.env.SMTP_USER, // noreply@veksol.com
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── OTP email HTML ─────────────────────────────────────────────────────────────
function buildEmailHtml(code) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Vektor Portal Access Code</title></head>
<body style="margin:0;padding:0;background:#F0F2F6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F6;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#CDCED3;border-radius:12px;border:1px solid #B6B9C0;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#1A1C22;padding:24px 32px;text-align:center;">
            <p style="color:#E8E8F0;font-size:11px;font-weight:800;letter-spacing:4px;margin:0 0 4px;">VEKTOR</p>
            <p style="color:#7A8799;font-size:9px;letter-spacing:3px;margin:0;">SOLUTIONS LLC</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#1A1C20;font-size:15px;font-weight:700;margin:0 0 8px;">Your Secure Access Code</p>
            <p style="color:#3A4252;font-size:12px;line-height:1.7;margin:0 0 24px;">
              Use the code below to access your Vektor Practice Reporting Dashboard.<br>
              This code expires in <strong>10 minutes</strong> and is valid for one use only.
            </p>
            <!-- OTP Block -->
            <div style="background:#1A1C22;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
              <p style="color:#7A8799;font-size:9px;letter-spacing:3px;margin:0 0 12px;">ACCESS CODE</p>
              <p style="color:#00D4FF;font-size:38px;font-weight:800;font-family:monospace;letter-spacing:12px;margin:0;">${code}</p>
            </div>
            <p style="color:#5A6475;font-size:10px;line-height:1.7;margin:0 0 8px;">
              If you did not request this code, please ignore this email.<br>
              Never share this code with anyone — Vektor staff will never ask for it.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#C0C1C6;border-top:1px solid #B6B9C0;padding:16px 32px;text-align:center;">
            <p style="color:#5A6475;font-size:9px;margin:0;">
              © 2026 Vektor Solutions LLC · Claymont, Delaware, USA<br>
              <a href="https://veksol.com" style="color:#1E4DB7;text-decoration:none;">veksol.com</a>
              &nbsp;·&nbsp;
              <a href="mailto:support@veksol.com" style="color:#1E4DB7;text-decoration:none;">support@veksol.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — allow portal domain in prod, any in dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!isProfessionalEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Please use a professional work email address." });
  }

  const supabase = getSupabase();

  // ── Check user exists ─────────────────────────────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("email", normalizedEmail)
    .single();

  if (userErr || !user) {
    // Generic message — don't leak whether email exists
    return res.status(200).json({
      message: "If this email is registered, you will receive a code shortly.",
    });
  }

  // ── Generate OTP ──────────────────────────────────────────────────────────
  const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  // Invalidate any previous unused OTPs for this email
  await supabase
    .from("otp_codes")
    .update({ used: true })
    .eq("email", normalizedEmail)
    .eq("used", false);

  // Insert new OTP
  const { error: insertErr } = await supabase.from("otp_codes").insert({
    email: normalizedEmail,
    code,
    expires_at: expiresAt,
    attempts: 0,
    used: false,
  });

  if (insertErr) {
    console.error("OTP insert error:", insertErr);
    return res.status(500).json({ error: "Failed to generate access code. Please try again." });
  }

  // ── Send email via nodemailer ─────────────────────────────────────────────
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Vektor Solutions" <${process.env.SMTP_USER}>`,
      to: normalizedEmail,
      subject: `${code} — Your Vektor Portal Access Code`,
      html: buildEmailHtml(code),
      text: `Your Vektor Portal access code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\n© 2026 Vektor Solutions LLC`,
    });
  } catch (emailErr) {
    console.error("SMTP send error:", emailErr);
    return res.status(500).json({ error: "Failed to send access code. Please try again." });
  }

  return res.status(200).json({ message: "Access code sent. Check your email." });
}
