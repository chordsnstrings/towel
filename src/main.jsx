import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Layers,
  LoaderCircle,
  LogOut,
  Minus,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ScanLine,
  Users,
  X,
  Upload,
  ListFilter,
  CircleAlert,
  FileSpreadsheet,
  RefreshCw,
  SlidersHorizontal,
  History,
  LockKeyhole,
} from "lucide-react";
import Scanner from "./Scanner.jsx";
import { api, setCsrf, downloadActivity } from "./api.js";
import { MAX_IMPORT_BYTES } from "../shared/limits.js";
import "./styles.css";

const dateTime = (v, date = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    ...(date ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
const initials = (name) =>
  name
    ?.split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "M";
const plural = (n, word = "towel") => `${n} ${word}${n === 1 ? "" : "s"}`;
function ErrorNotice({ children }) {
  return children ? (
    <div className="error-notice" role="alert">
      <CircleAlert size={18} />
      <span>{children}</span>
    </div>
  ) : null;
}
function Empty({ icon: Icon = Layers, title, children }) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Badge({ children, tone = "" }) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Spinner() {
  return <LoaderCircle className="spin" size={18} />;
}
function Avatar({ name, large }) {
  return (
    <span className={"avatar " + (large ? "large" : "")}>{initials(name)}</span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function PageTitle({ eyebrow = "FIVE JUMEIRAH VILLAGE", title, children }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function Pagination({ data, offset, setOffset }) {
  if (!data?.total) return null;
  return (
    <div className="pagination">
      <span>
        {offset + 1}–{Math.min(offset + data.limit, data.total)} of {data.total}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - data.limit))}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={offset + data.limit >= data.total}
          onClick={() => setOffset(offset + data.limit)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
function Login({ onLogin, demo }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e, isDemo = false) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api(isDemo ? "/auth/demo" : "/auth/login", {
          method: "POST",
          body: isDemo ? {} : { email, password },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-brand">
        <img src="/move-logo.svg" alt="MOVE at FIVE" />
        <div>
          <span className="eyebrow">FIVE JUMEIRAH VILLAGE</span>
          <h1>
            YOUR MOVE.
            <br />
            WE’VE GOT
            <br />
            THE TOWELS.
          </h1>
          <p>Member towel desk</p>
        </div>
        <span className="login-footer">
          MOVE AT FIVE <span>RECEPTION</span>
        </span>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <span className="label-icon">
            <LockKeyhole size={18} />
          </span>
          <p className="eyebrow">WELCOME TO THE DESK</p>
          <h2>Good to see you.</h2>
          <p className="muted">
            Sign in to check out towels and manage returns.
          </p>
          <form onSubmit={login}>
            <label>
              Staff email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorNotice>{error}</ErrorNotice>
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  Sign in <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>
          {demo && (
            <div className="demo-login">
              <Badge>DEVELOPMENT DEMO</Badge>
              <p>Explore the desk with fictional members.</p>
              <button
                className="button secondary full"
                disabled={busy}
                onClick={(e) => login(e, true)}
              >
                Open demo desk <ArrowRight size={17} />
              </button>
            </div>
          )}
          <p className="login-help">
            Need access? Contact your gym administrator.
          </p>
        </div>
        <span className="login-location">
          MOVE AT FIVE · JUMEIRAH VILLAGE, DUBAI
        </span>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [config, setConfig] = useState({ demo: false }),
    [page, setPage] = useState("desk"),
    [toast, setToast] = useState(""),
    [connection, setConnection] = useState("");
  useEffect(() => {
    Promise.all([
      api("/config").then(setConfig),
      api("/auth/me")
        .then((data) => {
          setSession(data);
          setCsrf(data.csrfToken);
        })
        .catch((e) => {
          if (e.status !== 401) setConnection(e.message);
        }),
    ])
      .catch((e) => setConnection(e.message))
      .finally(() => setReady(true));
    const expired = () => {
      setSession(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  function login(data) {
    setSession(data);
    setCsrf(data.csrfToken);
    setPage("desk");
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setSession(null);
      setCsrf("");
    } catch (e) {
      setToast(e.message);
    }
  }
  if (!ready)
    return (
      <div className="boot">
        <img src="/move-logo.svg" alt="MOVE at FIVE" />
        <Spinner />
      </div>
    );
  if (connection && !session)
    return (
      <div className="boot">
        <img src="/move-logo.svg" alt="MOVE at FIVE" />
        <ErrorNotice>{connection}</ErrorNotice>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (!session) return <Login onLogin={login} demo={config.demo} />;
  const admin = session.user.role === "admin";
  const nav = [
    ["desk", "Towel desk", ScanLine],
    ["outstanding", "Outstanding", Layers],
    ["members", "Members", Users],
    ["activity", "Activity", History],
    ...(admin ? [["settings", "Settings", Settings2]] : []),
  ];
  return (
    <>
      <header className="header">
        <button
          className="brand-button"
          onClick={() => setPage("desk")}
          aria-label="Towel desk home"
        >
          <img src="/move-logo.svg" alt="MOVE at FIVE" />
        </button>
        <div className="brand-divider" />
        <span className="header-location">
          JUMEIRAH
          <br />
          VILLAGE
        </span>
        <nav aria-label="Main navigation">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="staff-menu">
          <Avatar name={session.user.name} />
          <div>
            <strong>{session.user.name}</strong>
            <span>{admin ? "Administrator" : "Reception"}</span>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      {config.demo && (
        <div className="demo-banner">
          DEMO WORKSPACE{" "}
          <span>Fictional members · changes stay in this demo</span>
        </div>
      )}
      <main className="workspace">
        {page === "desk" ? (
          <Desk admin={admin} notify={setToast} onNavigate={setPage} />
        ) : page === "outstanding" ? (
          <Members outstanding admin={admin} notify={setToast} />
        ) : page === "members" ? (
          <Members admin={admin} notify={setToast} />
        ) : page === "activity" ? (
          <Activity admin={admin} />
        ) : (
          <Settings notify={setToast} user={session.user} />
        )}
      </main>
      <footer className="footer">
        <span>
          MOVE AT FIVE <b>▸</b> JUMEIRAH VILLAGE
        </span>
        <span>TOWEL DESK · DUBAI TIME (GST)</span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function Desk({ admin, notify, onNavigate }) {
  const [dashboard, setDashboard] = useState(null),
    [error, setError] = useState(""),
    [barcode, setBarcode] = useState(""),
    [search, setSearch] = useState(""),
    [results, setResults] = useState([]),
    [member, setMember] = useState(null),
    [scanBusy, setScanBusy] = useState(false),
    [newMember, setNewMember] = useState(false),
    [scannerKey, setScannerKey] = useState(0);
  const busyRef = useRef(false),
    searchVersion = useRef(0);
  const load = () =>
    api("/dashboard")
      .then((d) => {
        setDashboard(d);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const i = setInterval(load, 20000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const version = ++searchVersion.current;
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(
      () =>
        api("/members?q=" + encodeURIComponent(search))
          .then((d) => {
            if (version === searchVersion.current)
              setResults(d.rows.slice(0, 5));
          })
          .catch((e) => setError(e.message)),
      250,
    );
    return () => clearTimeout(t);
  }, [search]);
  async function scan(value) {
    if (busyRef.current) return;
    busyRef.current = true;
    setScanBusy(true);
    setError("");
    try {
      const found = await api(
        "/members/lookup?barcode=" + encodeURIComponent(value.trim()),
      );
      setMember(found);
      setBarcode("");
      setSearch("");
    } catch (e) {
      setError(e.message);
      setBarcode(value);
    } finally {
      busyRef.current = false;
      setScanBusy(false);
    }
  }
  function close() {
    setMember(null);
    setScannerKey((v) => v + 1);
    load();
  }
  const stats = [
    [
      "With members",
      dashboard?.outstanding,
      `${dashboard?.members_out ?? 0} members`,
      Layers,
    ],
    ["Checked out today", dashboard?.issued, "Towels handed out", ArrowUpRight],
    ["Returned today", dashboard?.returned, "Towels received", ArrowDownLeft],
    ["Overdue", dashboard?.overdue, "Past the return window", Clock3],
  ];
  return (
    <>
      <PageTitle title="TOWEL DESK" eyebrow="RECEPTION / FIVE JUMEIRAH VILLAGE">
        <div className="today">
          <Clock3 size={17} />
          {new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Dubai",
            weekday: "short",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </div>
      </PageTitle>
      <section className="stats" aria-label="Towel overview">
        {stats.map(([label, value, caption, Icon], i) => (
          <div
            key={label}
            className={"stat " + (i === 3 && value ? "attention" : "")}
          >
            <div className="stat-label">
              {label}
              <Icon size={18} />
            </div>
            <strong>
              {value ?? "—"}
              <span>{i === 0 ? "OUT" : ""}</span>
            </strong>
            <small>{caption}</small>
          </div>
        ))}
      </section>
      <div className="desk-grid">
        <div className="scan-column">
          <div className="section-heading">
            <h2>SCAN. SELECT. ALL SET.</h2>
            <span>01 / MEMBER IDENTIFICATION</span>
          </div>
          <Scanner
            key={scannerKey}
            onScan={scan}
            paused={!!member || scanBusy || !!error || newMember}
          />
          <form
            className="manual-form"
            onSubmit={(e) => {
              e.preventDefault();
              scan(barcode);
            }}
          >
            <label htmlFor="manual-barcode">
              <ScanLine size={18} /> Or enter a barcode
            </label>
            <div>
              <input
                id="manual-barcode"
                autoComplete="off"
                spellCheck="false"
                placeholder="Member barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                required
                maxLength={128}
              />
              <button
                className="button primary"
                disabled={scanBusy || !barcode.trim()}
              >
                {scanBusy ? (
                  <Spinner />
                ) : (
                  <>
                    Find member <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
          <ErrorNotice>{error}</ErrorNotice>
          {error && (
            <button
              className="text-button retry-scan"
              onClick={() => {
                setError("");
                setScannerKey((v) => v + 1);
              }}
            >
              <RefreshCw size={16} /> Scan again
            </button>
          )}
          <div className="desk-notes">
            <ShieldCheck size={19} />
            <span>
              Scan to identify a member. Every towel movement is confirmed
              before it is saved.
            </span>
          </div>
        </div>
        <aside className="desk-aside">
          <section className="find-member">
            <div className="section-heading">
              <h2>FIND A MEMBER</h2>
              <Users size={19} />
            </div>
            <p>No barcode to hand? Search their name.</p>
            <div className="search-input">
              <Search size={19} />
              <input
                aria-label="Find member by name"
                placeholder="Search name or barcode"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={16} />
                </button>
              )}
            </div>
            {search.length >= 2 ? (
              <div className="search-results">
                {results.length ? (
                  results.map((m) => (
                    <button
                      className="member-result"
                      key={m.id}
                      onClick={() => {
                        setMember(m);
                        setSearch("");
                      }}
                    >
                      <Avatar name={m.full_name} />
                      <span>
                        <strong>{m.full_name}</strong>
                        <small>
                          {m.membership} · {m.barcode}
                        </small>
                      </span>
                      <Badge>
                        {m.outstanding
                          ? plural(m.outstanding) + " out"
                          : "All returned"}
                      </Badge>
                    </button>
                  ))
                ) : (
                  <p className="search-empty">No matching members.</p>
                )}
              </div>
            ) : (
              <div className="search-hint">
                <span>MEMBER DIRECTORY</span>
                <button onClick={() => onNavigate("members")}>
                  View members <ArrowUpRight size={16} />
                </button>
              </div>
            )}
            {admin && (
              <button
                className="text-button"
                onClick={() => setNewMember(true)}
              >
                <Plus size={17} /> Add a new member
              </button>
            )}
          </section>
          <section className="recent-section">
            <div className="section-heading">
              <h2>RECENT ACTIVITY</h2>
              <button
                className="text-button"
                onClick={() => onNavigate("activity")}
              >
                View all <ArrowUpRight size={16} />
              </button>
            </div>
            {!dashboard ? (
              <div className="loading-row">
                <Spinner /> Loading activity
              </div>
            ) : !dashboard.recent.length ? (
              <Empty title="A fresh start">
                Towel checkouts and returns will appear here.
              </Empty>
            ) : (
              <div className="recent-list">
                {dashboard.recent.slice(0, 5).map((t) => (
                  <div className="recent-row" key={t.id}>
                    <span className={"movement-icon " + t.kind}>
                      {t.kind === "checkout" ? (
                        <ArrowUpRight size={19} />
                      ) : (
                        <ArrowDownLeft size={19} />
                      )}
                    </span>
                    <div>
                      <strong>{t.full_name}</strong>
                      <span>
                        {t.kind === "checkout" ? "Checked out" : "Returned"}{" "}
                        {plural(t.quantity)}
                      </span>
                    </div>
                    <time>{dateTime(t.created_at)}</time>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="return-reminder">
            <div>
              <span className="eyebrow">FINISHED YOUR SESSION?</span>
              <h3>
                SAME SCAN.
                <br />
                EASY RETURN.
              </h3>
            </div>
            <ArrowDownLeft size={36} strokeWidth={1} />
            <p>
              Scan the member again to see and return their outstanding towels.
            </p>
          </div>
        </aside>
      </div>
      {member && (
        <TransactionModal
          member={member}
          onClose={close}
          onSaved={(m) => {
            notify(m);
            load();
          }}
        />
      )}
      {newMember && (
        <MemberForm
          initial={{ barcode }}
          onClose={() => setNewMember(false)}
          onSaved={(m) => {
            setNewMember(false);
            setMember({ ...m, outstanding: 0 });
            notify("Member added.");
          }}
        />
      )}
    </>
  );
}

function TransactionModal({ member: initial, onClose, onSaved }) {
  const [member, setMember] = useState(initial),
    [settings, setSettings] = useState(null),
    [kind, setKind] = useState(initial.outstanding > 0 ? "return" : "checkout"),
    [quantity, setQuantity] = useState(initial.outstanding || 1),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(null),
    [notes, setNotes] = useState("");
  const request = useRef(null),
    submitting = useRef(false);
  async function refresh() {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api("/members/" + initial.id),
        api("/settings"),
      ]);
      setMember(m);
      setSettings(s);
      setQuantity((q) =>
        Math.max(
          1,
          Math.min(
            q,
            kind === "return"
              ? m.outstanding
              : s.max_outstanding - m.outstanding,
          ),
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const max =
    kind === "return"
      ? member.outstanding
      : Math.max(0, (settings?.max_outstanding || 0) - member.outstanding);
  function switchKind(value) {
    setKind(value);
    setQuantity(value === "return" ? Math.max(1, member.outstanding) : 1);
    setError("");
    request.current = null;
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({
      memberId: member.id,
      kind,
      quantity,
      notes,
    });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const { transaction, currentBalance } = await api("/transactions", {
        method: "POST",
        body: {
          memberId: member.id,
          kind,
          quantity,
          notes,
          requestId: request.current.id,
        },
      });
      setSuccess({ ...transaction, currentBalance });
      onSaved(
        `${plural(transaction.quantity)} ${kind === "checkout" ? "checked out" : "returned"}.`,
      );
    } catch (e) {
      setError(e.message);
      if (e.status === 409) await refresh();
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <Modal
      title={success ? "ALL SET." : "MEMBER IDENTIFIED"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {success ? (
        <div className="success">
          <span className="success-icon">
            <Check size={42} />
          </span>
          <p className="eyebrow">{member.full_name}</p>
          <h3>
            {plural(success.quantity)}
            <br />
            {success.kind === "checkout" ? "checked out." : "returned."}
          </h3>
          <p>
            {success.currentBalance
              ? `${plural(success.currentBalance)} still with this member.`
              : "All towels returned. Thank you."}
          </p>
          <button autoFocus className="button primary full" onClick={onClose}>
            Next member <ArrowRight size={19} />
          </button>
        </div>
      ) : (
        <>
          <div className="member-identity">
            <Avatar name={member.full_name} large />
            <div>
              <h3>{member.full_name}</h3>
              <p>
                {member.membership}
                <span>·</span>
                <code>{member.barcode}</code>
              </p>
              <Badge tone={!member.active ? "warning" : ""}>
                {member.active ? "Active member" : "Inactive member"}
              </Badge>
            </div>
          </div>
          <div className="balance-banner">
            <span>Currently with member</span>
            <strong>{plural(member.outstanding)}</strong>
            {member.overdue > 0 && (
              <Badge tone="warning">{plural(member.overdue)} overdue</Badge>
            )}
          </div>
          <div className="segmented" aria-label="Towel action">
            <button
              className={kind === "checkout" ? "selected" : ""}
              onClick={() => switchKind("checkout")}
              disabled={busy || !member.active}
            >
              <ArrowUpRight size={18} /> Check out
            </button>
            <button
              className={kind === "return" ? "selected" : ""}
              onClick={() => switchKind("return")}
              disabled={busy || !member.outstanding}
            >
              <ArrowDownLeft size={18} /> Return
            </button>
          </div>
          {loading ? (
            <div className="loading-row">
              <Spinner /> Checking balance
            </div>
          ) : (
            <>
              <p className="quantity-label">
                {kind === "return"
                  ? "How many towels are coming back?"
                  : "How many towels are they taking?"}
              </p>
              <div className="quantity-picker">
                <button
                  aria-label="Decrease towels"
                  disabled={quantity <= 1 || busy}
                  onClick={() => setQuantity((n) => n - 1)}
                >
                  <Minus size={23} />
                </button>
                <div>
                  <strong>{max === 0 ? 0 : quantity}</strong>
                  <span>TOWELS</span>
                </div>
                <button
                  aria-label="Increase towels"
                  disabled={quantity >= max || busy}
                  onClick={() => setQuantity((n) => n + 1)}
                >
                  <Plus size={23} />
                </button>
              </div>
              <div className="quantity-shortcuts">
                {[1, 2, 3]
                  .filter((n) => n <= max)
                  .map((n) => (
                    <button
                      key={n}
                      className={n === quantity ? "chosen" : ""}
                      onClick={() => setQuantity(n)}
                      disabled={busy}
                    >
                      {n}
                    </button>
                  ))}
                {kind === "return" && max > 0 && (
                  <button onClick={() => setQuantity(max)} disabled={busy}>
                    Return all ({max})
                  </button>
                )}
                <span>
                  {kind === "checkout"
                    ? `${max} available within member limit`
                    : `${plural(Math.max(0, member.outstanding - quantity))} will remain`}
                </span>
              </div>
              {max === 0 && (
                <ErrorNotice>
                  {kind === "return"
                    ? "No towels outstanding."
                    : "This member has reached their towel limit."}
                </ErrorNotice>
              )}
              <label className="optional-note">
                Note <span>(optional)</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  placeholder="Anything reception should know?"
                  disabled={busy}
                />
              </label>
            </>
          )}
          <ErrorNotice>{error}</ErrorNotice>
          <button
            className="button primary full confirm-button"
            disabled={
              busy ||
              loading ||
              !settings ||
              max < 1 ||
              quantity > max ||
              (!member.active && kind === "checkout")
            }
            onClick={submit}
          >
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              <>
                {kind === "return" ? "Confirm return" : "Confirm checkout"} ·{" "}
                {plural(max === 0 ? 0 : quantity)} <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="dialog-footnote">
            {kind === "return"
              ? "Confirm once the towels have been received."
              : "Confirm once the towels have been handed over."}
          </p>
        </>
      )}
    </Modal>
  );
}

function MemberForm({ initial = {}, onClose, onSaved }) {
  const [data, setData] = useState(() =>
      Object.fromEntries(
        Object.entries({
          full_name: "",
          barcode: "",
          email: "",
          phone: "",
          membership: "Member",
          active: true,
          notes: "",
        }).map(([key, value]) => [key, initial[key] ?? value]),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field = (key, value) => setData((d) => ({ ...d, [key]: value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const m = await api("/members" + (initial.id ? "/" + initial.id : ""), {
        method: initial.id ? "PUT" : "POST",
        body: data,
      });
      onSaved(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial.id ? "EDIT MEMBER" : "NEW MEMBER"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} className="member-form">
        <label>
          Full name
          <input
            autoFocus
            required
            value={data.full_name}
            maxLength={160}
            onChange={(e) => field("full_name", e.target.value)}
          />
        </label>
        <label>
          Member barcode
          <input
            required
            value={data.barcode}
            autoComplete="off"
            spellCheck="false"
            maxLength={128}
            onChange={(e) => field("barcode", e.target.value)}
          />
          <small>Enter the full barcode, including any leading zeros.</small>
        </label>
        <div className="two-fields">
          <label>
            Email <span>(optional)</span>
            <input
              type="email"
              value={data.email}
              maxLength={254}
              onChange={(e) => field("email", e.target.value)}
            />
          </label>
          <label>
            Phone <span>(optional)</span>
            <input
              type="tel"
              value={data.phone}
              maxLength={40}
              onChange={(e) => field("phone", e.target.value)}
            />
          </label>
        </div>
        <div className="two-fields">
          <label>
            Membership
            <input
              list="membership-options"
              value={data.membership}
              maxLength={80}
              onChange={(e) => field("membership", e.target.value)}
            />
            <datalist id="membership-options">
              <option>Movers</option>
              <option>Shapers</option>
              <option>Hotel guest</option>
              <option>Day pass</option>
              <option>Staff</option>
            </datalist>
          </label>
          <label>
            Status
            <select
              value={data.active ? "true" : "false"}
              onChange={(e) => field("active", e.target.value === "true")}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>
        <label>
          Notes <span>(optional)</span>
          <textarea
            rows={2}
            value={data.notes}
            maxLength={1000}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
        <ErrorNotice>{error}</ErrorNotice>
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : (
            <>
              Save member <Check size={18} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}

function Members({ outstanding = false, admin, notify }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(outstanding ? "outstanding" : "all"),
    [offset, setOffset] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [edit, setEdit] = useState(null),
    [selected, setSelected] = useState(null),
    [profile, setProfile] = useState(null),
    [importing, setImporting] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setStatus(outstanding ? "outstanding" : "all");
    setOffset(0);
    setQuery("");
  }, [outstanding]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(
      () =>
        api("/members?" + new URLSearchParams({ q: query, status, offset }))
          .then((d) => {
            if (live) {
              setData(d);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, status, offset, revision, outstanding]);
  const refresh = () => setRevision((v) => v + 1);
  async function showProfile(m) {
    try {
      setProfile(await api("/members/" + m.id));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <PageTitle title={outstanding ? "WITH MEMBERS" : "MEMBER DIRECTORY"}>
        <div className="heading-actions">
          {admin && !outstanding && (
            <>
              <button
                className="button secondary"
                onClick={() => setImporting(true)}
              >
                <Upload size={17} /> Import members
              </button>
              <button className="button primary" onClick={() => setEdit({})}>
                <Plus size={18} /> Add member
              </button>
            </>
          )}
          {outstanding && (
            <button className="button secondary" onClick={refresh}>
              <RefreshCw size={17} /> Refresh balances
            </button>
          )}
        </div>
      </PageTitle>
      <div className="page-intro">
        <p>
          {outstanding
            ? "See who has towels, and record returns as they arrive."
            : "Member profiles, barcodes, and towel balances in one place."}
        </p>
        <span>
          {data?.total ?? "—"} {outstanding ? "members with towels" : "members"}
        </span>
      </div>
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Search members"
            placeholder="Search name, barcode, phone or email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="filter-select">
          <ListFilter size={18} />
          <select
            aria-label="Filter members"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            {outstanding ? (
              <>
                <option value="outstanding">All outstanding</option>
                <option value="overdue">Overdue only</option>
              </>
            ) : (
              <>
                <option value="all">All members</option>
                <option value="active">Active members</option>
                <option value="inactive">Inactive members</option>
              </>
            )}
          </select>
        </div>
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="table-card" aria-busy={loading}>
        {loading && !data ? (
          <div className="loading-row">
            <Spinner /> Loading members
          </div>
        ) : !data?.rows.length ? (
          <Empty
            icon={Users}
            title={
              query
                ? "No matching members"
                : outstanding
                  ? "Every towel is accounted for."
                  : "Your member list starts here."
            }
          >
            {query
              ? "Try a different name or barcode."
              : outstanding
                ? "Members with outstanding towels will appear here."
                : admin
                  ? "Add a member or import your existing member list."
                  : "Ask your administrator to add or import members."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Barcode</th>
                  <th>Membership</th>
                  <th>{outstanding ? "Return due" : "Status"}</th>
                  <th className="numeric">Towels out</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button
                        className="table-member"
                        onClick={() => showProfile(m)}
                      >
                        <Avatar name={m.full_name} />
                        <span>
                          <strong>{m.full_name}</strong>
                          <small>
                            {m.phone || m.email || "Member profile"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <code>{m.barcode}</code>
                    </td>
                    <td>{m.membership}</td>
                    <td>
                      {outstanding ? (
                        <Badge tone={m.overdue ? "warning" : ""}>
                          {m.overdue ? "Overdue · " : ""}
                          {dateTime(m.due_at, true)}
                        </Badge>
                      ) : (
                        <Badge tone={!m.active ? "muted-tone" : ""}>
                          {m.active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </td>
                    <td className="numeric">
                      <strong className={m.outstanding ? "count-pill" : ""}>
                        {m.outstanding}
                      </strong>
                    </td>
                    <td>
                      <button
                        className="table-action"
                        aria-label={`${outstanding ? "Return towels for" : "Open towel desk for"} ${m.full_name}`}
                        onClick={() => setSelected(m)}
                      >
                        {outstanding ? "Return" : "Towels"}{" "}
                        <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={data} offset={offset} setOffset={setOffset} />
      </div>
      {selected && (
        <TransactionModal
          member={selected}
          onClose={() => {
            setSelected(null);
            refresh();
          }}
          onSaved={notify}
        />
      )}
      {edit && (
        <MemberForm
          initial={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
            notify("Member saved.");
          }}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onSaved={(result) => {
            setImporting(false);
            refresh();
            notify(
              `${result.created} members added, ${result.updated} updated.`,
            );
          }}
        />
      )}
      {profile && (
        <Modal title="MEMBER PROFILE" onClose={() => setProfile(null)} wide>
          <div className="profile-top">
            <div className="member-identity">
              <Avatar large name={profile.full_name} />
              <div>
                <h3>{profile.full_name}</h3>
                <p>
                  {profile.membership} · <code>{profile.barcode}</code>
                </p>
                <Badge>{profile.active ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
            {admin && (
              <button
                className="button secondary"
                onClick={() => {
                  setEdit(profile);
                  setProfile(null);
                }}
              >
                Edit profile
              </button>
            )}
          </div>
          <div className="profile-details">
            <span>
              Email<strong>{profile.email || "—"}</strong>
            </span>
            <span>
              Phone<strong>{profile.phone || "—"}</strong>
            </span>
            <span>
              Towels out<strong>{profile.outstanding}</strong>
            </span>
          </div>
          {profile.notes && <p className="profile-note">{profile.notes}</p>}
          <div className="section-heading">
            <h3>Recent towel history</h3>
            <span>LAST 50 TRANSACTIONS</span>
          </div>
          {profile.history.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Quantity</th>
                    <th>Time</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.history.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.kind === "checkout" ? "Checked out" : "Returned"}
                      </td>
                      <td>{t.quantity}</td>
                      <td>{dateTime(t.created_at, true)}</td>
                      <td>{t.staff_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No towel activity yet">
              Their first checkout will appear here.
            </Empty>
          )}
          <button
            className="button primary full"
            onClick={() => {
              setSelected(profile);
              setProfile(null);
            }}
          >
            Open towel desk <ArrowRight size={18} />
          </button>
        </Modal>
      )}
    </>
  );
}

const importLabels = {
  barcode: "Member barcode *",
  full_name: "Full name *",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  membership: "Membership",
  active: "Status",
};
function ImportModal({ onClose, onSaved }) {
  const [job, setJob] = useState(null),
    [mapping, setMapping] = useState({}),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fileRef = useRef(null);
  async function upload(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Choose a file no larger than 4 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const j = await api("/imports", { method: "POST", body: form });
      setJob(j);
      setMapping(j.mapping);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api(`/imports/${job.id}/preview`, {
          method: "POST",
          body: { mapping },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function downloadErrors() {
    const cell = (value) =>
      '\"' +
      String(value ?? "")
        .replace(/^[=+@\-]/, (c) => "'" + c)
        .replaceAll('\"', '\"\"') +
      '\"';
    const csv =
      "Row,Barcode,Error\r\n" +
      preview.errorRows
        .map((r) => [r.line, "'" + r.barcode, r.error].map(cell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "move-import-errors.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      onSaved(await api(`/imports/${job.id}/commit`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="IMPORT MEMBERS"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="import-steps">
        <span className={!job ? "current" : ""}>01 Upload</span>
        <ChevronRight size={15} />
        <span className={job && !preview ? "current" : ""}>
          02 Match columns
        </span>
        <ChevronRight size={15} />
        <span className={preview ? "current" : ""}>03 Review</span>
      </div>
      {!job ? (
        <>
          <button
            className="upload-zone"
            disabled={busy}
            onClick={() => fileRef.current.click()}
          >
            <FileSpreadsheet size={42} strokeWidth={1} />
            <h3>
              {busy ? "Reading your file…" : "Bring your members with you."}
            </h3>
            <p>Choose an Excel (.xlsx) or CSV file</p>
            <span className="button primary">
              {busy ? (
                <Spinner />
              ) : (
                <>
                  <Upload size={17} /> Choose file
                </>
              )}
            </span>
            <small>Up to 4 MB · 5,000 members · First worksheet</small>
          </button>
          <input
            type="file"
            ref={fileRef}
            className="sr-only"
            accept=".csv,.xlsx"
            onChange={(e) => upload(e.target.files[0])}
          />
          <div className="import-guidance">
            <p>
              <strong>Barcodes are identifiers.</strong> Keep the barcode column
              formatted as Text in Excel to preserve leading zeros.
            </p>
            <p>
              A matching barcode updates the existing profile. Blank optional
              fields preserve existing details. Towel balances and history are
              kept.
            </p>
            <a
              href="/member-import-template.csv"
              download
              className="text-button"
            >
              <Download size={17} /> Download CSV template
            </a>
          </div>
        </>
      ) : !preview ? (
        <>
          <p className="muted">
            Match your file’s columns. Use a full name, or first and last names.
          </p>
          <div className="mapping-grid">
            {Object.entries(importLabels).map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [key]: Number(e.target.value) }))
                  }
                >
                  <option value={-1}>Not included</option>
                  {job.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="file-preview">
            <span className="eyebrow">FIRST ROW IN YOUR FILE</span>
            <div>
              {job.headers.map((h, i) => (
                <p key={i}>
                  <span>{h}</span>
                  <strong>{job.sample[0]?.[i] || "—"}</strong>
                </p>
              ))}
            </div>
          </div>
          <button
            className="button primary full"
            disabled={busy}
            onClick={review}
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                Preview {job.total} members <ArrowRight size={18} />
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className="import-summary">
            <span>
              <strong>{preview.created}</strong>New members
            </span>
            <span>
              <strong>{preview.updated}</strong>Profile updates
            </span>
            <span className={preview.errors ? "danger-text" : ""}>
              <strong>{preview.errors}</strong>Rows with errors
            </span>
          </div>
          {preview.errors > 0 && (
            <ErrorNotice>
              Nothing has been imported. Correct the source file or column
              mapping, then preview again. All rows must be valid.
            </ErrorNotice>
          )}
          {preview.errors > 0 && (
            <button className="text-button" onClick={downloadErrors}>
              <Download size={17} /> Download all row errors
            </button>
          )}
          <div className="table-scroll import-table">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Member</th>
                  <th>Barcode</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.data.full_name || "—"}</td>
                    <td>
                      <code>{r.data.barcode || "—"}</code>
                    </td>
                    <td>
                      {r.errors.length ? (
                        <span className="danger-text">
                          {r.errors.join(" ")}
                        </span>
                      ) : (
                        <Badge>
                          {r.action === "create"
                            ? "New member"
                            : "Update profile"}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > 100 && (
            <p className="muted">
              Showing the first 100 of {preview.total} rows. Every row has been
              validated.
            </p>
          )}
          <div className="import-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              <ChevronLeft size={17} /> Match columns
            </button>
            <button
              className="button primary"
              disabled={busy || preview.errors > 0}
              onClick={commit}
            >
              {busy ? (
                <>
                  <Spinner /> Importing…
                </>
              ) : (
                <>
                  Import {preview.total} members <Check size={18} />
                </>
              )}
            </button>
          </div>
        </>
      )}
      <ErrorNotice>{error}</ErrorNotice>
      {job && (
        <button
          className="text-button import-reset"
          disabled={busy}
          onClick={() => {
            setJob(null);
            setPreview(null);
            setError("");
          }}
        >
          Choose a different file
        </button>
      )}
    </Modal>
  );
}

function Activity({ admin }) {
  const [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [offset, setOffset] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = new URLSearchParams({ q, kind, from, to, offset }).toString();
  useEffect(() => {
    let current = true;
    const t = setTimeout(
      () =>
        api("/transactions?" + query)
          .then((d) => {
            if (current) {
              setData(d);
              setError("");
            }
          })
          .catch((e) => {
            if (current) setError(e.message);
          }),
      180,
    );
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [query]);
  async function download() {
    setBusy(true);
    try {
      await downloadActivity(query);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="EVERY TOWEL. RECORDED.">
        <button
          className="button secondary"
          onClick={download}
          disabled={busy || !admin}
        >
          {busy ? <Spinner /> : <Download size={17} />} Export CSV
        </button>
      </PageTitle>
      <div className="page-intro">
        <p>A complete record of checkouts and returns.</p>
        <span>{data?.total ?? "—"} transactions</span>
      </div>
      <div className="table-toolbar activity-filters">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Search activity"
            placeholder="Search member or barcode"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <select
          aria-label="Activity type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All activity</option>
          <option value="checkout">Checkouts</option>
          <option value="return">Returns</option>
        </select>
        <label className="date-filter">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="date-filter">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="table-card">
        {!data ? (
          <div className="loading-row">
            <Spinner /> Loading activity
          </div>
        ) : !data.rows.length ? (
          <Empty icon={History} title="No activity in this view">
            Checkouts and returns will appear here. Try clearing your filters.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Action</th>
                  <th className="numeric">Towels</th>
                  <th className="numeric">Balance after</th>
                  <th>Time · Dubai</th>
                  <th>Recorded by</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.full_name}</strong>
                      <code className="table-sub">{t.barcode}</code>
                    </td>
                    <td>
                      <span className={"activity-kind " + t.kind}>
                        {t.kind === "checkout" ? (
                          <ArrowUpRight size={17} />
                        ) : (
                          <ArrowDownLeft size={17} />
                        )}{" "}
                        {t.kind === "checkout" ? "Checked out" : "Returned"}
                      </span>
                    </td>
                    <td className="numeric">
                      <strong>{t.quantity}</strong>
                    </td>
                    <td className="numeric">{t.balance_after}</td>
                    <td className="nowrap">{dateTime(t.created_at, true)}</td>
                    <td>{t.staff_name}</td>
                    <td className="note-cell">{t.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={data} offset={offset} setOffset={setOffset} />
      </div>
    </>
  );
}

function Settings({ notify, user }) {
  const [settings, setSettings] = useState(null),
    [staff, setStaff] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false);
  async function load() {
    try {
      const [s, u] = await Promise.all([api("/settings"), api("/staff")]);
      setSettings(s);
      setStaff(u);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/settings", { method: "PUT", body: settings });
      notify("Towel policy updated.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(s) {
    setBusy(true);
    setError("");
    try {
      await api("/staff/" + s.id, {
        method: "PATCH",
        body: { active: !s.active },
      });
      await load();
      notify("Staff access updated.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="DESK SETTINGS" />
      <ErrorNotice>{error}</ErrorNotice>
      <div className="settings-grid">
        <section className="settings-card">
          <div className="section-heading">
            <h2>TOWEL POLICY</h2>
            <SlidersHorizontal size={21} />
          </div>
          <p className="muted">
            Set the limits reception uses for new checkouts.
          </p>
          {settings && (
            <form onSubmit={save}>
              <label>
                Maximum towels per member
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={settings.max_outstanding}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      max_outstanding: Number(e.target.value),
                    }))
                  }
                />
                <small>The total a member can have outstanding at once.</small>
              </label>
              <label>
                Return window (hours)
                <input
                  type="number"
                  min={1}
                  max={168}
                  required
                  value={settings.due_hours}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      due_hours: Number(e.target.value),
                    }))
                  }
                />
                <small>
                  Applies to new checkouts. Existing return deadlines stay as
                  recorded.
                </small>
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    Save policy <Check size={17} />
                  </>
                )}
              </button>
            </form>
          )}
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <h2>RECEPTION TEAM</h2>
            <button className="text-button" onClick={() => setAdding(true)}>
              <Plus size={17} /> Add staff
            </button>
          </div>
          <p className="muted">
            Staff can check out and return towels. Administrators also manage
            members, imports, exports and settings.
          </p>
          <div className="staff-list">
            {staff.map((s) => (
              <div key={s.id} className="staff-row">
                <Avatar name={s.name} />
                <div>
                  <strong>
                    {s.name}
                    {s.id === user.id ? " (you)" : ""}
                  </strong>
                  <span>{s.email}</span>
                  <small>
                    {s.role === "admin" ? "Administrator" : "Reception"}
                    {!s.active ? " · Inactive" : ""}
                  </small>
                </div>
                {s.id !== user.id && (
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() => toggle(s)}
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      {adding && (
        <StaffForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            notify("Staff account created.");
          }}
        />
      )}
    </>
  );
}
function StaffForm({ onClose, onSaved }) {
  const [data, setData] = useState({
      name: "",
      email: "",
      password: "",
      role: "staff",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/staff", { method: "POST", body: data });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="ADD STAFF"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} className="member-form">
        {["name", "email", "password"].map((k) => (
          <label key={k}>
            {k === "name"
              ? "Full name"
              : k === "email"
                ? "Staff email"
                : "Password"}
            <input
              type={k === "name" ? "text" : k}
              required
              minLength={k === "password" ? 12 : 1}
              maxLength={k === "email" ? 254 : k === "password" ? 200 : 100}
              autoComplete={k === "password" ? "new-password" : "off"}
              value={data[k]}
              onChange={(e) => setData((d) => ({ ...d, [k]: e.target.value }))}
            />
            {k === "password" && (
              <small>Use a unique password of at least 12 characters.</small>
            )}
          </label>
        ))}
        <label>
          Access level
          <select
            value={data.role}
            onChange={(e) => setData((d) => ({ ...d, role: e.target.value }))}
          >
            <option value="staff">Reception staff</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <ErrorNotice>{error}</ErrorNotice>
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : (
            <>
              Create account <Plus size={18} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}

createRoot(document.getElementById("root")).render(<App />);
