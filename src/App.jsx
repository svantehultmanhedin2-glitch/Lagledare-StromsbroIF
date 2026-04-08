import React, { useEffect, useMemo, useState } from "react";
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
      teamIds: ["P14", "P/F15"],
    },
    {
      id: "u-led2",
      name: "Ledare 2",
      role: "leader",
      pinHash: hashPin("2222"),
      teamIds: ["F12"],
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
function notifKey(userId) {
  return `notifications:${userId}`;
}
function addNotification(userId, message) {
  const list = jget(notifKey(userId), []);
  jset(notifKey(userId), [
    { id: uuid(), message, createdAt: new Date().toISOString(), read: false },
    ...list,
  ]);
}
function markNotifRead(userId, id) {
  const list = jget(notifKey(userId), []);
  jset(
    notifKey(userId),
    list.map((n) => (n.id === id ? { ...n, read: true } : n))
  );
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
    addNotification(u.id, "Inloggad ✅");
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
function mkKey(teamId) {
  return `matchkit:${teamId}`;
}
function loadMatchKit(teamId) {
  return jget(mkKey(teamId), []);
}
function saveMatchKit(teamId, items) {
  jset(mkKey(teamId), items);
}
function moveMatchKit(fromTeamId, toTeamId, ids) {
  const from = loadMatchKit(fromTeamId);
  const to = loadMatchKit(toTeamId);
  const moving = from.filter((i) => ids.includes(i.id));
  saveMatchKit(fromTeamId, from.filter((i) => !ids.includes(i.id)));
  saveMatchKit(toTeamId, [...to, ...moving]);
}

/* Import matchkit excel (expected columns: nummer, storlek, spelare optional) */
async function importMatchKitExcel(teamId, file, mode) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const items = rows
    .map((r) => ({
      id: uuid(),
      number: Number(r.nummer ?? r.Nummer ?? r.number ?? r.Number),
      size: String(r.storlek ?? r.Storlek ?? r.size ?? r.Size ?? ""),
      playerName: String(
        r.spelare ?? r.Spelare ?? r.player ?? r.Player ?? ""
      ).trim(),
    }))
    .filter((x) => Number.isFinite(x.number) && x.size);

  const existing = loadMatchKit(teamId);
  saveMatchKit(teamId, mode === "replace" ? items : [...existing, ...items]);
  return items.length;
}

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

  // notify all admins
  const users = jget("users", []);
  users
    .filter((u) => u.role === "admin")
    .forEach((a) =>
      addNotification(a.id, `Ny beställning (${teamId}) från ${user.name}: ${total} kr`)
    );

  addNotification(user.id, "Beställning skickad ✅");
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

  addNotification(
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
  addNotification(order.createdByUserId, `Din beställning (${teamId}) avslogs ❌`);
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
    addNotification(leaderUserId, `Ledarkläder utlämnat (${teamId}): ${name} ✅`);
  }
  return true;
}

/* ================= Team cash (history + chart) ================= */
function cashKey(teamId) {
  return `teamcash:${teamId}`;
}
function cashHistKey(teamId) {
  return `teamcash-history:${teamId}`;
}

function loadCash(teamId) {
  return jget(cashKey(teamId), {
    teamId,
    balance: null,
    accountNumber: "",
    updatedAt: null,
  });
}

function loadCashHist(teamId) {
  return jget(cashHistKey(teamId), []);
}
function saveCashWithHistory(teamId, balance, month, accountNumber) {
  const now = new Date().toISOString();
  const prev = loadCash(teamId);

  jset(cashKey(teamId), {
    teamId,
    balance,
    accountNumber: accountNumber ?? prev.accountNumber ?? "",
    updatedAt: now,
  });

  const hist = loadCashHist(teamId).filter((h) => h.month !== month);
  jset(cashHistKey(teamId), [
    { teamId, month, balance, importedAt: now },
    ...hist,
  ]);
}
async function importCashExcel(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:"array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  let n = 0;

  rows.forEach(r => {
    const teamId =
      r.teamId ?? r.Team ?? r.Lag ?? r.lag;

    const saldo =
      r.saldo ?? r.Saldo ?? r.balance ?? r.Balance;

    const month =
      r.month ?? r.Month ?? r.månad ?? r.Månad;

    if (!teamId || saldo === undefined || !month) return;

    saveCashWithHistory(
      String(teamId).trim(),
      Number(saldo),
      String(month).trim()
    );
    n++;
  });



  return n;
}

