import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { userId, notifId } = req.body || {};
  if (!userId || !notifId)
    return res.status(400).json({ error: "Missing data" });

  try {
    const key = `notifications:${userId}`;
    const list = (await kv.get(key)) ?? [];
    const next = (Array.isArray(list) ? list : []).map(n =>
      n.id === notifId ? { ...n, read: true } : n
    );
    await kv.set(key, next);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}