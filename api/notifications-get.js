import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const list = await kv.get(`notifications:${userId}`);
    res.status(200).json(Array.isArray(list) ? list : []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}