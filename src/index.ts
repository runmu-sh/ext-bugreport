/**
 * Bug report (@runmu.sh/ext-bugreport): a panel for writing and filing a bug report in the game, over GMCP `Bug 1`.
 * The draft lives on the server (Torchship's `@bug` edits the same one), so the panel and the command line agree:
 * the server sends `Bug.Draft` on login, on Core.Supports and after every change, `Bug.Result` after every action,
 * `Bug.Mine` (the character's own reports) when asked and after a filing, and `Bug.Traceback` whenever the game
 * shows the character an error. The panel sends `Bug.Get`, `Bug.Open`, `Bug.Save {fields}`, `Bug.Submit {fields}`
 * and `Bug.Abort`.
 *
 * The panel: ┤DRAFT├ with SUBJECT, SEVERITY and CATEGORY toggles, WHAT HAPPENED (a textarea with a character count),
 * LAST ERROR (code, message, command, where, the traceback on demand, and ■ ATTACH), then [ SUBMIT ] [ SAVE DRAFT ]
 * [ DISCARD ] and a status line; ┤MY REPORTS├ below. Without a draft it reads NO REPORT OPEN with [ NEW REPORT ].
 * Subject and body are saved when the field loses focus; the toggles save at once.
 *
 * The easy button: ☰ → Report a bug, the command "Report a bug" (palette, bindable), and a [ ⚠ BUG ] button in the
 * HUD's top-right corner (hidden while the panel is open; a setting turns it off). Each opens the panel and starts a draft when none is open. When the
 * game shows an error, a toast offers REPORT IT (another setting). Activation is `onGmcp:Bug`: on a game that never
 * sends the package the extension stays dormant.
 */