/* ================= Reports (Excel export) ================= */
function exportXlsx(sheetName, rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
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
  const [list, setList] = useState(() => jget(notifKey(user.id), []));
  useEffect(() => {
    setList(jget(notifKey(user.id), []));
  }, [user.id]);

  const unread = list.filter((n) => !n.read).length;

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Notiser</div>
          <Pill tone="neutral">{unread} olästa</Pill>
        </div>
        {list.length === 0 && <div className="empty">Inga notiser</div>}
      </div>

      <div className="history">
        {list.map((n) => (
          <div key={n.id} className={`historyRow ${n.read ? "" : "card--selected"}`}>
            <div>
              <div className="historyRow__title">{n.message}</div>
              <div className="historyRow__sub">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {!n.read && (
                <button
                  className="btn btn--ok"
                  onClick={() => {
                    markNotifRead(user.id, n.id);
                    setList(jget(notifKey(user.id), []));
                  }}
                >
                  Läst
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
/* ================= HUVUDLAGER: Matchkläder (Warehouse) ================= */

const warehouseKey = "matchkit:warehouse";
function loadWarehouse() {
  return jget(warehouseKey, []);
}
function saveWarehouse(items) {
  jset(warehouseKey, items);
}

function normalizeSize(s) {
  return String(s ?? "").trim();
}

function normalizeNumber(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}

/** Gemensam parser för Excel (nummer, storlek, (ev spelare)) */
async function parseMatchkitExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  return rows
    .map((r) => {
      const number = normalizeNumber(r.nummer ?? r.Nummer ?? r.number ?? r.Number);
      const size = normalizeSize(r.storlek ?? r.Storlek ?? r.size ?? r.Size ?? "");
      const playerName = String(r.spelare ?? r.Spelare ?? r.player ?? r.Player ?? "").trim();
      return { number, size, playerName };
    })
    .filter((x) => x.number !== null && x.size);
}

/** Import till huvudlager */
async function importWarehouseExcel(file, mode) {
  const parsed = await parseMatchkitExcel(file);

  const incoming = parsed.map((x) => ({
    id: uuid(),
    number: x.number,
    size: x.size,
    status: "available", // available | assigned (för framtiden)
    note: "",
    createdAt: new Date().toISOString(),
  }));

  const existing = loadWarehouse();
  const next = mode === "replace" ? incoming : [...existing, ...incoming];
  saveWarehouse(next);

  return incoming.length;
}

function assignWarehouseItemToTeam(itemId, teamId) {
  // 1. Hämta huvudlager
  const warehouse = loadWarehouse();
  const item = warehouse.find((x) => x.id === itemId);

  if (!item || item.status !== "available") {
    throw new Error("Tröjan är inte tillgänglig");
  }

  // 2. Lägg till tröjan i lagets matchkläder
  const teamItems = loadMatchKit(teamId);
  const teamItem = {
    id: item.id,                 // SAMMA id
    number: item.number,
    size: item.size,
    playerName: "",              // fylls i av ledare senare
  };
  saveMatchKit(teamId, [teamItem, ...teamItems]);

  // 3. Uppdatera huvudlagerstatus
  const updatedWarehouse = warehouse.map((x) =>
    x.id === itemId
      ? { ...x, status: "assigned", teamId }
      : x
  );

  saveWarehouse(updatedWarehouse);
}

function returnWarehouseItemFromTeam(itemId, teamId) {
  // 1. Ta bort tröjan från lagets matchkläder
  const teamItems = loadMatchKit(teamId);
  const remaining = teamItems.filter((x) => x.id !== itemId);
  saveMatchKit(teamId, remaining);

  // 2. Uppdatera huvudlager: gör tröjan tillgänglig igen
  const warehouse = loadWarehouse();
  const updated = warehouse.map((x) =>
    x.id === itemId
      ? { ...x, status: "available", teamId: null }
      : x
  );
  saveWarehouse(updated);
}

/** UI: Admin‑vy för huvudlager */
function WarehouseMatchkitPage({ user }) {
  if (user.role !== "admin") {
    return (
      <div className="card">
        <div className="card__title">Huvudlager – Matchkläder</div>
        <div className="empty">Endast admin</div>
      </div>
    );
  }

  const [items, setItems] = useState(() => loadWarehouse());
  const [importMode, setImportMode] = useState("append");
const [assigningId, setAssigningId] = useState(null);
const [assignTeamId, setAssignTeamId] = useState("");


  // Sök/filter
  const [qNumber, setQNumber] = useState("");
  const [qSize, setQSize] = useState("all");

  // uppdatera state om localStorage ändras via andra actions
  const reload = () => setItems(loadWarehouse());

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

  const addManual = () => {
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
    saveWarehouse(next);
    setItems(next);
  };

  const removeOne = (id) => {
    const next = items.filter((x) => x.id !== id);
    saveWarehouse(next);
    setItems(next);
  };

  const clearAll = () => {
    if (!confirm("Rensa hela huvudlagret?")) return;
    saveWarehouse([]);
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
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={async (e) => {
                if (!e.target.files?.[0]) return;
                const n = await importWarehouseExcel(e.target.files[0], importMode);
                reload();
                addNotification(user.id, `Importerade ${n} rader till huvudlager ✅`);
                alert(`Importerade ${n} rader ✅`);
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
        onClick={() => {
          try {
            assignWarehouseItemToTeam(i.id, assignTeamId);
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
  const [items, setItems] = useState(() => loadMatchKit(teamId));
  const [importMode, setImportMode] = useState("replace");
  const [moveFrom, setMoveFrom] = useState(teamId);
  const [moveTo, setMoveTo] = useState(teamsVisible.find((t) => t.id !== teamId)?.id ?? teamId);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    setItems(loadMatchKit(teamId));
    setSelected([]);
  }, [teamId]);

  const isAdmin = user.role === "admin";
  const assigned = items.filter((i) => String(i.playerName || "").trim()).length;

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addItem = () => {
    if (!isAdmin) return;
    const number = Number(prompt("Tröjnummer?"));
    const size = prompt("Storlek (t.ex. 152, S, M)?") || "";
    if (!Number.isFinite(number) || !size) return;
    const next = [...items, { id: uuid(), number, size, playerName: "" }];
    setItems(next);
    saveMatchKit(teamId, next);
  };

  const updateItem = (id, patch) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems(next);
    saveMatchKit(teamId, next);
  };

  const removeItem = (id) => {
    if (!isAdmin) return;
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    saveMatchKit(teamId, next);
  };

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Matchtröjor (lag)</div>
        <div className="summaryValue">{assigned}/{items.length}</div>
        <div className="summarySub">Tilldelade / Totalt</div>
      </div>

      <div className="grid">
        {items.map((it) => (
          <div key={it.id} className="card">
            <div className="card__top">
              <div className="card__title">#{it.number} · {it.size}</div>
              {String(it.playerName || "").trim()
                ? <Pill tone="ok">Tilldelad</Pill>
                : <Pill tone="neutral">Ej tilldelad</Pill>
              }
            </div>

            <div className="meta">
              <div className="meta__row">
                <span>Spelare</span>
                <span className="meta__value">
                  <input
                    value={it.playerName || ""}
                    onChange={(e) => updateItem(it.id, { playerName: e.target.value })}
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
                      onChange={() => toggle(it.id)}
                    />
                  </span>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="btnRow">
                <button className="btn btn--ghost" onClick={() => updateItem(it.id, { playerName: "" })}>Frigör</button>

{user.role === "admin" && (
  <button
    className="btn btn--danger"
    onClick={() => {
      if (!confirm("Returnera tröjan till huvudlager?")) return;
      returnWarehouseItemFromTeam(it.id, teamId);
      setItems(loadMatchKit(teamId)); // uppdatera vyn
    }}
  >
    Returnera till lager
  </button>
)}

                              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__title">Åtgärder</div>
        <div className="btnRow">
          <button className="btn btn--primary" onClick={addItem} disabled={!isAdmin}>Lägg till (admin)</button>
          <button className="btn btn--ghost" onClick={() => alert("Ledare kan endast ändra namn, admin hanterar lager")}>Info</button>
        </div>

        {isAdmin && (
          <>
            <div className="meta">
              <div className="meta__row">
                <span>Flytta valda</span>
                <span className="meta__value">{selected.length} st</span>
              </div>
            </div>

            <div className="formGrid">
              <div className="field">
                <span>Från lag</span>
                <select value={moveFrom} onChange={(e) => setMoveFrom(e.target.value)}>
                  {teamsVisible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field">
                <span>Till lag</span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  {teamsVisible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <button
              className="btn btn--ok"
              disabled={selected.length === 0}
              onClick={() => {
                moveMatchKit(moveFrom, moveTo, selected);
                setItems(loadMatchKit(teamId));
                setSelected([]);
                addNotification(user.id, "Matchkläder flyttade ✅");
              }}
            >
              Flytta markerade
            </button>

            <div style={{ height: 10 }} />

            <div className="card__title">Importera (Excel)</div>
            <div className="meta">
              <div className="meta__row">
                <span>Format</span>
                <span className="meta__value">nummer, storlek, spelare</span>
              </div>
            </div>
            <div className="field">
              <span>Läge</span>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="replace">Ersätt</option>
                <option value="append">Lägg till</option>
              </select>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={async (e) => {
                if (!e.target.files?.[0]) return;
                const n = await importMatchKitExcel(teamId, e.target.files[0], importMode);
                setItems(loadMatchKit(teamId));
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
  const budget = loadBudget(teamId);
  const remaining = Math.max(0, budget.total - budget.used);
  const issued = loadIssued(teamId);
  const catalog = loadCatalog().filter((p) => p.active);

  const myIssued = user.role === "leader"
    ? issued.filter((i) => i.leaderUserId === user.id)
    : issued;

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Budget (ledarkläder)</div>
        <div className="summaryValue">{remaining} kr</div>
        <div className="summarySub">Kvar att handla för · Totalt {budget.total} kr</div>
      </div>

      <div className="card">
        <div className="card__top">
          <div className="card__title">Uthämtade ledarkläder</div>
          <Pill tone="neutral">{myIssued.length} rader</Pill>
        </div>
        {myIssued.length === 0 && <div className="empty">Inga registrerade utlämningar ännu.</div>}
      </div>

      <div className="history">
        {myIssued.map((i) => (
          <div key={i.id} className="historyRow">
            <div>
              <div className="historyRow__title">
                {i.leaderName} · {i.name} {i.quantity > 1 ? `x${i.quantity}` : ""}
              </div>
              <div className="historyRow__sub">
                {i.dateIssued} · {i.source === "order" ? "Beställning" : "Manuell"}
              </div>
            </div>
            <div className="historyRow__delta neg">{i.cost} kr</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__top">
          <div className="card__title">Beställ ledarkläder</div>
          <Pill tone="ok">{catalog.length} produkter</Pill>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Beställning skickas för godkännande. Budget dras först vid godkännande.
        </div>
        <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => nav("/order")}>
          Öppna beställning
        </button>
      </div>
    </div>
  );
}

/* ================= Page: Order ================= */
function OrderPage({ user, teamId }) {
  const products = loadCatalog().filter((p) => p.active);
  const [cart, setCart] = useState([]);

  const add = (p) => {
    if (cart.find((i) => i.productId === p.id)) return;
    setCart([...cart, { productId: p.id, name: p.name, price: p.price, quantity: 1, size: "-" }]);
  };

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

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
              <button className="btn btn--ok" onClick={() => add(p)}>Lägg till</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card__top">
          <div className="card__title">Varukorg</div>
          <Pill tone="neutral">{cart.length} rader</Pill>
        </div>

        {cart.length === 0 && <div className="empty">Ingen produkt vald ännu.</div>}

        {cart.map((i) => (
          <div key={i.productId} className="meta">
            <div className="meta__row"><span>{i.name}</span><span className="meta__value">{i.price} kr</span></div>
            <div className="meta__row">
              <span>Antal</span>
              <span className="meta__value">
                <input
                  value={i.quantity}
                  onChange={(e) => {
                    const q = Math.max(1, Number(e.target.value || 1));
                    setCart(cart.map((x) => (x.productId === i.productId ? { ...x, quantity: q } : x)));
                  }}
                  inputMode="numeric"
                />
              </span>
            </div>
          </div>
        ))}

        <div className="qtyRow">
          <div>
            <div className="qty__label">Totalt</div>
            <div className="qty__value">{total} kr</div>
          </div>
          <div className="miniMeta">
            <div>Lag: {teamId}</div>
            <div>Status: skickas</div>
          </div>
        </div>

        <div className="btnRow">
          <button
            className="btn btn--primary"
            disabled={cart.length === 0}
            onClick={() => {
              createOrder(teamId, user, cart);
              setCart([]);
              alert("Beställning skickad ✅");
            }}
          >
            Skicka
          </button>
          <button className="btn btn--ghost" onClick={() => setCart([])}>Töm</button>
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
  const users = jget("users", []);
  const teamUsers = users.filter((u) => u.teamIds?.includes(teamId));
  const leaders = teamUsers.filter((u) => u.role === "leader");

  const catalog = loadCatalog();
  const budget = loadBudget(teamId);
  const orders = loadOrders(teamId).slice().reverse();
  const pending = orders.filter((o) => o.status === "pending");

  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState("leader");

  const [prodName, setProdName] = useState("");
  const [prodCat, setProdCat] = useState("");
  const [prodPrice, setProdPrice] = useState("");

  const [issueLeaderId, setIssueLeaderId] = useState(leaders[0]?.id ?? "");
  const [issueName, setIssueName] = useState("");
  const [issueSize, setIssueSize] = useState("-");
  const [issueCost, setIssueCost] = useState("0");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));

  const [budgetTotal, setBudgetTotal] = useState(String(budget.total));

  return (
    <div>
      {/* Users */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Användare</div>
          <Pill tone="neutral">{teamUsers.length} kopplade</Pill>
        </div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Namn</span>
            <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="T.ex. Anders" />
          </div>
          <div className="field">
            <span>PIN</span>
            <input value={newUserPin} onChange={(e) => setNewUserPin(e.target.value)} placeholder="4 siffror" inputMode="numeric" />
          </div>
          <div className="field">
            <span>Roll</span>
            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
              <option value="leader">Ledare</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            className="btn btn--primary"
            onClick={() => {
              if (!newUserName.trim() || !newUserPin.trim()) return;
              const u = {
                id: uuid(),
                name: newUserName.trim(),
                role: newUserRole,
                pinHash: hashPin(newUserPin.trim()),
                teamIds: [teamId],
              };
              jset("users", [...users, u]);
              addNotification(user.id, "Användare skapad ✅");
              setNewUserName("");
              setNewUserPin("");
              alert("Skapad ✅ (logga ut/in för att se i listor)");
            }}
          >
            Lägg till användare (kopplas till aktivt lag)
          </button>
        </div>
      </div>

      {/* Budget */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Budget</div>
          <Pill tone="neutral">{teamId}</Pill>
        </div>
        <div className="meta">
          <div className="meta__row"><span>Förbrukat</span><span className="meta__value">{budget.used} kr</span></div>
        </div>
        <div className="field">
          <span>Total budget</span>
          <input value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} inputMode="numeric" />
        </div>
        <button
          className="btn btn--ok"
          onClick={() => {
            const t = Number(budgetTotal);
            if (!Number.isFinite(t) || t < 0) return;
            saveBudget(teamId, { ...budget, total: t });
            addNotification(user.id, "Budget uppdaterad ✅");
            alert("Sparad ✅");
          }}
        >
          Spara budget
        </button>
      </div>

      {/* Catalog */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Sortiment (katalog)</div>
          <Pill tone="neutral">{catalog.length} rader</Pill>
        </div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field"><span>Namn</span><input value={prodName} onChange={(e) => setProdName(e.target.value)} /></div>
          <div className="field"><span>Kategori</span><input value={prodCat} onChange={(e) => setProdCat(e.target.value)} /></div>
          <div className="field"><span>Pris</span><input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} inputMode="numeric" /></div>
          <button
            className="btn btn--primary"
            onClick={() => {
              const price = Number(prodPrice);
              if (!prodName.trim() || !prodCat.trim() || !Number.isFinite(price)) return;
              saveCatalog([...catalog, { id: uuid(), name: prodName.trim(), category: prodCat.trim(), price, active: true }]);
              setProdName("");
              setProdCat("");
              setProdPrice("");
              alert("Produkt tillagd ✅");
            }}
          >
            Lägg till produkt
          </button>
        </div>

        <div className="history" style={{ marginTop: 12 }}>
          {catalog.map((p) => (
            <div key={p.id} className="historyRow">
              <div>
                <div className="historyRow__title">{p.name}</div>
                <div className="historyRow__sub">{p.category} · {p.price} kr</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--ghost" onClick={() => saveCatalog(catalog.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))}>
                  {p.active ? "Inaktivera" : "Aktivera"}
                </button>
                <button className="btn btn--danger" onClick={() => saveCatalog(catalog.filter((x) => x.id !== p.id))}>Ta bort</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Orders approval */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Beställningar (väntar)</div>
          <Pill tone={pending.length > 0 ? "warn" : "neutral"}>{pending.length}</Pill>
        </div>

        {pending.length === 0 && <div className="empty">Inga väntande beställningar.</div>}

        <div className="history" style={{ marginTop: 10 }}>
          {pending.map((o) => (
            <div key={o.id} className="historyRow">
              <div>
                <div className="historyRow__title">{o.createdByName}</div>
                <div className="historyRow__sub">{new Date(o.createdAt).toLocaleString()} · {o.totalCost} kr</div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  className="btn btn--ok"
                  onClick={() => {
                    approveOrder(teamId, user, o.id);
                    alert("Godkänd ✅");
                    window.location.reload();
                  }}
                >
                  Godkänn
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    rejectOrder(teamId, user, o.id);
                    alert("Avslagen ❌");
                    window.location.reload();
                  }}
                >
                  Avslå
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual issue clothes */}
      <div className="card">
        <div className="card__top">
          <div className="card__title">Utlämning (manuell)</div>
          <Pill tone="neutral">{teamId}</Pill>
        </div>

        <div className="formGrid" style={{ marginTop: 10 }}>
          <div className="field">
            <span>Ledare</span>
            <select value={issueLeaderId} onChange={(e) => setIssueLeaderId(e.target.value)}>
              {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field"><span>Plagg</span><input value={issueName} onChange={(e) => setIssueName(e.target.value)} /></div>
          <div className="field"><span>Storlek</span><input value={issueSize} onChange={(e) => setIssueSize(e.target.value)} /></div>
          <div className="field"><span>Kostnad (kr)</span><input value={issueCost} onChange={(e) => setIssueCost(e.target.value)} inputMode="numeric" /></div>
          <div className="field"><span>Datum</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>

          <button
            className="btn btn--primary"
            onClick={() => {
              const leader = leaders.find((x) => x.id === issueLeaderId);
              if (!leader || !issueName.trim()) return;
              adminIssueClothes(teamId, user, leader.id, leader.name, issueName.trim(), issueSize || "-", Number(issueCost || 0), issueDate);
              alert("Utlämnat ✅");
              setIssueName("");
              setIssueCost("0");
            }}
          >
            Markera utlämnat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Page: Teamcash ================= */
function TeamCashPage({ user, teamId }) {
  const cash = loadCash(teamId);
  const hist = loadCashHist(teamId).slice().sort((a, b) => a.month.localeCompare(b.month));
  const chartData = hist.map((h) => ({ month: h.month, balance: h.balance }));
  const reversed = hist.slice().reverse();

  return (
    <div>
      <div className="summaryCard">
        <div className="summaryTitle">Lagkassa</div>
        <div className="summaryValue">{cash?.balance ?? "—"} kr</div>
        <div className="summarySub">
          {cash?.updatedAt ? "Uppdaterad " + new Date(cash.updatedAt).toLocaleDateString() : "Ingen import ännu"}
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
                <div className="historyRow__title">{h.month}</div>
                <div className="historyRow__sub">Import: {new Date(h.importedAt).toLocaleDateString()}</div>
              </div>
              <div className={`historyRow__delta ${delta >= 0 ? "pos" : "neg"}`}>{h.balance} kr</div>
            </div>
          );
        })}
      </div>

      {user.role === "admin" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card__title">Importera (Excel)</div>
          <div className="meta">
            <div className="meta__row"><span>Format</span><span className="meta__value">teamId, saldo, month</span></div>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={async (e) => {
              if (!e.target.files?.[0]) return;
              const n = await importCashExcel(e.target.files[0]);
              addNotification(user.id, `Importerade ${n} rader ✅`);
              alert("Importerad ✅");
              window.location.reload();
            }}
          />
        </div>
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

  const team = teamsAll.find((t) => t.id === teamId);

  
const cash = loadCash(teamId);

const cashHist = loadCashHist(teamId);
const cashRows = cashHist.map((h) => ({
  Lag: team?.name ?? teamId,
  Kontonummer: cash?.accountNumber ?? "",
  Månad: h.month,
  Saldo: h.balance,
  Importerad: new Date(h.importedAt).toLocaleDateString(),
}));


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

  const orders = loadOrders(teamId);
  const orderRows = orders.map((o) => ({
    Lag: team?.name ?? teamId,
    Beställare: o.createdByName,
    Datum: new Date(o.createdAt).toLocaleString(),
    Totalt: o.totalCost,
    Status: o.status,
  }));

  const matchKit = loadMatchKit(teamId);
  const mkRows = matchKit.map((m) => ({
    Lag: team?.name ?? teamId,
    Nummer: m.number,
    Storlek: m.size,
    Spelare: m.playerName ?? "",
  }));

  return (
    <div>
      <div className="card">
        <div className="card__top">
          <div className="card__title">Rapporter</div>
          <Pill tone="neutral">{team?.name ?? teamId}</Pill>
        </div>

        <div className="btnRow">
          <button className="btn btn--primary" onClick={() => exportXlsx("Lagkassa", cashRows, `lagkassa-${teamId}-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            Export Lagkassa
          </button>
          <button className="btn btn--primary" onClick={() => exportXlsx("Ledarkläder", issuedRows, `ledarklader-${teamId}-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            Export Ledarkläder
          </button>
        </div>

        <div className="btnRow">
          <button className="btn btn--ghost" onClick={() => exportXlsx("Orders", orderRows, `orders-${teamId}-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            Export Beställningar
          </button>
          <button className="btn btn--ghost" onClick={() => exportXlsx("Matchkläder", mkRows, `matchklader-${teamId}-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
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

  const unreadCount = useMemo(() => {
    const list = jget(notifKey(auth.user.id), []);
    return list.filter((n) => !n.read).length;
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

  return <AuthedApp auth={auth} route={route} nav={nav} />;
}