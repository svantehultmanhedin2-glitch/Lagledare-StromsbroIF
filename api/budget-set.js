import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId, budget } = req.body || {};
  if (!teamId || !budget || typeof budget !== "object") {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    await kv.set(`budget:${teamId}`, { ...budget, teamId });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}