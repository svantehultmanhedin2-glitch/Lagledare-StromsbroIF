import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId, items } = req.body || {};
  if (!teamId || !Array.isArray(items)) {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    await kv.set(`orders:${teamId}`, items);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}