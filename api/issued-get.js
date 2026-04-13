
import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: "Missing teamId" });

  try {
    const data = await kv.get(`issued:${teamId}`);
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
