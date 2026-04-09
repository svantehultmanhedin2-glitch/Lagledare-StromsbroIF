import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    const { teamId, balance, month, accountNumber } = req.body || {};
    if (!teamId) return res.status(400).json({ error: "Missing teamId" });

    const now = new Date().toISOString();

    // 1) uppdatera "current"
    const existing = (await kv.get(`teamcash:${teamId}`)) ?? { teamId, balance: null, accountNumber: "", updatedAt: null };

    const nextCash = {
      teamId,
      balance: balance === null || balance === undefined ? existing.balance : Number(balance),
      accountNumber: (accountNumber === undefined || accountNumber === null) ? (existing.accountNumber ?? "") : String(accountNumber),
      updatedAt: now,
    };

    await kv.set(`teamcash:${teamId}`, nextCash);

    // 2) om month skickas: upsert i historiken
    if (month) {
      const key = `teamcash-history:${teamId}`;
      const hist = (await kv.get(key)) ?? [];
      const arr = Array.isArray(hist) ? hist : [];

      const filtered = arr.filter((h) => String(h.month) !== String(month));
      const nextHist = [
        { teamId, month: String(month), balance: Number(nextCash.balance ?? 0), importedAt: now },
        ...filtered,
      ];

      await kv.set(key, nextHist);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}