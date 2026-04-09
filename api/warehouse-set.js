import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items must be an array" });
    }
    await kv.set("matchkit:warehouse", items);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
``