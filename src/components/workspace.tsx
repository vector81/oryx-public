"use client";
import Image from "next/image";
import { cachedData, readData, clearDataCache } from "@/lib/client-cache";
import { AmountPrivacyProvider, AmountPrivacyToggle, usePrivateAmounts } from "./amount-privacy";
import SpendChart from "./spend-chart";
import StatSpark from "./stat-spark";
import SortBoard from "./sort-board";
import CustomSelect, { SelectOption } from "./select";
import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Home,
  Vault,
  BanknoteArrowDown,
  BanknoteArrowUp,
  BookOpen,
  ArrowLeftRight,
  Layers,
  Landmark,
  CalendarDays,
  Users,
  Plane,
  Upload,
  SlidersHorizontal,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  X,
  Check,
  LogOut,
  RefreshCw,
  ArrowDownLeft,
  Settings,
  ChevronDown,
  WifiOff,
  Undo2,
} from "lucide-react";
import { today, shiftMonth, summary, cents } from "@/lib/money";
import type { dashboard } from "@/lib/store";
import type { Transaction, Debt } from "@/lib/types";
type Data = Awaited<ReturnType<typeof dashboard>>;
type View =
  | "home"
  | "money"
  | "sort"
  | "debt"
  | "months"
  | "people"
  | "trips"
  | "import"
  | "rules"
  | "settings";
const views = [
  { id: "home", label: "Home", icon: Home },
  { id: "money", label: "Money", icon: ArrowLeftRight },
  { id: "sort", label: "Sort", icon: Layers },
  { id: "debt", label: "Debt", icon: Landmark },
  { id: "months", label: "By month", icon: CalendarDays },
  { id: "people", label: "People", icon: Users },
  { id: "trips", label: "Trips", icon: Plane },
  { id: "import", label: "Import", icon: Upload },
  { id: "rules", label: "Rules", icon: SlidersHorizontal },
] as const;
async function api(action: string, body: Record<string, unknown> = {}) {
  const r = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "Could not save. Try again.");
  clearDataCache();
  return b;
}
const dayLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
function Tray({
  title,
  children,
  aside,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`tray ${className}`}>
      <div className="tray-title">
        <span>{title}</span>
        {aside}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}
