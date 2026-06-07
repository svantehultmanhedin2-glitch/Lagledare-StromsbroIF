// pages/api/warehouse.js
import { kv } from "@vercel/kv";

const KEY = "warehouse";

function safeNormalize(list) {
  // server-side minimal sanity: allow jersey items + stock items
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((x) => {
      if (!x || typeof x !== "object") return null;

      if (x.type === "stock" || x.qty !== undefined) {
        const kind = String(x.kind ?? "").toLowerCase().trim();
        const size = String(x.size ?? "").trim();
        const qty = Math.max(0, Number(x.qty ?? 0));
        if (!kind || !size) return null;

        return {
          type: "stock",
          id: x.id ?? `${kind}:${size}`,
          kind,
          size,
          qty,
          updatedAt: x.updatedAt ?? new Date().toISOString(),
        };
      }

      // jersey
      const number = Number(x.number);
      const size = String(x.size ?? "").trim();
      if (!Number.isFinite(number) || !size) return null;

      return {
        type: "jersey",
        id: x.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        number,
        size,
        position:
          x.position === "goalkeeper"
          ? "goalkeeper"
          : "outfield", // ✅ KRITISK FIX

        status: x.status === "assigned" ? "assigned" : "available",
        teamId: x.teamId ?? null,
        note: x.note ?? "",
        createdAt: x.createdAt ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = (await kv.get(KEY)) ?? [];
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { items } = req.body ?? {};
      const normalized = safeNormalize(items);
      await kv.set(KEY, normalized);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Warehouse API error" });
  }
}