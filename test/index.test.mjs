/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test) with a happy-dom document for the
 * panel. `mu.hud.mount`, `mu.ui.toast` (with its action) and `mu.ui.confirm` are replaced by recording fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function find() {
  if (process.env.MUCLIENT_DEV_TEST) return process.env.MUCLIENT_DEV_TEST;
  try { return createRequire(join(ROOT, 'package.json')).resolve('@runmu.sh/dev/test'); } catch { /* next */ }
  throw new Error('@runmu.sh/dev/test was not found. Run npm install (it is in the @runmu.sh/dev devDependency).');
}
const { createHost } = await import(pathToFileURL(find()).href);
const { validate } = await import('./schema.mjs');

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Node = win.Node;
globalThis.MouseEvent = win.MouseEvent;
globalThis.KeyboardEvent = win.KeyboardEvent;
globalThis.Event = win.Event;

const tick = () => new Promise((r) => setTimeout(r, 0));
const NOW = Math.floor(Date.now() / 1000);
/** Shapes captured from Torchship's $queue_feature:bug_payload, :bug_mine and $error:note_player_traceback. */
const TB = { time: NOW - 30, code: 'E_RANGE', msg: 'Index 5 out of bounds for TYPE_LIST of length 2', where: '#94A7E:kick (line 2)', command: 'kick glitch box', location: 'Freight Spur - Spare Parts', traceback: ['#94A7E:kick (line 2): E_RANGE (Index 5 out of bounds for TYPE_LIST of length 2)', '(End of traceback)'] };
const SEV = ['low', 'normal', 'high', 'critical'];
const CAT = ['general', 'commands', 'combat', 'ships', 'economy', 'crafting', 'rooms', 'npcs', 'help', 'client'];
const CLOSED = { open: false, severities: SEV, categories: CAT, last_traceback: TB };
const draft = (o = {}) => ({ open: true, severities: SEV, categories: CAT, last_traceback: TB, draft: { subject: '', body: '', severity: 'normal', category: 'general', traceback: true, started: NOW - 60, location: 'Freight Spur - Spare Parts', ...o } });
const MINE = { reports: [{ id: 45, ref: 'bugs/45', subject: '[HIGH] Kicking the glitch box throws an error', status: 'resolved', created: NOW - 7200, updated: NOW - 3600 }, { id: 3, ref: 'archived', subject: 'Old one', status: 'resolved', created: NOW - 9e5, updated: NOW - 9e5 }] };

async function setup(hostOpts = {}) {
  const host = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }], ...hostOpts });
  const huds = [], toasts = [], confirms = [];
  host.mu.hud.mount = (spec) => { huds.push(spec); return () => { const i = huds.indexOf(spec); if (i >= 0) huds.splice(i, 1); }; };
  host.mu.ui.toast = (title, body, o) => toasts.push({ title, body, ...o });
  host.mu.ui.confirm = async (spec) => { confirms.push(spec); return host.confirmAnswer ?? false; };
  host.mu.effects.owner = () => true;
  host.mu.ui.css = { ...host.mu.ui.css, cmd: 'sh-cmd', toggle: 'sh-toggle', plate: 'sh-plate', field: 'sh-field', label: 'sh-label', secHead: 'sec-head', secClose: 'sec-close', empty: 'empty', off: 'off', warn: 'warn', ok: 'ok', hot: 'hot', dim: 'dim', gold: 'gold' };
  const ext = await host.load('src/index.ts');
  const mount = (sid = 's1') => {
    const el = document.createElement('div');
    document.body.append(el);
    const off = host.panels.get('bugreport').mount(el, { sid, worldId: 'w1', params: {} });
    const q = (s) => el.querySelector(s);
    const all = (s) => [...el.querySelectorAll(s)];
    return { el, off, q, all };
  };
  const gmcpOut = (pkg) => host.sends('gmcp').filter((s) => !pkg || s.pkg === pkg || s.package === pkg);
  return { host, ext, mount, huds, toasts, confirms, gmcpOut };
}
const pkgOf = (s) => s.pkg ?? s.package;
const dataOf = (s) => s.data ?? s.payload;

