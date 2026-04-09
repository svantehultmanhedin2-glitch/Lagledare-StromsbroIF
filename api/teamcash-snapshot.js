import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: "Missing teamId" });

  try {
    const cash = await kv.get(`teamcash:${teamId}`);
    const hist = await kv.get(`teamcash-history:${teamId}`);
    res.status(200).json({
      cash: cash ?? { teamId, balance: null, accountNumber: "", updatedAt: null },
      hist: Array.isArray(hist) ? hist : [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
``