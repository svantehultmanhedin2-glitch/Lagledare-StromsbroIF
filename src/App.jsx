import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// ===== API: HUVUDLAGER =====
async function apiLoadWarehouse() {
  const r = await fetch("/api/warehouse");
  if (!r.ok) throw new Error("Kunde inte läsa lager");
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function apiSaveWarehouse(items) {
  const r = await fetch("/api/warehouse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara lager");
}
// ===== API: ISSUED =====
async function apiLoadIssued(teamId) {
  const r = await fetch(`/api/issued?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa issued");
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function apiSaveIssued(teamId, items) {
  const r = await fetch("/api/issued", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara issued");
}

async function addLeaderClothesEntry(teamId, leaderName, items) {
  const existing = await apiLoadIssued(teamId);

  const entry = {
    id: uuid(),
    teamId,
    leaderName,
    items,
    createdAt: new Date().toISOString(),
    source: "manual",
  };

  const next = [entry, ...(existing || [])];

  await apiSaveIssued(teamId, next);
  return next;
}

async function importLeaderClothesExcel(file) {
  const rows = await parseMatchkitExcel(file);

  let created = 0;

  // === 1. Bygg upp nya data per lag ===
  const perTeam = {};

  for (const r of rows) {
    const leaderName = String(r.Namn ?? "").trim();
    const teamId = String(r.Lag ?? "").trim();
    const year = Number(r.År ?? r.Ar ?? r.year);

    if (!leaderName || !teamId || !year) continue;

    const items = [];

    if (r.Halvzip) items.push("Halvzip");
    if (r.Tshirt) items.push("T-shirt");
    if (r.Byxa) items.push("Byxa");
    if (r.Shorts) items.push("Shorts");
    if (r.Jacka) items.push("Jacka");
    if (r.Vinterjacka) items.push("Vinterjacka");
    if (r.Ryggsäck) items.push("Ryggsäck");

    if (items.length === 0) continue;

    if (!perTeam[teamId]) {
      perTeam[teamId] = [];
    }

    perTeam[teamId].push({
      id: uuid(),
      teamId,
      leaderName,
      year,
      items,
      createdAt: new Date().toISOString(),
      source: "import",
    });

    created++;
  }

  // === 2. SPARA → ERSÄTT HELT ===
  for (const teamId of Object.keys(perTeam)) {
    await apiSaveIssued(teamId, perTeam[teamId]);
  }

  return created;
}



/* ================= Utilities ================= */
const uuid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* ================= Storage ================= */
const jget = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const jset = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

const STOCK_KINDS = [
  { id: "shorts", label: "Shorts" },
  { id: "socks", label: "Strumpor" },
];

const kindLabel = (k) => STOCK_KINDS.find(x => x.id === k)?.label ?? k;

function normalizeWarehouse(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => {
      // STOCK-rad: {type:"stock", kind, size, qty}
      if (x?.type === "stock" || x?.qty !== undefined) {
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

      // JERSEY-rad (default)
      const number = Number(x.number ?? x.Nummer);
      const size = String(x.size ?? "").trim();
      if (!Number.isFinite(number) || !size) return null;

      
return {
  type: "jersey",
  id: x.id ?? uuid(),
  number,
  size,
  status: x.status ?? "available",
  teamId: x.teamId ?? null,
  note: x.note ?? "",
  position: x.position ?? "outfield", // ✅ NY
  createdAt: x.createdAt ?? new Date().toISOString(),
};

    })
    .filter(Boolean);
}

function splitWarehouse(list) {
  const w = normalizeWarehouse(list);
  return {
    jerseys: w.filter(x => x.type === "jersey"),
    stock: w.filter(x => x.type === "stock"),
  };
}

function getStockQty(stockList, kind, size) {
  const r = stockList.find(s => s.kind === kind && s.size === size);
  return r ? Number(r.qty) : 0;
}

function setStockQty(fullWarehouse, kind, size, qty) {
  const w = normalizeWarehouse(fullWarehouse);
  const next = w.filter(x => !(x.type === "stock" && x.kind === kind && x.size === size));
  const safeQty = Math.max(0, Number(qty) || 0);

  if (safeQty === 0) return next; // ta bort rad vid 0

  next.push({
    type: "stock",
    id: `${kind}:${size}`,
    kind,
    size,
    qty: safeQty,
    updatedAt: new Date().toISOString(),
  });

  return next;
}

function adjustStock(fullWarehouse, kind, size, delta) {
  const w = normalizeWarehouse(fullWarehouse);
  const { stock } = splitWarehouse(w);
  const current = getStockQty(stock, kind, size);
  const nextQty = current + Number(delta || 0);
  if (nextQty < 0) return { ok: false, next: w, current };
  return { ok: true, next: setStockQty(w, kind, size, nextQty), current };
}

// matchkit extras back-compat
function normalizeMatchkit(list) {
  return (Array.isArray(list) ? list : []).map((it) => ({
    ...it,
    kind: it.kind ?? "jersey",
    extras: it.extras ?? { shorts: null, socks: null },
  }));
}

/* ================= Simple PIN hashing (local-only, not strong crypto) ================= */
function hashPin(pin) {
  let h = 2166136261;
  const s = String(pin ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
async function parseMatchkitExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  return rows;
}
/* ================= Default data ================= */
const DEFAULT_TEAMS = [
  { id: "A-lag Dam", name: "A-lag Dam" },
  { id: "Herr", name: "Herr" },
  { id: "P10", name: "P10" },
{ id: "P11", name: "P11" },
{ id: "F11/12", name: "F11/12" },
{ id: "P12", name: "P12" },
{ id: "P13", name: "P13" },
{ id: "F13", name: "F13" },
{ id: "P14", name: "P14" },
{ id: "F14", name: "F14" },
{ id: "P15", name: "P15" },
{ id: "P16", name: "P16" },
{ id: "P17", name: "P17" },
{ id: "F17", name: "F17" },
{ id: "P18", name: "P18" },
{ id: "F18", name: "F18" },
{ id: "P19", name: "P19" },
{ id: "F19", name: "F19" },

];
const LEADER_PRODUCTS = [
  "Halvzip",
  "T-shirt",
  "Byxa",
  "Shorts",
  "Jacka",
  "Vinterjacka",
  "Ryggsäck",
];

function normalizeLeaderClothesEntries(list, currentTeamId) {
  return (Array.isArray(list) ? list : [])
    .map((e) => {
      const leaderName = String(e?.leaderName ?? e?.leader ?? "").trim();
      if (!leaderName) return null;

      let items = [];

      // Ny struktur: items som array av strängar
      if (Array.isArray(e.items) && e.items.every((x) => typeof x === "string")) {
        items = e.items.filter(Boolean);
      }

      // Mellanstruktur: items som array av objekt
      else if (Array.isArray(e.items) && e.items.every((x) => typeof x === "object")) {
        items = e.items
          .map((x) => String(x?.name ?? "").trim())
          .filter(Boolean);
      }

      // Gammal struktur: enstaka plagg i "name"
      else if (e.name) {
        items = [String(e.name).trim()];
      }

      if (items.length === 0) return null;

      const fallbackYear = e.createdAt
        ? new Date(e.createdAt).getFullYear()
        : new Date().getFullYear();

      return {
        id: e.id ?? uuid(),
        teamId: e.teamId ?? currentTeamId,
        leaderName,
        year: Number(e.year ?? fallbackYear),
        items,
        createdAt: e.createdAt ?? new Date().toISOString(),
        source: e.source ?? "manual",
      };
    })
    .filter(Boolean);
}

function ensureSeed() {
  const users = jget("users", null);
  if (users && Array.isArray(users) && users.length > 0) return;

  // Seed: one admin + two leaders
  jset("users", [
    {
      id: "u-admin",
      name: "Admin",
      role: "admin",
      pinHash: hashPin("1234"),
      teamIds: DEFAULT_TEAMS.map((t) => t.id),
    },
    {
      id: "u-led1",
      name: "Ledare 1",
      role: "leader",
      pinHash: hashPin("1111"),
      teamIds: ["P14", "P15"],
    },
    {
      id: "u-led2",
      name: "Ledare 2",
      role: "leader",
      pinHash: hashPin("2222"),
      teamIds: ["F11/12"],
    },
  ]);


}

/* ================= Routing (hash) ================= */
function useRoute() {
  const [route, setRoute] = useState(
    () => window.location.hash.replace("#", "") || "/matchkit"
  );

  useEffect(() => {
    const onHash = () =>
      setRoute(window.location.hash.replace("#", "") || "/matchkit");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = (to) => {
    window.location.hash = to;
  };

  return { route, nav };
}

/* ================= Notifications ================= */
async function apiGetNotifs(userId) {
  const r = await fetch(`/api/notifications-get?userId=${encodeURIComponent(userId)}`);
  if (!r.ok) throw new Error("Kunde inte hämta notiser");
  return await r.json();
}

async function apiAddNotif(userId, message) {
  await fetch("/api/notifications-add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, message }),
  });
}

async function apiMarkNotifRead(userId, notifId) {
  await fetch("/api/notifications-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, notifId }),
  });
}

/* ================= Auth ================= */
function useAuth() {
  const [user, setUser] = useState(() => jget("auth:user", null));
  const users = jget("users", []);

  const login = (userId, pin) => {
    const u = users.find((x) => x.id === userId);
    if (!u) return { ok: false, msg: "Okänd användare" };
    if (u.pinHash !== hashPin(pin)) return { ok: false, msg: "Fel PIN" };
    jset("auth:user", u);
    setUser(u);
    apiAddNotif(u.id, "Inloggad ✅");
    return { ok: true };
  };

  const logout = () => {
    localStorage.removeItem("auth:user");
    setUser(null);
  };

  const refreshUser = () => {
    const u = jget("auth:user", null);
    if (!u) return;
    const latest = users.find((x) => x.id === u.id);
    if (latest) {
      jset("auth:user", latest);
      setUser(latest);
    }
  };

  return { user, users, login, logout, refreshUser };
}

/* ================= Teams ================= */
function useTeams(user) {
  const [teams] = useState(DEFAULT_TEAMS);
  const [activeTeamId, setActiveTeamId] = useState(() => {
    const saved = jget("teams:active", null);
    const firstAllowed = user?.teamIds?.[0] ?? teams[0].id;
    return saved && (user.role === "admin" || user.teamIds.includes(saved))
      ? saved
      : firstAllowed;
  });

  useEffect(() => jset("teams:active", activeTeamId), [activeTeamId]);

  const visibleTeams =
    user.role === "admin"
      ? teams
      : teams.filter((t) => user.teamIds.includes(t.id));

  return { teams, visibleTeams, activeTeamId, setActiveTeamId };
}



/* ================= MatchKit ================= */
async function apiLoadMatchKit(teamId) {
  const r = await fetch(`/api/matchkit?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa matchkit");
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function apiSaveMatchKit(teamId, items) {
  const r = await fetch("/api/matchkit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara matchkit");
}
async function moveMatchKit(fromTeamId, toTeamId, ids) {
  const from = apiLoadMatchKit(fromTeamId);
  const to = apiLoadMatchKit(toTeamId);

  const moving = from.filter(i => ids.includes(i.id));

  await apiSaveMatchKit(fromTeamId, from.filter(i => !ids.includes(i.id)));
  await apiSaveMatchKit(toTeamId, [...to, ...moving]);
}

// ===== enkel tilldelning =====
  async function assignJerseyWithExtras(jerseyId, teamId, extras) {
    const warehouse = normalizeWarehouse(await apiLoadWarehouse());
    const { jerseys, stock } = splitWarehouse(warehouse);

    const jersey = jerseys.find((j) => j.id === jerseyId);
    if (!jersey || jersey.status !== "available") {
      alert("Tröjan är inte tillgänglig");
      return null;
    }

    const want = [];
    if (extras?.shorts?.size) {
      want.push({ kind: "shorts", size: extras.shorts.size, qty: 1 });
    }
    if (extras?.socks?.size) {
      want.push({ kind: "socks", size: extras.socks.size, qty: 1 });
    }

    for (const w of want) {
      const have = getStockQty(stock, w.kind, w.size);
      if (have < w.qty) {
        alert(
          `Inte tillräckligt i lager: ${kindLabel(w.kind)} ${w.size} (har ${have}, behöver ${w.qty})`
        );
        return null;
      }
    }

    let nextWarehouse = warehouse;
    for (const w of want) {
      const res = adjustStock(nextWarehouse, w.kind, w.size, -w.qty);
      if (!res.ok) {
        alert("Kunde inte dra från lager.");
        return null;
      }
      nextWarehouse = res.next;
    }

    nextWarehouse = nextWarehouse.map((x) =>
      x.type === "jersey" && x.id === jerseyId
        ? { ...x, status: "assigned", teamId }
        : x
    );

    const teamItemsRaw = await apiLoadMatchKit(teamId);
    const teamItems = normalizeMatchkit(teamItemsRaw);

    const teamItem = {
      id: jersey.id,
      kind: "jersey",
      position: jersey.position ?? "outfield",
      number: jersey.number,
      size: jersey.size,
      playerName: "",
      extras: {
        shorts:
          extras?.shorts?.size && extras.shorts.qty > 0
            ? { size: extras.shorts.size, qty: Math.floor(extras.shorts.qty) }
            : null,
        socks:
          extras?.socks?.size && extras.socks.qty > 0
            ? { size: extras.socks.size, qty: Math.floor(extras.socks.qty) }
            : null,
      },
    };

    await apiSaveMatchKit(teamId, [teamItem, ...teamItems]);
    await apiSaveWarehouse(nextWarehouse);

    return nextWarehouse;
  }

/* ================= Team extras (shorts/strumpor per lag) ================= */

/* ================= Team extras (shorts/strumpor per lag, flera storlekar) ================= */

function normalizeTeamExtras(extras) {
  const normalizeList = (list) =>
    (Array.isArray(list) ? list : [])
      .map((x) => ({
        size: String(x?.size ?? "").trim(),
        qty: Math.max(0, Number(x?.qty) || 0),
      }))
      .filter((x) => x.size && x.qty > 0);

  return {
    shorts: normalizeList(extras?.shorts),
    socks: normalizeList(extras?.socks),
  };
}

async function apiLoadTeamExtras(teamId) {
  const r = await fetch(`/api/team-extras?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa lagets shorts/strumpor");
  const data = await r.json();
  return normalizeTeamExtras(data);
}

async function apiSaveTeamExtras(teamId, extras) {
  const safeExtras = normalizeTeamExtras(extras);

  const r = await fetch(`/api/team-extras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, extras: safeExtras }),
  });
  if (!r.ok) throw new Error("Kunde inte spara lagets shorts/strumpor");
}