test('registration: panel right-bottom, order 45, singleton, show auto; Bug 1 messages, onGmcp activation; ☰ row, command, HUD button, two settings; all disposed', async () => {
  const { host, huds } = await setup();
  const { id, title, defaultPosition, order, singleton, show } = host.panels.get('bugreport');
  assert.deepEqual({ id, title, defaultPosition, order, singleton, show }, { id: 'bugreport', title: 'Bug report', defaultPosition: 'right-bottom', order: 45, singleton: true, show: 'auto' });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.muclient.contributes.gmcp[0].package, 'Bug 1');
  assert.deepEqual(Object.entries(pkg.muclient.contributes.gmcp[0].messages).map(([k, v]) => `${k}:${v.dir}`), ['Bug.Draft:in', 'Bug.Result:in', 'Bug.Traceback:in', 'Bug.Get:out', 'Bug.Open:out', 'Bug.Save:out', 'Bug.Submit:out', 'Bug.Abort:out', 'Bug.Mine:both']);
  assert.deepEqual(pkg.muclient.activation, ['onGmcp:Bug']);
  const row = host.calls.find((c) => c.path === 'menus.add').args[0];
  assert.deepEqual([row.slot, row.title, row.icon], ['main', 'Report a bug', '⚠']);
  assert.ok(host.commands.has('bugreport.open'));
  assert.deepEqual(huds.map((h) => [h.id, h.slot]), [['button', 'top-right']]);
  assert.deepEqual(host.settingsSchema.items.map((i) => [i.key, i.default]), [['button.show', true], ['offer.errors', true]]);
  assert.equal(host.errors.length, 0);
  await host.unload();
  assert.deepEqual(host.live(), [], 'everything registered through mu is disposed');
  assert.equal(huds.length, 0, 'the HUD button is unmounted');
});

test('payload schemas accept what Torchship sends and what the panel sends', () => {
  const schema = (f) => JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8'));
  assert.equal(validate(schema('draft.json'), draft({ subject: 'x' })), null);
  assert.equal(validate(schema('draft.json'), CLOSED), null);
  assert.match(validate(schema('draft.json'), {}), /open/);
  assert.equal(validate(schema('traceback.json'), TB), null);
  assert.equal(validate(schema('result.json'), { action: 'submit', ok: true, message: 'Thanks.', id: 45 }), null);
  assert.equal(validate(schema('mine.json'), MINE), null);
  assert.equal(validate(schema('mine.json'), {}), null);
  assert.equal(validate(schema('fields.json'), { subject: 's', body: 'b', severity: 'high', category: 'ships', traceback: false }), null);
  assert.match(validate(schema('fields.json'), { traceback: 1 }), /boolean/);
  assert.equal(validate(schema('empty.json'), {}), null);
});

test('waiting, then no report: NEW REPORT sends Bug.Open; the panel asks for state with Bug.Get on mount', async () => {
  const { host, mount, gmcpOut } = await setup();
  const p = mount();
  assert.equal(p.q('[data-testid=bug-empty]').textContent, 'Waiting for the game');
  assert.ok(gmcpOut().some((s) => pkgOf(s) === 'Bug.Get'), 'asks for the draft');
  host.gmcp('s1', 'Bug.Draft', CLOSED);
  assert.equal(p.q('[data-testid=bug-bar]').textContent, 'No report open');
  assert.equal(p.q('[data-testid=bug-foot]'), null);
  p.q('[data-testid=bug-new]').click();
  assert.equal(pkgOf(gmcpOut().at(-1)), 'Bug.Open');
});

