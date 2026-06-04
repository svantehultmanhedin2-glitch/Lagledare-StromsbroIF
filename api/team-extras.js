// /api/team-extras.js
import { kv } from "@vercel/kv";

function key(teamId) {
  return `team-extras:${teamId}`;
}

function normalizeEntries(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => ({
      size: String(x?.size ?? "").trim(),
      qty: Math.max(0, Number(x?.qty) || 0),
    }))
    .filter((x) => x.size && x.qty > 0);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teamId } = req.query;

      if (!teamId) {
        return res.status(400).json({ error: "teamId saknas" });
      }

      const data = await kv.get(key(teamId));

      return res.status(200).json(
        data || {
          shorts: [],
          socks: [],
        }
      );
    }

    if (req.method === "POST") {
      const { teamId, extras } = req.body;

      if (!teamId) {
        return res.status(400).json({ error: "teamId saknas" });
      }

      const safeExtras = {
        shorts: normalizeEntries(extras?.shorts),
        socks: normalizeEntries(extras?.socks),
      };

      await kv.set(key(teamId), safeExtras);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("team-extras API error:", err);
    return res.status(500).json({ error: "Serverfel" });
  }
}