import { defineExtension, h, type Dispose, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { COPY } from './copy';
import { BODY_MAX, SETTINGS, SUBJECT_MAX, type BugDraft, type BugFields, type BugReport, type BugReportApi, type BugResult, type BugState, type BugTraceback } from './types';

export type { BugDraft, BugFields, BugReport, BugReportApi, BugResult, BugState, BugTraceback } from './types';
export { BODY_LINES_MAX, BODY_MAX, SETTINGS, SUBJECT_MAX } from './types';
export { COPY } from './copy';

const ID = 'bugreport';
const R = `.ext-panel[data-ext="${ID}"] .mu-bugreport`;
/** Theme tokens only, every rule under the panel root (the HUD button under its own root). */
export const BUG_CSS = `
${R} { height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: .9rem; box-sizing: border-box; }
${R} *, ${R} *::before, ${R} *::after { box-sizing: border-box; }
${R}:focus { outline: none; }
${R} .scroll { flex: 1; overflow-y: auto; padding: 0 10px 8px; }
${R} .sec-head { margin: .9rem 0 .4rem; }
${R} .fld { display: flex; flex-direction: column; gap: 3px; margin: 0 0 9px; }
${R} .fld > .lab { display: flex; align-items: baseline; gap: 1ch; }
${R} .fld > .lab .n { flex: 1; }
${R} .fld .cnt { font-size: .62rem; letter-spacing: .08em; color: var(--fg-faint); }
${R} .fld .cnt.over { color: var(--alert); }
${R} .fld .sh-field { width: 100%; font: inherit; font-size: .84rem; }
${R} .fld textarea.sh-field { min-height: 9em; resize: vertical; line-height: 1.4; }
${R} .opts { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -.5ch; }
${R} .err { border: 1px solid var(--border); background: var(--bg-deep); padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; font-size: .78rem; }
${R} .err .l1 { display: flex; align-items: baseline; gap: 1ch; flex-wrap: wrap; }
${R} .err .code { color: var(--alert); font-weight: 500; }
${R} .err .msg { color: var(--fg); flex: 1; min-width: 0; }
${R} .err .meta { color: var(--fg-dim); font-size: .72rem; display: flex; gap: 1ch; flex-wrap: wrap; }
${R} .err .meta .cmdline { color: var(--gold); }
${R} .err .meta .sep { color: var(--fg-faint); }
${R} .err .acts { display: flex; gap: 4px; align-items: center; margin-left: -.5ch; }
${R} .err pre { margin: 2px 0 0; padding: 4px 6px; border-top: 1px solid var(--border); color: var(--fg-dim); font: inherit; font-size: .7rem; white-space: pre-wrap; word-break: break-all; max-height: 12em; overflow: auto; }
${R} .err.none { color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
${R} .where { font-size: .7rem; color: var(--fg-faint); margin: -4px 0 8px; }
${R} .foot { display: flex; flex-direction: column; gap: 3px; padding: 7px 10px 8px; background: var(--bg-elev); border-top: 1px solid var(--border-bright); }
${R} .foot .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-left: -.5ch; }
${R} .foot .status { font-size: .72rem; color: var(--fg-dim); min-height: 1.2em; }
${R} .foot .status.bad { color: var(--alert); }
${R} .foot .status.good { color: var(--ok); }
${R} .bar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: var(--bg-elev); border-bottom: 1px solid var(--accent); min-height: 32px; }
${R} .bar .t { flex: 1; min-width: 0; font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-dim); }
${R} .awaiting { margin: .9rem 0 0; color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
${R} .rep { display: grid; grid-template-columns: 9ch 1fr auto; gap: 0 1ch; align-items: baseline; width: 100%; padding: 5px 4px 5px 2.4ch; border: 0; border-bottom: 1px solid var(--border); background: none; color: inherit; text-align: left; font: inherit; font-size: .8rem; position: relative; transition: background-color .12s ease; }
${R} .rep::before { content: "▸"; position: absolute; left: .6ch; color: transparent; transition: color .12s ease; }
${R} .rep:hover, ${R} .rep:focus-visible { background: var(--tint-row); }
${R} .rep:hover::before, ${R} .rep:focus-visible::before { color: var(--accent-bright); }
${R} .rep:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${R} .rep:disabled { cursor: default; }
${R} .rep:disabled:hover { background: none; }
${R} .rep .ref { color: var(--fg-dim); font-size: .72rem; }
${R} .rep .subj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .rep .st { display: flex; gap: 1ch; align-items: baseline; }
${R} .rep .ago { font-size: .66rem; color: var(--fg-faint); white-space: nowrap; }
.mu-bugreport-hud { display: flex; justify-content: flex-end; margin-top: 40px; font-family: var(--font-mono); background: var(--bg-elev); border: 1px solid var(--border-bright); }
.mu-bugreport-hud[hidden] { display: none; }
.mu-bugreport-hud .ic { color: var(--gold); }
`;

// ─── the payloads ─────────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
/** MOO booleans can arrive as true/false or 1/0. */
const bool = (v: unknown) => v === true || v === 1;

/** A `Bug.Traceback` payload (or `last_traceback`) → a traceback, or null. Exported for tests. */
export function tracebackOf(v: unknown): BugTraceback | null {
  const d = obj(v);
  if (!d || !str(d.code)) return null;
  return { time: num(d.time), code: str(d.code), msg: str(d.msg), where: str(d.where), command: str(d.command), location: str(d.location), traceback: strs(d.traceback) };
}

/** A `Bug.Draft` payload → the state, or null when it is not one. Exported for tests. */
export function stateOf(v: unknown): BugState | null {
  const d = obj(v);
  if (!d || !('open' in d)) return null;
  const dr = obj(d.draft);
  const draft: BugDraft | null = bool(d.open) && dr
    ? { subject: str(dr.subject), body: str(dr.body), severity: str(dr.severity) || 'normal', category: str(dr.category) || 'general', traceback: bool(dr.traceback), started: num(dr.started), location: str(dr.location) }
    : null;
  const severities = strs(d.severities), categories = strs(d.categories);
  return {
    draft,
    severities: severities.length ? severities : ['low', 'normal', 'high', 'critical'],
    categories: categories.length ? categories : ['general'],
    lastTraceback: tracebackOf(d.last_traceback),
  };
}

/** A `Bug.Result` payload → a result, or null. Exported for tests. */
export function resultOf(v: unknown): BugResult | null {
  const d = obj(v);
  if (!d || !str(d.action)) return null;
  const r: BugResult = { action: str(d.action), ok: bool(d.ok), message: str(d.message) };
  if (num(d.id)) r.id = num(d.id);
  return r;
}

/** A `Bug.Mine` payload → the reports, or null. Exported for tests. */
export function mineOf(v: unknown): BugReport[] | null {
  const d = obj(v);
  if (!d || !Array.isArray(d.reports)) return null;
  return d.reports.map(obj).filter((r): r is Record<string, unknown> => !!r && !!str(r.subject))
    .map((r) => ({ id: num(r.id), ref: str(r.ref), subject: str(r.subject), status: str(r.status) || 'open', created: num(r.created), updated: num(r.updated) }));
}

/** The fields to show: the server's draft with the player's unsaved edits over it. Exported for tests. */
export function shown(draft: BugDraft, edits: BugFields): BugDraft {
  return { ...draft, ...(edits.subject !== undefined ? { subject: edits.subject } : {}), ...(edits.body !== undefined ? { body: edits.body } : {}) };
}

/** Edits the server now holds are no longer unsaved. Exported for tests. */
export function settle(draft: BugDraft | null, edits: BugFields): BugFields {
  if (!draft) return {};
  const out: BugFields = {};
  if (edits.subject !== undefined && edits.subject.trim() !== draft.subject) out.subject = edits.subject;
  if (edits.body !== undefined && edits.body.replace(/\s+$/, '') !== draft.body) out.body = edits.body;
  return out;
}

const ago = (t: number, now: number) => (t ? COPY.ago(Math.max(0, now - t)) : '');
const statusPlate = (s: string) => (s === 'resolved' ? 'ok' : s === 'open' ? 'hot' : s === 'claimed' ? 'gold' : 'dim');

// ─── the panel ────────────────────────────────────────────────────────────────────────────────────────────────

/** What the panel needs from the extension. */
export interface PanelHost {
  css: Mu['ui']['css'];
  state(): BugState | null;
  edits(): BugFields;
  mine(): BugReport[] | null;
  status(): { text: string; kind: '' | 'good' | 'bad' } | null;
  /** The traceback lines are shown. */
  traceOpen(): boolean;
  now(): number;
  edit(field: 'subject' | 'body', value: string): void;
  /** Save one text field (on blur). */
  commit(field: 'subject' | 'body'): void;
  set(fields: BugFields): void;
  toggleTrace(): void;
  newReport(): void;
  save(): void;
  submit(): void;
  discard(): void;
  follow(ref: string): void;
}

const secHead = (css: Mu['ui']['css'], label: string, n?: number) => h('div', { class: css.secHead, role: 'heading', 'aria-level': '3' }, n === undefined ? label : `${label} (${n})`, h('span', { class: css.secClose, 'aria-hidden': 'true' }));
const note = (css: Mu['ui']['css'], text: string, testid = 'bug-empty') => h('p', { class: `${css.empty} awaiting`, 'data-testid': testid }, text);

/** The panel's DOM for one state. Exported for tests. */
export function renderPanel(host: PanelHost): { bar: HTMLElement; body: HTMLElement[]; foot: HTMLElement | null } {
  const css = host.css;
  const st = host.state();
  const cmd = (label: string, testid: string, run: () => void, extra = '', o: { disabled?: boolean; title?: string } = {}) =>
    h('button', { class: `${css.cmd}${extra ? ` ${extra}` : ''}`, type: 'button', 'data-testid': testid, disabled: o.disabled ? true : undefined, title: o.title ?? '', onclick: run }, label);

  const draft = st?.draft ? shown(st.draft, host.edits()) : null;
  const dirty = !!st?.draft && (host.edits().subject !== undefined || host.edits().body !== undefined);
  const bar = h('div', { class: 'bar' },
    h('span', { class: 't', 'data-testid': 'bug-bar' }, draft ? COPY.draft : st ? COPY.none : COPY.awaiting),
    draft ? h('span', { class: `${css.plate} ${dirty ? css.gold : css.dim}`, 'data-testid': 'bug-dirty' }, dirty ? COPY.unsaved : COPY.saved) : null,
    st && !draft ? cmd(COPY.newReport, 'bug-new', () => host.newReport(), 'primary') : null);

  const body: HTMLElement[] = [];
  if (!st) body.push(note(css, COPY.awaiting));
  if (draft && st) {
    body.push(secHead(css, COPY.draft));
    if (draft.location) body.push(h('div', { class: 'where', 'data-testid': 'bug-where' }, COPY.started(draft.location)));
    const subj = h('input', { class: css.field, type: 'text', name: 'subject', value: draft.subject, maxlength: String(SUBJECT_MAX), placeholder: COPY.subjectPh, 'aria-label': COPY.subject, 'data-testid': 'bug-subject', autocomplete: 'off' }) as HTMLInputElement;
    subj.addEventListener('input', () => host.edit('subject', subj.value));
    subj.addEventListener('change', () => host.commit('subject'));
    subj.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); host.commit('subject'); } });
    body.push(h('label', { class: 'fld' }, h('span', { class: 'lab' }, h('span', { class: `${css.label} n` }, COPY.subject)), subj));

    const opts = (label: string, key: 'severity' | 'category', list: string[], cur: string) =>
      h('div', { class: 'fld', role: 'group', 'aria-label': label },
        h('span', { class: 'lab' }, h('span', { class: `${css.label} n` }, label)),
        h('div', { class: 'opts' }, ...list.map((o) =>
          h('button', { class: `${css.toggle}${o === cur ? '' : ` ${css.off}`}`, type: 'button', 'aria-pressed': String(o === cur), 'data-testid': `bug-${key}-${o}`, onclick: () => { if (o !== cur) host.set({ [key]: o }); } }, o))));
    body.push(opts(COPY.severity, 'severity', st.severities, draft.severity));
    body.push(opts(COPY.category, 'category', st.categories, draft.category));

    const ta = h('textarea', { class: css.field, name: 'body', placeholder: COPY.bodyPh, 'aria-label': COPY.body, 'data-testid': 'bug-body', rows: '8' }) as HTMLTextAreaElement;
    ta.value = draft.body;
    const cnt = h('span', { class: `cnt${draft.body.length > BODY_MAX ? ' over' : ''}`, 'data-testid': 'bug-count' }, COPY.count(draft.body.length, BODY_MAX));
    ta.addEventListener('input', () => { host.edit('body', ta.value); cnt.textContent = COPY.count(ta.value.length, BODY_MAX); cnt.classList.toggle('over', ta.value.length > BODY_MAX); });
    ta.addEventListener('change', () => host.commit('body'));
    body.push(h('label', { class: 'fld' }, h('span', { class: 'lab' }, h('span', { class: `${css.label} n` }, COPY.body), cnt), ta));

    body.push(h('div', { class: 'fld' }, h('span', { class: 'lab' }, h('span', { class: `${css.label} n` }, COPY.error)), errorBox(host, st.lastTraceback, draft.traceback)));
  }

  const mine = host.mine();
  if (st) {
    body.push(secHead(css, COPY.mine, mine ? mine.length : undefined));
    if (mine && !mine.length) body.push(note(css, COPY.noReports, 'bug-no-reports'));
    for (const r of mine ?? []) {
      const live = r.ref !== '' && r.ref !== 'archived';
      body.push(h('button', { class: 'rep', type: 'button', 'data-testid': 'bug-report', 'data-ref': r.ref, disabled: live ? undefined : true, title: live ? COPY.followTitle : '', onclick: () => { if (live) host.follow(r.ref); } },
        h('span', { class: 'ref' }, r.ref || '—'),
        h('span', { class: 'subj' }, r.subject),
        h('span', { class: 'st' }, h('span', { class: `${css.plate} ${(css as Record<string, string>)[statusPlate(r.status)] ?? ''}` }, r.status), h('span', { class: 'ago' }, ago(r.updated || r.created, host.now())))));
    }
  }

  if (!draft) return { bar, body, foot: null };
  const s = host.status();
  const foot = h('div', { class: 'foot', 'data-testid': 'bug-foot' },
    h('div', { class: 'acts' },
      cmd(COPY.submit, 'bug-submit', () => host.submit(), 'primary', { disabled: !draft.subject.trim() || !draft.body.trim(), title: !draft.subject.trim() ? COPY.needSubject : !draft.body.trim() ? COPY.needBody : '' }),
      cmd(COPY.save, 'bug-save', () => host.save(), '', { disabled: !dirty }),
      cmd(COPY.discard, 'bug-discard', () => host.discard(), css.warn)),
    h('div', { class: `status${s?.kind ? ` ${s.kind}` : ''}`, 'data-testid': 'bug-status', role: 'status' }, s?.text ?? ''));
  return { bar, body, foot };
}

