// /pages/api/sports-gear.js
import { kv } from "@vercel/kv";

const KEY = "sports-gear";

function normalize(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => ({
      id: String(
        x?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
      ),
      kind: String(x?.kind ?? "").trim().toLowerCase(),
      size: String(x?.size ?? "").trim(),
      qty: Math.max(0, Number(x?.qty) || 0),
      lowStockAt: Math.max(0, Number(x?.lowStockAt) || 0), // ✅ NYTT
    }))
    .filter((x) => x.kind && x.qty >= 0);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = (await kv.get(KEY)) ?? [];
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { items } = req.body ?? {};
      const safe = normalize(items);
      await kv.set(KEY, safe);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("sports-gear api error:", err);
    return res.status(500).json({ error: "Sports gear API error" });
  }
}