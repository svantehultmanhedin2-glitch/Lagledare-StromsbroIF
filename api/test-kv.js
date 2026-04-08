import { kv } from "./_kv.js";

export default async function handler(req, res) {
  await kv.set("hello", "world");
  const value = await kv.get("hello");
  res.json({ value });
}