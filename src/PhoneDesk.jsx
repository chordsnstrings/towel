import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  CircleAlert,
  Delete,
  LoaderCircle,
  Phone,
  Plus,
  Search,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { api } from "./api.js";
import {
  formatPhone,
  normalizePhone,
  phoneSearch,
  westernDigits,
} from "../shared/phone.js";
import "./phone-desk.css";

const noop = () => {};
const towels = (n) => `${n} towel${n === 1 ? "" : "s"}`;
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
const Spinner = () => <LoaderCircle className="spin" size={19} />;
const ErrorNotice = ({ children }) =>
  children ? (
    <div className="error-notice" role="alert">
      <CircleAlert size={18} />
      <span>{children}</span>
    </div>
  ) : null;

export function TowelActions({
  initial,
  onSaved,
  onBack,
  onBusyChange = noop,
}) {
  const [member, setMember] = useState(initial);
  const [settings, setSettings] = useState(null);
  const [kind, setKind] = useState(initial.outstanding ? "return" : "checkout");
  const [quantity, setQuantity] = useState(initial.outstanding || 1);
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const pending = useRef(false),
    request = useRef(null),
    alive = useRef(true);
  const locked = busy || uncertain;
  useEffect(() => {
    onBusyChange(locked);
  }, [locked, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  async function refresh(first = false) {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api("/members/" + initial.id),
        api("/settings"),
      ]);
      if (!alive.current) return;
      setMember(m);
      setSettings(s);
      const nextKind = first ? (m.outstanding ? "return" : "checkout") : kind;
      if (first) setKind(nextKind);
      setQuantity((q) =>
        first
          ? m.outstanding || 1
          : Math.max(
              1,
              Math.min(
                q,
                nextKind === "return"
                  ? m.outstanding
                  : s.max_outstanding - m.outstanding,
              ),
            ),
      );
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    refresh(true);
    return () => {
      alive.current = false;
    };
  }, [initial.id]);
  const max =
    kind === "return"
      ? member.outstanding
      : Math.max(0, (settings?.max_outstanding || 0) - member.outstanding);
  const after = member.outstanding + (kind === "return" ? -quantity : quantity);
  const choose = (value) => {
    setKind(value);
    setQuantity(value === "return" ? member.outstanding : 1);
    setCustom(false);
    setError("");
    request.current = null;
  };
  async function save() {
    if (
      pending.current ||
      loading ||
      !settings ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > max
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    const body = { memberId: member.id, kind, quantity, notes };
    const fingerprint = JSON.stringify(body);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = await api("/transactions", {
        method: "POST",
        body: { ...body, requestId: request.current.id },
      });
      if (alive.current) {
        setUncertain(false);
        onSaved({ ...result, member });
      }
    } catch (e) {
      if (!alive.current) return;
      const unknown = !e.status || e.status >= 500;
      setUncertain(unknown);
      setError(
        unknown
          ? "The save could not be confirmed. Retry this same handover to check it; it will only be recorded once."
          : e.message,
      );
      if (e.status === 409) {
        request.current = null;
        await refresh();
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="phone-member-action">
      <div className="phone-member-heading">
        <span className="eyebrow">SELECTED MEMBER</span>
        <button className="text-button" disabled={locked} onClick={onBack}>
          Change member
        </button>
      </div>
      <h2>{member.full_name}</h2>
      <p className="phone-member-contact">
        {formatPhone(member.phone)} <span>·</span> {member.membership}
      </p>
      {!member.phone && (
        <p className="phone-missing">
          Phone not added. An administrator can add it in Members.
        </p>
      )}
      {!member.active && (
        <p className="phone-missing">
          Inactive member · outstanding towels can still be returned.
        </p>
      )}
      <div className="phone-balance">
        <span>Towels with member</span>
        <strong>{member.outstanding}</strong>
        {member.overdue > 0 && (
          <span className="phone-overdue">
            {towels(member.overdue)} overdue
          </span>
        )}
      </div>
      {loading ? (
        <div className="loading-row">
          <Spinner /> Checking current balance
        </div>
      ) : (
        <>
          <div
            className="phone-action-tabs"
            role="group"
            aria-label="Towel action"
          >
            <button
              aria-pressed={kind === "checkout"}
              disabled={locked || !member.active}
              onClick={() => choose("checkout")}
            >
              <ArrowUpRight size={18} /> Give towels
            </button>
            <button
              aria-pressed={kind === "return"}
              disabled={locked || !member.outstanding}
              onClick={() => choose("return")}
            >
              <ArrowDownLeft size={18} /> Return towels
            </button>
          </div>
          <p className="phone-quantity-label">
            {kind === "return"
              ? "How many are coming back?"
              : "How many are going out?"}
          </p>
          <div
            className="phone-quantity-options"
            role="group"
            aria-label="Number of towels"
          >
            {[1, 2, 3]
              .filter((n) => n <= max && (kind !== "return" || n < max))
              .map((n) => (
                <button
                  key={n}
                  disabled={locked}
                  aria-pressed={!custom && quantity === n}
                  onClick={() => {
                    setQuantity(n);
                    setCustom(false);
                  }}
                >
                  {n}
                </button>
              ))}
            {kind === "return" && max > 0 && (
              <button
                disabled={locked}
                aria-pressed={!custom && quantity === max}
                onClick={() => {
                  setQuantity(max);
                  setCustom(false);
                }}
              >
                All · {max}
              </button>
            )}
            {max > 3 && (
              <button
                disabled={locked}
                aria-pressed={custom}
                onClick={() => setCustom(true)}
              >
                More
              </button>
            )}
          </div>
          {custom && (
            <label className="phone-custom-quantity">
              Towels
              <input
                type="number"
                min="1"
                max={max}
                inputMode="numeric"
                value={quantity}
                disabled={locked}
                onChange={(e) =>
                  setQuantity(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </label>
          )}
          <p className="phone-after">
            {max === 0
              ? kind === "return"
                ? "This member has no towels outstanding."
                : "This member has reached the towel limit."
              : Number.isInteger(quantity) && quantity > 0 && quantity <= max
                ? `After ${kind === "return" ? "return" : "handover"}: ${towels(after)} with member`
                : `Choose between 1 and ${max} towels.`}
          </p>
          <details className="phone-note">
            <summary>Optional note</summary>
            <input
              aria-label="Handover note"
              placeholder="Anything reception should know?"
              maxLength={500}
              value={notes}
              disabled={locked}
              onChange={(e) => setNotes(e.target.value)}
            />
          </details>
        </>
      )}
      <ErrorNotice>{error}</ErrorNotice>
      {!settings && !loading && (
        <button className="button secondary full" onClick={() => refresh(true)}>
          Retry loading member
        </button>
      )}
      <button
        className="button primary full phone-confirm"
        disabled={
          busy ||
          loading ||
          !settings ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > max ||
          (!member.active && kind === "checkout")
        }
        onClick={save}
      >
        {busy ? (
          <>
            <Spinner /> Saving…
          </>
        ) : uncertain ? (
          <>
            Retry same handover <ArrowRight size={19} />
          </>
        ) : (
          <>
            {kind === "return"
              ? quantity === max
                ? "Return all"
                : "Return"
              : "Give"}{" "}
            {towels(quantity)} <ArrowRight size={19} />
          </>
        )}
      </button>
      <p className="phone-confirm-caption">
        For {member.full_name} · confirm once towels are{" "}
        {kind === "return" ? "received" : "handed over"}.
      </p>
    </div>
  );
}

export default function PhoneDesk({
  admin,
  notify,
  onNavigate,
  MemberForm,
  onBusyChange = noop,
}) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("phone");
  const [matches, setMatches] = useState({ rows: [], total: 0 });
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [member, setMember] = useState(null);
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoUnknown, setUndoUnknown] = useState(false);
  const [undoError, setUndoError] = useState("");
  const [creating, setCreating] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [wide, setWide] = useState(
    () => window.matchMedia("(min-width: 761px)").matches,
  );
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const input = useRef(null),
    version = useRef(0),
    undoRequest = useRef(null),
    undoPending = useRef(false);
  const locked = busy || undoing || undoUnknown;
  const enough =
    searchMode === "name" ? query.trim().length >= 2 : !!phoneSearch(query);
  useEffect(() => {
    onBusyChange(locked);
    return () => onBusyChange(false);
  }, [locked, onBusyChange]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const load = () =>
    api("/dashboard")
      .then(setDashboard)
      .catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      load();
      setNow(Date.now());
    }, 20000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const current = ++version.current;
    const abort = new AbortController();
    setMatches({ rows: [], total: 0 });
    setError("");
    if (!enough || member || result) {
      setSearching(false);
      return () => abort.abort();
    }
    setSearching(true);
    const timer = setTimeout(
      () =>
        api(
          `/members/search?mode=${searchMode}&q=${encodeURIComponent(query)}`,
          { signal: abort.signal },
        )
          .then((data) => {
            if (current === version.current) setMatches(data);
          })
          .catch((e) => {
            if (current === version.current && !abort.signal.aborted)
              setError(e.message);
          })
          .finally(() => {
            if (current === version.current) setSearching(false);
          }),
      180,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, searchMode, enough, member, result, revision]);
  function next() {
    setResult(null);
    setMember(null);
    setQuery("");
    setSearchMode("phone");
    setMatches({ rows: [], total: 0 });
    requestAnimationFrame(() => input.current?.focus());
  }
  useEffect(() => {
    if (!result || locked || result.isCorrection) return;
    const timer = setTimeout(next, 2400);
    return () => clearTimeout(timer);
  }, [result, locked]);
  function saved(data) {
    setResult(data);
    setMember(null);
    setLast(data);
    undoRequest.current = null;
    setUndoError("");
    load();
    setNow(Date.now());
  }
  async function undo() {
    if (!last || member || busy || undoPending.current) return;
    undoPending.current = true;
    setUndoing(true);
    setUndoError("");
    if (!undoRequest.current) undoRequest.current = crypto.randomUUID();
    try {
      const corrected = await api(`/transactions/${last.transaction.id}/undo`, {
        method: "POST",
        body: { requestId: undoRequest.current },
      });
      const originalMember = last.member;
      setResult({ ...corrected, member: originalMember, isCorrection: true });
      setMember(null);
      setLast(null);
      setUndoUnknown(false);
      load();
      notify(
        "Handover corrected. The original record stays in the activity history.",
      );
    } catch (e) {
      const unknown = !e.status || e.status >= 500;
      setUndoUnknown(unknown);
      setUndoError(
        unknown
          ? "The correction could not be confirmed. Retry the same undo to check it."
          : e.message,
      );
      if (!unknown) {
        setLast(null);
        setRevision((v) => v + 1);
      }
    } finally {
      undoPending.current = false;
      setUndoing(false);
    }
  }
  function editQuery(value) {
    if (locked) return;
    setQuery(value);
    setMember(null);
    setResult(null);
  }
  const canUndo =
    last &&
    (undoUnknown ||
      now - new Date(last.transaction.created_at).getTime() < 5 * 60000);
  return (
    <>
      <div className="page-heading phone-page-heading">
        <div>
          <p className="eyebrow">RECEPTION / FIVE JUMEIRAH VILLAGE</p>
          <h1>TOWEL DESK</h1>
        </div>
        <button
          className="phone-live-total"
          disabled={locked}
          onClick={() => onNavigate("outstanding")}
        >
          <span>{dashboard?.outstanding ?? "—"}</span> towels with members{" "}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <section
        className={"phone-desk " + (member || result ? "phone-has-member" : "")}
        aria-label="Phone lookup and towel handover"
      >
        <div className="phone-lookup">
          <div className="phone-step-label">
            <span>01</span> FIND YOUR MEMBER
          </div>
          <h2>
            {searchMode === "phone" ? (
              <>
                NUMBER IN.
                <br />
                TOWELS OUT.
              </>
            ) : (
              <>
                A NAME.
                <br />A QUICK MATCH.
              </>
            )}
          </h2>
          <label htmlFor="reception-phone">
            {searchMode === "phone"
              ? "Phone number or last 4 digits"
              : "Member name"}
          </label>
          <div className="phone-entry">
            <Search size={21} />
            <input
              ref={input}
              id="reception-phone"
              type={searchMode === "phone" ? "tel" : "text"}
              inputMode={
                searchMode === "name" ? "text" : wide ? "none" : "numeric"
              }
              value={query}
              autoComplete="off"
              spellCheck="false"
              maxLength={searchMode === "phone" ? 40 : 160}
              placeholder={
                searchMode === "phone"
                  ? "Enter phone number"
                  : "First or last name"
              }
              disabled={locked}
              onChange={(e) => editQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label="Clear member search"
                disabled={locked}
                onClick={() => editQuery("")}
              >
                <X size={19} />
              </button>
            )}
          </div>
          <p className="phone-input-hint">
            {searchMode === "phone"
              ? "UAE: 05… or +971… · international numbers accepted"
              : "Members without a phone can still be found by name."}
          </p>
          {searchMode === "phone" && (
            <div
              className="phone-keypad"
              role="group"
              aria-label="Phone number keypad"
            >
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "+",
                "0",
                "delete",
              ].map((key) => (
                <button
                  key={key}
                  disabled={locked}
                  aria-label={
                    key === "delete"
                      ? "Delete last digit"
                      : key === "+"
                        ? "International prefix"
                        : undefined
                  }
                  onClick={() =>
                    editQuery(
                      key === "delete"
                        ? query.slice(0, -1)
                        : key === "+"
                          ? query.startsWith("+")
                            ? query
                            : "+" + query
                          : (query + key).slice(0, 40),
                    )
                  }
                >
                  {key === "delete" ? <Delete size={23} /> : key}
                </button>
              ))}
            </div>
          )}
          <button
            className="text-button phone-search-switch"
            disabled={locked}
            onClick={() => {
              setSearchMode(searchMode === "phone" ? "name" : "phone");
              editQuery("");
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            {searchMode === "phone" ? (
              <>
                <Users size={17} /> Search by name instead
              </>
            ) : (
              <>
                <Phone size={17} /> Search by phone instead
              </>
            )}
          </button>
          <div className="phone-directory-link">
            <button
              className="text-button"
              disabled={locked}
              onClick={() => onNavigate("members")}
            >
              Member directory <ArrowRight size={17} />
            </button>
            {admin && (
              <button
                className="text-button"
                disabled={locked}
                onClick={() => setCreating(true)}
              >
                <Plus size={17} /> Add member
              </button>
            )}
          </div>
        </div>
        <div className="phone-work-area">
          {result ? (
            <div className="phone-saved" role="status">
              <span className="success-icon">
                <Check size={32} />
              </span>
              <p className="eyebrow">
                {result.isCorrection ? "CORRECTION RECORDED" : "ALL SET"}
              </p>
              <h2>
                {result.isCorrection ? (
                  "Handover corrected."
                ) : (
                  <>
                    {towels(result.transaction.quantity)}
                    <br />
                    {result.transaction.kind === "return"
                      ? "returned."
                      : "handed over."}
                  </>
                )}
              </h2>
              <p>
                <strong>{result.member.full_name}</strong>
                <br />
                {towels(result.currentBalance)} with member
              </p>
              <button
                className="button primary full"
                disabled={locked}
                onClick={next}
              >
                Next member <ArrowRight size={19} />
              </button>
              {!result.isCorrection && (
                <small>Ready for the next member automatically</small>
              )}
            </div>
          ) : member ? (
            <TowelActions
              key={member.id}
              initial={member}
              onBusyChange={setBusy}
              onBack={() => setMember(null)}
              onSaved={saved}
            />
          ) : (
            <>
              <div className="phone-step-label">
                <span>02</span> CONFIRM THE NAME
              </div>
              <div className="phone-results-heading">
                <h2>
                  {searching
                    ? "Finding your member…"
                    : error
                      ? "Let’s try that again."
                      : !enough
                        ? "WHO’S NEXT?"
                        : matches.total
                          ? `${matches.total} ${matches.total === 1 ? "member" : "members"} found`
                          : "No member found."}
                </h2>
                <p>
                  {!enough
                    ? searchMode === "phone"
                      ? "Enter a phone number or its last four digits to get started."
                      : "Enter at least two letters to find a member."
                    : matches.total
                      ? "Confirm their name, then choose the towel action."
                      : "Check the number, or try their name."}
                </p>
              </div>
              <ErrorNotice>{error}</ErrorNotice>
              {error && (
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => setRevision((v) => v + 1)}
                >
                  Retry search
                </button>
              )}
              {searching ? (
                <div className="loading-row">
                  <Spinner /> Searching members
                </div>
              ) : (
                <div className="phone-match-list">
                  {matches.rows.map((m) => (
                    <button
                      className="phone-match"
                      key={m.id}
                      disabled={locked}
                      onClick={() => setMember(m)}
                    >
                      <span className="avatar">{initials(m.full_name)}</span>
                      <span className="phone-match-person">
                        <strong>{m.full_name}</strong>
                        <span>{formatPhone(m.phone)}</span>
                        <small>
                          {m.membership}
                          {!m.active ? " · Inactive" : ""}
                        </small>
                      </span>
                      <span className="phone-match-balance">
                        <strong>{m.outstanding}</strong>
                        <span>
                          {m.outstanding ? "towels out" : "all returned"}
                        </span>
                        <ArrowRight size={18} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {matches.total > matches.rows.length && (
                <p className="phone-refine">
                  Showing the first {matches.rows.length} matches. Enter more
                  digits or search their name.
                </p>
              )}
              {!enough && (
                <div className="phone-idle">
                  <div>
                    <span>1</span>
                    <p>Find the member</p>
                  </div>
                  <div>
                    <span>2</span>
                    <p>Give or return towels</p>
                  </div>
                  <div>
                    <span>3</span>
                    <p>Confirm. All set.</p>
                  </div>
                </div>
              )}
              {enough && !searching && !error && !matches.total && (
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => {
                    setSearchMode(searchMode === "phone" ? "name" : "phone");
                    editQuery("");
                  }}
                >
                  Try {searchMode === "phone" ? "name" : "phone"} search{" "}
                  <ArrowRight size={17} />
                </button>
              )}
            </>
          )}
        </div>
        <div className="phone-desk-receipt">
          <div aria-live="polite">
            {last ? (
              <>
                <strong>{last.member.full_name}</strong>
                <span>
                  {" "}
                  · {towels(last.transaction.quantity)}{" "}
                  {last.transaction.kind === "return" ? "returned" : "given"}
                </span>
              </>
            ) : (
              <span>Every handover is confirmed before it is saved.</span>
            )}
          </div>
          {canUndo && (
            <button
              className="button secondary"
              disabled={busy || !!member || undoing}
              onClick={undo}
            >
              {undoing ? <Spinner /> : <Undo2 size={17} />}
              {undoUnknown ? "Retry same undo" : "Undo last action"}
            </button>
          )}
          {undoError && <ErrorNotice>{undoError}</ErrorNotice>}
        </div>
      </section>
      {creating && (
        <MemberForm
          initial={{
            phone:
              searchMode === "phone"
                ? normalizePhone(westernDigits(query)) || ""
                : "",
            full_name: searchMode === "name" ? query : "",
          }}
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false);
            setMember({ ...m, outstanding: 0 });
            setResult(null);
            notify("Member added.");
          }}
        />
      )}
    </>
  );
}
