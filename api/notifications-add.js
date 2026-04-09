import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { userId, message } = req.body || {};
  if (!userId || !message)
    return res.status(400).json({ error: "Missing data" });

  try {
    const key = `notifications:${userId}`;
    const list = (await kv.get(key)) ?? [];
    const next = [
      { id: crypto.randomUUID(), message, createdAt: new Date().toISOString(), read: false },
      ...(Array.isArray(list) ? list : []),
    ];
    await kv.set(key, next);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
``