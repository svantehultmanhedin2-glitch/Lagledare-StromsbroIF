import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId, balance, accountNumber } = req.body;

  if (!teamId || balance === undefined) {
    return res.status(400).json({ error: "Missing data" });
  }

  const payload = {
    teamId,
    balance: Number(balance),
    accountNumber: accountNumber ?? "",
    updatedAt: new Date().toISOString(),
  };

  try {
    await kv.set(`teamcash:${teamId}`, payload);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}