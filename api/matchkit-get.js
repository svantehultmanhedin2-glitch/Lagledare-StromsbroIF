
import { kv } from "./_kv.js";

export default async function handler(req, res) {
  const { teamId } = req.query;
  const key = `matchkit:${teamId}`;

  const data = await kv.get(key);

  // ✅ GARANTERA array
  res.status(200).json(Array.isArray(data) ? data : []);
}
