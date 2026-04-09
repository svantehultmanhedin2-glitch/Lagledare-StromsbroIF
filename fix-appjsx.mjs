import fs from "fs";

const file = "src/App.jsx";
let s = fs.readFileSync(file, "utf8");

// 1) Unescape ALL HTML entities
s = s
  .replaceAll("=&gt;", "=>")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&");

// 2) Remove stray double-backticks if they exist
s = s.replaceAll("``\n", "\n").replaceAll("\n``", "\n");

// 3) Ensure there is exactly ONE compat layer, and that it is top-level
const startTag = "// ===================== KV-backed compat layer =====================";
const endTag = "// ===================== END KV-backed compat layer =====================";

const compatBlock = `${startTag}
// Gör att ALL befintlig kod fortsätter fungera,
// men datat lagras i Upstash KV via /api-routes.

const _matchkitCache = new Map(); // teamId -> items[]
let _warehouseCache = [];         // items[]

// ---- Matchkit (lag) ----
async function hydrateMatchKit(teamId) {
  const items = await apiLoadMatchKit(teamId);
  _matchkitCache.set(teamId, Array.isArray(items) ? items : []);
  return _matchkitCache.get(teamId);
}
function loadMatchKit(teamId) {
  return _matchkitCache.get(teamId) ?? [];
}
async function saveMatchKit(teamId, items) {
  const arr = Array.isArray(items) ? items : [];
  _matchkitCache.set(teamId, arr);
  await apiSaveMatchKit(teamId, arr);
}

// ---- Warehouse ----
async function hydrateWarehouse() {
  const items = await apiLoadWarehouse();
  _warehouseCache = Array.isArray(items) ? items : [];
  return _warehouseCache;
}
function loadWarehouse() {
  return _warehouseCache ?? [];
}
async function saveWarehouse(items) {
  const arr = Array.isArray(items) ? items : [];
  _warehouseCache = arr;
  await apiSaveWarehouse(arr);
}
${endTag}
`;

// remove any existing compat blocks (even if duplicated / misplaced)
const compatRegex = new RegExp(
  `${startTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${endTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
  "g"
);
s = s.replace(compatRegex, "");

// insert compat block right after apiSaveWarehouse(...) function
const anchor = "async function apiSaveWarehouse";
const ai = s.indexOf(anchor);
if (ai === -1) {
  console.error("Kunde inte hitta 'async function apiSaveWarehouse' i App.jsx");
  process.exit(1);
}

// find end of apiSaveWarehouse function: first occurrence of "\n}\n" after anchor
const end = s.indexOf("\n}\n", ai);
if (end === -1) {
  console.error("Kunde inte hitta slutet på apiSaveWarehouse-funktionen.");
  process.exit(1);
}

s = s.slice(0, end + 3) + "\n" + compatBlock + "\n" + s.slice(end + 3);

// 4) Final sanity check: there must be no HTML entities left
const leftovers = ["=&gt;", "&lt;", "&gt;", "&amp;"].filter((t) => s.includes(t));
if (leftovers.length) {
  console.error("Det finns fortfarande HTML-entiteter kvar:", leftovers);
  process.exit(1);
}

fs.writeFileSync(file, s, "utf8");
console.log("✅ App.jsx fixad: unescape + compat layer placerad korrekt");
``