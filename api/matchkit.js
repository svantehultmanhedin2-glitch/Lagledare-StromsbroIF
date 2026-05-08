// pages/api/matchkit.js
import { kv } from "@vercel/kv";

const keyFor = (teamId) => `matchkit:${teamId}`;

function safeNormalizeMatchkit(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((x) => {
      if (!x || typeof x !== "object") return null;

      // we store jerseys only (as your UI does), but allow kind/extras fields
      const id = String(x.id ?? "").trim();
      if (!id) return null;

      const number = x.number === null || x.number === undefined ? null : Number(x.number);
      const size = String(x.size ?? "").trim();
      if (!size) return null;

      return {
        id,
        kind: x.kind ?? "jersey",
        number: Number.isFinite(number) ? number : null,
        size,
        playerName: String(x.playerName ?? ""),
        extras: x.extras ?? { shorts: null, socks: null },
      };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const teamId = String(req.query.teamId ?? "").trim();
      if (!teamId) return res.status(400).json({ error: "teamId required" });

      const data = (await kv.get(keyFor(teamId))) ?? [];
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { teamId, items } = req.body ?? {};
      const tid = String(teamId ?? "").trim();
      if (!tid) return res.status(400).json({ error: "teamId required" });

      const normalized = safeNormalizeMatchkit(items);
      await kv.set(keyFor(tid), normalized);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Matchkit API error" });
  }
}