/**
 * Uppdatera lagets shorts/strumpor och justera huvudlagret automatiskt.
 * Ny modell: flera storlekar per lag.
 */
async function updateTeamExtrasWithWarehouse(teamId, nextExtras) {
  const [warehouseRaw, currentExtrasRaw] = await Promise.all([
    apiLoadWarehouse(),
    apiLoadTeamExtras(teamId),
  ]);

  let warehouse = normalizeWarehouse(warehouseRaw);
  const currentExtras = normalizeTeamExtras(currentExtrasRaw);
  const desiredExtras = normalizeTeamExtras(nextExtras);

  const { stock } = splitWarehouse(warehouse);

  const deltas = {};
  const addDelta = (kind, size, delta) => {
    if (!size || !delta) return;
    const key = `${kind}|${size}`;
    deltas[key] = (deltas[key] || 0) + delta;
  };

  // gamla tillbaka till huvudlager
  currentExtras.shorts.forEach((x) => addDelta("shorts", x.size, +x.qty));
  currentExtras.socks.forEach((x) => addDelta("socks", x.size, +x.qty));

  // nya dras från huvudlager
  desiredExtras.shorts.forEach((x) => addDelta("shorts", x.size, -x.qty));
  desiredExtras.socks.forEach((x) => addDelta("socks", x.size, -x.qty));

  // kontrollera att lager räcker
  for (const key of Object.keys(deltas)) {
    const [kind, size] = key.split("|");
    const delta = deltas[key];

    const currentQty = getStockQty(stock, kind, size);
    const nextQty = currentQty + delta;

    if (nextQty < 0) {
      throw new Error(
        `Inte tillräckligt i lager för ${kindLabel(kind)} ${size}. Har ${currentQty}, behöver ${Math.abs(delta)}.`
      );
    }
  }

  // tillämpa lagerändringar
  for (const key of Object.keys(deltas)) {
    const [kind, size] = key.split("|");
    const delta = deltas[key];

    if (delta !== 0) {
      const res = adjustStock(warehouse, kind, size, delta);
      if (!res.ok) {
        throw new Error(`Kunde inte uppdatera lager för ${kindLabel(kind)} ${size}.`);
      }
      warehouse = res.next;
    }
  }

  await apiSaveWarehouse(warehouse);
  await apiSaveTeamExtras(teamId, desiredExtras);

  return {
    warehouse,
    teamExtras: desiredExtras,
  };
}

async function updateMatchKitExtras(teamId, jerseyId, extras) {
  const current = await apiLoadMatchKit(teamId);

  const next = current.map((item) => {
    if (item.id !== jerseyId) return item;

    return {
      ...item,
      extras: {
        shorts: extras?.shorts ?? null,
        socks: extras?.socks ?? null,
      },
    };
  });

  await apiSaveMatchKit(teamId, next);
  return next;
}


/* ================= Leader clothes: catalog, budget, issued, orders ================= */
const catalogKey = "catalog:leaderclothes";


function issuedKey(teamId) {
  return `leaderclothes:${teamId}`;
}
function loadIssued(teamId) {
  return jget(issuedKey(teamId), []);
}
function saveIssued(teamId, list) {
  jset(issuedKey(teamId), list);
}

/* ================= Team cash (Upstash KV via Vercel API) =================
KV keys:
- teamcash:<teamId>               (current)
- teamcash-history:<teamId>       (array of {teamId, month, balance, importedAt})
*/

async function apiCashSnapshot(teamId) {
  const r = await fetch(`/api/teamcash-snapshot?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte hämta lagkassa");
  return await r.json(); // { cash, hist }
}

async function apiCashUpsert({ teamId, balance, month, accountNumber }) {
  const r = await fetch(`/api/teamcash-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, balance, month, accountNumber }),
  });
  if (!r.ok) throw new Error("Kunde inte spara lagkassa");
  return await r.json();
}

async function importCashExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  let n = 0;

  for (const r of rows) {
    const teamId =
      r.teamId ?? r.Team ?? r.Lag ?? r.lag;

    const saldo =
      r.saldo ?? r.Saldo ?? r.balance ?? r.Balance;

    const month =
      r.month ?? r.Month ?? r.månad ?? r.Månad;

    const accountNumber =
      r.kontonummer ?? r.Kontonummer ?? r.accountNumber ?? r.AccountNumber ?? "";

    if (!teamId || saldo === undefined || !month) continue;

    await apiCashUpsert({
      teamId: String(teamId).trim(),
      balance: Number(saldo),
      month: String(month).trim(),
      accountNumber: String(accountNumber ?? "").trim(),
    });

    n++;
  }

  return n;
}