test('a draft: subject, severity and category toggles, body with count, the last error attached; SUBMIT waits for subject and body', async () => {
  const { host, mount, gmcpOut } = await setup();
  host.gmcp('s1', 'Bug.Draft', draft());
  const p = mount();
  assert.equal(p.q('[data-testid=bug-bar]').textContent, 'Draft');
  assert.equal(p.q('[data-testid=bug-where]').textContent, 'started in Freight Spur - Spare Parts');
  assert.equal(p.all('[data-testid^=bug-severity-]').length, 4);
  assert.equal(p.q('[data-testid=bug-severity-normal]').getAttribute('aria-pressed'), 'true');
  assert.equal(p.q('[data-testid=bug-category-general]').getAttribute('aria-pressed'), 'true');
  assert.equal(p.q('[data-testid=bug-attach]').getAttribute('aria-pressed'), 'true');
  assert.match(p.q('[data-testid=bug-error]').textContent, /E_RANGE.*Index 5.*> kick glitch box.*Freight Spur/);
  assert.ok(p.q('[data-testid=bug-submit]').disabled, 'no subject, no body');
  p.q('[data-testid=bug-severity-high]').click();
  assert.deepEqual(dataOf(gmcpOut('Bug.Save').at(-1) ?? gmcpOut().at(-1)), { severity: 'high' });
  assert.equal(p.q('[data-testid=bug-severity-high]').getAttribute('aria-pressed'), 'true', 'shown before the server answers');
  p.q('[data-testid=bug-attach]').click();
  assert.deepEqual(dataOf(gmcpOut().at(-1)), { traceback: false });
  p.q('[data-testid=bug-trace-toggle]').click();
  assert.match(p.q('[data-testid=bug-trace]').textContent, /End of traceback/);
  assert.equal(host.errors.length, 0);
});

test('typing marks the draft unsaved without a redraw; change saves the field; the echoed draft settles the edit', async () => {
  const { host, mount, gmcpOut } = await setup();
  host.gmcp('s1', 'Bug.Draft', draft());
  const p = mount();
  const subj = p.q('[data-testid=bug-subject]');
  subj.value = 'Kick breaks';
  subj.dispatchEvent(new Event('input'));
  assert.equal(p.q('[data-testid=bug-subject]'), subj, 'the field is not replaced while typing');
  assert.equal(p.q('[data-testid=bug-dirty]').textContent, 'unsaved changes');
  subj.dispatchEvent(new Event('change'));
  assert.deepEqual([pkgOf(gmcpOut().at(-1)), dataOf(gmcpOut().at(-1))], ['Bug.Save', { subject: 'Kick breaks' }]);
  host.gmcp('s1', 'Bug.Draft', draft({ subject: 'Kick breaks' }));
  assert.equal(p.q('[data-testid=bug-dirty]').textContent, 'draft saved');
  const ta = p.q('[data-testid=bug-body]');
  ta.value = 'I kicked it.\n\nIt broke.';
  ta.dispatchEvent(new Event('input'));
  assert.equal(p.q('[data-testid=bug-count]').textContent, '23/8000');
  assert.equal(p.q('[data-testid=bug-submit]').disabled, false);
  p.q('[data-testid=bug-submit]').click();
  assert.deepEqual([pkgOf(gmcpOut().at(-1)), dataOf(gmcpOut().at(-1))], ['Bug.Submit', { body: 'I kicked it.\n\nIt broke.' }]);
});

test('Bug.Result: an error shows in the status line; a filing toasts, clears edits and lists the report; MY REPORTS rows follow with @request', async () => {
  const { host, mount, toasts } = await setup();
  host.gmcp('s1', 'Bug.Draft', draft({ subject: 's' }));
  const p = mount();
  host.gmcp('s1', 'Bug.Result', { action: 'save', ok: false, message: 'Severity must be one of low, normal, high, or critical.' });
  assert.equal(p.q('[data-testid=bug-status]').className, 'status bad');
  host.gmcp('s1', 'Bug.Result', { action: 'submit', ok: true, message: 'Thanks. Bug report bugs/45 is filed.', id: 45 });
  host.gmcp('s1', 'Bug.Draft', CLOSED);
  host.gmcp('s1', 'Bug.Mine', MINE);
  assert.deepEqual(toasts.map((t) => [t.title, t.kind]), [['Bug report filed', 'ok']]);
  assert.equal(p.q('[data-testid=bug-bar]').textContent, 'No report open');
  const rows = p.all('[data-testid=bug-report]');
  assert.deepEqual(rows.map((r) => r.getAttribute('data-ref')), ['bugs/45', 'archived']);
  assert.match(rows[0].textContent, /resolved.*1h ago/);
  assert.ok(rows[1].disabled);
  rows[0].click();
  await tick();
  assert.equal(host.sends('command').at(-1).text, '@request bugs/45');
});

