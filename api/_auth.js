/**
 * _auth.js — shared JWT verification utility
 * Used by /api/dashboard/*, /api/ai/*, /api/admin/*
 *
 * Usage:
 *   import { requireAuth } from "../_auth.js";
 *   const { user, error } = await requireAuth(req);
 *   if (error) return res.status(401).json({ error });
 */

import { jwtVerify } from "jose";

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    cookies[k.trim()] = v.join("=");
  });
  return cookies;
}

export async function requireAuth(req, requiredRole = null) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["vk_session"];

  if (!token) return { user: null, error: "Not authenticated." };

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    if (requiredRole && payload.role !== requiredRole) {
      return { user: null, error: "Insufficient permissions." };
    }

    return {
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        verified: payload.verified,
      },
      error: null,
    };
  } catch {
    return { user: null, error: "Session expired. Please log in again." };
  }
}
