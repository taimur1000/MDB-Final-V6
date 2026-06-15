/**
 * POST /api/admin/addDoctor
 * Admin JWT only.
 * Body: { email, full_name, title, specialty, practice, city, state, sheet_url, verified }
 * Inserts into Supabase users. Sends welcome/invite email via nodemailer.
 */

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { requireAuth } from "../_auth.js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildInviteEmail(doctor) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Vektor Portal Invitation</title></head>
<body style="margin:0;padding:0;background:#F0F2F6;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F6;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#CDCED3;border-radius:12px;border:1px solid #B6B9C0;">
        <tr>
          <td style="background:#1A1C22;padding:24px 32px;text-align:center;">
            <p style="color:#E8E8F0;font-size:11px;font-weight:800;letter-spacing:4px;margin:0 0 4px;">VEKTOR</p>
            <p style="color:#7A8799;font-size:9px;letter-spacing:3px;margin:0;">SOLUTIONS LLC</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#1A1C20;font-size:15px;font-weight:700;margin:0 0 8px;">Welcome to the Vektor Portal</p>
            <p style="color:#3A4252;font-size:12px;line-height:1.7;margin:0 0 16px;">
              Dear ${doctor.title || doctor.full_name},<br><br>
              Your Vektor Practice Reporting Dashboard is now ${doctor.verified ? "ready to access" : "being configured"}. 
              ${doctor.verified
                ? "You can log in immediately using your professional email address."
                : "You will receive a confirmation email once your account is fully activated."}
            </p>
            <div style="background:#1A1C22;border-radius:8px;padding:20px;margin-bottom:20px;">
              <p style="color:#7A8799;font-size:9px;letter-spacing:2px;margin:0 0 8px;">PORTAL ACCESS</p>
              <p style="color:#00D4FF;font-size:14px;font-weight:700;margin:0;">portal.veksol.com</p>
              <p style="color:#5A6475;font-size:10px;margin:4px 0 0;">Use your email: ${doctor.email}</p>
            </div>
            <p style="color:#5A6475;font-size:10px;line-height:1.7;margin:0;">
              Questions? Reply to this email or contact <a href="mailto:support@veksol.com" style="color:#1E4DB7;">support@veksol.com</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#C0C1C6;border-top:1px solid #B6B9C0;padding:16px 32px;text-align:center;">
            <p style="color:#5A6475;font-size:9px;margin:0;">
              © 2026 Vektor Solutions LLC · <a href="https://veksol.com" style="color:#1E4DB7;text-decoration:none;">veksol.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user: adminUser, error: authError } = await requireAuth(req, "admin");
  if (authError) return res.status(401).json({ error: authError });

  const { email, full_name, title, specialty, practice, city, state, sheet_url, verified = false } = req.body || {};

  if (!email || !full_name) {
    return res.status(400).json({ error: "Email and full name are required." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = getSupabase();

  // Insert doctor
  const { data: newUser, error: insertErr } = await supabase
    .from("users")
    .insert({
      email: normalizedEmail,
      full_name,
      title: title || full_name,
      specialty: specialty || null,
      practice: practice || null,
      city: city || null,
      state: state || null,
      role: "doctor",
      verified: Boolean(verified),
      sheet_url: sheet_url || null,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return res.status(409).json({ error: "A user with this email already exists." });
    }
    console.error("Insert error:", insertErr);
    return res.status(500).json({ error: "Failed to add doctor." });
  }

  // Send invite email
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Vektor Solutions" <${process.env.SMTP_USER}>`,
      to: normalizedEmail,
      subject: `Welcome to Vektor Portal — ${verified ? "Your Dashboard is Ready" : "Setup in Progress"}`,
      html: buildInviteEmail({ email: normalizedEmail, full_name, title, verified }),
      text: `Welcome to Vektor Portal. Access your dashboard at portal.veksol.com using ${normalizedEmail}.`,
    });
  } catch (emailErr) {
    // Don't fail the whole request if email fails — user was created
    console.error("Invite email error:", emailErr);
  }

  return res.status(201).json({ user: newUser, message: "Doctor added successfully." });
}
