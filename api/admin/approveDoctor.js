/**
 * PUT /api/admin/approveDoctor
 * Body: { id }
 * Sets verified = true for the doctor. Sends activation email.
 *
 * DELETE /api/admin/removeDoctor
 * Body: { id }
 * Removes doctor from users table.
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { user: adminUser, error: authError } = await requireAuth(req, "admin");
  if (authError) return res.status(401).json({ error: authError });

  const supabase = getSupabase();

  // ── APPROVE ───────────────────────────────────────────────────────────────
  if (req.method === "PUT") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Doctor ID required." });

    const { data: doctor, error: fetchErr } = await supabase
      .from("users")
      .select("email, title, full_name")
      .eq("id", id)
      .single();

    if (fetchErr || !doctor) return res.status(404).json({ error: "Doctor not found." });

    const { error: updateErr } = await supabase
      .from("users")
      .update({ verified: true })
      .eq("id", id);

    if (updateErr) return res.status(500).json({ error: "Failed to approve doctor." });

    // Send activation email
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Vektor Solutions" <${process.env.SMTP_USER}>`,
        to: doctor.email,
        subject: "Your Vektor Portal Is Now Active",
        html: `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
  <h2 style="color:#1A1C20;">Your Dashboard Is Ready</h2>
  <p style="color:#3A4252;line-height:1.7;">
    ${doctor.title || doctor.full_name},<br><br>
    Your Vektor Practice Reporting Dashboard has been activated.<br>
    Log in at <a href="https://portal.veksol.com" style="color:#1E4DB7;">portal.veksol.com</a> using <strong>${doctor.email}</strong>.
  </p>
  <p style="color:#5A6475;font-size:11px;margin-top:24px;">© 2026 Vektor Solutions LLC</p>
</div>`,
        text: `Your Vektor Portal is now active. Log in at portal.veksol.com using ${doctor.email}.`,
      });
    } catch (emailErr) {
      console.error("Activation email error:", emailErr);
    }

    return res.status(200).json({ message: "Doctor approved and notified." });
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Doctor ID required." });

    const { error: deleteErr } = await supabase
      .from("users")
      .delete()
      .eq("id", id)
      .neq("role", "admin"); // Safety: never delete admin rows via this endpoint

    if (deleteErr) return res.status(500).json({ error: "Failed to remove doctor." });

    return res.status(200).json({ message: "Doctor removed." });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