/* ================= Reports (Excel export) ================= */
function exportXlsx(sheetName, rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

async function buildReportForAllTeams() {
  const rows = [];

  for (const team of DEFAULT_TEAMS) {
    const teamId = team.id;

    
    const matchKit = await apiLoadMatchKit(teamId);

     matchKit.forEach(mk => {
      rows.push({
        lag: teamId,
        nummer: mk.number,
        storlek: mk.size,
        spelare: mk.playerName || "",
        typ: "Matchställ",
      });
    });
  }

  return rows;
}

/* ================= UI helpers ================= */
function Pill({ tone, children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

function NavButton({ active, label, onClick }) {
  return (
    <a
      href="#"
      className="navItem"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={active ? { outline: "2px solid rgba(30,91,191,.75)" } : undefined}
    >
      {label}
    </a>
  );
}

/* ================= Login UI ================= */
function Login({ users, onLogin }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  // if users were missing for any reason, allow reseed
  if (!users || users.length === 0) {
    return (
      <div className="loginWrap">
        <div className="card">
          <div className="card__title">Inga användare hittades</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Klicka för att skapa demo-användare.
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: 12 }}
            onClick={() => {
              ensureSeed();
              window.location.reload();
            }}
          >
            Skapa demo-användare
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="loginWrap">
      <div className="card">
        <div className="card__title">Logga in</div>

        {err && <div className="banner banner--error">{err}</div>}

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Användare</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span>PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="4 siffror"
              inputMode="numeric"
            />
          </div>

          <div className="btnRow">
            <button
              className="btn btn--primary"
              onClick={() => {
                const res = onLogin(userId, pin);
                if (!res.ok) setErr(res.msg || "Fel");
              }}
            >
              Logga in
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPin("");
                setErr("");
              }}
            >
              Rensa
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            Demo: Admin PIN 1234 · Ledare 1 PIN 1111 · Ledare 2 PIN 2222
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Topbar ================= */
function Topbar({ user, teamsVisible, activeTeamId, setActiveTeamId, nav, unreadCount }) {
  return (
    <header className="topbar">
      <div className="topbar__row">
        <div className="brand">
          <div className="brand__logo">SIF</div>
          <div className="brand__text">
            <div className="title">Lagledarapp</div>
            <div className="subtitle">
              {user.role === "admin" ? "Adminläge" : "Ledarläge"} · {user.name}
            </div>
          </div>
        </div>


<div className="actions">
  <div className="team-switcher">
    <select
      value={activeTeamId}
      onChange={(e) => setActiveTeamId(e.target.value)}
      className="team-switcher__select"
      aria-label="Välj lag"
    >
      {teamsVisible.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  </div>

  <button className="btn btn--ghost btn--notifications" onClick={() => nav("/notifications")}>
    Notiser {unreadCount > 0 ? `(${unreadCount})` : ""}
  </button>
 </div>
      </div>
    </header>
  );
}

function BottomNav({ route, nav, user }) {
  return (
    <nav className="bottom-nav">

{user.role === "admin" && (
  <NavButton active={route === "/warehouse"} label="Huvudlager" onClick={() => nav("/warehouse")} />
)}
      
<NavButton active={route === "/matchkit"} label="Matchkläder" onClick={() => nav("/matchkit")} />
      <NavButton active={route === "/leaderclothes"} label="Ledarkläder" onClick={() => nav("/leaderclothes")} />
      <NavButton active={route === "/teamcash"} label="Lagkassa" onClick={() => nav("/teamcash")} />
      {user.role === "admin" && <NavButton active={route === "/admin"} label="Admin" onClick={() => nav("/admin")} />}
      {user.role === "admin" && <NavButton active={route === "/reports"} label="Rapporter" onClick={() => nav("/reports")} />}
    </nav>
  );
}

/* ================= Page: Notifications ================= */
function NotificationsPage({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGetNotifs(user.id)
      .then((l) => alive && setList(l))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [user.id]);

  const unread = list.filter((n) => !n.read).length;

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Notiser</div>
          <Pill tone="neutral">{unread} olästa</Pill>
        </div>
        {loading && <div className="empty">Laddar…</div>}
        {!loading && list.length === 0 && <div className="empty">Inga notiser</div>}
      </div>

      <div className="history">
        {list.map((n) => (
          <div key={n.id} className={`historyRow ${n.read ? "" : "card--selected"}`}>
            <div>
              <div className="historyRow__title">{n.message}</div>
              <div className="historyRow__sub">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
            {!n.read && (
              <button
                className="btn btn--ok"
                onClick={async () => {
                  await apiMarkNotifRead(user.id, n.id);
                  setList(await apiGetNotifs(user.id));
                }}
              >
                Läst
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
/* ================= HUVUDLAGER: Matchkläder (Warehouse) ================= */

function WarehouseMatchkitPage({ user }) {
  const fileRef = useRef(null);

  const [items, setItems] = useState([]);
  const [importMode, setImportMode] = useState("append");

  // enkel tilldelning
  const [assigningId, setAssigningId] = useState(null);
  const [assignTeamId, setAssignTeamId] = useState("");
  const [extraShortsSize, setExtraShortsSize] = useState("");
  const [extraSocksSize, setExtraSocksSize] = useState("");

  // filter
  const [showGoalkeepersOnly, setShowGoalkeepersOnly] = useState(false);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [qNumber, setQNumber] = useState("");
  const [qSize, setQSize] = useState("all");

  // batch
  const [selectedJerseyIds, setSelectedJerseyIds] = useState([]);
  const [bulkAssignTeamId, setBulkAssignTeamId] = useState("");
  const [bulkShortsSize, setBulkShortsSize] = useState("");
  const [bulkSocksSize, setBulkSocksSize] = useState("");

  // tool panels
  const [activeToolPanel, setActiveToolPanel] = useState(null); // null | "batch" | "import" | "stock"

  // stock form (kontrollerade inputs)
  const [stockKindInput, setStockKindInput] = useState("shorts");
  const [stockSizeInput, setStockSizeInput] = useState("");
  const [stockQtyInput, setStockQtyInput] = useState("");

  useEffect(() => {
    apiLoadWarehouse().then((w) => setItems(normalizeWarehouse(w)));
  }, []);

  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Huvudlager</div>
        <div className="empty">Endast admin</div>
      </div>
    );
  }

  const { jerseys, stock } = splitWarehouse(items);

  const sizes = useMemo(() => {
    const set = new Set(jerseys.map((i) => i.size).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sv"));
  }, [jerseys]);

  const filteredJerseys = useMemo(() => {
  const numberQuery = qNumber.trim();

  return jerseys.filter((i) => {
    if (numberQuery && !String(i.number).includes(numberQuery)) return false;
    if (qSize !== "all" && i.size !== qSize) return false;

    if (showGoalkeepersOnly && i.position !== "goalkeeper") return false;

    // ✅ NY FILTER
    if (showAvailableOnly && i.status !== "available") return false;

    return true;
  });
}, [jerseys, qNumber, qSize, showGoalkeepersOnly, showAvailableOnly]);

  const availableCount = jerseys.filter((j) => j.status === "available").length;
  const assignedCount = jerseys.length - availableCount;

  const reload = async () => {
    const w = await apiLoadWarehouse();
    setItems(normalizeWarehouse(w));
  };

  const toggleToolPanel = (panel) => {
    setActiveToolPanel((prev) => (prev === panel ? null : panel));
  };

  // ===== batch-markering =====
  const toggleSelectedJersey = (id) => {
    setSelectedJerseyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelectedJerseys = () => {
    setSelectedJerseyIds([]);
  };

  const visibleAvailableIds = filteredJerseys
    .filter((j) => j.status === "available")
    .map((j) => j.id);

  const allVisibleAvailableSelected =
    visibleAvailableIds.length > 0 &&
    visibleAvailableIds.every((id) => selectedJerseyIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleAvailableSelected) {
      setSelectedJerseyIds((prev) =>
        prev.filter((id) => !visibleAvailableIds.includes(id))
      );
    } else {
      setSelectedJerseyIds((prev) => [
        ...new Set([...prev, ...visibleAvailableIds]),
      ]);
    }
  };

  // ===== import =====
  const importWarehouseExcel = async (file, mode) => {
    const parsed = await parseMatchkitExcel(file);

    const incoming = (Array.isArray(parsed) ? parsed : [])
      .map((row) => {
        const roleVal = String(
          row.position ??
            row.Position ??
            row.typ ??
            row.Typ ??
            row.roll ??
            row.Roll ??
            row.rolle ??
            row.Rolle ??
            ""
        )
          .toLowerCase()
          .trim();

        const isGoalkeeper =
          roleVal === "målvakt" ||
          roleVal === "goalkeeper" ||
          roleVal === "keeper" ||
          roleVal === "mv";

        return {
          id: uuid(),
          type: "jersey",
          number: Number(row.Nummer ?? row.nummer ?? row.number ?? row.Number),
          size: String(
            row.Storlek ?? row.storlek ?? row.size ?? row.Size ?? ""
          ).trim(),
          position: isGoalkeeper ? "goalkeeper" : "outfield",
          status: "available",
          teamId: null,
          note: "",
          createdAt: new Date().toISOString(),
        };
      })
      .filter((x) => Number.isFinite(x.number) && x.size);

    if (incoming.length === 0) {
      alert("Filen innehåller inga giltiga rader (Nummer + Storlek krävs).");
      return 0;
    }

    const next =
      mode === "replace"
        ? [...incoming, ...stock]
        : [...normalizeWarehouse(items), ...incoming];

    setItems(next);
    await apiSaveWarehouse(next);
    return incoming.length;
  };

  // ===== lägg till tröja =====
  const addManualJersey = async () => {
    const number = Number(prompt("Tröjnummer?"));
    const size = (prompt("Storlek (t.ex. 152, S, M)?") || "").trim();

    if (!Number.isFinite(number) || !size) return;

    const type = prompt("Typ av tröja?\n\n1 = Utespelare\n2 = Målvakt", "1");
    if (!type) return;

    const isKeeper = type === "2";

    const next = [
      {
        id: uuid(),
        type: "jersey",
        number,
        size,
        position: isKeeper ? "goalkeeper" : "outfield",
        status: "available",
        teamId: null,
        createdAt: new Date().toISOString(),
      },
      ...normalizeWarehouse(items),
    ];

    setItems(next);
    await apiSaveWarehouse(next);
  };

  // ===== ta bort tröja från huvudlager =====
  const removeJersey = async (id) => {
    const next = normalizeWarehouse(items).filter(
      (x) => !(x.type === "jersey" && x.id === id)
    );
    setItems(next);
    await apiSaveWarehouse(next);
  };

  
  // ===== batch-tilldelning med extras =====
  async function assignMultipleJerseysWithExtras(teamId, jerseyIds, extras) {
    const ids = Array.isArray(jerseyIds) ? jerseyIds : [];

    if (!teamId) {
      alert("Välj ett lag först.");
      return null;
    }

    if (ids.length === 0) {
      alert("Markera minst en tröja.");
      return null;
    }

    const warehouse = normalizeWarehouse(await apiLoadWarehouse());
    const { jerseys, stock } = splitWarehouse(warehouse);

    const selectedJerseys = jerseys.filter((j) => ids.includes(j.id));

    if (selectedJerseys.length !== ids.length) {
      alert("Några markerade tröjor kunde inte hittas.");
      return null;
    }

    const unavailable = selectedJerseys.filter((j) => j.status !== "available");
    if (unavailable.length > 0) {
      alert("En eller flera markerade tröjor är inte längre tillgängliga.");
      return null;
    }

    const shortsQtyNeeded = extras?.shorts?.size ? ids.length : 0;
    const socksQtyNeeded = extras?.socks?.size ? ids.length : 0;

    if (shortsQtyNeeded > 0) {
      const haveShorts = getStockQty(stock, "shorts", extras.shorts.size);
      if (haveShorts < shortsQtyNeeded) {
        alert(
          `Inte tillräckligt med shorts i lager (${extras.shorts.size}). Har ${haveShorts}, behöver ${shortsQtyNeeded}.`
        );
        return null;
      }
    }

    if (socksQtyNeeded > 0) {
      const haveSocks = getStockQty(stock, "socks", extras.socks.size);
      if (haveSocks < socksQtyNeeded) {
        alert(
          `Inte tillräckligt med strumpor i lager (${extras.socks.size}). Har ${haveSocks}, behöver ${socksQtyNeeded}.`
        );
        return null;
      }
    }

    let nextWarehouse = warehouse;

    if (shortsQtyNeeded > 0) {
      const res = adjustStock(
        nextWarehouse,
        "shorts",
        extras.shorts.size,
        -shortsQtyNeeded
      );
      if (!res.ok) {
        alert("Kunde inte dra shorts från lager.");
        return null;
      }
      nextWarehouse = res.next;
    }

    if (socksQtyNeeded > 0) {
      const res = adjustStock(
        nextWarehouse,
        "socks",
        extras.socks.size,
        -socksQtyNeeded
      );
      if (!res.ok) {
        alert("Kunde inte dra strumpor från lager.");
        return null;
      }
      nextWarehouse = res.next;
    }

    nextWarehouse = nextWarehouse.map((x) =>
      x.type === "jersey" && ids.includes(x.id)
        ? { ...x, status: "assigned", teamId }
        : x
    );

    const teamItemsRaw = await apiLoadMatchKit(teamId);
    const teamItems = normalizeMatchkit(teamItemsRaw);

    const existingIds = new Set(teamItems.map((x) => x.id));

    const newTeamItems = selectedJerseys
      .filter((j) => !existingIds.has(j.id))
      .map((j) => ({
        id: j.id,
        kind: "jersey",
        position: j.position ?? "outfield",
        number: j.number,
        size: j.size,
        playerName: "",
        extras: {
          shorts: extras?.shorts?.size
            ? { size: extras.shorts.size, qty: 1 }
            : null,
          socks: extras?.socks?.size
            ? { size: extras.socks.size, qty: 1 }
            : null,
        },
      }));

    await apiSaveMatchKit(teamId, [...newTeamItems, ...teamItems]);
    await apiSaveWarehouse(nextWarehouse);

    return {
      nextWarehouse,
      assignedCount: newTeamItems.length,
      shortsAssigned: shortsQtyNeeded,
      socksAssigned: socksQtyNeeded,
    };
  }

  const toolBtnStyle = (active) => ({
    position: "relative",
    borderRadius: 12,
    minWidth: 42,
    minHeight: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    background: active ? "rgba(30,91,191,0.22)" : "rgba(255,255,255,0.04)",
    border: active
      ? "1px solid rgba(30,91,191,.65)"
      : "1px solid rgba(157,179,216,.18)",
    boxShadow: active
      ? "0 0 0 2px rgba(30,91,191,.18) inset"
      : "none",
  });

  const floatingBadgeStyle = {
    position: "absolute",
    top: -7,
    right: -7,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 999,
    background: "#22c55e",
    color: "#06121f",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  };

  const stickyWrapStyle = {
    position: "sticky",
    top: 80, // justera till 76/80 om din topbar är högre
    zIndex: 30,
  };

  const glassCardStyle = {
    background: "rgba(15,23,42,0.88)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 10px 30px rgba(0,0,0,.22)",
    border: "1px solid rgba(157,179,216,.14)",
  };

  return (
    <div>
      {/* ===== STICKY STACK: sök + verktygsrad ===== */}
      <div style={stickyWrapStyle}>
        <div
          className="card"
          style={{
            ...glassCardStyle,
            marginBottom: 10,
          }}
        >
          <div className="card__top">
            <div className="card__title">Huvudlager – sök & filter</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill tone="neutral">Totalt {jerseys.length}</Pill>
              <Pill tone="ok">Tillgängliga {availableCount}</Pill>
              <Pill tone="warn">Tilldelade {assignedCount}</Pill>
            </div>
          </div>

          <div className="formGrid" style={{ marginTop: 10 }}>
            <div className="field">
              <span>Sök tröjnummer</span>
              <input
                value={qNumber}
                onChange={(e) => setQNumber(e.target.value)}
                placeholder="t.ex. 10"
                inputMode="numeric"
              />
            </div>

            <div className="field">
              <span>Storlek</span>
              <select value={qSize} onChange={(e) => setQSize(e.target.value)}>
                <option value="all">Alla</option>
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="muted"
            style={{ fontSize: 12, marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <span>Visar {filteredJerseys.length} tröjor</span>
            {showAvailableOnly && (
  <span style={{ color: "#22c55e" }}>• Endast lediga</span>
)}
            <span>Markerade {selectedJerseyIds.length}</span>
          </div>
        </div>

        <div
          className="card"
          style={{
            ...glassCardStyle,
            padding: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
            borderBottom: "1px solid rgba(157,179,216,0.12)",
          }}
        >
          <button
            className={`btn ${showGoalkeepersOnly ? "btn--ok" : "btn--ghost"}`}
            onClick={() => setShowGoalkeepersOnly((prev) => !prev)}
            style={{
              boxShadow: showGoalkeepersOnly
                ? "0 8px 20px rgba(34,197,94,.18)"
                : "none",
            }}
          >
            {showGoalkeepersOnly ? "Visa alla" : "🥅 Målvakter"}
          </button>

<button
  className={`btn ${showAvailableOnly ? "btn--ok" : "btn--ghost"}`}
  onClick={() => setShowAvailableOnly((prev) => !prev)}
>
  {showAvailableOnly ? "Visa alla" : "Endast lediga"}
</button>

          <button
            className="iconBtn"
            title="Batch-tilldelning"
            aria-label="Batch-tilldelning"
            style={toolBtnStyle(activeToolPanel === "batch")}
            onClick={() => toggleToolPanel("batch")}
          >
            🧺
            {selectedJerseyIds.length > 0 && (
              <span style={floatingBadgeStyle}>{selectedJerseyIds.length}</span>
            )}
          </button>

          <button
            className="iconBtn"
            title="Importera"
            aria-label="Importera"
            style={toolBtnStyle(activeToolPanel === "import")}
            onClick={() => toggleToolPanel("import")}
          >
            📥
          </button>

          <button
            className="iconBtn"
            title="Lager för shorts och strumpor"
            aria-label="Lager för shorts och strumpor"
            style={toolBtnStyle(activeToolPanel === "stock")}
            onClick={() => toggleToolPanel("stock")}
          >
            📦
          </button>

          <button
            className="iconBtn"
            title="Lägg till tröja"
            aria-label="Lägg till tröja"
            style={toolBtnStyle(false)}
            onClick={addManualJersey}
          >
            ➕
          </button>

          <button
            className="iconBtn"
            title="Uppdatera"
            aria-label="Uppdatera"
            style={toolBtnStyle(false)}
            onClick={reload}
          >
            🔄
          </button>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Pill tone="neutral">{filteredJerseys.length} visade</Pill>
            {selectedJerseyIds.length > 0 && (
              <Pill tone="ok">{selectedJerseyIds.length} markerade</Pill>
            )}
          </div>
        </div>
      </div>

      {/* ===== VERKTYGSPANELER ===== */}
      {activeToolPanel === "batch" && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="card__top">
            <div className="card__title">Batch-tilldelning</div>
            <Pill tone="neutral">{selectedJerseyIds.length} markerade</Pill>
          </div>

          <div className="formGrid" style={{ marginTop: 10 }}>
            <div className="field">
              <span>Lag</span>
              <select
                value={bulkAssignTeamId}
                onChange={(e) => setBulkAssignTeamId(e.target.value)}
              >
                <option value="">Välj lag</option>
                {DEFAULT_TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span>Shorts storlek (valfritt)</span>
              <select
                value={bulkShortsSize}
                onChange={(e) => setBulkShortsSize(e.target.value)}
              >
                <option value="">Ingen</option>
                {stock
                  .filter((s) => s.kind === "shorts")
                  .map((s) => (
                    <option key={s.id} value={s.size}>
                      {s.size} ({s.qty})
                    </option>
                  ))}
              </select>
            </div>

            <div className="field">
              <span>Strumpor storlek (valfritt)</span>
              <select
                value={bulkSocksSize}
                onChange={(e) => setBulkSocksSize(e.target.value)}
              >
                <option value="">Ingen</option>
                {stock
                  .filter((s) => s.kind === "socks")
                  .map((s) => (
                    <option key={s.id} value={s.size}>
                      {s.size} ({s.qty})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="btnRow" style={{ marginTop: 10 }}>
            <button className="btn btn--ghost" onClick={toggleSelectAllVisible}>
              {allVisibleAvailableSelected
                ? "Avmarkera alla visade"
                : "Markera alla visade"}
            </button>

            <button
              className="btn btn--ghost"
              onClick={() => {
                clearSelectedJerseys();
                setBulkAssignTeamId("");
                setBulkShortsSize("");
                setBulkSocksSize("");
              }}
            >
              Rensa
            </button>

            <button
              className="btn btn--ok"
              disabled={!bulkAssignTeamId || selectedJerseyIds.length === 0}
              onClick={async () => {
                const extras = {
                  shorts: bulkShortsSize ? { size: bulkShortsSize, qty: 1 } : null,
                  socks: bulkSocksSize ? { size: bulkSocksSize, qty: 1 } : null,
                };

                const targetTeam = bulkAssignTeamId;

                const res = await assignMultipleJerseysWithExtras(
                  targetTeam,
                  selectedJerseyIds,
                  extras
                );

                if (!res) return;

                setItems(res.nextWarehouse);
                setSelectedJerseyIds([]);
                setBulkAssignTeamId("");
                setBulkShortsSize("");
                setBulkSocksSize("");
                setActiveToolPanel(null);

                alert(
                  `${res.assignedCount} tröjor tilldelade till ${targetTeam} ✅\nShorts: ${res.shortsAssigned}\nStrumpor: ${res.socksAssigned}`
                );
              }}
            >
              Tilldela markerade
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Alla markerade tröjor får samma valda shorts- och strumpstorlek.
          </div>
        </div>
      )}

      {activeToolPanel === "import" && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="card__top">
            <div className="card__title">Importera tröjor</div>
            <Pill tone="neutral">Nummer + Storlek (+ roll valfritt)</Pill>
          </div>

          <div className="formGrid" style={{ marginTop: 10 }}>
            <div className="field">
              <span>Läge</span>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="append">Lägg till</option>
                <option value="replace">Ersätt tröjor men behåll stock</option>
              </select>
            </div>

            <div className="field">
              <span>Fil</span>
              <button
                className="btn btn--primary"
                onClick={() => fileRef.current?.click()}
              >
                Välj Excel-fil
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              try {
                const count = await importWarehouseExcel(file, importMode);
                alert(`${count} tröjor importerade ✅`);
                setActiveToolPanel(null);
              } catch (err) {
                console.error(err);
                alert("Importen misslyckades ❌");
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
      )}

      {activeToolPanel === "stock" && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="card__top">
            <div className="card__title">Shorts & Strumpor – lager</div>
            <Pill tone="neutral">{stock.length} rader</Pill>
          </div>

          <div className="formGrid" style={{ marginTop: 10 }}>
            <div className="field">
              <span>Typ</span>
              <select
                value={stockKindInput}
                onChange={(e) => setStockKindInput(e.target.value)}
              >
                {STOCK_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span>Storlek</span>
              <input
                value={stockSizeInput}
                onChange={(e) => setStockSizeInput(e.target.value)}
                placeholder="t.ex. 152 eller 31-33"
              />
            </div>

            <div className="field">
              <span>Antal</span>
              <input
                value={stockQtyInput}
                onChange={(e) => setStockQtyInput(e.target.value)}
                inputMode="numeric"
                placeholder="t.ex. 10"
              />
            </div>

            <button
              className="btn btn--ok"
              onClick={async () => {
                const kind = stockKindInput;
                const size = String(stockSizeInput || "").trim();
                const qty = Number(stockQtyInput || 0);

                if (!size || qty < 0) return;

                const next = setStockQty(items, kind, size, qty);
                setItems(next);
                await apiSaveWarehouse(next);

                setStockSizeInput("");
                setStockQtyInput("");
              }}
            >
              Spara
            </button>
          </div>

          <div className="history" style={{ marginTop: 12 }}>
            {stock
              .slice()
              .sort((a, b) => (a.kind + a.size).localeCompare(b.kind + b.size, "sv"))
              .map((s) => (
                <div key={s.id} className="historyRow">
                  <div>
                    <div className="historyRow__title">
                      {kindLabel(s.kind)} · {s.size}
                    </div>
                    <div className="historyRow__sub">
                      I lager: <strong>{s.qty}</strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="iconBtn"
                      title="Minska"
                      onClick={async () => {
                        const r = adjustStock(items, s.kind, s.size, -1);
                        if (!r.ok) return;
                        setItems(r.next);
                        await apiSaveWarehouse(r.next);
                      }}
                    >
                      ➖
                    </button>

                    <button
                      className="iconBtn"
                      title="Öka"
                      onClick={async () => {
                        const r = adjustStock(items, s.kind, s.size, +1);
                        setItems(r.next);
                        await apiSaveWarehouse(r.next);
                      }}
                    >
                      ➕
                    </button>

                    <button
                      className="iconBtn danger"
                      title="Ta bort rad"
                      onClick={async () => {
                        const next = setStockQty(items, s.kind, s.size, 0);
                        setItems(next);
                        await apiSaveWarehouse(next);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ===== TRÖJORNA ===== */}
      <div className="history" style={{ marginTop: 12 }}>
        {filteredJerseys.length === 0 && <div className="empty">Inga träffar</div>}

        {filteredJerseys.map((i) => (
          <div
            key={i.id}
            className="historyRow"
            style={{
              borderRadius: 14,
              marginBottom: 8,
              background:
                i.status === "available"
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(245,158,11,0.06)",
              border:
                i.status === "available"
                  ? "1px solid rgba(157,179,216,.10)"
                  : "1px solid rgba(245,158,11,.18)",
            }}
          >
            <div>
              <div className="historyRow__title">
                #{i.number} · {i.size}
                {i.position === "goalkeeper" && " 🥅"}
              </div>

              <div
                className="historyRow__sub"
                style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
              >
                <span>
                  Status:{" "}
                  {i.status === "available" ? "Tillgänglig" : `Tilldelad (${i.teamId})`}
                </span>

                {i.position === "goalkeeper" && (
                  <span className="chip">Målvakt</span>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {i.status === "available" ? (
                <Pill tone="ok">Tillgänglig</Pill>
              ) : (
                <Pill tone="warn">Tilldelad</Pill>
              )}

              {i.status === "available" && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 12,
                    background: selectedJerseyIds.includes(i.id)
                      ? "rgba(34,197,94,.14)"
                      : "rgba(255,255,255,.04)",
                    border: selectedJerseyIds.includes(i.id)
                      ? "1px solid rgba(34,197,94,.35)"
                      : "1px solid rgba(157,179,216,.12)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedJerseyIds.includes(i.id)}
                    onChange={() => toggleSelectedJersey(i.id)}
                  />
                  <span style={{ fontSize: 12 }}>Markera</span>
                </label>
              )}

              {i.status === "available" && assigningId !== i.id && (
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    setAssigningId(i.id);
                    setAssignTeamId("");
                    setExtraShortsSize("");
                    setExtraSocksSize("");
                  }}
                >
                  Tilldela
                </button>
              )}

              {i.status === "available" && assigningId === i.id && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  <select
                    value={assignTeamId}
                    onChange={(e) => setAssignTeamId(e.target.value)}
                  >
                    <option value="">Välj lag</option>
                    {DEFAULT_TEAMS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={extraShortsSize}
                    onChange={(e) => setExtraShortsSize(e.target.value)}
                  >
                    <option value="">Shorts storlek</option>
                    {stock
                      .filter((s) => s.kind === "shorts")
                      .map((s) => (
                        <option key={s.id} value={s.size}>
                          {s.size} ({s.qty})
                        </option>
                      ))}
                  </select>

                  <select
                    value={extraSocksSize}
                    onChange={(e) => setExtraSocksSize(e.target.value)}
                  >
                    <option value="">Strumpor storlek</option>
                    {stock
                      .filter((s) => s.kind === "socks")
                      .map((s) => (
                        <option key={s.id} value={s.size}>
                          {s.size} ({s.qty})
                        </option>
                      ))}
                  </select>

                  <button
                    className="iconBtn ok"
                    title="Bekräfta"
                    disabled={!assignTeamId}
                    onClick={async () => {
                      const extras = {
                        shorts: extraShortsSize
                          ? { size: extraShortsSize, qty: 1 }
                          : null,
                        socks: extraSocksSize
                          ? { size: extraSocksSize, qty: 1 }
                          : null,
                      };

                      const nextWarehouse = await assignJerseyWithExtras(
                        i.id,
                        assignTeamId,
                        extras
                      );

                      if (nextWarehouse) setItems(nextWarehouse);

                      setAssigningId(null);
                      setAssignTeamId("");
                      setExtraShortsSize("");
                      setExtraSocksSize("");
                    }}
                  >
                    ✅
                  </button>

                  <button
                    className="iconBtn"
                    title="Avbryt"
                    onClick={() => {
                      setAssigningId(null);
                      setAssignTeamId("");
                      setExtraShortsSize("");
                      setExtraSocksSize("");
                    }}
                  >
                    ✖️
                  </button>
                </div>
              )}

              <button
                className="iconBtn danger"
                title="Ta bort tröja"
                onClick={() => removeJersey(i.id)}
                disabled={i.status !== "available"}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



/* ================= Page: Matchkit ================= */
function MatchKitPage({ user, teamId, teamsVisible }) {
  const isAdmin = user.role === "admin";

  const [showOnlyGoalkeepers, setShowOnlyGoalkeepers] = useState(false);

  // Matchtröjor för valt lag
  const [items, setItems] = useState([]);

  // Huvudlager behövs för lagerstatus på shorts/strumpor
  const [warehouseItems, setWarehouseItems] = useState([]);
const [assignFromWarehouseOpen, setAssignFromWarehouseOpen] = useState(false);
  // Lagets shorts/strumpor (på lag-nivå)
const [teamExtras, setTeamExtras] = useState({
  shorts: [],
  socks: [],
});

const startEditTeamExtras = () => {
  setDraftTeamExtras(normalizeTeamExtras(teamExtras));
  setEditingTeamExtras(true);
};

const cancelEditTeamExtras = () => {
  setDraftTeamExtras(normalizeTeamExtras(teamExtras));
  setEditingTeamExtras(false);
};

const addDraftRow = (kind) => {
  setDraftTeamExtras((prev) => ({
    ...prev,
    [kind]: [...prev[kind], { size: "", qty: 1 }],
  }));
};

const updateDraftRow = (kind, index, patch) => {
  setDraftTeamExtras((prev) => ({
    ...prev,
    [kind]: prev[kind].map((row, i) =>
      i === index ? { ...row, ...patch } : row
    ),
  }));
};

const removeDraftRow = (kind, index) => {
  setDraftTeamExtras((prev) => ({
    ...prev,
    [kind]: prev[kind].filter((_, i) => i !== index),
  }));
};

const saveEditedTeamExtras = async () => {
  try {
    const cleaned = normalizeTeamExtras(draftTeamExtras);
    const res = await updateTeamExtrasWithWarehouse(teamId, cleaned);

    setWarehouseItems(res.warehouse);
    setTeamExtras(res.teamExtras);
    setDraftTeamExtras(res.teamExtras);
    setEditingTeamExtras(false);
  } catch (err) {
    console.error(err);
    alert(err.message || "Kunde inte spara lagets shorts/strumpor.");
  }
};

const renderExtrasSummary = (kind) => {
  const list = teamExtras[kind] || [];
  if (list.length === 0) return "-";
  return list.map((x) => `${x.size} ×${x.qty}`).join(", ");
};

const [editingTeamExtras, setEditingTeamExtras] = useState(false);
const [draftTeamExtras, setDraftTeamExtras] = useState({
  shorts: [],
  socks: [],
});

const [assignSizeFilter, setAssignSizeFilter] = useState("all");
const [assignOnlyGoalkeepers, setAssignOnlyGoalkeepers] = useState(false);

  // Flytta markerade tröjor
  const [selected, setSelected] = useState([]);
  const [importMode, setImportMode] = useState("replace");
  const [moveFrom, setMoveFrom] = useState(teamId);
  const [moveTo, setMoveTo] = useState(
    teamsVisible.find((t) => t.id !== teamId)?.id ?? teamId
  );

  // Ladda data
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [matchkitData, warehouseData, extrasData] = await Promise.all([
          apiLoadMatchKit(teamId),
          apiLoadWarehouse(),
          apiLoadTeamExtras(teamId),
        ]);

        if (!alive) return;

        setItems(normalizeMatchkit(matchkitData));
        setWarehouseItems(normalizeWarehouse(warehouseData));

        const normalizedExtras = normalizeTeamExtras(extrasData);

        setTeamExtras(normalizedExtras);
        setDraftTeamExtras(normalizedExtras);

          setSelected([]);
          setMoveFrom(teamId);
          setMoveTo(teamsVisible.find((t) => t.id !== teamId)?.id ?? teamId);

          setEditingTeamExtras(false);

      } catch (e) {
        console.error(e);
        if (!alive) return;
        setItems([]);
        setWarehouseItems([]);
        setTeamExtras({ shorts: [], socks: [] });
        setSelected([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [teamId, teamsVisible]);

  const stock = useMemo(() => splitWarehouse(warehouseItems).stock, [warehouseItems]);
const assignSizes = useMemo(() => {
  const all = splitWarehouse(warehouseItems).jerseys
    .map(j => j.size)
    .filter(Boolean);

  return [...new Set(all)].sort((a, b) => a.localeCompare(b, "sv"));
}, [warehouseItems]);
  const assignedCount = useMemo(
    () => items.filter((i) => String(i.playerName || "").trim()).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    if (!showOnlyGoalkeepers) return items;
    return items.filter((i) => i.position === "goalkeeper");
  }, [items, showOnlyGoalkeepers]);

  const toggleSelected = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Spara hela listan för aktuellt lag
  const persist = async (next) => {
    setItems(next);
    await apiSaveMatchKit(teamId, next);
  };

const reloadMatchKit = async () => {
  const data = await apiLoadMatchKit(teamId);
  setItems(normalizeMatchkit(data));
};

  
  // Uppdatera enstaka tröja

const updateItem = async (id, patch) => {
  if ("size" in patch) {
    console.warn("Storlek ändras endast i huvudlager");
    return;
  }

  const next = items.map((i) =>
    i.id === id ? { ...i, ...patch } : i
  );

  await persist(next);
};


  // Flytta markerade tröjor mellan lag
  const moveMatchKitBetweenTeams = async (fromTeamId, toTeamId, ids) => {
    const from = await apiLoadMatchKit(fromTeamId);
    const to = await apiLoadMatchKit(toTeamId);

    const safeFrom = Array.isArray(from) ? from : [];
    const safeTo = Array.isArray(to) ? to : [];

    const moving = safeFrom.filter((i) => ids.includes(i.id));
    const nextFrom = safeFrom.filter((i) => !ids.includes(i.id));
    const nextTo = [...safeTo, ...moving];

    await apiSaveMatchKit(fromTeamId, nextFrom);
    await apiSaveMatchKit(toTeamId, nextTo);

    if (teamId === fromTeamId) setItems(normalizeMatchkit(nextFrom));
    if (teamId === toTeamId) setItems(normalizeMatchkit(nextTo));
    setSelected([]);
  };

  // Import matchkit Excel
  const importMatchKitExcelHere = async (file, mode) => {
    const rows = await parseMatchkitExcel(file);

    const incoming = (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        id: uuid(),
        kind: "jersey",
        number: Number(r.nummer ?? r.Nummer ?? r.number ?? r.Number),
        size: String(r.storlek ?? r.Storlek ?? r.size ?? r.Size ?? "").trim(),
        playerName: String(
          r.spelare ?? r.Spelare ?? r.player ?? r.Player ?? ""
        ).trim(),
        position: "outfield",
        extras: { shorts: null, socks: null },
      }))
      .filter((x) => Number.isFinite(x.number) && x.size);

    if (incoming.length === 0) {
      alert("Filen innehåller inga giltiga rader (Nummer + Storlek krävs)");
      return 0;
    }

    const next = mode === "replace" ? incoming : [...items, ...incoming];
    await persist(next);
    return incoming.length;
  };

  /**
   * Uppdatera lagets shorts/strumpor med automatisk lagerjustering
   * old -> läggs tillbaka
   * new -> dras ur lager
   */
const saveTeamExtrasWithWarehouse = async (nextTeamExtras) => {
  try {
    const res = await updateTeamExtrasWithWarehouse(teamId, nextTeamExtras);

    if (!res) return;

    // ✅ uppdatera UI EN gång
    setWarehouseItems(res.warehouse);
    setTeamExtras(res.teamExtras);
    setDraftTeamExtras(res.teamExtras);
    setEditingTeamExtras(false);

    return res;

  } catch (err) {
    console.error(err);
    alert(err.message || "Kunde inte spara lagets shorts/strumpor.");
  }
};

  // Returnera tröja till huvudlager (utan individuell shorts/strump-logik)
  const returnToWarehouse = async (itemId) => {
    if (!isAdmin) return;

    const it = items.find((x) => x.id === itemId);
    if (!it) return;

    if (!confirm("Returnera tröjan till huvudlager?")) return;

    // 1) bort från lagets matchkit
    const nextTeam = items.filter((x) => x.id !== itemId);
    setItems(nextTeam);
    await apiSaveMatchKit(teamId, nextTeam);

    // 2) tillbaka till huvudlager
    let warehouse = normalizeWarehouse(await apiLoadWarehouse());

    const jerseyExists = warehouse.some(
      (x) => x.type === "jersey" && x.id === itemId
    );

    if (jerseyExists) {
      warehouse = warehouse.map((x) =>
        x.type === "jersey" && x.id === itemId
          ? { ...x, status: "available", teamId: null }
          : x
      );
    } else {
      warehouse = [
        {
          id: it.id,
          type: "jersey",
          number: it.number,
          size: it.size,
          position: it.position ?? "outfield",
          status: "available",
          teamId: null,
          note: "",
          createdAt: new Date().toISOString(),
        },
        ...warehouse,
      ];
    }

    await apiSaveWarehouse(warehouse);
    setWarehouseItems(warehouse);
  };

  // Hjälpare för ikonåtgärder
  const editPlayerName = async (item) => {
    const nextName = prompt("Spelarnamn?", item.playerName || "");
    if (nextName === null) return;
    await updateItem(item.id, { playerName: nextName.trim() });
  };

  const clearPlayer = async (item) => {
    await updateItem(item.id, { playerName: "" });
  };

  return (
    <div>
      {/* Översikt */}
      <div className="summaryCard">
        <div className="summaryTitle">Matchtröjor ({teamId})</div>
        <div className="summaryValue">
          {assignedCount}/{items.length}
        </div>
        <div className="summarySub">Tilldelade / Totalt</div>
      </div>
      
{assignFromWarehouseOpen && (
  <div className="card" style={{ marginTop: 12 }}>

    <div className="card__top">
      <div className="card__title">Tilldela från huvudlager</div>

      <button
        className="btn btn--ghost"
        onClick={() => setAssignFromWarehouseOpen(false)}
      >
        Stäng
      </button>
    </div>

    {/* 🔍 FILTRERING */}
    <div className="formGrid" style={{ marginTop: 10 }}>
      <div className="field">
       <span>Storlek</span>
<select
  value={assignSizeFilter}
  onChange={(e) => setAssignSizeFilter(e.target.value)}
>
  <option value="all">Alla</option>

  {assignSizes.map(s => (
    
<option key={s} value={s}>
  {s} ({splitWarehouse(warehouseItems).jerseys.filter(j => j.size === s && j.status === "available").length})
</option>

  ))}
</select>

      </div>

      <div className="field">
        <span>Filter</span>
        <button
          className={`btn ${assignOnlyGoalkeepers ? "btn--ok" : "btn--ghost"}`}
          onClick={() => setAssignOnlyGoalkeepers((prev) => !prev)}
        >
          {assignOnlyGoalkeepers ? "Visa alla" : "🥅 Målvakter"}
        </button>
      </div>
    </div>


<div className="muted" style={{ fontSize: 12 }}>
  Visar {
    splitWarehouse(warehouseItems).jerseys
      .filter(j => j.status === "available")
      .filter(j => assignSizeFilter === "all" || j.size === assignSizeFilter)
      .filter(j => !assignOnlyGoalkeepers || j.position === "goalkeeper")
      .length
  } tröjor
  {assignSizeFilter !== "all" && ` · storlek ${assignSizeFilter}`}
</div>



    {/* 📋 LISTA */}
    <div className="history" style={{ marginTop: 10 }}>

      {splitWarehouse(warehouseItems).jerseys
        .filter(j => j.status === "available")

        // ✅ sökfilter
        .filter(j => {
          if (assignSizeFilter === "all") return true;
          return j.size === assignSizeFilter;
        })


        // ✅ målvaktsfilter
        .filter(j => {
          if (!assignOnlyGoalkeepers) return true;
          return j.position === "goalkeeper";
        })

        // ✅ sortering (bonus)
        .sort((a, b) => a.number - b.number)

        .map(j => (
          <div
            key={j.id}
            className="historyRow"
            style={{
              borderRadius: 12,
              marginBottom: 6,
            }}
          >

            {/* INFO */}
            <div>
              <div className="historyRow__title">
                #{j.number} · {j.size}
                {j.position === "goalkeeper" && " 🥅"}
              </div>

              <div className="historyRow__sub">
                Tillgänglig i huvudlager
              </div>
            </div>

            {/* ACTION */}
            <button
              className="btn btn--ok"
              onClick={async () => {
                const res = await assignJerseyWithExtras(
                  j.id,
                  teamId,
                  {
                    shorts: null,
                    socks: null,
                  }
                );

                if (!res) return;

                setWarehouseItems(res);
                await reloadMatchKit();
              }}
            >
              Tilldela
            </button>

          </div>
        ))}

    </div>

    {/* empty state */}
    {splitWarehouse(warehouseItems).jerseys
      .filter(j => j.status === "available")
      .filter(j => assignSizeFilter === "all" || j.size === assignSizeFilter)

      .filter(j => !assignOnlyGoalkeepers || j.position === "goalkeeper")
      .length === 0 && (
      <div className="empty" style={{ marginTop: 10 }}>
        Inga tröjor hittades
      </div>
    )}
  </div>
)}

<div style={{ marginTop: 8 }}>
  <button
    className="iconBtn"
    title="Lägg till från huvudlager"
    onClick={() => setAssignFromWarehouseOpen(true)}
  >
    ➕
  </button>
</div>

      {/* Lag-nivå shorts/strumpor */}
      <div className="card" style={{ marginTop: 12 }}>
  <div className="card__top">
    <div className="card__title">Lagets shorts & strumpor</div>

    {isAdmin && !editingTeamExtras && (
      <button className="btn btn--ghost" onClick={startEditTeamExtras}>
        Ändra
      </button>
    )}
  </div>

  {!editingTeamExtras ? (
    <div
      style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        marginTop: 10,
      }}
    >
      <div className="chip">
        🩳 Shorts: <strong>{renderExtrasSummary("shorts")}</strong>
      </div>

      <div className="chip">
        🧦 Strumpor: <strong>{renderExtrasSummary("socks")}</strong>
      </div>
    </div>
  ) : (
    <div style={{ marginTop: 12 }}>
      {/* Shorts */}
      <div className="card__title" style={{ fontSize: 14, marginBottom: 8 }}>
        Shorts
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(draftTeamExtras.shorts || []).map((row, index) => (
          <div
            key={`shorts-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              value={row.size}
              onChange={(e) =>
                updateDraftRow("shorts", index, { size: e.target.value })
              }
            >
              <option value="">Välj storlek</option>
              {stock
                .filter((s) => s.kind === "shorts")
                .sort((a, b) => a.size.localeCompare(b.size, "sv"))
                .map((s) => (
                  <option key={s.id} value={s.size}>
                    {s.size} ({s.qty} st i huvudlager)
                  </option>
                ))}
            </select>

            <input
              value={row.qty}
              onChange={(e) =>
                updateDraftRow("shorts", index, {
                  qty: Math.max(0, Number(e.target.value) || 0),
                })
              }
              inputMode="numeric"
              placeholder="Antal"
            />

            <button
              className="iconBtn danger"
              title="Ta bort rad"
              onClick={() => removeDraftRow("shorts", index)}
            >
              🗑️
            </button>
          </div>
        ))}

        <button
          className="btn btn--ghost"
          style={{ alignSelf: "flex-start" }}
          onClick={() => addDraftRow("shorts")}
        >
          + Lägg till shortsstorlek
        </button>
      </div>

      <div style={{ height: 16 }} />

      {/* Strumpor */}
      <div className="card__title" style={{ fontSize: 14, marginBottom: 8 }}>
        Strumpor
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(draftTeamExtras.socks || []).map((row, index) => (
          <div
            key={`socks-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              value={row.size}
              onChange={(e) =>
                updateDraftRow("socks", index, { size: e.target.value })
              }
            >
              <option value="">Välj storlek</option>
              {stock
                .filter((s) => s.kind === "socks")
                .sort((a, b) => a.size.localeCompare(b.size, "sv"))
                .map((s) => (
                  <option key={s.id} value={s.size}>
                    {s.size} ({s.qty} st i huvudlager)
                  </option>
                ))}
            </select>

            <input
              value={row.qty}
              onChange={(e) =>
                updateDraftRow("socks", index, {
                  qty: Math.max(0, Number(e.target.value) || 0),
                })
              }
              inputMode="numeric"
              placeholder="Antal"
            />

            <button
              className="iconBtn danger"
              title="Ta bort rad"
              onClick={() => removeDraftRow("socks", index)}
            >
              🗑️
            </button>
          </div>
        ))}

        <button
          className="btn btn--ghost"
          style={{ alignSelf: "flex-start" }}
          onClick={() => addDraftRow("socks")}
        >
          + Lägg till strumpstorlek
        </button>
      </div>

      <div className="btnRow" style={{ marginTop: 14 }}>
        <button className="btn btn--ok" onClick={saveEditedTeamExtras}>
          Spara
        </button>

        <button className="btn btn--ghost" onClick={cancelEditTeamExtras}>
          Avbryt
        </button>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Lager i huvudlagret justeras automatiskt när du ändrar storlekar eller antal.
      </div>
    </div>
  )}
</div>


      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 10 }}>
        <button
          className="btn btn--ghost"
          onClick={() => setShowOnlyGoalkeepers(false)}
          style={!showOnlyGoalkeepers ? { outline: "2px solid #1e5bbf" } : {}}
        >
          Alla
        </button>

        <button
          className="btn btn--ghost"
          onClick={() => setShowOnlyGoalkeepers(true)}
          style={showOnlyGoalkeepers ? { outline: "2px solid #22c55e" } : {}}
        >
          🥅 Målvakter
        </button>
      </div>

      {/* Kompaktare kort */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {filteredItems.map((it) => (
          <div
            key={it.id}
            className="card"
            style={{
              padding: 12,
              borderRadius: 14,
            }}
          >
            <div
              className="card__top"
              style={{ alignItems: "flex-start", marginBottom: 8 }}
            >
              <div>
                <div
                  className="card__title"
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  {it.position === "goalkeeper" && <span>🥅</span>}
                  <span>#{it.number}</span>
                </div>

<div
  style={{
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
  }}
>
  {/* Storlek */}
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: "rgba(157,179,216,.12)",
      border: "1px solid rgba(157,179,216,.2)",
    }}
  >
    📏 {it.size}
  </span>

  {/* Spelare */}
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: it.playerName
        ? "rgba(34,197,94,.12)"
        : "rgba(255,255,255,.05)",
      border: it.playerName
        ? "1px solid rgba(34,197,94,.25)"
        : "1px solid rgba(157,179,216,.15)",
      opacity: it.playerName ? 1 : 0.7,
    }}
  >
    👤 {it.playerName || "Ej tilldelad"}
  </span>
</div>

              </div>

              {String(it.playerName || "").trim() ? (
                <Pill tone="ok">Tilldelad</Pill>
              ) : (
                <Pill tone="neutral">Ledig</Pill>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  className="iconBtn"
                  title={it.playerName ? "Ändra spelare" : "Tilldela spelare"}
                  onClick={() => editPlayerName(it)}
                >
                  👤
                </button>

                {it.playerName && (
                  <button
                    className="iconBtn"
                    title="Frigör spelare"
                    onClick={() => clearPlayer(it)}
                  >
                    🧹
                  </button>
                )}

                {isAdmin && (
                  <button
                    className="iconBtn"
                    title="Returnera till huvudlager"
                    onClick={() => returnToWarehouse(it.id)}
                  >
                    ↩️
                  </button>
                )}
              </div>

              {isAdmin && (
                <label
                  title="Markera för flytt"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(it.id)}
                    onChange={() => toggleSelected(it.id)}
                  />
                  Flytta
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Åtgärder */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__title">Åtgärder</div>

        {isAdmin && (
          <>
            <div className="meta" style={{ marginTop: 10 }}>
              <div className="meta__row">
                <span>Markerade för flytt</span>
                <span className="meta__value">{selected.length} st</span>
              </div>
            </div>

            <div className="formGrid">
              <div className="field">
                <span>Från lag</span>
                <select
                  className="input"
                  value={moveFrom}
                  onChange={(e) => setMoveFrom(e.target.value)}
                >
                  {teamsVisible.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span>Till lag</span>
                <select
                  className="input"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                >
                  {teamsVisible.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn btn--ok"
              disabled={selected.length === 0 || !moveFrom || !moveTo}
              onClick={() => moveMatchKitBetweenTeams(moveFrom, moveTo, selected)}
            >
              Flytta markerade
            </button>

            <div style={{ height: 10 }} />

            <div className="card__title">Importera tröjor (Excel)</div>
            <div className="meta">
              <div className="meta__row">
                <span>Format</span>
                <span className="meta__value">
                  nummer, storlek, spelare (valfri)
                </span>
              </div>
            </div>

            <div className="field">
              <span>Läge</span>
              <select
                className="input"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="replace">Ersätt</option>
                <option value="append">Lägg till</option>
              </select>
            </div>

            <input
              type="file"
              accept=".xlsx,.xls"
              onClick={(e) => {
                e.currentTarget.value = "";
              }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;

                try {
                  const n = await importMatchKitExcelHere(f, importMode);
                  alert(`Importerade ${n} tröjor ✅`);
                  await apiAddNotif(user.id, `Importerade ${n} tröjor ✅`);
                } catch (err) {
                  console.error(err);
                  alert("Importen misslyckades ❌");
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ================= Page: Leaderclothes v2================= */
function LeaderClothesV2Page({ user, teamId }) {
  const [entries, setEntries] = useState([]);
  const [leaderName, setLeaderName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchLeader, setSearchLeader] = useState("");

  useEffect(() => {
    load();
  }, [teamId]);

  async function load() {
    const data = await apiLoadIssued(teamId);
    const normalized = normalizeLeaderClothesEntries(data, teamId);
    setEntries(normalized);
  }

  const existingLeaders = useMemo(() => {
    return [...new Set(entries.map((e) => e.leaderName))]
      .sort((a, b) => a.localeCompare(b, "sv"));
  }, [entries]);

  const groupedEntries = useMemo(() => {
    const q = searchLeader.trim().toLowerCase();

    const filtered = entries.filter((e) => {
      if (!q) return true;
      return e.leaderName.toLowerCase().includes(q);
    });

    const groups = {};

    for (const e of filtered) {
      const key = e.leaderName;

      if (!groups[key]) {
        groups[key] = {
          leaderName: key,
          rows: [],
          teamIds: new Set(),
          years: new Set(),
          itemTotals: {},
        };
      }

      groups[key].rows.push(e);
      groups[key].teamIds.add(e.teamId);
      groups[key].years.add(e.year);

      for (const item of e.items || []) {
        groups[key].itemTotals[item] = (groups[key].itemTotals[item] || 0) + 1;
      }
    }

    return Object.values(groups)
      .map((g) => ({
        ...g,
        teamIds: Array.from(g.teamIds),
        years: Array.from(g.years).sort((a, b) => Number(b) - Number(a)),
        rows: g.rows.sort((a, b) => {
          const byYear = Number(b.year || 0) - Number(a.year || 0);
          if (byYear !== 0) return byYear;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }),
      }))
      .sort((a, b) => a.leaderName.localeCompare(b.leaderName, "sv"));
  }, [entries, searchLeader]);

  const totalLeaders = groupedEntries.length;
  const totalEntries = entries.length;

  const toggleItem = (item) => {
    setSelectedItems((prev) =>
      prev.includes(item)
        ? prev.filter((x) => x !== item)
        : [...prev, item]
    );
  };

  const clearForm = () => {
    setLeaderName("");
    setYear(new Date().getFullYear());
    setSelectedItems([]);
  };

  const saveEntry = async () => {
    const cleanName = String(leaderName || "").trim();
    const cleanYear = Number(year);

    if (!cleanName) {
      alert("Fyll i ledarens namn.");
      return;
    }

    if (!cleanYear || !Number.isFinite(cleanYear)) {
      alert("Fyll i ett giltigt år.");
      return;
    }

    if (selectedItems.length === 0) {
      alert("Välj minst ett plagg.");
      return;
    }

    const existing = await apiLoadIssued(teamId);
    const safeExisting = normalizeLeaderClothesEntries(existing, teamId);

    const entry = {
      id: uuid(),
      teamId,
      leaderName: cleanName,
      year: cleanYear,
      items: selectedItems,
      createdAt: new Date().toISOString(),
      source: "manual",
    };

    const next = [entry, ...safeExisting];
    await apiSaveIssued(teamId, next);

    clearForm();
    await load();
  };

  const importExcel = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const n = await importLeaderClothesExcel(file);
        alert(`${n} rader importerade ✅`);
        await load();
      } catch (err) {
        console.error(err);
        alert("Importen misslyckades ❌");
      }
    };

    input.click();
  };

  const deleteEntry = async (id) => {
    if (!confirm("Ta bort denna utdelning?")) return;

    const next = entries.filter((x) => x.id !== id);
    await apiSaveIssued(teamId, next);
    await load();
  };

  return (
    <div>
      {/* ===== ÖVERSIKT ===== */}
      <div className="summaryCard">
        <div className="summaryTitle">Ledarkläder – {teamId}</div>
        <div className="summaryValue">{totalLeaders}</div>
        <div className="summarySub">
          Ledare med registrerade plagg · {totalEntries} utdelningar totalt
        </div>
      </div>

      {/* ===== FORM ===== */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__top">
          <div className="card__title">Registrera ledarkläder</div>
          <Pill tone="neutral">{selectedItems.length} valda</Pill>
        </div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Ledare</span>
            <input
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              placeholder="Skriv namn eller välj befintlig"
              list="leaderSuggestions"
            />
            <datalist id="leaderSuggestions">
              {existingLeaders.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <span>År</span>
            <input
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              inputMode="numeric"
              placeholder="t.ex. 2026"
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Kryssa för vilka kläder som beställts / hämtats ut
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LEADER_PRODUCTS.map((product) => {
              const checked = selectedItems.includes(product);

              return (
                <label
                  key={product}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: checked
                      ? "1px solid rgba(30,91,191,.35)"
                      : "1px solid rgba(157,179,216,.16)",
                    background: checked
                      ? "rgba(30,91,191,.14)"
                      : "rgba(255,255,255,.03)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(product)}
                  />
                  {product}
                </label>
              );
            })}
          </div>
        </div>

        <div className="btnRow" style={{ marginTop: 12 }}>
          <button className="btn btn--primary" onClick={saveEntry}>
            Spara
          </button>

          <button className="btn btn--ghost" onClick={clearForm}>
            Rensa
          </button>

          <button className="btn btn--ghost" onClick={importExcel}>
            📥 Importera Excel
          </button>
        </div>
      </div>

      {/* ===== FILTER / SÖK ===== */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__top">
          <div className="card__title">Sök ledare</div>
          <Pill tone="neutral">{groupedEntries.length} visade</Pill>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <span>Namn</span>
          <input
            value={searchLeader}
            onChange={(e) => setSearchLeader(e.target.value)}
            placeholder="Sök på ledarnamn"
          />
        </div>
      </div>

      {/* ===== GRUPPERAD HISTORIK ===== */}
      <div className="history" style={{ marginTop: 12 }}>
        {groupedEntries.length === 0 && (
          <div className="empty">Inga registrerade ledarkläder ännu.</div>
        )}

        {groupedEntries.map((group) => (
          <div
            key={group.leaderName}
            className="card"
            style={{
              marginBottom: 12,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(157,179,216,.12)",
            }}
          >
            <div className="card__top">
              <div>
                <div className="card__title">{group.leaderName}</div>

                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>Lag: {group.teamIds.join(", ") || teamId}</span>
                  <span>År: {group.years.join(", ")}</span>
                  <span>Poster: {group.rows.length}</span>
                </div>
              </div>

              <Pill tone="neutral">{group.rows.length} st</Pill>
            </div>

            {/* Summering av plagg */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {Object.entries(group.itemTotals).map(([name, count]) => (
                <span
                  key={`${group.leaderName}-${name}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.20)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {name}: {count}
                </span>
              ))}
            </div>

            {/* Historikrader */}
            <div className="history" style={{ marginTop: 12 }}>
              {group.rows.map((e) => (
                <div
                  key={e.id}
                  className="historyRow"
                  style={{
                    borderRadius: 12,
                    marginBottom: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(157,179,216,.10)",
                  }}
                >
                  <div>
                    <div className="historyRow__title">
                      {e.year} · {e.teamId}
                    </div>

                    <div
                      className="historyRow__sub"
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 6,
                      }}
                    >
                      {(e.items || []).map((item, idx) => (
                        <span
                          key={`${e.id}-${idx}-${item}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: "rgba(30,91,191,0.12)",
                            border: "1px solid rgba(30,91,191,0.20)",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    <div className="historyRow__sub" style={{ marginTop: 6 }}>
                      Källa: {e.source === "import" ? "Import" : "Manuell"} ·{" "}
                      {e.createdAt
                        ? new Date(e.createdAt).toLocaleDateString()
                        : "-"}
                    </div>
                  </div>

                  {user.role === "admin" && (
                    <button
                      className="btn btn--danger"
                      onClick={() => deleteEntry(e.id)}
                    >
                      Ta bort
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ================= Page: Admin ================= */
function AdminPage({ user, teamId }) {
  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Admin</div>
        <div className="empty">Ej behörig</div>
      </div>
    );
  }

  return <AdminInner user={user} teamId={teamId} />;
}

function AdminInner({ user, teamId }) {
  /* ================= USERS ================= */
  const users = jget("users", []);
  const teamUsers = users.filter((u) => u.teamIds?.includes(teamId));

  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState("leader");

  const addUser = () => {
    if (!newUserName.trim() || !newUserPin.trim()) return;

    const u = {
      id: uuid(),
      name: newUserName.trim(),
      role: newUserRole,
      pinHash: hashPin(newUserPin.trim()),
      teamIds: [teamId],
    };

    jset("users", [...users, u]);

    setNewUserName("");
    setNewUserPin("");

    alert("Användare skapad ✅");
  };

  /* ================= RENDER ================= */
  return (
    <div>

      {/* ===== ANVÄNDARE ===== */}
      <div className="card">
        <div className="card__title">Användare – {teamId}</div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Namn</span>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
            />
          </div>

          <div className="field">
            <span>PIN</span>
            <input
              value={newUserPin}
              onChange={(e) => setNewUserPin(e.target.value)}
            />
          </div>

          <div className="field">
            <span>Roll</span>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              <option value="leader">Ledare</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button className="btn btn--primary" onClick={addUser}>
            Lägg till användare
          </button>
        </div>
      </div>

      

    </div>
  );
}

/* ================= Page: Teamcash (Upstash) ================= */
function TeamCashPage({ user, teamId }) {
  const [cash, setCash] = useState(null);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(true);

  // (valfritt) admin kan editera kontonummer direkt
  const [accountInput, setAccountInput] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    apiCashSnapshot(teamId)
      .then(({ cash, hist }) => {
        if (!alive) return;
        setCash(cash);
        setHist(Array.isArray(hist) ? hist : []);
        setAccountInput(cash?.accountNumber ?? "");
      })
      .catch((e) => {
        console.error(e);
        if (!alive) return;
        setCash(null);
        setHist([]);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [teamId]);

  const chartData = useMemo(() => {
    const sorted = [...hist].sort((a, b) => String(a.month).localeCompare(String(b.month)));
    return sorted.map((h) => ({ month: h.month, balance: h.balance }));
  }, [hist]);

  const reversed = useMemo(() => {
    const sorted = [...hist].sort((a, b) => String(a.month).localeCompare(String(b.month)));
    return sorted.slice().reverse();
  }, [hist]);

  async function saveAccountNumber() {
    // Uppdatera endast kontonummer (behåll saldo)
    const balance = cash?.balance ?? null;
    await apiCashUpsert({
      teamId,
      balance,
      month: null,
      accountNumber: accountInput,
    });
    const snap = await apiCashSnapshot(teamId);
    setCash(snap.cash);
    setHist(snap.hist);
  }

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Lagkassa</div>

        <div className="summaryValue">
          {loading ? "…" : (cash?.balance ?? "—")} kr
        </div>

        <div className="summarySub">
          {cash?.updatedAt
            ? "Uppdaterad " + new Date(cash.updatedAt).toLocaleDateString()
            : "Ingen import ännu"}
        </div>

        {cash?.accountNumber && (
          <div className="summarySub">
            Kontonummer: <strong>{cash.accountNumber}</strong>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__top">
          <div className="card__title">Saldo över tid</div>
          <Pill tone="neutral">{hist.length} mån</Pill>
        </div>

        <div style={{ width: "100%", height: 260, marginTop: 10 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(157,179,216,.18)" />
              <XAxis dataKey="month" stroke="#9db3d8" />
              <YAxis stroke="#9db3d8" />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,23,42,.95)",
                  border: "1px solid rgba(157,179,216,.18)",
                  borderRadius: 12,
                  color: "#e6ecf7",
                }}
                labelStyle={{ color: "#9db3d8" }}
              />
              <Line type="monotone" dataKey="balance" stroke="#1e5bbf" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="history">
        {reversed.map((h, idx) => {
          const prev = reversed[idx + 1];
          const delta = prev ? h.balance - prev.balance : 0;

          return (
            <div key={h.month} className="historyRow">
              <div>
                <div className="historyRow__title">{String(h.month)}</div>
                <div className="historyRow__sub">
                  Import: {h.importedAt ? new Date(h.importedAt).toLocaleDateString() : "—"}
                </div>
              </div>

              <div className={`historyRow__delta ${delta >= 0 ? "pos" : "neg"}`}>
                {h.balance} kr
              </div>
            </div>
          );
        })}
      </div>

      {user.role === "admin" && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card__title">Kontonummer</div>
            <div className="formGrid" style={{ marginTop: 10 }}>
              <div className="field">
                <span>Kontonummer</span>
                <input
                  value={accountInput}
                  onChange={(e) => setAccountInput(e.target.value)}
                  placeholder="t.ex. 8134-9-123456"
                />
              </div>
              <button className="btn btn--ok" onClick={saveAccountNumber}>
                Spara kontonummer
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card__title">Importera (Excel)</div>
            <div className="meta">
              <div className="meta__row">
                <span>Format</span>
                <span className="meta__value">teamId/Lag, saldo/Saldo, month/Månad, kontonummer (valfri)</span>
              </div>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={async (e) => {
                if (!e.target.files?.[0]) return;
                const n = await importCashExcel(e.target.files[0]);
                apiAddNotif(user.id, `Importerade ${n} rader ✅`);
                alert(`Importerade ${n} rader ✅`);
                const snap = await apiCashSnapshot(teamId);
                setCash(snap.cash);
                setHist(snap.hist);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ================= Page: Reports ================= */

function ReportsPage({ user, teamId, teamsAll }) {
  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Rapporter</div>
        <div className="empty">Endast admin</div>
      </div>
    );
  }

  return <ReportsInner user={user} teamId={teamId} teamsAll={teamsAll} />;
}

function ReportsInner({ user, teamId, teamsAll }) {
  const team = teamsAll.find((t) => t.id === teamId);

  const [scope, setScope] = useState("team"); // "team" | "all"
  const date = new Date().toISOString().slice(0, 10);

  /* =========================
     LAGKASSA (oförändrad)
  ========================= */

  const [cashRowsAll, setCashRowsAll] = useState([]);

  useEffect(() => {
    if (scope !== "all") return;

    let alive = true;

    (async () => {
      const rows = [];

      for (const t of teamsAll) {
        const { cash, hist } = await apiCashSnapshot(t.id);

        (hist ?? []).forEach((h) => {
          rows.push({
            Lag: t.name,
            Kontonummer: cash?.accountNumber ?? "",
            Månad: String(h.month),
            Saldo: h.balance,
          });
        });
      }

      if (alive) setCashRowsAll(rows);
    })();

    return () => {
      alive = false;
    };
  }, [scope, teamsAll]);

  /* =========================
     LEDARKLÄDER (NY LOGIK)
  ========================= */

async function buildLeaderClothesRows(scope) {
  const rows = [];

  const targets = scope === "all" ? teamsAll : [team];

  for (const t of targets) {
    const issued = await apiLoadIssued(t.id);

    (Array.isArray(issued) ? issued : []).forEach((entry) => {
      const leaderName = entry.leaderName ?? "";
      const year = entry.year ?? "";
      const items = Array.isArray(entry.items) ? entry.items : [];

      items.forEach((item) => {
        rows.push({
          Lag: t.name,
          Ledare: leaderName,
          År: year,
          Plagg: item,
          Datum: entry.createdAt
            ? new Date(entry.createdAt).toLocaleDateString()
            : "",
          Källa: entry.source ?? "",
        });
      });
    });
  }

  return rows;
}

  /* =========================
     MATCHKLÄDER
  ========================= */

  async function buildMatchKitRows(scope) {
    const rows = [];

    const targets = scope === "all" ? teamsAll : [team];

    for (const t of targets) {
      const kit = await apiLoadMatchKit(t.id);

      (kit ?? []).forEach((m) => {
        rows.push({
          Lag: t.name,
          Nummer: m.number,
          Storlek: m.size,
          Spelare: m.playerName ?? "",
        });
      });
    }

    return rows;
  }

  /* =========================
     EXPORT
  ========================= */

  const exportLeaderClothes = async () => {
    const rows = await buildLeaderClothesRows(scope);

    exportXlsx(
      "Ledarkläder",
      rows,
      `ledarklader-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
    );
  };

  const exportMatchKit = async () => {
    const rows = await buildMatchKitRows(scope);

    exportXlsx(
      "Matchkläder",
      rows,
      `matchklader-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
    );
  };

  const exportCash = () => {
    exportXlsx(
      "Lagkassa",
      scope === "all" ? cashRowsAll : [],
      `lagkassa-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
    );
  };

  /* =========================
     RENDER
  ========================= */

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Rapporter</div>
          <span className="pill">{team?.name ?? teamId}</span>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <span>Omfattning</span>
          <select
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="team">Valt lag</option>
            <option value="all">Alla lag</option>
          </select>
        </div>

        <div className="btnRow" style={{ marginTop: 12 }}>
          <button className="btn btn--primary" onClick={exportLeaderClothes}>
            Export Ledarkläder
          </button>

          <button className="btn btn--primary" onClick={exportMatchKit}>
            Export Matchkläder
          </button>

          <button className="btn btn--ghost" onClick={exportCash}>
            Export Lagkassa
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Ledarkläder exporteras nu som rekvisitioner per ledare (ny struktur).
        </div>
      </div>
    </div>
  );
}
/* ================= App root ================= */
function AuthedApp({ auth, route, nav }) {
  const { visibleTeams, activeTeamId, setActiveTeamId } = useTeams(auth.user);

const [unreadCount, setUnreadCount] = useState(0);

useEffect(() => {
  apiGetNotifs(auth.user.id).then((list) => {
    setUnreadCount(list.filter((n) => !n.read).length);
  });
}, [auth.user.id, route]);

  const renderPage = () => {
if (route === "/warehouse") return <WarehouseMatchkitPage user={auth.user} />;    

if (route === "/matchkit")
      return (
        <MatchKitPage
          user={auth.user}
          teamId={activeTeamId}
          teamsVisible={visibleTeams}
        />
      );
    if (route === "/leaderclothes")
      return (
       <LeaderClothesV2Page user={auth.user} teamId={activeTeamId} />
      );
    
    if (route === "/teamcash") return <TeamCashPage user={auth.user} teamId={activeTeamId} />;
    if (route === "/reports")
      return (
        <ReportsPage
          user={auth.user}
          teamId={activeTeamId}
          teamsAll={DEFAULT_TEAMS}
        />
      );
    if (route === "/admin")
      return (
        <AdminPage
          user={auth.user}
          teamId={activeTeamId}
          teamsAll={DEFAULT_TEAMS}
        />
      );
    if (route === "/notifications") return <NotificationsPage user={auth.user} />;
    return (
      <MatchKitPage
        user={auth.user}
        teamId={activeTeamId}
        teamsVisible={visibleTeams}
      />
    );
  };

  return (
    <div className="app">
      <Topbar
        user={auth.user}
        teamsVisible={visibleTeams}
        activeTeamId={activeTeamId}
        setActiveTeamId={setActiveTeamId}
        nav={nav}
        unreadCount={unreadCount}
      />

      <main className="content">
        <div
          className="actions"
          style={{ justifyContent: "space-between", marginBottom: 12 }}
        >
          <div className="muted" style={{ fontWeight: 900 }}>
            Aktivt lag: {activeTeamId}
          </div>
          <button className="btn btn--ghost" onClick={() => auth.logout()}>
            Logga ut
          </button>
        </div>

        {renderPage()}
      </main>

      <BottomNav route={route} nav={nav} user={auth.user} />
    </div>
  );
}

export default function App() {
  // ✅ Seed synkront så users finns innan useAuth läser localStorage
  ensureSeed();

  // ✅ Dessa hooks körs ALLTID i samma ordning
  const { route, nav } = useRoute();
  const auth = useAuth();

  // ✅ Tidig return är OK nu, eftersom App() inte har fler hooks efter detta
  if (!auth.user) {
    return <Login users={auth.users} onLogin={auth.login} />;
  }

  return <AuthedApp auth={auth} route={route} nav={nav} />
;}