function errorBox(host: PanelHost, tb: BugTraceback | null, attached: boolean): HTMLElement {
  const css = host.css;
  if (!tb) return h('div', { class: 'err none', 'data-testid': 'bug-error' }, COPY.noError);
  const meta: HTMLElement[] = [];
  const bits = [tb.command ? h('span', { class: 'cmdline' }, `> ${tb.command}`) : null, tb.location ? h('span', {}, tb.location) : null, tb.time ? h('span', {}, ago(tb.time, host.now())) : null].filter((x): x is HTMLElement => !!x);
  bits.forEach((b, i) => { if (i) meta.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·')); meta.push(b); });
  const open = host.traceOpen();
  return h('div', { class: 'err', 'data-testid': 'bug-error' },
    h('div', { class: 'l1' }, h('span', { class: 'code' }, tb.code), h('span', { class: 'msg' }, tb.msg)),
    meta.length ? h('div', { class: 'meta' }, ...meta) : null,
    h('div', { class: 'acts' },
      h('button', { class: `${css.toggle}${attached ? '' : ` ${css.off}`}`, type: 'button', 'aria-pressed': String(attached), 'data-testid': 'bug-attach', onclick: () => host.set({ traceback: !attached }) }, COPY.attach),
      tb.traceback.length ? h('button', { class: css.cmd, type: 'button', 'aria-expanded': String(open), 'data-testid': 'bug-trace-toggle', onclick: () => host.toggleTrace() }, COPY.showTrace) : null),
    open && tb.traceback.length ? h('pre', { 'data-testid': 'bug-trace' }, [tb.where, ...tb.traceback].filter(Boolean).join('\n')) : null);
}

// ─── the extension ────────────────────────────────────────────────────────────────────────────────────────────

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    ctx.subscriptions.push(mu.ui.style(BUG_CSS));
    const css = mu.ui.css;

    mu.settings.define({
      title: COPY.settingsTitle,
      items: [
        { key: SETTINGS.button, label: COPY.settingButton, default: true, kind: 'toggle', scope: 'both', hint: COPY.settingButtonHint },
        { key: SETTINGS.offer, label: COPY.settingOffer, default: true, kind: 'toggle', scope: 'both', hint: COPY.settingOfferHint },
      ],
    });

    // Per session: the last Bug.Draft, the reports, unsaved edits, the status line, the panels drawing them.
    const states = new Map<string, BugState>();
    const mines = new Map<string, BugReport[]>();
    const edits = new Map<string, BugFields>();
    const statuses = new Map<string, { text: string; kind: '' | 'good' | 'bad' }>();
    const traceOpen = new Map<string, boolean>();
    const redraws = new Map<string, Set<() => void>>();
    const redraw = (sid: string) => { for (const fn of redraws.get(sid) ?? []) fn(); };
    /** HUD buttons to re-sync when a panel mounts or unmounts: the button hides while the panel is open. */
    const hudSyncs = new Set<() => void>();
    const panelOpen = (sid: string | null) => !!sid && (redraws.get(sid)?.size ?? 0) > 0;
    const send = (sid: string, pkg: string, data: unknown = {}) => { void mu.gmcp.send(pkg, data, sid); };
    const activeSid = () => mu.sessions.active()?.id ?? null;

    /** Open the panel on a report: start a draft when none is open (the server attaches a recent error itself). */
    const open = (sid: string | null) => {
      if (!sid) return;
      mu.panels.open(ID, undefined, { sid });
      const st = states.get(sid);
      if (!st?.draft) send(sid, 'Bug.Open');
      if (!mines.has(sid)) send(sid, 'Bug.Get');
      queueMicrotask(() => mu.panels.focus(ID));
    };

    const mount = (hostEl: HTMLElement, pc: PanelMountCtx): Dispose => {
      const root = h('section', { class: 'mu-bugreport', 'aria-label': COPY.title, 'data-focus-region': ID, tabindex: '-1', 'data-testid': 'bugreport' });
      hostEl.append(root);
      const sid = pc.sid;
      const ed = () => (sid ? edits.get(sid) ?? {} : {});
      const setEd = (e: BugFields) => { if (sid) edits.set(sid, e); };
      const status = (text: string, kind: '' | 'good' | 'bad' = '') => { if (sid) statuses.set(sid, { text, kind }); };
      const api: PanelHost = {
        css,
        state: () => (sid ? states.get(sid) ?? null : null),
        edits: ed,
        mine: () => (sid ? mines.get(sid) ?? null : null),
        status: () => (sid ? statuses.get(sid) ?? null : null),
        traceOpen: () => (sid ? !!traceOpen.get(sid) : false),
        now: () => Math.floor(Date.now() / 1000),
        edit: (field, value) => {
          const had = ed()[field] !== undefined;
          setEd({ ...ed(), [field]: value });
          if (!had) syncBar();
        },
        commit: (field) => {
          const v = ed()[field];
          if (!sid || v === undefined) return;
          send(sid, 'Bug.Save', { [field]: v });
        },
        set: (fields) => {
          if (!sid) return;
          // Optimistic: the toggle shows at once; the server's Bug.Draft (or a refusal's) settles it.
          const st = states.get(sid);
          if (st?.draft) { st.draft = { ...st.draft, ...fields } as BugDraft; draw(); }
          send(sid, 'Bug.Save', fields);
        },
        toggleTrace: () => { if (sid) { traceOpen.set(sid, !traceOpen.get(sid)); draw(); } },
        newReport: () => { if (sid) { status(''); send(sid, 'Bug.Open'); } },
        save: () => { if (sid) send(sid, 'Bug.Save', { ...ed() }); },
        submit: () => { if (sid) { status(''); send(sid, 'Bug.Submit', { ...ed() }); } },
        discard: async () => {
          if (!sid) return;
          if (await mu.ui.confirm({ title: COPY.discardTitle, body: COPY.discardBody, confirm: COPY.discardConfirm, danger: true })) { edits.delete(sid); send(sid, 'Bug.Abort'); }
        },
        follow: (ref) => { void mu.sessions.send(COPY.follow(ref), sid ?? undefined); },
      };
      /** Only the dirty plate and SAVE change while typing, so the field keeps its focus and caret. */
      const syncBar = () => {
        const out = renderPanel(api);
        root.querySelector('.bar')?.replaceWith(out.bar);
        const foot = root.querySelector('.foot');
        if (foot && out.foot) foot.querySelector('.acts')?.replaceWith(out.foot.querySelector('.acts')!);
      };
      const draw = () => {
        // A redraw keeps the field being typed in focused, with its caret.
        const act = (root.ownerDocument?.activeElement ?? null) as HTMLInputElement | HTMLTextAreaElement | null;
        const focus = act && root.contains(act) ? { testid: act.getAttribute('data-testid'), a: act.selectionStart, b: act.selectionEnd } : null;
        const top = root.querySelector('.scroll')?.scrollTop ?? 0;
        const out = renderPanel(api);
        const scroll = h('div', { class: 'scroll' }, ...out.body);
        root.replaceChildren(out.bar, scroll, ...(out.foot ? [out.foot] : []));
        scroll.scrollTop = top;
        if (focus?.testid) {
          const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-testid="${focus.testid}"]`);
          if (el) { el.focus(); if (focus.a !== null && 'setSelectionRange' in el) try { el.setSelectionRange(focus.a, focus.b); } catch { /* not a text field */ } }
        }
      };
      draw();
      if (sid && !states.has(sid)) send(sid, 'Bug.Get');
      else if (sid && !mines.has(sid)) send(sid, 'Bug.Get');
      const set = sid ? (redraws.get(sid) ?? redraws.set(sid, new Set()).get(sid)!) : null;
      set?.add(draw);
      for (const f of hudSyncs) f();
      return () => { set?.delete(draw); root.remove(); for (const f of hudSyncs) f(); };
    };

    mu.panels.register({ id: ID, title: COPY.title, singleton: true, defaultPosition: 'right-bottom', order: 45, show: 'auto', mount });

    // The easy buttons: ☰ row, a command (palette, keys), and the HUD [ ⚠ BUG ].
    ctx.subscriptions.push(
      mu.menus.add({ id: 'bugreport.open', slot: 'main', title: COPY.menu, icon: '⚠', order: 70, when: 'session', run: () => open(activeSid()) }),
      mu.commands.register({ id: 'bugreport.open', title: COPY.command, when: 'session', run: () => open(activeSid()) }),
      mu.hud.mount({
        id: 'button', slot: 'top-right', order: 900,
        mount: (el, hc) => {
          const btn = h('button', { class: css.cmd, type: 'button', title: COPY.hudTitle, 'aria-label': COPY.hudTitle, 'data-testid': 'bug-hud', onclick: () => open(hc.sid ?? activeSid()) }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '⚠'), COPY.hud);
          const wrap = h('div', { class: 'mu-bugreport-hud' }, btn);
          el.append(wrap);
          const sync = () => { wrap.hidden = panelOpen(hc.sid) || mu.settings.get<boolean>(SETTINGS.button, hc.sid ? { sid: hc.sid } : undefined) === false; };
          sync();
          hudSyncs.add(sync);
          const off = mu.settings.watch(SETTINGS.button, sync, hc.sid ? { sid: hc.sid } : undefined);
          return () => { off(); hudSyncs.delete(sync); wrap.remove(); };
        },
      }),
    );

    // After the panel is registered: with onGmcp activation the first draft is already in the session's state and
    // the watch replays it at once.
    ctx.subscriptions.push(mu.sessions.each((s) => {
      const offD = mu.gmcp.watch('Bug.Draft', (data) => {
        const st = stateOf(data);
        if (!st) { if (data === undefined) { states.delete(s.id); redraw(s.id); } return; }
        // A newer error from Bug.Traceback is kept when the draft carries an older one.
        const prev = states.get(s.id)?.lastTraceback;
        if (prev && (!st.lastTraceback || st.lastTraceback.time < prev.time)) st.lastTraceback = prev;
        states.set(s.id, st);
        edits.set(s.id, settle(st.draft, edits.get(s.id) ?? {}));
        redraw(s.id);
      }, { sid: s.id });
      const offR = mu.gmcp.on('Bug.Result', (data, m) => {
        const r = resultOf(data);
        if (!r || m.replay) return;
        if (r.ok && r.action === 'submit') {
          edits.delete(s.id);
          statuses.set(s.id, { text: r.message, kind: 'good' });
          mu.ui.toast(COPY.filedTitle, r.message, { kind: 'ok' });
        } else if (r.ok && r.action === 'abort') {
          edits.delete(s.id);
          statuses.set(s.id, { text: r.message, kind: '' });
        } else statuses.set(s.id, { text: r.message, kind: r.ok ? '' : 'bad' });
        redraw(s.id);
      }, { sid: s.id });
      const offM = mu.gmcp.watch('Bug.Mine', (data) => { const m = mineOf(data); if (m) { mines.set(s.id, m); redraw(s.id); } }, { sid: s.id });
      const offT = mu.gmcp.on('Bug.Traceback', (data, m) => {
        const tb = tracebackOf(data);
        if (!tb) return;
        const st = states.get(s.id);
        if (st) { st.lastTraceback = tb; redraw(s.id); }
        if (m.replay || !mu.effects.owner(s.id) || mu.settings.get<boolean>(SETTINGS.offer, { sid: s.id }) === false) return;
        mu.ui.toast(COPY.errTitle, COPY.errBody(tb.code, tb.command), {
          kind: 'warn', group: 'bugreport.error', timeoutMs: 8000,
          action: { label: COPY.errAction, run: () => {
            open(s.id);
            const d = states.get(s.id)?.draft;
            if (d && !d.traceback) send(s.id, 'Bug.Save', { traceback: true });
          } },
        });
      }, { sid: s.id });
      return () => { offD(); offR(); offM(); offT(); for (const m of [states, mines, edits, statuses, traceOpen, redraws]) m.delete(s.id); };
    }));

    const api: BugReportApi = {
      open: (sid) => open(sid ?? activeSid()),
      state: (sid) => { const s = sid ?? activeSid(); const st = s ? states.get(s) : undefined; return st ? structuredClone(st) : null; },
    };
    return api;
  },
});
