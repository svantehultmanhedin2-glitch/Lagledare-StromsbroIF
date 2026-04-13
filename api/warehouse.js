import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await kv.get("matchkit:warehouse");
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { items } = req.body || {};
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Missing data" });
      }

      await kv.set("matchkit:warehouse", items);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
