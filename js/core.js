// Ядро: состояние, адреса страниц, отрисовка, действия по кнопкам, общий каркас и кэш людей.
import { db, uid, data, doc, getDoc, updateDoc, serverTimestamp } from './fb.js';
import { html, raw, morph, esc, initials, safePhoto, ms, I, toast, lsGet, lsSet } from './lib.js';

export const VERSION = '9.0';
// Папка сайта (на GitHub Pages — /vsmske/): берём из адреса этого файла (он лежит в js/)
export const BASE = new URL('../', import.meta.url).pathname;
export const siteUrl = p => location.origin + BASE + (p || '');

/* ---------- Состояние ---------- */
export const S = {
  phase: 'boot',          // boot | auth | onboarding | app
  me: null,               // мой профиль
  route: { name: 'feed', args: [] },
  modal: null,            // открытое окно: { type, ... }
  menu: null,             // открытое маленькое меню (id)
  busy: false,
};
export const cache = { users: new Map(), chats: [], notifs: [], incoming: [], outgoing: [] };
export const U = id => cache.users.get(id) || null;
/* ---------- Забаненные: для всех, кроме самого человека, — «Deleted Account», вместо аватарки заглушка, фото/видео/музыка недоступны ---------- */
export const isBanned = u => !!u?.ban && (u.ban.until == null || ms(u.ban.until) > Date.now());
export function maskUser(u) {
  if (!u || u.id === uid() || !isBanned(u)) return u;
  return { id: u.id, name: 'Deleted Account', nick: '', banned: true, friends: [], createdAt: u.createdAt };
}
// кэш людей сам прячет забаненных — так маска действует везде, где показывают имя и аватарку
cache.users.set = function (id, u) { return Map.prototype.set.call(this, id, maskUser(u)); };
export const hidden = id => !!id && !!U(id)?.banned;   // содержимое этого человека не показываем
export const locked = (text = 'Содержимое недоступно', cls = '') => html`<span class="locked ${cls}">${raw(I.lock)}<small>${text}</small></span>`;

/* ---------- Кэш людей: подгружаем профили по одному разу ---------- */
const pending = new Set();
let flushT = 0;
export function ensureUsers(ids) {
  for (const id of ids || []) if (id && !cache.users.has(id) && !pending.has(id)) pending.add(id);
  if (pending.size && !flushT) flushT = setTimeout(flushUsers, 30);
}
async function flushUsers() {
  flushT = 0; const ids = [...pending]; pending.clear();
  await Promise.all(ids.map(async id => {
    try { const s = await getDoc(doc(db, 'users', id)); cache.users.set(id, s.exists() ? data(s) : { id, name: 'Удалённая страница', nick: '', deleted: true, friends: [] }); }
    catch (e) { cache.users.set(id, { id, name: 'Пользователь', nick: '', deleted: true, friends: [] }); }
  }));
  render();
}
export const isOnline = u => !!u?.lastSeen && Date.now() - ms(u.lastSeen) < 5 * 60e3;
export const isFriend = id => (S.me?.friends || []).includes(id);
export const iBlocked = id => (S.me?.blocked || []).includes(id);
export const isAdmin = u => u?.admin === true || u?.admin === 'true';
export function seenText(u) {
  if (!u?.lastSeen) return '';
  if (isOnline(u)) return 'в сети';
  const m = (Date.now() - ms(u.lastSeen)) / 60e3;
  if (m < 60) return `был(а) ${Math.round(m)} мин назад`;
  if (m < 60 * 24) return `был(а) ${Math.round(m / 60)} ч назад`;
  return `был(а) ${Math.round(m / 60 / 24)} дн. назад`;
}

