// /pages/api/team-gear.js
import { kv } from "@vercel/kv";

function key(teamId) {
  return `team-gear:${teamId}`;
}

function normalize(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => ({
      kind: String(x?.kind ?? "").trim().toLowerCase(),
      size: String(x?.size ?? "").trim(),
      qty: Math.max(0, Number(x?.qty) || 0),
    }))
    .filter((x) => x.kind && x.qty > 0);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teamId } = req.query;

      if (!teamId) {
        return res.status(400).json({ error: "teamId saknas" });
      }

      const data = (await kv.get(key(teamId))) ?? [];
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { teamId, items } = req.body ?? {};

      if (!teamId) {
        return res.status(400).json({ error: "teamId saknas" });
      }

      const safe = normalize(items);
      await kv.set(key(teamId), safe);

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("team-gear api error:", err);
    return res.status(500).json({ error: "Team gear API error" });
  }
}