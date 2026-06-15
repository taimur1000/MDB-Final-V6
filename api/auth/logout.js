/**
 * POST /api/auth/logout
 * Clears vk_session cookie
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  res.setHeader(
    "Set-Cookie",
    "vk_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  return res.status(200).json({ message: "Logged out." });
}
