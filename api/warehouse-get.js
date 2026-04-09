import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    const items = await kv.get("matchkit:warehouse");
    res.status(200).json(Array.isArray(items) ? items : []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