/* ---------- Общие куски разметки ---------- */
const HUES = [12, 28, 160, 200, 225, 262, 300, 340];
const GHOST = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7c-6.1 0-10.5 4.6-10.5 10.6V33l3.3-2.4 3.4 2.4 3.8-2.4 3.8 2.4 3.4-2.4 3.3 2.4V17.6C30.5 11.6 26.1 7 20 7z" fill="currentColor"/><circle cx="16" cy="18" r="2.2" fill="var(--gh-bg)"/><circle cx="24" cy="18" r="2.2" fill="var(--gh-bg)"/></svg>';
export function avatar(u, size = 40, link = true) {
  if (u?.banned) { const g = html`<span class="av ghost" style="--s:${size}px">${raw(GHOST)}</span>`; return link ? html`<a class="av-link" href="id/${u.id}" aria-label="Deleted Account">${g}</a>` : g; }
  const ph = safePhoto(u?.photo), hue = HUES[[...String(u?.id || u?.name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  const inner = ph ? html`<img src="${ph}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span>${initials(u?.name)}</span>`;
  const body = html`<span class="av ${isOnline(u) ? 'on' : ''}" style="--s:${size}px;--h:${hue}">${inner}</span>`;
  return link && u?.id && !u.deleted ? html`<a class="av-link" href="${profileHref(u)}" aria-label="${u.name}">${body}</a>` : body;
}
export const profileHref = u => u?.nick ? '@' + u.nick : 'id/' + (u?.id || '');
export const nameLink = u => u?.banned ? html`<a class="name banned" href="id/${u.id}">Deleted Account</a>` : u && !u.deleted ? html`<a class="name" href="${profileHref(u)}">${u.name}</a>${isAdmin(u) ? raw('<span class="vbadge" title="Администратор">✓</span>') : ''}` : html`<span class="name">${u?.name || '…'}</span>`;
export const empty = (title, text = '', extra = '') => html`<div class="empty"><b>${title}</b>${text ? html`<span>${text}</span>` : ''}${extra}</div>`;
export const skeleton = (n = 3) => html`<div class="skel">${Array.from({ length: n }, () => raw('<div class="card sk"><i class="sk-c"></i><i class="sk-l"></i><i class="sk-l s"></i></div>'))}</div>`;
export const pageHead = (title, sub = '', right = '') => html`<header class="phead"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${right}</header>`;

/* ---------- Регистрация страниц, действий, форм и окон ---------- */
const views = {}, acts = {}, forms = {}, inputs = {}, modals = {};
export const view = (name, def) => { views[name] = def; };
export const act = (name, fn) => { acts[name] = fn; };
export const form = (name, fn) => { forms[name] = fn; };
export const onInput = (name, fn) => { inputs[name] = fn; };
export const modal = (type, fn) => { modals[type] = fn; };
export const openModal = m => { S.modal = m; render(); };
export const closeModal = () => { S.modal = null; render(); };
const hooks = { shellExtra: [], afterRender: [] };
export const onAfterRender = fn => hooks.afterRender.push(fn);
export const shellExtra = fn => hooks.shellExtra.push(fn);   // куски поверх страницы (мини-плеер и т. п.)

/* ---------- Адреса: /feed, /id/<uid>, /@ник, /im/<кто>… ---------- */
export const curPath = () => decodeURI(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, ''));
let viewSubs = [];
export const sub = fn => viewSubs.push(fn);   // отписка при уходе со страницы
export function go(path, replace = false) {
  path = String(path || '').replace(/^\/+/, '');
  if (path === curPath()) { route(); return; }
  history[replace ? 'replaceState' : 'pushState'](null, '', BASE + path);
  route();
}
window.addEventListener('popstate', () => route());
const ALIASES = { '': 'feed', news: 'feed', im: 'im', messages: 'im' };
export function route() {
  if (S.phase !== 'app') return;
  // старые ссылки с решёткой (/#video, …/#music/t_x из старых записей); #id_token — возврат от Google
  if (/^#[^#]/.test(location.hash) && !location.hash.includes('id_token')) history.replaceState(null, '', BASE + location.hash.slice(1).replace(/^\/+/, ''));
  const parts = curPath().split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
  let name = parts[0] ?? '', args = parts.slice(1);
  if (name.startsWith('@')) { args = [name.slice(1)]; name = 'nick'; }
  name = ALIASES[name] ?? name;
  if (!views[name]) { name = 'feed'; args = []; }
  const prev = S.route.name;
  viewSubs.forEach(u => { try { u(); } catch (e) { } }); viewSubs = [];
  views[prev]?.leave?.();
  S.route = { name, args }; S.modal = null; S.menu = null;
  document.documentElement.dataset.view = name;
  views[name].enter?.(...args);
  render(); window.scrollTo(0, 0);
}

/* ---------- Отрисовка: всё приложение одной функцией, изменения — точечно ---------- */
const root = () => document.getElementById('app');
let raf = 0;
export function render() { if (!raf) raf = requestAnimationFrame(doRender); }
export function renderNow() { cancelAnimationFrame(raf); doRender(); }
function doRender() {
  raf = 0;
  const r = root(); if (!r) return;
  let out;
  try { out = S.phase === 'app' ? shell() : views['@' + S.phase]?.render() ?? html`<div class="boot"><span class="logo-mark">вс</span></div>`; }
  catch (e) { console.error(e); out = html`<div class="boot"><div class="card pad">Ошибка на странице. Обновите страницу.</div></div>`; }
  morph(r, out);
  hooks.afterRender.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}

const NAV = [
  ['feed', 'Лента', I.feed], ['me', 'Профиль', I.user], ['im', 'Чаты', I.chat], ['friends', 'Друзья', I.friends],
  ['notif', 'Сигналы', I.bell], ['music', 'Музыка', I.music], ['video', 'Видео', I.video], ['clips', 'Клипы', I.clips],
];
export const unreadChats = () => cache.chats.filter(isUnread).length;
export const isUnread = c => c.lastFrom && c.lastFrom !== uid() && ms(c.lastAt) > ms(c.read?.[uid()] || 0);
export const unseenNotifs = () => { const seen = ms(S.me?.notifSeenAt || 0); return cache.notifs.filter(n => n.from !== uid() && ms(n.createdAt) > seen).length; };
const badge = n => n ? html`<b class="nb">${n > 99 ? '99+' : n}</b>` : '';
function navCount(k) { return k === 'im' ? unreadChats() : k === 'notif' ? unseenNotifs() : k === 'friends' ? cache.incoming.length : 0; }
const navOn = k => S.route.name === k || (k === 'me' && ((S.route.name === 'id' && (S.route.args[0] || uid()) === uid()) || (S.route.name === 'nick' && S.route.args[0] === S.me?.nick))) || (k === 'video' && S.route.name === 'watch');

function shell() {
  const v = views[S.route.name], me = S.me;
  const title = typeof v.title === 'function' ? v.title(...S.route.args) : v.title || 'VСмске';
  document.title = (unreadChats() ? `(${unreadChats()}) ` : '') + title + ' · VСмске';
  const navItem = ([k, label, icon]) => html`<a class="nav-i ${navOn(k) ? 'on' : ''}" href="${k === 'me' ? 'id/' + uid() : k}" data-k="nav-${k}">${raw(icon)}<span>${label}</span>${badge(navCount(k))}</a>`;
  const tab = k => { const it = NAV.find(x => x[0] === k); return html`<a class="tab ${navOn(k) ? 'on' : ''}" href="${k === 'me' ? 'id/' + uid() : k}" data-k="tab-${k}">${raw(it[2])}<span>${it[1]}</span>${badge(navCount(k))}</a>`; };
  return html`<div class="shell ${v.wide ? 'wide' : ''} ${v.full ? 'full' : ''}" data-k="shell">
    <aside class="side" data-k="side">
      <a class="brand" href="feed" aria-label="VСмске"><span class="logo-mark">вс</span><span class="brand-w">VСмске</span></a>
      <button class="side-search" data-a="search-open">${raw(I.search)}<span>Поиск</span><kbd>/</kbd></button>
      <nav class="nav">${NAV.map(navItem)}</nav>
      <div class="side-foot">
        <a class="me-card" href="settings">${avatar(me, 36, false)}<span class="mc-t"><b>${me.name}</b><small>@${me.nick}</small></span>${raw(I.gear)}</a>
      </div>
    </aside>
    <header class="top" data-k="top">
      <a class="brand" href="feed" aria-label="VСмске"><span class="logo-mark">вс</span></a>
      <b class="top-t">${title}</b>
      <button class="ib" data-a="search-open" aria-label="Поиск">${raw(I.search)}</button>
      <a class="ib" href="settings" aria-label="Настройки">${avatar(me, 30, false)}</a>
    </header>
    <main class="main" data-k="main-${S.route.name}-${S.route.args.join('-')}">${v.render(...S.route.args)}</main>
    ${hooks.shellExtra.map(f => f())}
    <nav class="tabs" data-k="tabs">${['feed', 'im', 'music', 'friends'].map(tab)}<a class="tab ${S.route.name === 'more' ? 'on' : ''}" href="more" data-k="tab-more">${raw(I.more)}<span>Ещё</span>${badge(unseenNotifs())}</a></nav>
  </div>
  ${S.modal && modals[S.modal.type] ? html`<div class="ov" data-a="modal-x" data-k="ov-${S.modal.type}"><div class="sheet ${S.modal.wide ? 'wide' : ''}" data-stop role="dialog">${modals[S.modal.type](S.modal)}</div></div>` : ''}`;
}

/* ---------- Нажатия, формы, ввод ---------- */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a) {
    const stop = e.target.closest('[data-stop]');
    if (stop && !stop.contains(a)) return;   // клик внутри окна не закрывает его
    const fn = acts[a.dataset.a];
    if (fn) { e.preventDefault(); Promise.resolve(fn(a.dataset, a, e)).catch(err => { console.error(err); toast(err?.userText || 'Не получилось — попробуйте ещё раз'); }); }
    return;
  }
  const l = e.target.closest('a[href]');
  if (!l || l.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
  const u = new URL(l.href, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  e.preventDefault(); go(decodeURI(u.pathname.slice(BASE.length)));
  if (S.menu) S.menu = null;
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.f]; if (!fn) return;
  const vals = Object.fromEntries(new FormData(f).entries());
  Promise.resolve(fn(vals, f)).catch(err => { console.error(err); toast(err?.userText || 'Не получилось — попробуйте ещё раз'); S.busy = false; render(); });
});
document.addEventListener('input', e => { const n = e.target.dataset?.i; if (n && inputs[n]) inputs[n](e.target.value, e.target, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.modal) { closeModal(); return; }
  if (e.key === '/' && S.phase === 'app' && !e.target.closest('input,textarea,[contenteditable]')) { e.preventDefault(); acts['search-open']?.({}); }
});
act('modal-x', () => closeModal());
act('menu', d => { S.menu = S.menu === d.id ? null : d.id; render(); });
document.addEventListener('click', e => { if (S.menu && !e.target.closest('[data-a="menu"],.pop')) { S.menu = null; render(); } }, true);

/* ---------- Тема ---------- */
export function applyTheme() {
  const t = lsGet('vs_theme') || 'system', r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
}
applyTheme();
export const setTheme = t => { lsSet('vs_theme', t); applyTheme(); render(); };

/* ---------- «В сети»: отмечаемся раз в 4 минуты, пока вкладка открыта ---------- */
let seenAt = 0;
export function touchSeen() {
  if (!S.me || document.hidden || Date.now() - seenAt < 4 * 60e3) return;
  seenAt = Date.now(); updateDoc(doc(db, 'users', uid()), { lastSeen: serverTimestamp() }).catch(() => { });
}
setInterval(touchSeen, 60e3);
document.addEventListener('visibilitychange', touchSeen);
export { esc };