function Empty({
  text,
  action,
  label = "Import money",
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ArrowLeftRight size={24} />
      </div>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
function Pill({ t }: { t: Transaction }) {
  const label =
    t.kind === "transfer"
      ? "Transfer"
      : t.kind === "debt"
        ? "Debt"
        : t.reimbursed
          ? "Reimbursed"
          : t.reviewed && t.category_id !== "unsorted"
            ? "Sorted"
            : "To sort";
  return (
    <span
      className={`pill ${label === "To sort" ? "waiting" : label === "Sorted" || label === "Reimbursed" ? "good" : ""}`}
    >
      <i />
      {label}
    </span>
  );
}
export default function Workspace() {
  return <AmountPrivacyProvider><WorkspaceContent /></AmountPrivacyProvider>;
}
function WorkspaceContent() {
  const { money, hidden } = usePrivateAmounts();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const rowsRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const dashboardKey = useRef("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<View>("home"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [entity, setEntity] = useState("me"),
    [data, setData] = useState<Data | null>(null),
    [rows, setRows] = useState<Transaction[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<Transaction | null>(null),
    [search, setSearch] = useState(""),
    [account, setAccount] = useState(""),
    [category, setCategory] = useState(""),
    [person, setPerson] = useState(""),
    [trip, setTrip] = useState(""),
    [direction, setDirection] = useState(""),
    [work, setWork] = useState(false),
    [sortIndex, setSortIndex] = useState(0),
    [undo, setUndo] = useState<Transaction | null>(null),
    [debt, setDebt] = useState<Debt | null>(null),
    [panelError, setPanelError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null),
    undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    loaded = useRef(false);
  const refresh = useCallback(async (force = true) => {
    const request = ++dashboardRequest.current;
    if (force) clearDataCache();
    const key = `/api/data?month=${month}&entity=${entity}`;
    const cached = cachedData<Data>(key);
    if (cached || dashboardKey.current !== key) {
      setData(cached ?? null);
      setLoading(!cached);
    }
    dashboardKey.current = key;
    setError("");
    try {
      const b = await readData<Data>(key);
      if (request !== dashboardRequest.current) return;
      setData(b);
      if (
        !loaded.current &&
        !b.accounts.some((a: { synced_at: string | null }) => a.synced_at) &&
        b.imports.length === 0
      )
        setView("import");
      loaded.current = true;
    } catch (e) {
      if (request === dashboardRequest.current && !(e instanceof Error && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Could not load your numbers.");
    } finally {
      if (request === dashboardRequest.current) setLoading(false);
    }
  }, [month, entity]);
  useEffect(() => {
    const requestCounter = dashboardRequest;
    void refresh(false);
    return () => { requestCounter.current++; };
  }, [refresh]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), search ? 180 : 0);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const loadRows = useCallback(async () => {
    if (!["money", "sort", "months", "people", "trips"].includes(view)) return;
    const request = ++rowsRequest.current;
    try {
      const filters: Record<string, unknown> = { entity, limit: 10000 };
      if (view === "sort") filters.unsorted = true;
      else filters.month = month;
      if (debouncedSearch) filters.query = debouncedSearch;
      if (account) filters.account = account;
      if (category) filters.category = category;
      if (person) filters.person = person;
      if (trip) filters.trip = trip;
      if (direction) filters.direction = direction;
      if (work) filters.reimbursable = true;
      const key = "/api/data?action=transactions&filters=" + encodeURIComponent(JSON.stringify(filters));
      const cached = cachedData<Transaction[]>(key);
      setRows(cached ?? []);
      setRowsLoading(!cached);
      const b = await readData<Transaction[]>(key);
      if (request === rowsRequest.current) setRows(b);
    } catch (e) {
      if (request === rowsRequest.current && !(e instanceof Error && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Could not load money.");
    } finally {
      if (request === rowsRequest.current) setRowsLoading(false);
    }
  }, [
    view,
    entity,
    month,
    debouncedSearch,
    account,
    category,
    person,
    trip,
    direction,
    work,
  ]);
  useEffect(() => {
    const requestCounter = rowsRequest;
    void loadRows();
    return () => { requestCounter.current++; };
  }, [loadRows]);
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
        void loadRows();
      }
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, [refresh, loadRows]);
  const navigate = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
    setSearch("");
    setDebouncedSearch("");
    setAccount("");
    setCategory("");
    setPerson("");
    setTrip("");
    setDirection("");
    setWork(false);
    setSortIndex(0);
  }, []);
  useEffect(() => {
    if (!selected && !debt) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (debt)
      document.querySelector<HTMLElement>('[aria-label="Close debt"]')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.defaultPrevented) return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".sheet button:not(:disabled),.sheet input,.sheet select,.sheet textarea",
        ),
      ).filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [selected, debt]);
  const mutate = async (action: string, b: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const r = await api(action, b);
      await Promise.all([refresh(), loadRows()]);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  async function pick(cat: string, transaction?: Transaction): Promise<boolean> {
    const t = transaction || rows[sortIndex];
    if (!t || busy || rowsLoading) return false;
    try {
      await mutate("update", {
        id: t.id,
        changes: {
          category_id: cat === "__transfer" ? "unsorted" : cat === "__debt" ? "loan" : cat,
          reviewed: 1,
          kind: cat === "__transfer" ? "transfer" : cat === "__debt" ? "debt" : t.amount_cents > 0 ? "income" : "spend",
        },
      });
      setUndo(t);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
      setSortIndex(0);
      return true;
    } catch { return false; }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target as HTMLElement).closest(
          '[role="listbox"],[role="option"],[role="combobox"]',
        )
      )
        return;
      if (e.key === "Escape") {
        setSelected(null);
        setDebt(null);
      }
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (e.key === "/") {
        e.preventDefault();
        setView("money");
        searchRef.current?.focus();
      }
      if ((e.key === "j" || e.key === "k") && rows.length) {
        e.preventDefault();
        const current = selected
          ? rows.findIndex((r) => r.id === selected.id)
          : -1;
        setSelected(
          rows[
            Math.min(
              rows.length - 1,
              Math.max(0, current + (e.key === "j" ? 1 : -1)),
            )
          ],
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const title = new Date(month + "-01T12:00:00").toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
  const debtTotal =
    data?.debts.reduce(
      (s, d) => s + Math.round(d.balance_cents * d.fx_aud),
      0,
    ) || 0;
  const header = (
    <>
      <div>
        <span className="eyebrow">
          {entity === "all"
            ? "ALL ENTITIES"
            : entity === "me"
              ? "PERSONAL"
              : entity === "business-one"
                ? "BUSINESS ONE"
                : "BUSINESS TWO"}{" "}
          / OVERVIEW
        </span>
        <h1>
          {view === "home" || view === "money"
            ? title
            : views.find((v) => v.id === view)?.label || "Settings"}
        </h1>
      </div>
      <div className="header-actions">
        <div className="month-switch">
          <button
            className="icon"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </button>
          <span>
            {new Date(month + "-01").toLocaleDateString("en-AU", {
              month: "short",
              year: "numeric",
            })}
          </span>
          <button
            className="icon"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </button>
        </div>
        <button
          className="secondary desktop"
          onClick={() => navigate("import")}
        >
          <RefreshCw size={16} /> Sync bank
        </button>
      </div>
    </>
  );
  return (
    <div className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="rail">
        <button
          type="button"
          className="brand sidebar-toggle"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="sidebar-navigation"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed(value => !value)}
        >
          <Image className="oryx-logo" src="/app-mark.svg" alt="ORYX" width={72} height={72} />
        </button>
        <div className="entity-switch">
          <span className="eyebrow">YOUR VIEW</span>
          <CustomSelect
            aria-label="Entity"
            variant="entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <SelectOption value="me">Me</SelectOption>
            <SelectOption value="business-one">Business One</SelectOption>
            <SelectOption value="business-two">Business Two</SelectOption>
            <SelectOption value="all">All entities</SelectOption>
          </CustomSelect>
        </div>
        <nav id="sidebar-navigation">
          {views.map((v, i) => (
            <div key={v.id}>
              {[0, 4, 7].includes(i) && (
                <div className="nav-group">
                  {i === 0 ? "MONEY" : i === 4 ? "VIEWS" : "SETTINGS"}
                </div>
              )}
              <button
                className={`nav-item ${view === v.id ? "active" : ""}`}
                aria-label={v.label}
                title={sidebarCollapsed ? v.label : undefined}
                onClick={() => navigate(v.id)}
              >
                <v.icon size={18} />
                <span className="nav-label">{v.label}</span>
                {v.id === "sort" && !!data?.unsorted && (
                  <span className="badge">{data.unsorted}</span>
                )}
              </button>
            </div>
          ))}
          <a className="nav-item" href="/api/data?action=export" aria-label="Export CSV" title={sidebarCollapsed ? "Export CSV" : undefined}>
            <Download size={18} />
            <span className="nav-label">Export CSV</span>
          </a>
        </nav>
        <div className="rail-bottom">
          <div className="sidebar-privacy">
            <div className="sidebar-privacy-copy">
              <span className="sidebar-privacy-label">Privacy</span>
              <span className="sidebar-privacy-status" role="status">
                {hidden ? "Amounts hidden" : "Amounts visible"}
              </span>
            </div>
            <AmountPrivacyToggle />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <AmountPrivacyToggle />
          <div className="breadcrumb">
            <span className="mobile-brand"><Image className="oryx-logo" src="/app-mark.svg" alt="" width={28} height={28} /> ORYX</span>
            <span className="desktop">
              Money <span className="slash">/</span>
            </span>
            <b>{views.find((v) => v.id === view)?.label || "Settings"}</b>
          </div>
          <label className="global-search desktop">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Search transactions"
              placeholder="Search your money…"
              value={search}
              onFocus={() => setView("money")}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <button
            className="primary import-top"
            onClick={() => navigate("import")}
          >
            <Plus size={16} /> Import
          </button>
          <button
            className="secondary topbar-profile"
            aria-label="Demo User, open settings"
            title="Profile and settings"
            onClick={() => navigate("settings")}
          >
            <span className="topbar-avatar" aria-hidden="true">DU</span>
            <span className="topbar-profile-name">Demo User</span>
            <Settings size={14} aria-hidden="true" />
          </button>
        </header>
        {offline && (
          <div role="status" className="offline">
            <WifiOff size={16} />
            No internet. Showing your last numbers.
          </div>
        )}
        <main className="content">
          <div className="page-heading">{header}</div>
          <div className="mobile entity-mobile">
            <label>
              Entity
              <CustomSelect
                aria-label="Mobile entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
              >
                <SelectOption value="me">Me</SelectOption>
                <SelectOption value="business-one">B1</SelectOption>
                <SelectOption value="business-two">B2</SelectOption>
                <SelectOption value="all">All</SelectOption>
              </CustomSelect>
            </label>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="secondary"
                onClick={() => {
                  refresh();
                  loadRows();
                }}
              >
                Try again
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon"
                aria-label="Dismiss"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading && !data ? (
            <>
              <div className="stats">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 140 }} />
                ))}
              </div>
              <div className="skeleton" style={{ height: 330 }} />
            </>
          ) : (
            data && (
              <>
                {view === "home" && (
                  <>
                    <div className="stats">
                      {[
                        {
                          label: "KEPT",
                          value: data.totals.kept,
                          previous: data.previousTotals.kept,
                        },
                        {
                          label: "IN",
                          value: data.totals.in,
                          previous: data.previousTotals.in,
                        },
                        {
                          label: "OUT",
                          value: data.totals.out,
                          previous: data.previousTotals.out,
                        },
                        { label: "DEBT", value: debtTotal, previous: null },
                      ].map((s, i) => (
                        <section
                          className={`stat-tray stat-${i}`}
                          key={s.label}
                        >
                          <div className="stat">
                            <div className="metric-heading">
                              <span className="metric-icon" aria-hidden="true">
                                {i === 0 ? <Vault size={22} strokeWidth={1.25} /> : i === 1 ? <BanknoteArrowDown size={22} strokeWidth={1.25} /> : i === 2 ? <BanknoteArrowUp size={22} strokeWidth={1.25} /> : <BookOpen size={22} strokeWidth={1.25} />}
                              </span>
                              <span className="metric-heading-copy">
                                <span className="metric-name">{["Money kept", "Money in", "Money out", "Debt"][i]}</span>
                                <span className="metric-caption">{i === 3 ? "Outstanding balance" : "This month"}</span>
                              </span>
                            </div>
                            <div className="stat-line">
                              <strong>
                                {hidden ? "" : i === 2 ? "-" : i === 1 ? "+" : ""}
                                <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(s.value)}</span>
                              </strong>
                              <StatSpark label={s.label === "DEBT" ? "Owed" : s.label === "KEPT" ? "Kept" : i === 1 ? "In" : "Out"}
                                points={i === 3 ? data.debts.map(d => ({label:d.name,value:Math.round(d.balance_cents*d.fx_aud)})) : data.days.filter(d => d.date <= today()).slice(-12).map(d => ({label:dayLabel(d.date),value:i === 0 ? d.in-d.out : i === 1 ? d.in : -d.out}))} />

                            </div>
                          </div>
                          <div className="stat-foot">
                            {s.previous === null ? <span className="metric-debt-note">Across your recorded debts</span> : (
                              <>
                                <span
                                  className={
                                    s.value - s.previous > 0 ? "delta" : "muted"
                                  }
                                >
                                  {!hidden && s.value - s.previous >= 0 ? "+" : ""}
                                  <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(s.value - s.previous)}</span>
                                </span>
                                <span>vs last month</span>
                              </>
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                    <div className="chart-grid">
                      <Tray
                        title="SPEND BY DAY"
                        aside={<span className="mini-label">DAILY / AUD</span>}
                      >
                        <div className="chart-top">
                          <div>
                            <span className="muted">Out this month</span>
                            <h2 className="mono">{!hidden && "−"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(data.totals.out)}</span></h2>
                          </div>
                          <div className="chart-legend">
                            <span><i /> Money out</span>
                            <span><i className="ghost" /> Scale</span>
                          </div>

                        </div>
                        <SpendChart days={data.days} />
                      </Tray>
                      <Tray
                        title="WHERE IT WENT"
                        aside={<ArrowUpRight size={16} />}
                      >
                        <div className="silver-categories" aria-label="Spending by category">
                          {data.leaks.slice(0, 7).map(c => (
                            <button key={c.id} onClick={() => {navigate("money");setCategory(c.id);}} aria-label={`${c.name}, out ${money(c.amount)}. View transactions.`}>
                              <span className="silver-category-label"><span>{c.name}</span><b>{!hidden && "-"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(c.amount)}</span></b></span>
                              <span className="silver-category-track" aria-hidden="true">
                                {Array.from({ length: 28 }, (_, index) => (
                                  <i key={index} className={index < Math.max(c.amount > 0 ? 1 : 0, Math.round(c.amount / Math.max(...data.leaks.map(l => l.amount), 1) * 28)) ? "ink-cell" : undefined} />
                                ))}
                              </span>
                            </button>
                          ))}
                          {!data.leaks.length && <p className="muted">No spending recorded this month.</p>}
                        </div>
                      </Tray>
                    </div>
                    <Tray
                      title="LATEST MONEY"
                      aside={
                        <button
                          className="text-button"
                          onClick={() => navigate("money")}
                        >
                          View all <ArrowUpRight size={14} />
                        </button>
                      }
                    >
                      <MoneyTable rows={data.latest} onSelect={setSelected} />
                    </Tray>
                    <div className="lower-grid">
                      <Tray title="THIS WEEK">
                        <strong className="medium-number">
                          {!hidden && "−"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(data.week.current)}</span>
                        </strong>
                        <p className="muted">
                          Compared with <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(data.week.average)}</span> a week over
                          the previous four weeks.
                        </p>
                        <span
                          className={`pill ${data.week.current <= data.week.average ? "good" : "bad"}`}
                        >
                          <i />
                          <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(
                            Math.abs(data.week.average - data.week.current),
                          )}</span>{" "}
                          {data.week.current <= data.week.average
                            ? "under your usual"
                            : "over your usual"}
                        </span>
                      </Tray>
                      <Tray title="LEAKS / TOP FIVE">
                        <div className="leaks">
                          {data.leaks.slice(0, 5).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                navigate("money");
                                setCategory(c.id);
                              }}
                            >
                              <span>
                                {c.name}
                                <small>
                                  {c.average
                                    ? `${Math.round(((c.amount - c.average) / c.average) * 100) > 0 ? "+" : ""}${Math.round(((c.amount - c.average) / c.average) * 100)}% vs 3-month average`
                                    : "No previous spending"}
                                </small>
                              </span>
                              <b><span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(c.amount)}</span></b>
                            </button>
                          ))}
                          {!data.leaks.length && (
                            <p className="muted">
                              Categories will appear as money comes in.
                            </p>
                          )}
                        </div>
                      </Tray>
                    </div>
                    {data.totals.work > 0 && (
                      <div className="notice">
                        Work buys awaiting reimbursement:{" "}
                        <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(data.totals.work)}</span>. Included in Out until marked
                        reimbursed.
                      </div>
                    )}
                    {data.foreignCount > 0 && (
                      <div className="notice">
                        {data.foreignCount} foreign-currency lines are excluded
                        from AUD totals.
                      </div>
                    )}
                  </>
                )}
                {rowsLoading &&
                  ["money", "sort", "months", "people", "trips"].includes(
                    view,
                  ) && (
                    <div
                      className="skeleton"
                      aria-label="Loading money"
                      style={{ height: 320 }}
                    />
                  )}
                {["money", "months", "people", "trips"].includes(view) && (
                  <>
                    <div className="filters">
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          aria-label="Search money"
                          value={search}
                          placeholder="Merchant, note or bank text"
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <CustomSelect
                        aria-label="Account filter"
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                      >
                        <SelectOption value="">All accounts</SelectOption>
                        {data.accounts.map((a) => (
                          <SelectOption key={a.id} value={a.id}>
                            {a.name}
                          </SelectOption>
                        ))}
                      </CustomSelect>
                      <CustomSelect
                        aria-label="Category filter"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <SelectOption value="">All categories</SelectOption>
                        {data.categories.map((c) => (
                          <SelectOption key={c.id} value={c.id}>
                            {c.name}
                          </SelectOption>
                        ))}
                      </CustomSelect>
                      <CustomSelect
                        aria-label="In or out filter"
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                      >
                        <SelectOption value="">In and out</SelectOption>
                        <SelectOption value="in">In</SelectOption>
                        <SelectOption value="out">Out</SelectOption>
                      </CustomSelect>
                      <CustomSelect
                        aria-label="Person filter"
                        value={person}
                        onChange={(e) => setPerson(e.target.value)}
                      >
                        <SelectOption value="">All people</SelectOption>
                        {data.people.map((p) => (
                          <SelectOption key={p.id} value={p.id}>
                            {p.name}
                          </SelectOption>
                        ))}
                      </CustomSelect>
                      <CustomSelect
                        aria-label="Trip filter"
                        value={trip}
                        onChange={(e) => setTrip(e.target.value)}
                      >
                        <SelectOption value="">All trips</SelectOption>
                        {data.trips.map((t) => (
                          <SelectOption key={t.id} value={t.id}>
                            {t.name}
                          </SelectOption>
                        ))}
                      </CustomSelect>
                      <button
                        className={`chip ${work ? "selected" : ""}`}
                        onClick={() => setWork(!work)}
                      >
                        Work buys
                      </button>
                    </div>
                    <div className="view-chips">
                      {(["money", "months", "people", "trips"] as View[]).map(
                        (v) => (
                          <button
                            key={v}
                            className={`chip ${view === v ? "selected" : ""}`}
                            onClick={() => setView(v)}
                          >
                            {v === "money"
                              ? "All"
                              : v === "months"
                                ? "By month"
                                : v === "people"
                                  ? "People"
                                  : "Trips"}
                          </button>
                        ),
                      )}
                      <span className="muted mono">
                        {rows.length.toLocaleString()} lines
                        {rows.length === 10000 ? " · first 10,000" : ""}
                      </span>
                    </div>
                    {!rowsLoading && view === "money" && (
                      <Tray title="EVERY LINE">
                        <MoneyTable
                          rows={rows}
                          onSelect={setSelected}
                          grouped
                        />
                      </Tray>
                    )}
                    {!rowsLoading && view === "months" && (
                      <Tray title={title.toUpperCase()}>
                        <div className="month-summary">
                          {Object.entries(
                            summary(rows.filter((t) => t.currency === "AUD")),
                          )
                            .filter(([k]) => k !== "work")
                            .map(([k, v]) => (
                              <div key={k}>
                                <span className="eyebrow">{k}</span>
                                <strong><span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(v)}</span></strong>
                              </div>
                            ))}
                        </div>
                        {data.categories.map((c) => {
                          const lines = rows.filter(
                            (t) => t.category_id === c.id,
                          );
                          return (
                            lines.length > 0 && (
                              <details className="category-detail" key={c.id}>
                                <summary>
                                  <span>
                                    {c.name} <small>{lines.length} lines</small>
                                  </span>
                                  <b>
                                    <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(
                                      lines.reduce(
                                        (s, t) => s + t.amount_cents,
                                        0,
                                      ),
                                    )}</span>
                                  </b>
                                  <ChevronDown size={16} />
                                </summary>
                                <MoneyTable
                                  rows={lines}
                                  onSelect={setSelected}
                                />
                              </details>
                            )
                          );
                        })}
                      </Tray>
                    )}
                    {!rowsLoading && view === "people" && (
                      <>
                        {data.people.map((p) => {
                          const lines = rows.filter(
                            (t) => t.person_id === p.id,
                          );
                          const gave = -lines.reduce(
                              (s, t) => s + Math.min(t.amount_cents, 0),
                              0,
                            ),
                            got = lines.reduce(
                              (s, t) => s + Math.max(t.amount_cents, 0),
                              0,
                            );
                          return (
                            <Tray key={p.id} title={p.name.toUpperCase()}>
                              <div className="month-summary">
                                <div>
                                  <small>Gave</small>
                                  <strong>{!hidden && "−"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(gave)}</span></strong>
                                </div>
                                <div>
                                  <small>Got back</small>
                                  <strong>{!hidden && "+"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(got)}</span></strong>
                                </div>
                                <div>
                                  <small>Net</small>
                                  <strong><span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(got - gave)}</span></strong>
                                </div>
                              </div>
                              <MoneyTable rows={lines} onSelect={setSelected} />
                            </Tray>
                          );
                        })}
                        <CreateNamed
                          type="person"
                          onSave={async (b) => {
                            await mutate("person", b);
                          }}
                        />
                      </>
                    )}
                    {!rowsLoading && view === "trips" && (
                      <>
                        {data.trips.map((t) => (
                          <Tray
                            key={t.id}
                            title={t.name.toUpperCase()}
                            aside={
                              <span className="mono">
                                <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(
                                  -rows
                                    .filter((r) => r.trip_id === t.id)
                                    .reduce((s, r) => s + r.amount_cents, 0),
                                )}</span>
                              </span>
                            }
                          >
                            <p className="muted">
                              {t.start_date} to {t.end_date}
                            </p>
                            <MoneyTable
                              rows={rows.filter((r) => r.trip_id === t.id)}
                              onSelect={setSelected}
                            />
                          </Tray>
                        ))}
                        <CreateNamed
                          type="trip"
                          onSave={async (b) => {
                            await mutate("trip", b);
                          }}
                        />
                      </>
                    )}
                  </>
                )}
                {view === "sort" && (
                  <SortBoard key={entity} rows={rows} categories={data.categories} entity={entity}
                    onRefresh={() => Promise.all([refresh(), loadRows()])} busy={busy || rowsLoading} assign={pick}
                    addCategory={(name) => mutate("category", {name})} />
                )}
                {view === "debt" && (
                  <>
                    <Tray title="TOTAL OWED">
                      <div className="debt-hero">
                        <strong><span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(debtTotal)}</span></strong>
                        <span className="muted">
                          AUD, including approximate USD conversion
                        </span>
                      </div>
                      <DebtChart debts={data.debts} payments={data.payments} />
                      <p className="muted">
                        Recorded balances. Logging a payment records money
                        already paid and never moves money.
                      </p>
                    </Tray>
                    <div className="debt-grid">
                      {data.debts.map((d) => {
                        const progress = Math.max(
                          0,
                          1 - d.balance_cents / Math.max(d.start_cents, 1),
                        );
                        const period =
                          d.payment_every === "week"
                            ? 7
                            : d.payment_every === "fortnight"
                              ? 14
                              : d.payment_every === "year"
                                ? 365
                                : 30.4375;
                        const payoff = d.payment_cents
                          ? new Date(
                              new Date(today() + "T12:00:00Z").getTime() +
                                Math.ceil(d.balance_cents / d.payment_cents) *
                                  period *
                                  86400000,
                            ).toLocaleDateString("en-AU", {
                              month: "short",
                              year: "numeric",
                            })
                          : null;
                        const fy =
                          Number(today().slice(0, 4)) -
                          (Number(today().slice(5, 7)) < 7 ? 1 : 0);
                        const paid = data.payments
                          .filter(
                            (p) =>
                              p.debt_id === d.id &&
                              p.date >= `${fy}-07-01` &&
                              p.date < `${fy + 1}-07-01`,
                          )
                          .reduce((s, p) => s + p.amount_cents, 0);
                        return (
                          <Tray key={d.id} title={d.name.toUpperCase()}>
                            <div className="debt-card-top">
                              <strong className="medium-number">
                                <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(d.balance_cents, d.currency)}</span>
                              </strong>
                              <span className="pill">{d.currency}</span>
                            </div>
                            <div className="progress">
                              <i style={{ width: progress * 100 + "%" }} />
                            </div>
                            <p>
                              {Math.round(progress * 100)}% paid · Started at{" "}
                              <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(d.start_cents, d.currency)}</span>
                            </p>
                            <p className="muted">
                              {d.payment_cents
                                ? `${money(d.payment_cents, d.currency)} each ${d.payment_every}`
                                : "No regular payment set"}
                              {payoff
                                ? ` · Estimate ${payoff}, before interest and fees`
                                : ""}
                            </p>
                            {["business-two", "business-one"].includes(d.id) && (
                              <div className="loan-note">
                                Due 30 June:{" "}
                                {d.annual_minimum_cents === null
                                  ? "Yearly minimum needs accountant confirmation"
                                  : `${money(Math.max(0, d.annual_minimum_cents - paid))} left this financial year`}
                              </div>
                            )}
                            <p className="muted small">{d.note}</p>
                            <button
                              className="secondary"
                              onClick={() => {
                                setDebt(d);
                                setPanelError("");
                              }}
                            >
                              Log payment / edit
                            </button>
                          </Tray>
                        );
                      })}
                    </div>
                  </>
                )}
                {view === "import" && (
                  <ImportPanel
                    data={data}
                    refresh={refresh}
                    notify={setNotice}
                  />
                )}
                {view === "rules" && (
                  <Tray title="YOUR RULES">
                    <p className="muted">
                      Rules match words in bank descriptions. Transfer rules run
                      first.
                    </p>
                    <div className="rule-list">
                      {data.rules.map((r) => (
                        <div key={r.id}>
                          <span>
                            <b>{r.pattern.replace(/^exact:[^:]+:/, "")}</b>
                            <small>
                              {r.merchant || "Keep merchant"} ·{" "}
                              {r.kind === "transfer"
                                ? "Own-account transfer"
                                : data.categories.find(
                                    (c) => c.id === r.category_id,
                                  )?.name || "Keep category"}
                              {r.pattern.startsWith("exact:")
                                ? " · Matching description in one account"
                                : ""}
                              {r.entity ? ` · ${r.entity.toUpperCase()}` : ""}
                            </small>
                          </span>
                          <button
                            className="icon"
                            aria-label={`Delete rule ${r.pattern}`}
                            onClick={() =>
                              mutate("delete-rule", { id: r.id }).catch(
                                () => {},
                              )
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <RuleForm
                      data={data}
                      onSave={async (rule) => {
                        await mutate("rule", { rule });
                      }}
                    />
                  </Tray>
                )}
                {view === "settings" && (
                  <>
                    <Tray title="ACCOUNTS">
                      <p className="muted">Changes here affect ORYX only.</p>
                      {data.accounts.map((a) => (
                        <form
                          className="account-edit"
                          key={a.id}
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            try {
                              await mutate("account", {
                                id: a.id,
                                name: f.get("name"),
                                entity: f.get("entity"),
                                active: f.get("active") === "on",
                              });
                              setNotice("Account saved.");
                            } catch {}
                          }}
                        >
                          <label>
                            Name
                            <input name="name" defaultValue={a.name} required />
                          </label>
                          <label>
                            Entity
                            <CustomSelect name="entity" defaultValue={a.entity}>
                              <SelectOption value="me">Me</SelectOption>
                              <SelectOption value="business-one">
                                Business One
                              </SelectOption>
                              <SelectOption value="business-two">
                                Business Two
                              </SelectOption>
                            </CustomSelect>
                          </label>
                          <label className="check">
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={!!a.active}
                            />
                            Active · •{a.last4}
                          </label>
                          <button className="secondary" disabled={busy}>
                            Save
                          </button>
                        </form>
                      ))}
                    </Tray>
                    <Tray title="CATEGORIES">
                      <div className="view-chips">
                        {data.categories.map((c) => (
                          <span className="pill" key={c.id}>
                            {c.name}
                          </span>
                        ))}
                      </div>
                      <form
                        className="inline-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          try {
                            await mutate("category", {
                              name: new FormData(form).get("name"),
                            });
                            form.reset();
                          } catch {}
                        }}
                      >
                        <label>
                          New category
                          <input name="name" required maxLength={80} />
                        </label>
                        <button className="secondary">Add category</button>
                      </form>
                    </Tray>
                    <Tray title="YOUR ACCOUNT">
                      <p>Passkey sign-in. Sessions last 30 days.</p>
                      <a
                        className="button secondary"
                        href="/api/data?action=export"
                      >
                        <Download size={16} /> Export all money as CSV
                      </a>
                      <button
                        className="secondary"
                        onClick={async () => {
                          await fetch("/api/auth/logout", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: "{}",
                          });
                          clearDataCache();
                          location.reload();
                        }}
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </Tray>
                  </>
                )}
              </>
            )
          )}
        </main>
      </div>
      <nav className="bottom-nav">
        {views.slice(0, 4).map((v) => (
          <button
            key={v.id}
            className={view === v.id ? "active" : ""}
            onClick={() => navigate(v.id)}
          >
            <v.icon size={22} />
            <span>
              {v.label}
              {v.id === "sort" && !!data?.unsorted && <i>{data.unsorted}</i>}
            </span>
          </button>
        ))}
      </nav>
      {selected && data && (
        <Detail
          transaction={selected}
          data={data}
          busy={busy}
          close={() => setSelected(null)}
          save={async (changes) => {
            await mutate("update", { id: selected.id, changes });
            setSelected(null);
          }}
          addRule={async (rule) => {
            await mutate("rule", { rule });
          }}
        />
      )}
      {debt && (
        <div className="overlay" onClick={() => setDebt(null)}>
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Debt details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon close"
              onClick={() => setDebt(null)}
              aria-label="Close debt"
            >
              <X />
            </button>
            <h2>{debt.name}</h2>
            <p className="muted">Record a payment you have already made.</p>
            {panelError && (
              <p className="error" role="alert">
                {panelError}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await mutate("payment", {
                    debt_id: debt.id,
                    amount_cents: cents(String(f.get("amount"))),
                    date: f.get("date"),
                  });
                  setDebt(null);
                } catch (e) {
                  setPanelError(
                    e instanceof Error ? e.message : "Could not save payment.",
                  );
                }
              }}
            >
              <label>
                Payment ({debt.currency})
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="185.00"
                />
              </label>
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </label>
              <button disabled={busy}>Record payment</button>
            </form>
            <hr />
            <h3>Edit recorded debt</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await mutate("debt", {
                    id: debt.id,
                    balance_cents: cents(String(f.get("balance"))),
                    payment_cents: cents(String(f.get("payment"))),
                    annual_minimum_cents: f.get("minimum")
                      ? cents(String(f.get("minimum")))
                      : null,
                    note: f.get("note"),
                  });
                  setDebt(null);
                } catch (e) {
                  setPanelError(
                    e instanceof Error ? e.message : "Could not save debt.",
                  );
                }
              }}
            >
              <label>
                Balance
                <input
                  name="balance"
                  defaultValue={(debt.balance_cents / 100).toFixed(2)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Regular payment
                <input
                  name="payment"
                  defaultValue={(debt.payment_cents / 100).toFixed(2)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Yearly minimum, if confirmed
                <input
                  name="minimum"
                  defaultValue={
                    debt.annual_minimum_cents === null
                      ? ""
                      : (debt.annual_minimum_cents / 100).toFixed(2)
                  }
                  inputMode="decimal"
                />
              </label>
              <label>
                Note
                <textarea name="note" defaultValue={debt.note} />
              </label>
              <button className="secondary" disabled={busy}>
                Save debt
              </button>
            </form>
          </section>
        </div>
      )}
      {undo && (
        <div className="toast" role="status">
          <Check size={16} />
          Category saved
          <button
            className="text-button"
            onClick={async () => {
              try {
                await mutate("update", {
                  id: undo.id,
                  changes: {
                    category_id: undo.category_id,
                    reviewed: undo.reviewed,
                    kind: undo.kind,
                  },
                });
                setUndo(null);
              } catch {}
            }}
          >
            <Undo2 size={16} />
            Undo
          </button>
        </div>
      )}

    </div>
  );
}
function MoneyTable({
  rows,
  onSelect,
  grouped = false,
}: {
  rows: Transaction[];
  onSelect: (t: Transaction) => void;
  grouped?: boolean;
}) {
  const { money, spoken, hidden } = usePrivateAmounts();
  const scroll = useRef<HTMLDivElement>(null);
  // React Compiler skips this component: TanStack Virtual returns mutable helpers.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 64,
    overscan: 8,
  });
  if (!rows.length)
    return (
      <Empty text="No money here yet. Change the filters or import your records." />
    );
  const render = (t: Transaction, i: number) => {
    const first = grouped && (i === 0 || rows[i - 1].date !== t.date);
    return (
      <div key={t.id}>
        {first && rows.length <= 200 && (
          <div className="day-heading">
            <span>{dayLabel(t.date)}</span>
            <b>
              <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(
                rows
                  .filter((r) => r.date === t.date)
                  .reduce((s, r) => s + r.amount_cents, 0),
              )}</span>
            </b>
          </div>
        )}
        <button className="money-row" onClick={() => onSelect(t)}>
          <span className="date-cell">{dayLabel(t.date)}</span>
          <span className="merchant">
            <span className="merchant-icon">
              {t.kind === "transfer" ? (
                <ArrowLeftRight size={15} />
              ) : t.amount_cents > 0 ? (
                <ArrowDownLeft size={15} />
              ) : (
                t.merchant.charAt(0).toUpperCase()
              )}
            </span>
            <span>
              <b>{t.merchant}</b>
              <small>
                {t.kind === "transfer"
                  ? "Transfer"
                  : t.kind === "debt"
                    ? "Debt"
                    : t.category || "Unsorted"}{" "}
                · {t.account}
              </small>
            </span>
          </span>
          <span className="category-cell">
            {t.kind === "transfer" || t.kind === "debt" ? (
              <Pill t={t} />
            ) : (
              <span className="pill">{t.category || "Unsorted"}</span>
            )}
          </span>
          <span className="account-cell">
            <i />
            {t.account}
          </span>
          <span
            className={`amount ${t.amount_cents > 0 ? "positive" : ""}`}
            aria-label={spoken(t.amount_cents)}
          >
            {!hidden && t.amount_cents > 0 ? "+" : ""}
            <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(t.amount_cents, t.currency)}</span>
            <small>
              {t.kind === "transfer"
                ? "Transfer"
                : t.amount_cents < 0
                  ? "Out"
                  : "In"}
            </small>
          </span>
          <span className="row-menu">
            <MoreHorizontal size={18} />
          </span>
        </button>
      </div>
    );
  };
  return (
    <>
      <div className="table-head privacy-table-head">
        <span>DATE</span>
        <span>MERCHANT</span>
        <span>CATEGORY</span>
        <span>ACCOUNT</span>
        <span>AMOUNT</span>
        <AmountPrivacyToggle />
      </div>
      {rows.length > 200 ? (
        <div ref={scroll} className="virtual-list">
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => (
              <div
                key={rows[v.index].id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${v.start}px)`,
                }}
              >
                {render(rows[v.index], v.index)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        rows.map(render)
      )}
    </>
  );
}
function Detail({
  transaction: t,
  data,
  busy,
  close,
  save,
  addRule,
}: {
  transaction: Transaction;
  data: Data;
  busy: boolean;
  close: () => void;
  save: (c: Record<string, unknown>) => Promise<void>;
  addRule: (r: Record<string, unknown>) => Promise<void>;
}) {
  const { money, hidden } = usePrivateAmounts();
  const [cat, setCat] = useState(t.category_id),
    [error, setError] = useState(""),
    [children, setChildren] = useState<Transaction[]>([]);
  const ref = useRef<HTMLElement>(null),
    touch = useRef(0);
  useEffect(() => {
    ref.current?.focus();
    fetch("/api/data?action=detail&id=" + encodeURIComponent(t.id))
      .then((r) => r.json())
      .then((b) => setChildren(b.children || []));
  }, [t.id]);
  return (
    <div className="overlay" onClick={close}>
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Money details"
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const els = ref.current?.querySelectorAll<HTMLElement>(
              "button,input,select,textarea",
            );
            if (!els?.length) return;
            const first = els[0],
              last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div
          className="drag-handle"
          onTouchStart={(e) => (touch.current = e.touches[0].clientY)}
          onTouchEnd={(e) => {
            if (e.changedTouches[0].clientY - touch.current > 70) close();
          }}
        />
        <button
          className="icon close"
          aria-label="Close detail"
          onClick={close}
        >
          <X />
        </button>
        <span className="eyebrow">
          {dayLabel(t.date)} / {t.account}
        </span>
        <h2>{t.merchant}</h2>
        <strong className="detail-amount">
          <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(t.amount_cents, t.currency)}</span>
        </strong>
        <Pill t={t} />
        <h3>Bank description</h3>
        <p className="raw-text">{t.raw_description}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              if (f.get("always"))
                await addRule({
                  pattern: t.merchant,
                  merchant: t.merchant,
                  category_id: cat,
                  entity: t.entity,
                });
              await save({
                category_id: cat,
                reviewed: 1,
                person_id: f.get("person") || null,
                trip_id: f.get("trip") || null,
                note: f.get("note"),
                kind: f.get("kind"),
                reimbursable: f.get("work") === "on",
                reimbursed: f.get("repaid") === "on",
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save.");
            }
          }}
        >
          <label>Category</label>
          <div className="category-grid">
            {data.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`secondary ${cat === c.id ? "selected" : ""}`}
                onClick={() => setCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" name="always" />
            Always do this for {t.merchant}
          </label>
          <label>
            Kind
            <CustomSelect name="kind" defaultValue={t.kind}>
              <SelectOption value="income">Income</SelectOption>
              <SelectOption value="spend">Spend</SelectOption>
              <SelectOption value="transfer">Own-account transfer</SelectOption>
              <SelectOption value="debt">Debt / director loan</SelectOption>
            </CustomSelect>
          </label>
          <label>
            Person
            <CustomSelect name="person" defaultValue={t.person_id || ""}>
              <SelectOption value="">No person</SelectOption>
              {data.people.map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  {p.name}
                </SelectOption>
              ))}
            </CustomSelect>
          </label>
          <label>
            Trip
            <CustomSelect name="trip" defaultValue={t.trip_id || ""}>
              <SelectOption value="">No trip</SelectOption>
              {data.trips.map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  {p.name}
                </SelectOption>
              ))}
            </CustomSelect>
          </label>
          <label>
            Note
            <textarea name="note" defaultValue={t.note} />
          </label>
          <label className="check">
            <input
              name="work"
              type="checkbox"
              defaultChecked={!!t.reimbursable}
            />
            Reimbursable work buy
          </label>
          <label className="check">
            <input
              name="repaid"
              type="checkbox"
              defaultChecked={!!t.reimbursed}
            />
            Reimbursed
          </label>
          {children.length > 0 && (
            <div>
              <h3>What this payment bought</h3>
              {children.map((c) => (
                <p key={c.id}>
                  {c.merchant} · <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(c.amount_cents)}</span>
                </p>
              ))}
            </div>
          )}
          <button disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </form>
      </section>
    </div>
  );
}
function ImportPanel({
  data,
  refresh,
  notify,
}: {
  data: Data;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [account, setAccount] = useState(data.accounts[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [from, setFrom] = useState("2020-01-01"),
    [to, setTo] = useState(today());
  async function files(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    setError("");
    let added = 0,
      skipped = 0;
    try {
      for (const file of Array.from(list)) {
        setStatus(`Reading ${file.name}`);
        const pdf = file.name.toLowerCase().endsWith(".pdf");
        if (!pdf && !file.name.toLowerCase().endsWith(".csv"))
          throw new Error("Choose a Bank CSV or Credit PDF.");
        if (file.size > 3000000)
          throw new Error("Choose a file smaller than 3 MB.");
        let content;
        if (pdf) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let raw = "";
          for (const byte of bytes) raw += String.fromCharCode(byte);
          content = btoa(raw);
        } else content = await file.text();
        const result = await api("import", {
          account,
          filename: file.name,
          content,
          format: pdf ? "pdf" : "csv",
        });
        added += result.rows_new;
        skipped += result.rows_skipped;
      }
      setStatus(`${added} new rows · ${skipped} skipped`);
      notify("Import complete. Your numbers are ready.");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import failed. No further files were read.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError("");
    let added = 0;
    try {
      for (const a of data.accounts.filter((a) => a.active)) {
        setStatus(`Syncing ${a.name}…`);
        const result = await api("sync", { account: a.id, from, to });
        added += result.rows_new;
      }
      setStatus(`Bank sync complete. ${added} new rows.`);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Bank sync failed. You can retry safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Tray title="CONNECTED BANKS">
        <p>
          Seven accounts. Personal and business. Read-only access through
          Redbark.
        </p>
        <div className="inline-form">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button disabled={busy || from > to} onClick={sync}>
            <RefreshCw className={busy ? "spin" : ""} size={16} />
            {busy ? "Working…" : "Sync all bank accounts"}
          </button>
        </div>
        <p className="muted small">
          Only posted transactions are imported. Pending purchases may change.
          Repeating a sync adds no duplicates.
        </p>
        {data.accounts.map((a) => (
          <div className="sync-account" key={a.id}>
            <span>
              {a.name}
              <small>
                ••{a.last4} · {a.entity.toUpperCase()}
              </small>
            </span>
            <span className={`pill ${a.synced_at ? "good" : "waiting"}`}>
              <i />
              {a.synced_at ? "Synced" : "Ready to sync"}
            </span>
          </div>
        ))}
      </Tray>
      <Tray title="IMPORT STATEMENTS">
        <label>
          Account for these files
          <CustomSelect
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            {data.accounts.map((a) => (
              <SelectOption value={a.id} key={a.id}>
                {a.name} · •{a.last4}
              </SelectOption>
            ))}
          </CustomSelect>
        </label>
        <label
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) files(e.dataTransfer.files);
          }}
        >
          <Upload size={28} />
          <strong>Drop your statements here</strong>
          <span>Bank CSV or Credit text PDF. Many files at once.</span>
          <input
            type="file"
            accept=".csv,.pdf"
            multiple
            disabled={busy}
            onChange={(e) => files(e.target.files)}
          />
        </label>
        <p className="muted small">
          Use one source per account and date range. CSVs with running balances
          and bank-feed rows can represent the same payment differently.
        </p>
        {busy && <p role="status">{status}</p>}
        {!busy && status && (
          <p role="status" className="notice">
            {status}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Tray>
      <button
        className="secondary"
        aria-expanded={historyOpen}
        aria-controls="import-history-panel"
        onClick={() => setHistoryOpen(!historyOpen)}
      >
        {historyOpen ? "Hide import history" : "Show import history"}
        <ChevronDown
          size={16}
          style={{ transform: historyOpen ? "rotate(180deg)" : undefined }}
        />
      </button>
      <div
        id="import-history-panel"
        hidden={!historyOpen}
        style={{ marginTop: 16 }}
      >
        {historyOpen && (
          <Tray title="IMPORT HISTORY">
            <div className="import-history">
              <div className="table-head">
                <span>FILE / SOURCE</span>
                <span>ROWS IN</span>
                <span>NEW</span>
                <span>SKIPPED</span>
              </div>
              {data.imports.map((r, i) => (
                <div key={i}>
                  <span>{String(r.file_name)}</span>
                  <span>{Number(r.rows_in)}</span>
                  <span>{Number(r.rows_new)}</span>
                  <span>{Number(r.rows_skipped)}</span>
                </div>
              ))}
            </div>
          </Tray>
        )}
      </div>
    </>
  );
}
function CreateNamed({
  type,
  onSave,
}: {
  type: "person" | "trip";
  onSave: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <Tray title={`ADD ${type.toUpperCase()}`}>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          try {
            await onSave(Object.fromEntries(f));
            form.reset();
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          }
        }}
      >
        <label>
          Name
          <input name="name" required />
        </label>
        {type === "trip" && (
          <>
            <label>
              Start
              <input name="start_date" type="date" required />
            </label>
            <label>
              End
              <input name="end_date" type="date" required />
            </label>
          </>
        )}
        <button className="secondary">Add {type}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </Tray>
  );
}
function RuleForm({
  data,
  onSave,
}: {
  data: Data;
  onSave: (r: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        try {
          await onSave({
            pattern: f.get("pattern"),
            merchant: f.get("merchant") || null,
            category_id: f.get("category"),
          });
          form.reset();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      }}
    >
      <label>
        Bank text contains
        <input name="pattern" required minLength={2} />
      </label>
      <label>
        Merchant name
        <input name="merchant" />
      </label>
      <label>
        Category
        <CustomSelect name="category">
          {data.categories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              {c.name}
            </SelectOption>
          ))}
        </CustomSelect>
      </label>
      <button className="secondary">Add rule</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
function DebtChart({
  debts,
  payments,
}: {
  debts: Debt[];
  payments: Data["payments"];
}) {
  const relevant = payments.filter((p) =>
    debts.some((d) => d.id === p.debt_id),
  );
  const current = debts.reduce((s, d) => s + d.balance_cents * d.fx_aud, 0);
  const totalPaid = relevant.reduce(
    (s, p) =>
      s + p.amount_cents * (debts.find((d) => d.id === p.debt_id)?.fx_aud || 1),
    0,
  );
  const values = relevant.reduce<number[]>(
    (v, p) => [
      ...v,
      v[v.length - 1] -
        p.amount_cents * (debts.find((d) => d.id === p.debt_id)?.fx_aud || 1),
    ],
    [current + totalPaid],
  );
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (v, i) =>
        `${20 + (i / Math.max(values.length - 1, 1)) * 960},${100 - (v / max) * 80}`,
    )
    .join(" ");
  return (
    <div className="debt-chart">
      <svg
        viewBox="0 0 1000 120"
        role="img"
        aria-label="Recorded debt balance over payment history"
      >
        <line x1="20" x2="980" y1="100" y2="100" stroke="#e6e6e3" />
        <polyline
          points={values.length > 1 ? points : `20,20 980,20`}
          fill="none"
          stroke="#111"
          strokeWidth="2"
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={20 + (i / Math.max(values.length - 1, 1)) * 960}
            cy={100 - (v / max) * 80}
            r="3"
          />
        ))}
      </svg>
      <div className="chart-caption">
        <span>{relevant[0]?.date || "Opening record"}</span>
        <span>{today()}</span>
      </div>
    </div>
  );
}
