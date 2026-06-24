import { kv } from "./_kv.js";

export default async function handler(req, res) {
  try {
    const key = "inventory:tasks";

    if (req.method === "GET") {
      const data = await kv.get(key);
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === "POST") {
      const { tasks } = req.body || {};

      if (!Array.isArray(tasks)) {
        return res.status(400).json({ error: "Missing tasks array" });
      }

      await kv.set(key, tasks);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
