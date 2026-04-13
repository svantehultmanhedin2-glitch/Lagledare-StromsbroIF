import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teamId } = req.query;
      if (!teamId) return res.status(400).json({ error: "Missing teamId" });

      const data = await kv.get(`budget:${teamId}`);
      return res.status(200).json(data ?? { teamId, total: 0, used: 0 });
    }

    if (req.method === "POST") {
      const { teamId, budget } = req.body || {};
      if (!teamId || !budget || typeof budget !== "object") {
        return res.status(400).json({ error: "Missing data" });
      }

      await kv.set(`budget:${teamId}`, { ...budget, teamId });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}