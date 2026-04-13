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
  const r = await fetch("/api/warehouse-get");
  if (!r.ok) throw new Error("Kunde inte läsa huvudlager");
  return await r.json();
}

async function apiSaveWarehouse(items) {
  const r = await fetch("/api/warehouse-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara huvudlager");
}
// ===== API: ISSUED =====
async function apiLoadIssued(teamId) {
  const r = await fetch(`/api/issued-get?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa issued");
  return await r.json(); // array
}
async function apiSaveIssued(teamId, items) {
  const r = await fetch("/api/issued-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara issued");
}

// ===== API: BUDGET =====
async function apiLoadBudget(teamId) {
  const r = await fetch(`/api/budget-get?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa budget");
  return await r.json(); // object
}
async function apiSaveBudget(teamId, budget) {
  const r = await fetch("/api/budget-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, budget }),
  });
  if (!r.ok) throw new Error("Kunde inte spara budget");
}

// ===== API: ORDERS =====
async function apiLoadOrders(teamId) {
  const r = await fetch(`/api/orders-get?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa orders");
  return await r.json(); // array
}
async function apiSaveOrders(teamId, items) {
  const r = await fetch("/api/orders-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara orders");
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

  // Seed catalog
  jset("catalog:leaderclothes", [
    { id: "prod-byxa", name: "Träningsbyxa", category: "Startpaket", price: 650, active: true },
    { id: "prod-halvzip", name: "Halvzip", category: "Startpaket", price: 600, active: true },
    { id: "prod-tshirt", name: "T-shirt", category: "Startpaket", price: 250, active: true },
    { id: "prod-shorts", name: "Shorts", category: "Startpaket", price: 250, active: true },
    { id: "prod-jacka", name: "Träningsjacka", category: "Vartannat år", price: 850, active: true },
  ]);

  // Seed budgets per team
  DEFAULT_TEAMS.forEach((t) => {
    const key = `leaderbudget:${t.id}`;
    if (!jget(key, null)) jset(key, { teamId: t.id, total: 5000, used: 0 });
  });
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
  const r = await fetch(`/api/matchkit-get?teamId=${encodeURIComponent(teamId)}`);
  if (!r.ok) throw new Error("Kunde inte läsa matchkläder");
  return await r.json();
}

async function apiSaveMatchKit(teamId, items) {
  const r = await fetch("/api/matchkit-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, items }),
  });
  if (!r.ok) throw new Error("Kunde inte spara matchkläder");
}
async function moveMatchKit(fromTeamId, toTeamId, ids) {
  const from = apiLoadMatchKit(fromTeamId);
  const to = apiLoadMatchKit(toTeamId);

  const moving = from.filter(i => ids.includes(i.id));

  await apiSaveMatchKit(fromTeamId, from.filter(i => !ids.includes(i.id)));
  await apiSaveMatchKit(toTeamId, [...to, ...moving]);
}

/* Import matchkit excel (expected columns: nummer, storlek, spelare optional) */
const importMatchKitExcel = async (file, mode) => {
  const parsed = await parseMatchkitExcel(file);

  const incoming = parsed.map((x) => ({
    id: uuid(),
    number: x.number,
    size: x.size,
    playerName: x.playerName || "",
  }));

  const next =
    mode === "replace"
      ? incoming
      : [...items, ...incoming];

  // ✅ uppdatera UI direkt
  setItems(next);

  // ✅ spara till backend (Upstash)
  await apiSaveMatchKit(teamId, next);

  return incoming.length;
};
/* ================= Leader clothes: catalog, budget, issued, orders ================= */
const catalogKey = "catalog:leaderclothes";
function loadCatalog() {
  return jget(catalogKey, []);
}
function saveCatalog(list) {
  jset(catalogKey, list);
}

function budgetKey(teamId) {
  return `leaderbudget:${teamId}`;
}
function loadBudget(teamId) {
  return jget(budgetKey(teamId), { teamId, total: 0, used: 0 });
}
function saveBudget(teamId, b) {
  jset(budgetKey(teamId), b);
}

function issuedKey(teamId) {
  return `leaderclothes:${teamId}`;
}
function loadIssued(teamId) {
  return jget(issuedKey(teamId), []);
}
function saveIssued(teamId, list) {
  jset(issuedKey(teamId), list);
}

function ordersKey(teamId) {
  return `orders:${teamId}`;
}
function loadOrders(teamId) {
  return jget(ordersKey(teamId), []);
}
function saveOrders(teamId, list) {
  jset(ordersKey(teamId), list);
}

function createOrder(teamId, user, items) {
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const order = {
    id: uuid(),
    teamId,
    createdByUserId: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
    items,
    totalCost: total,
    status: "pending",
  };
  const list = loadOrders(teamId);
  saveOrders(teamId, [...list, order]);

async function adminRemoveLeaderClothesItem(teamId, itemId) {
  const orders = loadOrders(teamId);
  const next = orders.filter(o => o.id !== itemId);
  saveOrders(teamId, next);
  return next;
}

  // notify all admins
  const users = jget("users", []);
  users
    .filter((u) => u.role === "admin")
    .forEach((a) =>
      apiAddNotif(a.id, `Ny beställning (${teamId}) från ${user.name}: ${total} kr`)
    );

  apiAddNotif(user.id, "Beställning skickad ✅");
  return order;
}

function approveOrder(teamId, adminUser, orderId) {
  const list = loadOrders(teamId);
  const order = list.find((o) => o.id === orderId);
  if (!order || order.status !== "pending") return false;

  // budget
  const b = loadBudget(teamId);
  saveBudget(teamId, { ...b, used: b.used + order.totalCost });

  // issued items
  const issued = loadIssued(teamId);
  const now = new Date().toISOString().slice(0, 10);
  const newIssued = order.items.map((i) => ({
    id: uuid(),
    leaderUserId: order.createdByUserId,
    leaderName: order.createdByName,
    name: i.name,
    size: i.size ?? "-",
    quantity: i.quantity,
    dateIssued: now,
    cost: i.price * i.quantity,
    source: "order",
    sourceId: order.id,
  }));
  saveIssued(teamId, [...issued, ...newIssued]);

  // update order
  saveOrders(
    teamId,
    list.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "approved",
            decidedAt: new Date().toISOString(),
            decidedBy: adminUser.name,
          }
        : o
    )
  );

  apiAddNotif(
    order.createdByUserId,
    `Din beställning (${teamId}) godkänd ✅ (${order.totalCost} kr)`
  );
  return true;
}

function rejectOrder(teamId, adminUser, orderId) {
  const list = loadOrders(teamId);
  const order = list.find((o) => o.id === orderId);
  if (!order || order.status !== "pending") return false;

  saveOrders(
    teamId,
    list.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            decidedBy: adminUser.name,
          }
        : o
    )
  );
  apiAddNotif(order.createdByUserId, `Din beställning (${teamId}) avslogs ❌`);
  return true;
}

function adminIssueClothes(teamId, adminUser, leaderUserId, leaderName, name, size, cost, dateIssued) {
  const issued = loadIssued(teamId);
  const entry = {
    id: uuid(),
    leaderUserId,
    leaderName,
    name,
    size,
    quantity: 1,
    dateIssued,
    cost: Number(cost) || 0,
    source: "manual",
    sourceId: adminUser.id,
  };
  saveIssued(teamId, [entry, ...issued]);

  if (Number(cost) > 0) {
    const b = loadBudget(teamId);
    saveBudget(teamId, { ...b, used: b.used + Number(cost) });
  }

  if (leaderUserId) {
    apiAddNotif(leaderUserId, `Ledarkläder utlämnat (${teamId}): ${name} ✅`);
  }
  return true;
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

    const orders = loadOrders(teamId);
    const matchKit = await apiLoadMatchKit(teamId);

    // Exempel: ledarkläder via orders
    orders
      .filter(o => o.status === "approved")
      .forEach(o => {
        o.items.forEach(item => {
          rows.push({
            lag: teamId,
            produkt: item.name,
            storlek: item.size,
            pris: item.price,
            typ: "Ledarkläder",
          });
        });
      });

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




/** Import till huvudlager */

/** UI: Admin‑vy för huvudlager */
function WarehouseMatchkitPage({ user }){
const fileRef = useRef(null); 
  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Huvudlager – Matchkläder</div>
        <div className="empty">Endast admin</div>
      </div>
    );
  }

  const [items, setItems] = useState([]);

  const importWarehouseExcel = async (file, mode) => {
  const parsed = await parseMatchkitExcel(file);

  const incoming = parsed
    .map((row) => ({
      id: uuid(),
      number: Number(row.Nummer ?? row.number),
      size: String(row.Storlek ?? row.size),
      status: "available",
      note: "",
      createdAt: new Date().toISOString(),
    }))
    .filter((x) => Number.isFinite(x.number) && x.size);

  if (incoming.length === 0) {
    alert("Filen innehåller inga giltiga rader");
    return 0;
  }

  const next =
    mode === "replace"
      ? incoming
      : [...items, ...incoming];

  // ✅ UI uppdateras direkt
  setItems(next);

  // ✅ backend sparas
  await apiSaveWarehouse(next);

  return incoming.length;
};
const assignWarehouseItemToTeam = async (itemId, teamId) => {
  // 1. hämta huvudlager
  const warehouse = await apiLoadWarehouse();
  const item = warehouse.find((x) => x.id === itemId);

  if (!item || item.status !== "available") {
    alert("Tröjan är inte tillgänglig");
    return;
  }

  // 2. hämta lagets matchkläder
  const teamItems = await apiLoadMatchKit(teamId);

  const teamItem = {
    id: item.id,        // samma id
    number: item.number,
    size: item.size,
    playerName: "",
  };

  // 3. spara till lagets matchkit
  await apiSaveMatchKit(teamId, [teamItem, ...teamItems]);

  // 4. uppdatera huvudlager
  const updatedWarehouse = warehouse.map((x) =>
    x.id === itemId
      ? { ...x, status: "assigned", teamId }
      : x
  );

  await apiSaveWarehouse(updatedWarehouse);

  // ✅ 5. uppdatera UI direkt
  setItems(updatedWarehouse);
};
``

async function returnWarehouseItemFromTeam(itemId, teamId) {
  // 1. Ta bort tröjan från lagets matchkläder
  const teamItems = apiLoadMatchKit(teamId);
  const remaining = teamItems.filter((x) => x.id !== itemId);
 apiSaveMatchKit(teamId, remaining);

  // 2. Uppdatera huvudlager: gör tröjan tillgänglig igen
  const warehouse = apiLoadWarehouse();
  const updated = warehouse.map((x) =>
    x.id === itemId
      ? { ...x, status: "available", teamId: null }
      : x
  );
  await apiSaveWarehouse(updated);
}


useEffect(() => {
    apiLoadWarehouse().then(setItems);
  }, []);
  const [importMode, setImportMode] = useState("append");
const [assigningId, setAssigningId] = useState(null);
const [assignTeamId, setAssignTeamId] = useState("");


  // Sök/filter
  const [qNumber, setQNumber] = useState("");
  const [qSize, setQSize] = useState("all");

  // uppdatera state om localStorage ändras via andra actions
  const reload = async () => {
    const w = await apiLoadWarehouse();
    setItems(w);
  };
const sizes = useMemo(() => {
    const set = new Set(items.map((i) => i.size).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sv"));
  }, [items]);

  const filtered = useMemo(() => {
    const numberQuery = qNumber.trim();
    return items.filter((i) => {
      if (numberQuery && !String(i.number).includes(numberQuery)) return false;
      if (qSize !== "all" && i.size !== qSize) return false;
      return true;
    });
  }, [items, qNumber, qSize]);

  const totalCount = items.length;
  const availableCount = items.filter((i) => i.status === "available").length;

  const addManual = async () => {
    const number = normalizeNumber(prompt("Tröjnummer?"));
    const size = normalizeSize(prompt("Storlek (t.ex. 152, S, M)?") || "");
    if (number === null || !size) return;

    const next = [
      {
        id: uuid(),
        number,
        size,
        status: "available",
        note: "",
        createdAt: new Date().toISOString(),
      },
      ...items,
    ];
    await apiSaveWarehouse(next);
    setItems(next);
  };

  const removeOne = async (id) => {
    const next = items.filter((x) => x.id !== id);
    await apiSaveWarehouse(next);
    setItems(next);
  };

  const clearAll = async () => {
    if (!confirm("Rensa hela huvudlagret?")) return;
    await apiSaveWarehouse([]);
    setItems([]);
  };

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Huvudlager – Matchkläder</div>
        <div className="summaryValue">{availableCount}/{totalCount}</div>
        <div className="summarySub">Tillgängliga / Totalt</div>

      </div>

      <div className="card">
        <div className="card__top">
          <div className="card__title">Sök & filter</div>
          <Pill tone="neutral">{filtered.length} visade</Pill>
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
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="btnRow" style={{ marginTop: 10 }}>
          <button className="btn btn--primary" onClick={addManual}>
            Lägg till (manuellt)
          </button>
          <button className="btn btn--danger" onClick={clearAll} disabled={items.length === 0}>
            Rensa lager
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__top">
          <div className="card__title">Importera (Excel)</div>
          <Pill tone="neutral">nummer, storlek, (spelare valfri)</Pill>
        </div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Läge</span>
            <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
              <option value="append">Lägg till</option>
              <option value="replace">Ersätt</option>
            </select>
          </div>

          <div className="field">
            <span>Fil</span>
            
<button
  className="btn btn--primary"
  onClick={() => fileRef.current.click()}
>
  Importera huvudlager
</button>

            <input
  ref={fileRef}
  type="file"
  accept=".xlsx,.xls"
  style={{ display: "none" }}
  onChange={async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const count = await importWarehouseExcel(file, "append");
      alert(`${count} plagg importerade ✅`);
    } catch (err) {
      console.error(err);
      alert("Importen misslyckades ❌");
    } finally {
      e.target.value = "";
    }
  }}
/>
          </div>
        </div>
      </div>

      <div className="history" style={{ marginTop: 12 }}>
        {filtered.length === 0 && (
          <div className="empty">Inga träffar</div>
        )}

        {filtered.map((i) => (
          <div key={i.id} className="historyRow">
            <div>
              <div className="historyRow__title">#{i.number} · {i.size}</div>

<div className="historyRow__sub">
  Status: {i.status === "available" ? "Tillgänglig" : "Tilldelad"}
  {i.status === "assigned" && i.teamId && (
    <> · Lag: <strong>{i.teamId}</strong></>
  )}
  {" · "}
  Skapad: {i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "—"}
</div>

            </div>

<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
  
{i.status === "available" ? (
  <Pill tone="ok">Tillgänglig</Pill>
) : (
  <Pill tone="warn">Tilldelad – {i.teamId}</Pill>
)}




  {i.status === "available" && assigningId !== i.id && (
    <button
      className="btn btn--primary"
      onClick={() => {
        setAssigningId(i.id);
        setAssignTeamId("");
      }}
    >
      Tilldela till lag
    </button>
  )}

  {i.status === "available" && assigningId === i.id && (
    <>
      <select
        value={assignTeamId}
        onChange={(e) => setAssignTeamId(e.target.value)}
        style={{ minWidth: 120 }}
      >
        <option value="">Välj lag</option>
        {DEFAULT_TEAMS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <button
        className="btn btn--ok"
        disabled={!assignTeamId}
        onClick={async() => {
          try {
            await assignWarehouseItemToTeam(i.id, assignTeamId);
            setAssigningId(null);
            setAssignTeamId("");
            reload();
          } catch {
            alert("Kunde inte tilldela tröjan");
          }
        }}
      >
        Bekräfta
      </button>

      <button
        className="btn btn--ghost"
        onClick={() => {
          setAssigningId(null);
          setAssignTeamId("");
        }}
      >
        Avbryt
      </button>
    </>
  )}

  <button
    className="btn btn--danger"
    onClick={() => removeOne(i.id)}
    disabled={i.status !== "available"}
  >
    Ta bort
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

  const [items, setItems] = useState([]);              // matchkit-items för aktuellt lag
  const [selected, setSelected] = useState([]);        // markerade tröjor (admin)
  const [importMode, setImportMode] = useState("replace");
  const [moveFrom, setMoveFrom] = useState(teamId);
  const [moveTo, setMoveTo] = useState(
    teamsVisible.find((t) => t.id !== teamId)?.id ?? teamId
  );

  // Ladda matchkit för valt lag (async, säkert)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiLoadMatchKit(teamId);
        if (!alive) return;

        setItems(Array.isArray(data) ? data : []);
        setSelected([]);
        setMoveFrom(teamId);
        setMoveTo(teamsVisible.find((t) => t.id !== teamId)?.id ?? teamId);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setItems([]);
        setSelected([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [teamId, teamsVisible]);

  const assignedCount = useMemo(
    () => items.filter((i) => String(i.playerName || "").trim()).length,
    [items]
  );

  const toggleSelected = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Spara hela listan för aktuellt lag (UI först, backend sen)
  const persist = async (next) => {
    setItems(next);
    await apiSaveMatchKit(teamId, next);
  };

  // Admin: lägg till tröja manuellt
  const addItem = async () => {
    if (!isAdmin) return;
    const number = Number(prompt("Tröjnummer?"));
    const size = (prompt("Storlek (t.ex. 152, S, M)?") || "").trim();
    if (!Number.isFinite(number) || !size) return;

    const next = [...items, { id: uuid(), number, size, playerName: "" }];
    await persist(next);
  };

  // Uppdatera en tröja (spelarnamn alltid, storlek bara admin)
  const updateItem = async (id, patch) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    await persist(next);
  };

  // Admin: ta bort tröja från lagets matchkit
  const removeItem = async (id) => {
    if (!isAdmin) return;
    const next = items.filter((i) => i.id !== id);
    await persist(next);
  };

  // Admin: flytta markerade tröjor mellan lag (via API)
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

    if (teamId === fromTeamId) setItems(nextFrom);
    if (teamId === toTeamId) setItems(nextTo);
    setSelected([]);
  };

  // Import matchkit Excel (nummer, storlek, spelare valfri)
  const importMatchKitExcelHere = async (file, mode) => {
    const rows = await parseMatchkitExcel(file);

    const incoming = (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        id: uuid(),
        number: Number(r.nummer ?? r.Nummer ?? r.number ?? r.Number),
        size: String(r.storlek ?? r.Storlek ?? r.size ?? r.Size ?? "").trim(),
        playerName: String(
          r.spelare ?? r.Spelare ?? r.player ?? r.Player ?? ""
        ).trim(),
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

  // Admin: returnera en tröja till huvudlager (warehouse)
  const returnToWarehouse = async (itemId) => {
    if (!isAdmin) return;
    if (!confirm("Returnera tröjan till huvudlager?")) return;

    // 1) ta bort från lagets matchkit
    const next = items.filter((x) => x.id !== itemId);
    setItems(next);
    await apiSaveMatchKit(teamId, next);

    // 2) uppdatera huvudlager: status=available, teamId=null
    const warehouse = await apiLoadWarehouse();
    const safeWarehouse = Array.isArray(warehouse) ? warehouse : [];

    const updatedWarehouse = safeWarehouse.map((x) =>
      x.id === itemId ? { ...x, status: "available", teamId: null } : x
    );

    await apiSaveWarehouse(updatedWarehouse);
  };

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Matchtröjor (lag)</div>
        <div className="summaryValue">
          {assignedCount}/{items.length}
        </div>
        <div className="summarySub">Tilldelade / Totalt</div>
      </div>

      <div className="grid">
        {items.map((it) => (
          <div key={it.id} className="card">
            <div className="card__top">
              <div className="card__title">
                #{it.number} · {it.size}
              </div>
              {String(it.playerName || "").trim() ? (
                <Pill tone="ok">Tilldelad</Pill>
              ) : (
                <Pill tone="neutral">Ej tilldelad</Pill>
              )}
            </div>

            <div className="meta">
              <div className="meta__row">
                <span>Spelare</span>
                <span className="meta__value">
                  <input
                    value={it.playerName || ""}
                    onChange={(e) =>
                      updateItem(it.id, { playerName: e.target.value })
                    }
                    placeholder="Namn"
                  />
                </span>
              </div>

              <div className="meta__row">
                <span>Storlek</span>
                <span className="meta__value">
                  <input
                    value={it.size}
                    disabled={!isAdmin}
                    onChange={(e) => updateItem(it.id, { size: e.target.value })}
                  />
                </span>
              </div>

              {isAdmin && (
                <div className="meta__row">
                  <span>Flytta</span>
                  <span className="meta__value">
                    <input
                      type="checkbox"
                      checked={selected.includes(it.id)}
                      onChange={() => toggleSelected(it.id)}
                    />
                  </span>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="btnRow">
                <button
                  className="btn btn--ghost"
                  onClick={() => updateItem(it.id, { playerName: "" })}
                >
                  Frigör
                </button>

                <button
                  className="btn btn--danger"
                  onClick={() => returnToWarehouse(it.id)}
                >
                  Returnera till lager
                </button>

                <button
                  className="btn btn--danger"
                  onClick={() => removeItem(it.id)}
                >
                  Ta bort
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__title">Åtgärder</div>

        <div className="btnRow">
          <button
            className="btn btn--primary"
            onClick={addItem}
            disabled={!isAdmin}
          >
            Lägg till (admin)
          </button>
          <button
            className="btn btn--ghost"
            onClick={() =>
              alert("Ledare kan ändra spelarnamn. Admin hanterar lager/flytt/return.")
            }
          >
            Info
          </button>
        </div>

        {isAdmin && (
          <>
            <div className="meta">
              <div className="meta__row">
                <span>Flytta markerade</span>
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

            <div className="card__title">Importera (Excel)</div>
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
                const n = await importMatchKitExcelHere(f, importMode);
                addNotification(user.id, `Importerade ${n} tröjor ✅`);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
/* ================= Page: Leaderclothes ================= */
function LeaderClothesPage({ user, teamId, nav }) {
  const [budget, setBudget] = useState({ teamId, total: 0, used: 0 });
  const [issued, setIssued] = useState([]);
  const catalog = loadCatalog().filter((p) => p.active);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [b, i] = await Promise.all([
          apiLoadBudget(teamId),
          apiLoadIssued(teamId),
        ]);

        if (!alive) return;

        setBudget(b ?? { teamId, total: 0, used: 0 });
        setIssued(Array.isArray(i) ? i : []);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [teamId]);

  const remaining = Math.max(0, budget.total - budget.used);

  const myIssued =
    user.role === "leader"
      ? issued.filter((i) => i.leaderUserId === user.id)
      : issued;

  return (
    <div>
      {/* BUDGET */}
      <div className="summaryCard">
        <div className="summaryTitle">Budget (ledarkläder)</div>
        <div className="summaryValue">{remaining} kr</div>
        <div className="summarySub">
          Kvar att handla för · Totalt {budget.total} kr
        </div>
      </div>

      {/* ISSUED HEADER */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Uthämtade ledarkläder</div>
          <Pill tone="neutral">{myIssued.length} rader</Pill>
        </div>
        {myIssued.length === 0 && (
          <div className="empty">
            Inga registrerade utlämningar ännu.
          </div>
        )}
      </div>

      {/* ISSUED LIST */}
      <div className="history">
        {myIssued.map((i) => (
          <div key={i.id} className="historyRow">
            <div>
              <div className="historyRow__title">
                {i.leaderName} · {i.name}
                {i.quantity > 1 ? ` x${i.quantity}` : ""}
              </div>
              <div className="historyRow__sub">
                {i.dateIssued} ·{" "}
                {i.source === "order" ? "Beställning" : "Manuell"}
              </div>
            </div>

            <div className="historyRow__delta neg">{i.cost} kr</div>

            {/* ADMIN: TA BORT */}
            {user.role === "admin" && (
              <button
                className="btn btn--danger"
                onClick={async () => {
                  if (!confirm("Ta bort ledarklädesplagg från laget?")) return;

                  try {
                    const nextIssued = issued.filter((x) => x.id !== i.id);
                    await apiSaveIssued(teamId, nextIssued);
                    setIssued(nextIssued);
                  } catch (e) {
                    alert("Kunde inte ta bort ledarklädesplagg");
                    console.error(e);
                  }
                }}
              >
                Ta bort från lag
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ORDER CTA */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__top">
          <div className="card__title">Beställ ledarkläder</div>
          <Pill tone="ok">{catalog.length} produkter</Pill>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Beställning skickas för godkännande. Budget dras först vid godkännande.
        </div>

        <button
          className="btn btn--primary"
          style={{ marginTop: 10 }}
          onClick={() => nav("/order")}
        >
          Öppna beställning
        </button>
      </div>
    </div>
  );
}

/* ================= Page: Order ================= */
function OrderPage({ user, teamId }) {
  // Sortiment (katalogen kan vara lokal tills vidare)
  const products = (loadCatalog?.() ?? []).filter((p) => p.active);

  // Varukorg: { productId, name, price, quantity, size }
  const [cart, setCart] = useState([]);

  const add = (p) => {
    if (cart.find((i) => i.productId === p.id)) return;
    setCart([
      ...cart,
      { productId: p.id, name: p.name, price: p.price, quantity: 1, size: "-" },
    ]);
  };

  const remove = (productId) => {
    setCart(cart.filter((i) => i.productId !== productId));
  };

  const setQty = (productId, quantity) => {
    const q = Math.max(1, Number(quantity || 1));
    setCart(
      cart.map((i) => (i.productId === productId ? { ...i, quantity: q } : i))
    );
  };

  const setSize = (productId, size) => {
    setCart(
      cart.map((i) => (i.productId === productId ? { ...i, size } : i))
    );
  };

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  // ✅ Skapa order via API så Admin ser den
  const submitOrder = async () => {
    if (cart.length === 0) return;

    const order = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      createdByUserId: user.id,
      createdByName: user.name,
      teamId,
      items: cart.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        size: i.size,
      })),
      totalCost: total,
      status: "pending",
    };

    // Hämta senaste listan från servern för att undvika att skriva på gammal lokal data
    const existing = await apiLoadOrders(teamId);
    const safeExisting = Array.isArray(existing) ? existing : [];
    const next = [...safeExisting, order];

    await apiSaveOrders(teamId, next);

    // UI feedback
    setCart([]);
    if (typeof addNotification === "function") {
      addNotification(user.id, "Beställning skickad ✅");
    }
    alert("Beställning skickad ✅\n(Admin kan nu godkänna i Admin-vyn)");
  };

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Sortiment</div>
          <Pill tone="neutral">{products.length} st</Pill>
        </div>

        <div className="history" style={{ marginTop: 10 }}>
          {products.map((p) => (
            <div key={p.id} className="historyRow">
              <div>
                <div className="historyRow__title">{p.name}</div>
                <div className="historyRow__sub">{p.category} · {p.price} kr</div>
              </div>

              <button className="btn btn--ok" onClick={() => add(p)}>
                Lägg till
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card__top">
          <div className="card__title">Varukorg</div>
          <Pill tone="neutral">{cart.length} rader</Pill>
        </div>

        {cart.length === 0 && (
          <div className="empty">Ingen produkt vald ännu.</div>
        )}

        {cart.map((i) => (
          <div key={i.productId} className="meta" style={{ marginTop: 10 }}>
            <div className="meta__row">
              <span>{i.name}</span>
              <span className="meta__value">{i.price} kr</span>
            </div>

            <div className="meta__row">
              <span>Antal</span>
              <span className="meta__value">
                <input
                  value={i.quantity}
                  inputMode="numeric"
                  onChange={(e) => setQty(i.productId, e.target.value)}
                />
              </span>
            </div>

            <div className="meta__row">
              <span>Storlek</span>
              <span className="meta__value">
                <input
                  value={i.size}
                  onChange={(e) => setSize(i.productId, e.target.value)}
                  placeholder="t.ex. S, M, L"
                />
              </span>
            </div>

            <div className="btnRow" style={{ marginTop: 8 }}>
              <button className="btn btn--danger" onClick={() => remove(i.productId)}>
                Ta bort
              </button>
            </div>
          </div>
        ))}

        <div className="qtyRow" style={{ marginTop: 12 }}>
          <div>
            <div className="qty__label">Totalt</div>
            <div className="qty__value">{total} kr</div>
          </div>

          <div className="miniMeta">
            <div>Lag: {teamId}</div>
            <div>Status: skickas som pending</div>
          </div>
        </div>

        <div className="btnRow" style={{ marginTop: 10 }}>
          <button
            className="btn btn--primary"
            disabled={cart.length === 0}
            onClick={submitOrder}
          >
            Skicka beställning
          </button>

          <button className="btn btn--ghost" onClick={() => setCart([])}>
            Töm
          </button>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Beställningen sparas centralt (API). Budget dras och utlämning (Issued) skapas vid godkännande i Admin.
        </div>
      </div>
    </div>
  );
}

/* ================= Page: Admin (hook-safe gate) ================= */
function AdminPage(props) {
  const { user } = props;

  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Admin</div>
        <div className="empty">Ej behörig</div>
      </div>
    );
  }

  return <AdminInner {...props} />;
}

function AdminInner({ user, teamId }) {
  /* ===================== USERS (lokalt OK tills vidare) ===================== */
  const users = jget("users", []);
  const teamUsers = users.filter((u) => u.teamIds?.includes(teamId));
  const leaders = teamUsers.filter((u) => u.role === "leader");

  /* ===================== ISSUED / BUDGET / ORDERS (API) ===================== */
  const [issued, setIssued] = useState([]);
  const [budget, setBudget] = useState({ teamId, total: 0, used: 0 });
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [i, b, o] = await Promise.all([
          apiLoadIssued(teamId),
          apiLoadBudget(teamId),
          apiLoadOrders(teamId),
        ]);

        if (!alive) return;

        setIssued(Array.isArray(i) ? i : []);
        setBudget(b ?? { teamId, total: 0, used: 0 });
        setOrders(Array.isArray(o) ? o.slice().reverse() : []);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [teamId]);

  const pending = orders.filter((o) => o.status === "pending");

  /* ===================== ADD USER ===================== */
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
    alert("Användare skapad ✅ (logga ut/in för att se i listor)");
  };

  /* ===================== CATALOG (oförändrad) ===================== */
  const [catalog, setCatalog] = useState(loadCatalog());
  const [prodName, setProdName] = useState("");
  const [prodCat, setProdCat] = useState("");
  const [prodPrice, setProdPrice] = useState("");

  const addCatalogItem = () => {
    const price = Number(prodPrice);
    if (!prodName.trim() || !prodCat.trim() || !Number.isFinite(price)) return;

    const next = [
      ...catalog,
      { id: uuid(), name: prodName.trim(), category: prodCat.trim(), price, active: true },
    ];

    setCatalog(next);
    saveCatalog(next);
    setProdName("");
    setProdCat("");
    setProdPrice("");
  };

  const toggleCatalog = (id) => {
    const next = catalog.map((p) =>
      p.id === id ? { ...p, active: !p.active } : p
    );
    setCatalog(next);
    saveCatalog(next);
  };

  const removeCatalog = (id) => {
    const next = catalog.filter((p) => p.id !== id);
    setCatalog(next);
    saveCatalog(next);
  };

  /* ===================== BUDGET ===================== */
  const saveBudgetTotal = async () => {
    if (!Number.isFinite(Number(budget.total))) return;
    await apiSaveBudget(teamId, budget);
    alert("Budget sparad ✅");
  };

  /* ===================== ORDERS ===================== */
  const approve = async (id) => {
  const order = orders.find((o) => o.id === id);
  if (!order || order.status !== "pending") return;

  /* 1️⃣ GODKÄNN ORDER */
  const nextOrders = orders.map((o) =>
    o.id === id ? { ...o, status: "approved" } : o
  );
  await apiSaveOrders(teamId, nextOrders);
  setOrders(nextOrders.slice().reverse());


  /* 2️⃣ UPPDATERA BUDGET */
  const nextBudget = {
    ...budget,
    used: (budget.used || 0) + order.totalCost,
  };
  await apiSaveBudget(teamId, nextBudget);
  setBudget(nextBudget);

  /* 3️⃣ SKAPA ISSUED-POSTER */
  const existingIssued = await apiLoadIssued(teamId);

  const issuedFromOrder = order.items.map((i) => ({
    id: uuid(),
    leaderUserId: order.createdByUserId,
    leaderName: order.createdByName,
    name: i.name,
    size: i.size,
    quantity: i.quantity,
    cost: i.price * i.quantity,
    dateIssued: new Date().toISOString().slice(0, 10),
    source: "order",
  }));

  const nextIssued = [...existingIssued, ...issuedFromOrder];
  await apiSaveIssued(teamId, nextIssued);
};
const reject = async (id) => {
  const order = orders.find((o) => o.id === id);
  if (!order || order.status !== "pending") return;

  if (!confirm("Vill du avslå denna beställning?")) return;

  const nextOrders = orders.map((o) =>
    o.id === id ? { ...o, status: "rejected" } : o
  );

  // 1️⃣ Spara till backend
  await apiSaveOrders(teamId, nextOrders);

  // 2️⃣ Uppdatera UI
  setOrders(nextOrders.slice().reverse());
};
  /* ===================== RENDER ===================== */
  return (
    <div>
            {/* BUDGET */}
      <div className="card">
        <div className="card__title">Budget – {teamId}</div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Total budget</span>
            <input
              value={budget.total}
              onChange={(e) =>
                setBudget({ ...budget, total: Number(e.target.value) })
              }
            />
          </div>
          <button className="btn btn--ok" onClick={saveBudgetTotal}>
            Spara budget
          </button>
<div className="field" style={{ marginTop: 10 }}>
  <span>Korrigera använd budget (kr)</span>
  <input
    inputMode="numeric"
    value={budget.used}
    onChange={(e) =>
      setBudget({ ...budget, used: Number(e.target.value) || 0 })
    }
  />
</div>

<button
  className="btn btn--ok"
  onClick={async () => {
    await apiSaveBudget(teamId, budget);
    alert("Budget uppdaterad ✅");
  }}
>
  Spara korrigerad budget
</button>
          
          <button
  className="btn btn--danger"
  style={{ marginTop: 10 }}
  onClick={async () => {
    if (
      !confirm(
        "Detta återställer använd budget (used = 0). Historiska utdelningar påverkas inte.\n\nFortsätt?"
      )
    )
      return;

    const resetBudget = {
      ...budget,
      used: 0,
    };

    await apiSaveBudget(teamId, resetBudget);
    setBudget(resetBudget);

    alert("Använd budget återställd ✅");
  }}
>
  Återställ använd budget
    </button>

        </div>
      </div>
{/* ==== AVDELSARE: ADMINISTRERA ALLA LAG ==== */}
<div
  style={{
    margin: "24px 4px 12px",
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontWeight: 600,
    fontSize: 14,
    opacity: 0.8,
  }}
>
  Administrera alla lag
</div>

            {/* ORDERS */}
      <div className="card">
        <div className="card__title">
          Beställningar (väntar: {pending.length})
        </div>

        {pending.length === 0 && (
          <div className="empty">Inga väntande beställningar</div>
        )}

        {pending.map((o) => (
          <div key={o.id} className="historyRow">
            <div>{o.createdByName} · {o.totalCost} kr</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--ok" onClick={() => approve(o.id)}>
                Godkänn
              </button>
              <button className="btn btn--danger" onClick={() => reject(o.id)}>
                Avslå
              </button>
            </div>
          </div>
        ))}
      </div>


      {/* USERS */}
      <div className="card">
        <div className="card__title">Användare</div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Namn</span>
            <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
          </div>

          <div className="field">
            <span>PIN</span>
            <input value={newUserPin} onChange={(e) => setNewUserPin(e.target.value)} />
          </div>

          <div className="field">
            <span>Roll</span>
            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
              <option value="leader">Ledare</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button className="btn btn--primary" onClick={addUser}>
            Lägg till användare
          </button>
        </div>
      </div>

      {/* CATALOG */}
<div className="card">
  <div className="card__top">
    <div className="card__title">Ledarkläder – Katalog</div>
  </div>

  {/* === LÄGG TILL PRODUKT === */}
  <div className="formGrid" style={{ marginTop: 10 }}>
    <div className="field">
      <span>Namn</span>
      <input
        value={prodName}
        onChange={(e) => setProdName(e.target.value)}
        placeholder="T.ex. Träningsjacka"
      />
    </div>

    <div className="field">
      <span>Kategori</span>
      <select
        className="input"
        value={prodCat}
        onChange={(e) => setProdCat(e.target.value)}
      >
        <option value="">Välj kategori</option>
        <option value="Startpaket">Startpaket</option>
        <option value="Vartannat år">Vartannat år</option>
        <option value="Tillval">Tillval</option>
      </select>
    </div>

    <div className="field">
      <span>Pris (kr)</span>
      <input
        value={prodPrice}
        onChange={(e) => setProdPrice(e.target.value)}
        inputMode="numeric"
        placeholder="T.ex. 799"
      />
    </div>

    <button className="btn btn--primary" onClick={addCatalogItem}>
      Lägg till produkt
    </button>
  </div>

  {/* === LISTA PRODUKTER === */}
  <div className="history" style={{ marginTop: 12 }}>
    {catalog.length === 0 && (
      <div className="empty">Inga produkter i katalogen ännu.</div>
    )}

    {catalog.map((p) => (
      <div key={p.id} className="historyRow">
        <div>
          <div className="historyRow__title">
            {p.name} · {p.price} kr
          </div>
          <div className="historyRow__sub">
            {p.category} · {p.active ? "Aktiv" : "Inaktiv"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn--ghost"
            onClick={() => toggleCatalog(p.id)}
          >
            {p.active ? "Inaktivera" : "Aktivera"}
          </button>

          <button
            className="btn btn--danger"
            onClick={() => removeCatalog(p.id)}
          >
            Ta bort
          </button>
        </div>
      </div>
    ))}
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

/* ================= Page: Reports (Upstash for lagkassa) ================= */
function ReportsPage(props) {
  const { user } = props;
  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Rapporter</div>
        <div className="empty">Endast admin</div>
      </div>
    );
  }
  return <ReportsInner {...props} />;
}

function ReportsInner({ user, teamId, teamsAll }) {
  const team = teamsAll.find((t) => t.id === teamId);
  const [mkRowsAll, setMkRowsAll] = useState([]);
  const [scope, setScope] = useState("team"); // "team" | "all"
  const [cashRowsAll, setCashRowsAll] = useState([]);
  const [cash, setCash] = useState(null);
  const [cashHist, setCashHist] = useState([]);

  useEffect(() => {
    let alive = true;
    apiCashSnapshot(teamId).then(({ cash, hist }) => {
      if (!alive) return;
      setCash(cash);
      setCashHist(Array.isArray(hist) ? hist : []);
    });
    return () => {
      alive = false;
    };
  }, [teamId]);

  useEffect(() => {
  let alive = true;

  if (scope !== "all") return;

  (async () => {
    const rows = [];

    for (const t of teamsAll) {
      const kit = await apiLoadMatchKit(t.id);
      const safeKit = Array.isArray(kit) ? kit : [];

      safeKit.forEach((m) => {
        rows.push({
          Lag: t.name,
          Nummer: m.number,
          Storlek: m.size,
          Spelare: m.playerName ?? "",
        });
      });
    }

    if (alive) setMkRowsAll(rows);
  })();

  return () => {
    alive = false;
  };
}, [scope, teamsAll]);
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
          Månad: String(h.month),            // samma som valt lag
          Saldo: h.balance,
          Importerad: h.importedAt
            ? new Date(h.importedAt).toLocaleDateString()
            : "",
        });
      });
    }

    if (alive) setCashRowsAll(rows);
  })();

  return () => {
    alive = false;
  };
}, [scope, teamsAll]);
  const date = new Date().toISOString().slice(0, 10);

  /* =========================
     LAGKASSA
  ========================= */

  const cashRows = cashHist.map((h) => ({
    Lag: team?.name ?? teamId,
    Kontonummer: cash?.accountNumber ?? "",
    Månad: String(h.month),
    Saldo: h.balance,
    Importerad: h.importedAt
      ? new Date(h.importedAt).toLocaleDateString()
      : "",
  }));



  /* =========================
     LEDARKLÄDER
  ========================= */

  const issued = loadIssued(teamId);
  const issuedRows = issued.map((i) => ({
    Lag: team?.name ?? teamId,
    Ledare: i.leaderName,
    Plagg: i.name,
    Storlek: i.size,
    Antal: i.quantity,
    Datum: i.dateIssued,
    Kostnad: i.cost,
    Källa: i.source,
  }));

  const issuedRowsAll = useMemo(() => {
    const rows = [];
    for (const t of teamsAll) {
      const issued = loadIssued(t.id) ?? [];
      issued.forEach((i) => {
        rows.push({
          Lag: t.name,
          Ledare: i.leaderName,
          Plagg: i.name,
          Storlek: i.size,
          Antal: i.quantity,
          Datum: i.dateIssued,
          Kostnad: i.cost,
          Källa: i.source,
        });
      });
    }
    return rows;
  }, [teamsAll]);

  /* =========================
     BESTÄLLNINGAR
  ========================= */

  const orders = loadOrders(teamId) ?? [];
  const orderRows = orders.map((o) => ({
    Lag: team?.name ?? teamId,
    Beställare: o.createdByName,
    Datum: new Date(o.createdAt).toLocaleString(),
    Totalt: o.totalCost,
    Status: o.status,
  }));

  const orderRowsAll = useMemo(() => {
    const rows = [];
    for (const t of teamsAll) {
      const orders = loadOrders(t.id) ?? [];
      orders.forEach((o) => {
        rows.push({
          Lag: t.name,
          Beställare: o.createdByName,
          Datum: new Date(o.createdAt).toLocaleString(),
          Totalt: o.totalCost,
          Status: o.status,
        });
      });
    }
    return rows;
  }, [teamsAll]);

  /* =========================
     MATCHKLÄDER
  ========================= */

  const matchKit = apiLoadMatchKit(teamId);
  const safeMatchKit = Array.isArray(matchKit) ? matchKit : [];

  const mkRows = safeMatchKit.map((m) => ({
    Lag: team?.name ?? teamId,
    Nummer: m.number,
    Storlek: m.size,
    Spelare: m.playerName ?? "",
  }));



  /* =========================
     RENDER
  ========================= */

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Rapporter</div>
          <Pill tone="neutral">{team?.name ?? teamId}</Pill>
        </div>

        <div className="field">
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

        <div className="btnRow">
          <button
            className="btn btn--primary"
            onClick={() =>
              exportXlsx(
                "Lagkassa",
                scope === "all" ? cashRowsAll : cashRows,
                `lagkassa-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
              )
            }
          >
            Export Lagkassa
          </button>

          <button
            className="btn btn--primary"
            onClick={() =>
              exportXlsx(
                "Ledarkläder",
                scope === "all" ? issuedRowsAll : issuedRows,
                `ledarklader-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
              )
            }
          >
            Export Ledarkläder
          </button>
        </div>

        <div className="btnRow">
          <button
            className="btn btn--ghost"
            onClick={() =>
              exportXlsx(
                "Orders",
                scope === "all" ? orderRowsAll : orderRows,
                `orders-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
              )
            }
          >
            Export Beställningar
          </button>

          <button
            className="btn btn--ghost"
            onClick={() =>
              exportXlsx(
                "Matchkläder",
                scope === "all" ? mkRowsAll : mkRows,
                `matchklader-${scope === "all" ? "alla-lag" : teamId}-${date}.xlsx`
              )
            }
          >
            Export Matchkläder
          </button>
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
        <LeaderClothesPage user={auth.user} teamId={activeTeamId} nav={nav} />
      );
    if (route === "/order") return <OrderPage user={auth.user} teamId={activeTeamId} />;
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