test('DISCARD asks first, then sends Bug.Abort', async () => {
  const { host, mount, confirms, gmcpOut } = await setup();
  host.gmcp('s1', 'Bug.Draft', draft({ subject: 's' }));
  const p = mount();
  p.q('[data-testid=bug-discard]').click();
  await tick();
  assert.equal(confirms.length, 1);
  assert.ok(!gmcpOut().some((s) => pkgOf(s) === 'Bug.Abort'));
  host.confirmAnswer = true;
  p.q('[data-testid=bug-discard]').click();
  await tick();
  assert.equal(pkgOf(gmcpOut().at(-1)), 'Bug.Abort');
});

test('the easy button: HUD [ ⚠ BUG ], ☰ row and command open the panel and start a draft when none is open; the setting hides the button', async () => {
  const { host, huds, gmcpOut } = await setup();
  host.gmcp('s1', 'Bug.Draft', CLOSED);
  const el = document.createElement('div');
  const off = huds[0].mount(el, { sid: 's1', worldId: 'w1', params: {} });
  const btn = el.querySelector('[data-testid=bug-hud]');
  assert.equal(btn.textContent, '⚠Bug');
  btn.click();
  assert.deepEqual(host.calls.filter((c) => c.path === 'panels.open').at(-1).args.slice(0, 1), ['bugreport']);
  assert.equal(pkgOf(gmcpOut().at(-1)) === 'Bug.Get' || pkgOf(gmcpOut().at(-1)) === 'Bug.Open', true);
  assert.ok(gmcpOut().some((s) => pkgOf(s) === 'Bug.Open'));
  host.gmcp('s1', 'Bug.Draft', draft());
  const n = gmcpOut('Bug.Open').length || gmcpOut().filter((s) => pkgOf(s) === 'Bug.Open').length;
  host.commands.get('bugreport.open').run();
  assert.equal(gmcpOut().filter((s) => pkgOf(s) === 'Bug.Open').length, n, 'a draft is open: not a second one');
  host.calls.find((c) => c.path === 'menus.add').args[0].run();
  assert.equal(host.calls.filter((c) => c.path === 'panels.open').length, 3);
  const p = (() => { const e = document.createElement('div'); return host.panels.get('bugreport').mount(e, { sid: 's1', worldId: 'w1', params: {} }); })();
  assert.equal(el.querySelector('.mu-bugreport-hud').hidden, true, 'hidden while the panel is open');
  p();
  assert.equal(el.querySelector('.mu-bugreport-hud').hidden, false);
  host.mu.settings.set('button.show', false);
  await tick();
  assert.equal(el.querySelector('.mu-bugreport-hud').hidden, true);
  off();
  assert.equal(el.children.length, 0);
});

test('Bug.Traceback: the panel shows the new error, and a toast offers REPORT IT, which opens and attaches it', async () => {
  const { host, mount, toasts, gmcpOut } = await setup();
  host.gmcp('s1', 'Bug.Draft', draft({ traceback: false }));
  const p = mount();
  host.gmcp('s1', 'Bug.Traceback', { ...TB, time: NOW, code: 'E_PROPNF', msg: 'Property not found', command: 'look sky' });
  assert.match(p.q('[data-testid=bug-error]').textContent, /E_PROPNF.*look sky/);
  const t = toasts.at(-1);
  assert.equal(t.title, 'The game hit an error');
  assert.equal(t.body, 'E_PROPNF after "look sky"');
  t.action.run();
  assert.deepEqual([pkgOf(gmcpOut().at(-1)), dataOf(gmcpOut().at(-1))], ['Bug.Save', { traceback: true }]);
  host.mu.settings.set('offer.errors', false);
  host.gmcp('s1', 'Bug.Traceback', { ...TB, time: NOW + 1 });
  assert.equal(toasts.length, 1, 'no offer with the setting off');
});
