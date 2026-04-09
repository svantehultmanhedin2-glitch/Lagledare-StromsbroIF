import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId } = req.query;

  if (!teamId) {
    return res.status(400).json({ error: "Missing teamId" });
  }

  try {
    const data = await kv.get(`teamcash:${teamId}`);
    res.status(200).json(data ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}