/* ==========================================================================
   VСмске — социальная сеть на Firebase (Auth + Firestore).
   Хостинг: Firebase Hosting. Фото сжимаются в браузере и хранятся в Firestore.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, query, where, orderBy, limit, limitToLast,
  getDoc, getDocs, addDoc, updateDoc, onSnapshot, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyADzttkHdFJ1m9hEEaX7Ab84QkBNfHjm_Q",
  authDomain: "vsmske.firebaseapp.com",
  projectId: "vsmske",
  storageBucket: "vsmske.firebasestorage.app",
  messagingSenderId: "195735209722",
  appId: "1:195735209722:web:e9a36c806abeb048edeb43",
  measurementId: "G-WSKQEVMZ6Q"
};

const fbApp = initializeApp(firebaseConfig);
isSupported().then(ok => { if (ok) getAnalytics(fbApp); }).catch(() => {});
const auth = getAuth(fbApp);
auth.languageCode = "ru";
const db = getFirestore(fbApp);

/* ---------- Константы и утилиты ---------- */
const COLORS = ['#2F44D0','#D0462F','#1F8A5B','#B4398F','#C98A12','#2B8BB5','#6A47C9','#4E5B76'];
const NICK_RE = /^[a-z0-9._]{3,30}$/;
const MAX_POST_IMG = 700000;   // символов dataURL (~520 КБ), лимит документа Firestore — 1 МБ
const MAX_AVATAR = 120000;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms = t => t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : Date.now());
const data = s => ({ id: s.id, ...s.data({ serverTimestamps: 'estimate' }) });
const chatId = (a, b) => [a, b].sort().join('_');
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const initials = n => (n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const pad2 = n => String(n).padStart(2, '0');
const hm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const startOfDay = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); };
function ago(t) {
  t = ms(t); const s = (Date.now() - t) / 1000, d = new Date(t), day = startOfDay();
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (t >= day) return 'сегодня в ' + hm(d);
  if (t >= day - 864e5) return 'вчера в ' + hm(d);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') + ' в ' + hm(d);
}
function dayLabel(t) {
  t = ms(t); const d = new Date(t), day = startOfDay();
  if (t >= day) return 'Сегодня'; if (t >= day - 864e5) return 'Вчера';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

let toastTimer;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2600); }

function buildSearch(name, nick, city) {
  const words = `${name || ''} ${city || ''}`.toLowerCase().replace(/ё/g, 'е').split(/[\s\-,.]+/).filter(Boolean);
  if (nick) words.push(nick.toLowerCase());
  const set = new Set();
  words.forEach(w => { for (let i = 1; i <= Math.min(w.length, 15); i++) set.add(w.slice(0, i)); });
  return [...set].slice(0, 150);
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
async function compress(file, maxSide, maxLen, square = false) {
  const img = await loadImage(file);
  let side = maxSide, q = 0.8, out = '';
  for (let i = 0; i < 8; i++) {
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    if (square) {
      const s = Math.min(img.width, img.height); c.width = c.height = Math.min(side, s);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
    } else {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
    out = c.toDataURL('image/jpeg', q);
    if (out.length <= maxLen) return out;
    q = Math.max(0.5, q - 0.1); side = Math.round(side * 0.85);
  }
  if (out.length <= maxLen) return out;
  throw new Error('too-big');
}

function errText(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-email': 'Неверный формат почты.',
    'auth/missing-email': 'Введите почту.',
    'auth/email-already-in-use': 'Эта почта уже зарегистрирована. Войдите во вкладке «Вход».',
    'auth/weak-password': 'Пароль слишком простой: нужно минимум 6 символов.',
    'auth/missing-password': 'Введите пароль.',
    'auth/invalid-credential': 'Неверная почта или пароль.',
    'auth/wrong-password': 'Неверная почта или пароль.',
    'auth/user-not-found': 'Пользователь с такой почтой не найден.',
    'auth/too-many-requests': 'Слишком много попыток. Подождите пару минут.',
    'auth/network-request-failed': 'Нет соединения с интернетом.',
    'auth/operation-not-allowed': 'Этот способ входа не включён: Firebase → Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'Этот адрес сайта не разрешён: Firebase → Authentication → Settings → Authorized domains.',
    'auth/popup-blocked': 'Браузер заблокировал окно входа. Разрешите всплывающие окна.',
    'auth/account-exists-with-different-credential': 'Эта почта уже привязана к другому способу входа.',
    'permission-denied': 'Нет доступа. Проверьте, что правила Firestore опубликованы (firebase deploy).',
    'unavailable': 'Сервер недоступен. Проверьте интернет.',
  };
  if (map[code]) return map[code];
  if (code === 'failed-precondition' && /index/i.test(e.message || '')) return 'Нужен индекс Firestore. Выполните firebase deploy или создайте его по ссылке ниже.';
  return (e?.message || 'Что-то пошло не так').replace(/^Firebase:\s*/, '');
}
const indexLink = e => (String(e?.message || '').match(/https:\/\/console\.firebase\.google\.com\S+/) || [])[0];
function errBox(e) {
  const link = indexLink(e);
  return `<div class="err"><b>Ошибка.</b> ${esc(errText(e))}${link ? `<br><a href="${esc(link)}" target="_blank" rel="noopener">Создать индекс в консоли</a>` : ''}</div>`;
}

const I = {
  home:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  feed:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>',
  msg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  friends:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="7" r="2.8"/><path d="M17 13c2.8 0 4.5 1.6 4.5 4.5"/></svg>',
  people:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  out:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  heart:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  heartO:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  comment:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  photo:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  send:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>',
  search:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  back:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  google:'<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

/* ---------- Состояние ---------- */
const S = {
  phase: 'boot',          // boot | auth | onboarding | app
  authUser: null, me: null, fatal: null,
  authTab: 'login', authBusy: false, authError: '', pendingProfile: null,
  view: 'feed', profileId: null, chatWith: null, feedTab: 'friends', query: '',
  loading: false, viewError: null,
  openComments: new Set(), confirm: null,
  draft: { text: '', image: '' }, editColor: null, editPhoto: undefined, busy: false,
};
const cache = {
  users: new Map(), feed: new Map(), wall: [], comments: new Map(),
  chats: [], messages: [], incoming: [], outgoing: [], people: [],
};
let globalUnsubs = [], viewUnsubs = [], commentUnsubs = new Map(), routedOnce = false;
const uid = () => S.authUser?.uid;
const app = document.getElementById('app');

function stopAll() {
  globalUnsubs.forEach(u => u()); globalUnsubs = [];
  clearView(); routedOnce = false;
  Object.assign(cache, { users: new Map(), feed: new Map(), wall: [], comments: new Map(), chats: [], messages: [], incoming: [], outgoing: [], people: [] });
}
function clearView() {
  viewUnsubs.forEach(u => u()); viewUnsubs = [];
  commentUnsubs.forEach(u => u()); commentUnsubs = new Map();
  S.openComments = new Set(); S.viewError = null;
}

/* ---------- Пользователи (кэш) ---------- */
const pendingUsers = new Set();
function ensureUsers(ids) {
  const miss = [...new Set(ids)].filter(i => i && !cache.users.has(i) && !pendingUsers.has(i));
  if (!miss.length) return;
  miss.forEach(i => pendingUsers.add(i));
  Promise.all(miss.map(async i => {
    try {
      const s = await getDoc(doc(db, 'users', i));
      cache.users.set(i, s.exists() ? data(s) : { id: i, name: 'Удалённая страница', nick: '', friends: [], deleted: true });
    } catch (e) {
      cache.users.set(i, { id: i, name: 'Пользователь', nick: '', friends: [], deleted: true });
    } finally { pendingUsers.delete(i); }
  })).then(render);
}
const U = id => cache.users.get(id);

/* ---------- Вход ---------- */
onAuthStateChanged(auth, async user => {
  stopAll();
  S.authUser = user; S.me = null; S.fatal = null;
  if (!user) { S.phase = 'auth'; S.authBusy = false; render(); return; }
  S.phase = 'boot'; render();
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) return startSession();
    if (S.pendingProfile) {
      const p = S.pendingProfile; S.pendingProfile = null;
      try { await createProfile(p); return startSession(); }
      catch (e) { S.authError = e.message === 'nick-taken' ? 'Короткое имя уже занято, выберите другое.' : errText(e); }
    }
    S.phase = 'onboarding'; S.authBusy = false; render();
  } catch (e) { S.fatal = e; S.phase = 'auth'; S.authBusy = false; render(); }
});

async function createProfile({ name, nick, city = '', photo = '' }) {
  const id = uid();
  const taken = await getDoc(doc(db, 'usernames', nick));
  if (taken.exists() && taken.data().uid !== id) throw new Error('nick-taken');
  const b = writeBatch(db);
  b.set(doc(db, 'usernames', nick), { uid: id });
  b.set(doc(db, 'users', id), {
    name, nick, city, status: '', about: '', photo,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    friends: [], search: buildSearch(name, nick, city), createdAt: serverTimestamp(),
  });
  await b.commit();
}

function startSession() {
  const id = uid();
  globalUnsubs.push(onSnapshot(doc(db, 'users', id), s => {
    if (!s.exists()) return;
    const prevFriends = JSON.stringify(S.me?.friends || []);
    S.me = data(s); cache.users.set(id, S.me); S.phase = 'app';
    if (!routedOnce) { routedOnce = true; route(); return; }
    if (S.view === 'feed' && S.feedTab === 'friends' && prevFriends !== JSON.stringify(S.me.friends || [])) attachView();
    else render();
  }, e => { S.fatal = e; render(); }));
  globalUnsubs.push(onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', id), orderBy('lastAt', 'desc'), limit(100)), s => {
    cache.chats = s.docs.map(data);
    ensureUsers(cache.chats.map(c => c.members.find(m => m !== id)));
    markRead(); render();
  }, e => { console.error(e); S.chatsError = e; render(); }));
  globalUnsubs.push(onSnapshot(query(collection(db, 'friendRequests'), where('to', '==', id)), s => {
    cache.incoming = s.docs.map(data); ensureUsers(cache.incoming.map(r => r.from)); render();
  }, console.error));
  globalUnsubs.push(onSnapshot(query(collection(db, 'friendRequests'), where('from', '==', id)), s => {
    cache.outgoing = s.docs.map(data); render();
  }, console.error));
}

/* ---------- Маршруты (#feed, #id/<uid>, #im/<uid>, #friends, #people, #edit) ---------- */
function route() {
  if (S.phase !== 'app') return;
  const [v, arg] = (location.hash.slice(1) || 'feed').split('/');
  S.confirm = null;
  if (v === 'id') { S.view = 'profile'; S.profileId = arg || uid(); }
  else if (v === 'im') { S.view = 'messages'; S.chatWith = arg || null; }
  else if (['feed', 'friends', 'people', 'edit'].includes(v)) S.view = v;
  else S.view = 'feed';
  if (S.view !== 'edit') { S.editColor = null; S.editPhoto = undefined; }
  attachView();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };

function onViewErr(e) { console.error(e); S.viewError = e; S.loading = false; render(); }

function attachView() {
  clearView();
  const id = uid();
  S.loading = true;
  if (S.view === 'feed') {
    cache.feed = new Map();
    const listen = (q, key) => viewUnsubs.push(onSnapshot(q, s => {
      const posts = s.docs.map(data); cache.feed.set(key, posts); S.loading = false;
      ensureUsers(posts.flatMap(p => [p.authorId, p.wallId])); render();
    }, onViewErr));
    if (S.feedTab === 'all') listen(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)), 'all');
    else chunk([id, ...(S.me.friends || [])], 30).forEach((c, i) =>
      listen(query(collection(db, 'posts'), where('authorId', 'in', c), orderBy('createdAt', 'desc'), limit(50)), i));
  } else if (S.view === 'profile') {
    const pid = S.profileId; cache.wall = [];
    if (pid !== id) viewUnsubs.push(onSnapshot(doc(db, 'users', pid), s => {
      cache.users.set(pid, s.exists() ? data(s) : { id: pid, name: 'Страница не найдена', friends: [], deleted: true }); render();
    }, onViewErr));
    viewUnsubs.push(onSnapshot(query(collection(db, 'posts'), where('wallId', '==', pid), orderBy('createdAt', 'desc'), limit(50)), s => {
      cache.wall = s.docs.map(data); S.loading = false;
      ensureUsers(cache.wall.map(p => p.authorId)); render();
    }, onViewErr));
  } else if (S.view === 'messages') {
    cache.messages = [];
    if (S.chatWith) {
      ensureUsers([S.chatWith]);
      viewUnsubs.push(onSnapshot(query(collection(db, 'chats', chatId(id, S.chatWith), 'messages'), orderBy('createdAt', 'asc'), limitToLast(200)), s => {
        cache.messages = s.docs.map(data); S.loading = false; markRead(); render();
      }, onViewErr));
    } else S.loading = false;
  } else if (S.view === 'people') {
    cache.people = [];
    const token = S.query.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/)[0] || '';
    const q = token
      ? query(collection(db, 'users'), where('search', 'array-contains', token.slice(0, 15)), limit(40))
      : query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(40));
    getDocs(q).then(s => {
      const rest = S.query.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).slice(1);
      cache.people = s.docs.map(data).filter(u => rest.every(w => (u.search || []).includes(w.slice(0, 15))));
      S.loading = false; render();
    }).catch(onViewErr);
  } else S.loading = false;
  render();
}

function markRead() {
  if (S.view !== 'messages' || !S.chatWith || document.hidden) return;
  const id = uid(), c = cache.chats.find(c => c.id === chatId(id, S.chatWith));
  if (c && isUnread(c)) updateDoc(doc(db, 'chats', c.id), { [`read.${id}`]: serverTimestamp() }).catch(console.error);
}
document.addEventListener('visibilitychange', markRead);
const isUnread = c => c.lastFrom !== uid() && (!c.read?.[uid()] || ms(c.read[uid()]) < ms(c.lastAt));

/* ---------- Рендер ---------- */
const avatar = (u, size = 40, link = true) => {
  const inner = u?.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u?.name));
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;background-color:${esc(u?.color || '#8E95AB')}`;
  return link && u && !u.deleted
    ? `<a class="av" style="${st}" href="#id/${esc(u.id)}" aria-label="${esc(u.name)}">${inner}</a>`
    : `<span class="av" style="${st}">${inner}</span>`;
};
const nameLink = u => u && !u.deleted ? `<a class="name" href="#id/${esc(u.id)}" style="color:var(--fg);font-weight:600">${esc(u.name)}</a>` : `<span class="name">${esc(u?.name || '…')}</span>`;
const loadingBox = () => `<div class="card loading"><div class="spin"></div></div>`;

function render() {
  // сохраняем то, что пользователь печатает, между перерисовками
  const active = document.activeElement, focusId = active?.id, sel = active?.selectionStart;
  const kept = {};
  app.querySelectorAll('input[id],textarea[id]').forEach(el => { if (el.type !== 'file') kept[el.id] = el.value; });
  const msgs = app.querySelector('.msgs');
  const atBottom = !msgs || msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;

  if (S.phase === 'boot') app.innerHTML = `<div class="boot"><div class="spin"></div></div>`;
  else if (S.phase === 'auth') app.innerHTML = viewAuth();
  else if (S.phase === 'onboarding') app.innerHTML = viewOnboarding();
  else app.innerHTML = shell();

  for (const [k, v] of Object.entries(kept)) { const el = document.getElementById(k); if (el && !resetIds.has(k)) el.value = v; }
  resetIds.clear();
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} } }
  const box = app.querySelector('.msgs'); if (box && atBottom) box.scrollTop = box.scrollHeight;
}
const resetIds = new Set();

function viewAuth() {
  const login = S.authTab === 'login';
  return `<div class="login"><div class="login-in">
    <div class="hero"><span class="logo-mark">VС</span>
      <h1>VСмске — все свои рядом</h1>
      <p>Стена, лента друзей, лайки, комментарии и личные сообщения.</p></div>
    <div class="card pad form">
      <div class="auth-tabs" role="tablist">
        <button class="${login ? 'on' : ''}" data-act="authtab" data-tab="login" role="tab" aria-selected="${login}">Вход</button>
        <button class="${!login ? 'on' : ''}" data-act="authtab" data-tab="register" role="tab" aria-selected="${!login}">Регистрация</button>
      </div>
      <button class="gbtn" data-act="google" ${S.authBusy ? 'disabled' : ''}>${I.google}<span>${login ? 'Войти' : 'Продолжить'} через Google</span></button>
      <div class="or">или по почте</div>
      <form class="form" data-form="${login ? 'login' : 'register'}">
        ${login ? '' : `
        <div class="field"><label for="rName">Имя и фамилия</label><input id="rName" required maxlength="60" placeholder="Иван Петров" autocomplete="name"></div>
        <div class="field"><label for="rNick">Короткое имя</label><input id="rNick" required minlength="3" maxlength="30" placeholder="ivan.petrov" pattern="[a-zA-Z0-9._]+" title="Латиница, цифры, точка и _ (от 3 символов)" autocomplete="username"></div>`}
        <div class="field"><label for="aEmail">Почта</label><input id="aEmail" type="email" required autocomplete="email" placeholder="you@mail.ru"></div>
        <div class="field"><label for="aPass">Пароль</label><input id="aPass" type="password" required minlength="6" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? '' : 'Не меньше 6 символов'}"></div>
        ${S.authError ? `<div class="err">${esc(S.authError)}</div>` : ''}
        ${S.fatal ? errBox(S.fatal) : ''}
        <button class="btn" type="submit" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? 'Подождите…' : login ? 'Войти' : 'Зарегистрироваться'}</button>
        ${login ? `<button type="button" class="linkbtn small" data-act="reset" style="align-self:flex-start">Забыли пароль?</button>` : ''}
      </form>
    </div>
  </div></div>`;
}

function viewOnboarding() {
  const u = S.authUser;
  const nickGuess = (u.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30);
  return `<div class="login"><div class="login-in" style="max-width:480px;grid-template-columns:1fr">
    <div class="card pad form">
      <div class="row">${avatar({ name: u.displayName || '?', photo: u.photoURL || '', color: COLORS[0] }, 56, false)}
        <div><h1 class="h">Почти готово</h1><div class="muted small">${esc(u.email || '')}</div></div></div>
      <p class="muted" style="margin:0">Как вас показывать другим людям?</p>
      <form class="form" data-form="onboard">
        <div class="field"><label for="oName">Имя и фамилия</label><input id="oName" required maxlength="60" value="${esc(u.displayName || '')}"></div>
        <div class="field"><label for="oNick">Короткое имя</label><input id="oNick" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._]+" title="Латиница, цифры, точка и _ (от 3 символов)" value="${esc(nickGuess.length >= 3 ? nickGuess : '')}"></div>
        <div class="field"><label for="oCity">Город</label><input id="oCity" maxlength="40" placeholder="Необязательно"></div>
        ${S.authError ? `<div class="err">${esc(S.authError)}</div>` : ''}
        <button class="btn" type="submit" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? 'Создаём…' : 'Создать страницу'}</button>
        <button type="button" class="btn ghost" data-act="logout">Выйти</button>
      </form>
    </div></div></div>`;
}

function shell() {
  const me = S.me, unread = cache.chats.filter(isUnread).length, reqs = cache.incoming.length;
  const on = v => S.view === v && (v !== 'profile' || S.profileId === me.id) ? 'on' : '';
  const nav = (v, href, icon, label, badge = 0) => `<a class="navlink ${on(v)}" href="#${href}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  let main;
  if (S.viewError) main = errBox(S.viewError);
  else if (S.view === 'profile') main = viewProfile();
  else if (S.view === 'messages') main = viewMessages();
  else if (S.view === 'friends') main = viewFriends();
  else if (S.view === 'people') main = viewPeople();
  else if (S.view === 'edit') main = viewEdit();
  else main = viewFeed();
  return `
  <header class="top"><div class="top-in">
    <a class="logo" href="#feed" aria-label="VСмске, новости"><span class="logo-mark">VС</span><span class="logo-word" style="color:var(--fg)">VСмске</span></a>
    <form class="search" data-form="search">${I.search}<input id="q" type="search" placeholder="Поиск людей" autocomplete="off" value="${esc(S.view === 'people' ? S.query : '')}"></form>
    <a class="top-me" href="#id/${esc(me.id)}" style="color:var(--fg)">${avatar(me, 32, false)}<span>${esc(me.name.split(' ')[0])}</span></a>
  </div></header>
  <div class="wrap">
    <nav class="nav">
      ${nav('profile', 'id/' + me.id, I.home, 'Моя страница')}
      ${nav('feed', 'feed', I.feed, 'Новости')}
      ${nav('messages', 'im', I.msg, 'Сообщения', unread)}
      ${nav('friends', 'friends', I.friends, 'Друзья', reqs)}
      ${nav('people', 'people', I.people, 'Люди')}
      <hr>
      <button class="sub desk" data-act="logout">${I.out}<span>Выйти</span></button>
    </nav>
    <main>${main}</main>
  </div>`;
}

/* Новости */
function viewFeed() {
  const posts = [...cache.feed.values()].flat().sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 100);
  const tab = (t, l) => `<button class="${S.feedTab === t ? 'on' : ''}" data-act="feedtab" data-tab="${t}">${l}</button>`;
  return `${composer(S.me.id, 'Что у вас нового?')}
  <div class="card"><div class="tabs">${tab('friends', 'Друзья')}${tab('all', 'Все записи')}</div></div>
  ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') :
    `<div class="card empty"><b>${S.feedTab === 'friends' ? 'Здесь появятся записи ваши и ваших друзей' : 'Пока никто ничего не написал'}</b>
     <span>Напишите первую запись или найдите знакомых.</span><a class="btn sec" href="#people">Найти людей</a></div>`}`;
}

function composer(wallId, ph) {
  const d = S.draft;
  return `<div class="card pad composer"><form data-form="post" data-wall="${esc(wallId)}">
    <div class="row" style="align-items:flex-start">${avatar(S.me, 40, false)}
      <textarea id="postText" rows="2" placeholder="${esc(ph)}" maxlength="4000"></textarea></div>
    ${d.image ? `<div class="preview"><img src="${d.image}" alt="Прикреплённое фото"><button type="button" data-act="unattach" aria-label="Убрать фото">×</button></div>` : ''}
    <div class="composer-bar"><button type="button" class="icon-btn" data-act="attach">${I.photo}<span class="small">Фото</span></button>
      <span class="grow"></span><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Публикуем…' : 'Опубликовать'}</button></div>
  </form></div>`;
}

function postCard(p) {
  const a = U(p.authorId); if (!a) return '';
  const me = S.me, wall = p.wallId !== p.authorId ? U(p.wallId) : null;
  const likes = p.likes || [], liked = likes.includes(me.id);
  const open = S.openComments.has(p.id), comments = cache.comments.get(p.id);
  const canDel = p.authorId === me.id || p.wallId === me.id;
  const n = p.commentCount || 0;
  const confirmKey = 'post:' + p.id;
  return `<article class="card pad post">
    <div class="row post-head">${avatar(a, 44)}
      <div class="grow">${nameLink(a)}${wall ? ` <span class="muted">→</span> ${nameLink(wall)}` : ''}
        <div class="muted small">${ago(p.createdAt)}</div></div>
      ${canDel ? `<button class="btn ${S.confirm === confirmKey ? 'danger' : 'ghost'} small" data-act="delpost" data-id="${esc(p.id)}">${S.confirm === confirmKey ? 'Удалить?' : 'Удалить'}</button>` : ''}
    </div>
    ${p.text ? `<div class="post-text">${esc(p.text)}</div>` : ''}
    ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="Фото к записи" loading="lazy">` : ''}
    <div class="post-actions">
      <button class="pill ${liked ? 'liked' : ''}" data-act="like" data-id="${esc(p.id)}" aria-pressed="${liked}" aria-label="Нравится">${liked ? I.heart : I.heartO}${likes.length || ''}</button>
      <button class="pill" data-act="togglec" data-id="${esc(p.id)}" aria-label="Комментарии">${I.comment}${n || ''}</button>
    </div>
    ${open ? `<div class="comments">
      ${!comments ? '<div class="muted small">Загружаем…</div>' : comments.map(c => {
        const ca = U(c.authorId); if (!ca) return '';
        const del = c.authorId === me.id || canDel;
        return `<div class="comment">${avatar(ca, 32)}<div class="bubble">${nameLink(ca)} <span class="post-text">${esc(c.text)}</span>
          <div class="muted small">${ago(c.createdAt)}${del ? ` · <button class="btn ghost small" style="padding:0 4px" data-act="delc" data-post="${esc(p.id)}" data-id="${esc(c.id)}">удалить</button>` : ''}</div></div></div>`;
      }).join('')}
      <form class="cform" data-form="comment" data-post="${esc(p.id)}">${avatar(me, 32, false)}<input id="c_${esc(p.id)}" placeholder="Написать комментарий…" maxlength="1000" autocomplete="off"><button class="icon-btn" aria-label="Отправить комментарий">${I.send}</button></form>
    </div>` : n ? `<button class="more small" data-act="togglec" data-id="${esc(p.id)}">Показать ${n} ${plural(n, 'комментарий', 'комментария', 'комментариев')}</button>` : ''}
  </article>`;
}

/* Отношения с человеком */
function relation(id) {
  if (id === S.me.id) return 'me';
  if ((S.me.friends || []).includes(id)) return 'friend';
  if (cache.incoming.some(r => r.from === id)) return 'incoming';
  if (cache.outgoing.some(r => r.to === id)) return 'outgoing';
  return 'none';
}
function relButtons(id, compact = false) {
  switch (relation(id)) {
    case 'me': return '<span class="muted small">Это вы</span>';
    case 'friend': return `<button class="btn ${compact ? 'ghost' : 'sec'}" data-act="unfriend" data-id="${esc(id)}">${S.confirm === 'unf:' + id ? 'Точно убрать?' : compact ? 'Убрать' : 'У вас в друзьях ✓'}</button>`;
    case 'incoming': return `<button class="btn" data-act="accept" data-id="${esc(id)}">Принять заявку</button><button class="btn ghost" data-act="decline" data-id="${esc(id)}">Отклонить</button>`;
    case 'outgoing': return `<button class="btn sec" data-act="cancelreq" data-id="${esc(id)}">Заявка отправлена · отменить</button>`;
    default: return `<button class="btn" data-act="addfriend" data-id="${esc(id)}">Добавить в друзья</button>`;
  }
}

/* Профиль */
function viewProfile() {
  const u = U(S.profileId), me = S.me;
  if (!u) return loadingBox();
  if (u.deleted) return `<div class="card empty"><b>Страница не найдена</b><a class="btn sec" href="#feed">К новостям</a></div>`;
  const own = u.id === me.id, isFriend = (me.friends || []).includes(u.id);
  const friendIds = u.friends || [];
  ensureUsers(friendIds.slice(0, 9));
  const friends = friendIds.slice(0, 9).map(U).filter(Boolean);
  const posts = cache.wall;
  const likes = posts.reduce((s, p) => s + (p.likes || []).length, 0);
  const since = u.createdAt ? new Date(ms(u.createdAt)) : null;
  return `<div class="card">
    <div class="cover"></div>
    <div class="prof">${avatar(u, 120, false)}
      <div class="prof-info"><h1 class="prof-name">${esc(u.name)}</h1><div class="muted">${u.status ? esc(u.status) : own ? 'Добавьте статус в «Редактировать»' : '@' + esc(u.nick)}</div></div>
      <div class="prof-btns">${own ? `<a class="btn sec" href="#edit">Редактировать</a>` : `<a class="btn" href="#im/${esc(u.id)}">Написать</a>${relButtons(u.id)}`}</div>
    </div>
    <dl class="facts">
      <dt>Короткое имя</dt><dd>@${esc(u.nick)}</dd>
      ${u.city ? `<dt>Город</dt><dd>${esc(u.city)}</dd>` : ''}
      ${u.about ? `<dt>О себе</dt><dd>${esc(u.about)}</dd>` : ''}
      ${since ? `<dt>На VСмске</dt><dd>с ${since.getDate()} ${MONTHS[since.getMonth()]} ${since.getFullYear()}</dd>` : ''}
    </dl>
    <div class="stats">
      <div><b>${friendIds.length}</b><span>${plural(friendIds.length, 'друг', 'друга', 'друзей')}</span></div>
      <div><b>${posts.length}</b><span>${plural(posts.length, 'запись', 'записи', 'записей')}</span></div>
      <div><b>${likes}</b><span>${plural(likes, 'отметка', 'отметки', 'отметок')} «нравится»</span></div>
    </div>
  </div>
  <div class="two">
    <div>
      ${own || isFriend ? composer(u.id, own ? 'Что у вас нового?' : 'Написать на стене у ' + u.name.split(' ')[0]) : ''}
      <div class="card pad" style="padding-block:12px"><b>${own ? 'Мои записи' : 'Стена'}</b> <span class="muted">${posts.length}</span></div>
      ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') : `<div class="card empty">${own ? 'Напишите первую запись: её увидят ваши друзья.' : 'На стене пока нет записей'}</div>`}
    </div>
    <div>
      <div class="card pad"><div class="row"><b class="grow">Друзья</b><span class="muted small">${friendIds.length}</span></div>
        ${friends.length ? `<div class="fgrid">${friends.map(f => `<a href="#id/${esc(f.id)}" style="color:var(--fg);display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;min-width:0">${avatar(f, 52, false)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(f.name.split(' ')[0])}</span></a>`).join('')}</div>`
          : `<p class="muted small" style="margin:8px 0 0">${own ? 'Найдите знакомых в разделе «Люди»' : 'Пока никого'}</p>`}
      </div>
    </div>
  </div>`;
}

function viewEdit() {
  const me = S.me, color = S.editColor || me.color, photo = S.editPhoto === undefined ? me.photo : S.editPhoto;
  return `<div class="card pad"><h1 class="h" style="margin-bottom:16px">Редактирование страницы</h1>
  <form class="form" data-form="edit">
    <div class="row">${avatar({ ...me, color, photo }, 72, false)}
      <div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" class="btn sec" data-act="avatar">Загрузить фото</button>
      ${photo ? `<button type="button" class="btn ghost" data-act="noavatar">Убрать фото</button>` : ''}</div></div>
    <div class="field"><label>Цвет аватара</label><div class="swatches">${COLORS.map(c => `<button type="button" class="${c === color ? 'on' : ''}" style="background:${c}" data-act="color" data-c="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>
    <div class="field"><label for="eName">Имя и фамилия</label><input id="eName" required maxlength="60" value="${esc(me.name)}"></div>
    <div class="field"><label for="eNick">Короткое имя</label><input id="eNick" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._]+" value="${esc(me.nick)}"></div>
    <div class="field"><label for="eStatus">Статус</label><input id="eStatus" maxlength="120" value="${esc(me.status)}"></div>
    <div class="field"><label for="eCity">Город</label><input id="eCity" maxlength="40" value="${esc(me.city)}"></div>
    <div class="field"><label for="eAbout">О себе</label><textarea id="eAbout" rows="3" maxlength="600">${esc(me.about)}</textarea></div>
    <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Сохраняем…' : 'Сохранить'}</button><a class="btn ghost" href="#id/${esc(me.id)}">Отмена</a></div>
  </form>
  <div class="row" style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px"><span class="grow muted small">${esc(S.authUser?.email || '')}</span><button type="button" class="btn ghost" data-act="logout">Выйти из аккаунта</button></div>
  </div>`;
}

/* Друзья и люди */
function userRow(u, extra = '') {
  return `<div class="uitem">${avatar(u, 52)}
    <div class="grow">${nameLink(u)}
      <div class="muted small">${[u.city, u.status].filter(Boolean).map(esc).join(' · ') || '@' + esc(u.nick)}</div>${extra}</div>
    <div class="acts" style="flex-wrap:wrap">${u.id !== S.me.id ? `<a class="btn sec" href="#im/${esc(u.id)}">Написать</a>` : ''}${relButtons(u.id, true)}</div>
  </div>`;
}

function viewFriends() {
  const ids = S.me.friends || [];
  ensureUsers([...ids, ...cache.incoming.map(r => r.from), ...cache.outgoing.map(r => r.to)]);
  const fr = ids.map(U).filter(Boolean);
  const inc = cache.incoming.map(r => U(r.from)).filter(Boolean);
  const out = cache.outgoing.map(r => U(r.to)).filter(Boolean);
  return `${inc.length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Заявки в друзья <span class="muted">${inc.length}</span></h2></div>
      <div class="ulist">${inc.map(u => userRow(u, '<div class="req">Хочет добавить вас в друзья</div>')).join('')}</div></div>` : ''}
    <div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Друзья <span class="muted">${ids.length}</span></h1></div>
    <div class="ulist">${fr.length ? fr.map(u => userRow(u)).join('') : ids.length ? '<div class="loading"><div class="spin"></div></div>' : `<div class="empty">У вас пока нет друзей<a class="btn sec" href="#people">Найти людей</a></div>`}</div></div>
    ${out.length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Исходящие заявки <span class="muted">${out.length}</span></h2></div>
      <div class="ulist">${out.map(u => userRow(u)).join('')}</div></div>` : ''}`;
}

function viewPeople() {
  const q = S.query.trim();
  const list = cache.people.filter(u => u.id !== S.me.id);
  list.forEach(u => cache.users.set(u.id, u));
  return `<div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">${q ? `Поиск: «${esc(q)}»` : 'Новые на VСмске'} ${S.loading ? '' : `<span class="muted">${list.length}</span>`}</h1>
    ${q ? '' : '<p class="hint" style="margin:4px 0 0">Ищите по имени, фамилии, короткому имени или городу.</p>'}</div>
    <div class="ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : list.length ? list.map(u => userRow(u)).join('')
      : `<div class="empty">${q ? 'Никого не нашли. Попробуйте начало имени или фамилии.' : 'Кроме вас здесь пока никого. Пригласите друзей!'}</div>`}</div></div>`;
}

/* Сообщения */
function viewMessages() {
  const id = S.me.id;
  const list = [...cache.chats];
  if (S.chatWith && !list.some(c => c.id === chatId(id, S.chatWith))) list.unshift({ id: chatId(id, S.chatWith), members: [id, S.chatWith], fresh: true });
  let chatHtml = `<div class="empty" style="height:100%">Выберите диалог<br><span class="small">или напишите человеку с его страницы</span></div>`;
  const o = S.chatWith && U(S.chatWith);
  if (S.chatWith && !o) chatHtml = '<div class="loading"><div class="spin"></div></div>';
  if (o) {
    let lastDay = '';
    const body = S.loading ? '<div class="loading"><div class="spin"></div></div>' : cache.messages.map(m => {
      const dl = dayLabel(m.createdAt), sep = dl !== lastDay ? `<div class="daysep">${dl}</div>` : ''; lastDay = dl;
      return sep + `<div class="msg ${m.from === id ? 'me' : ''}">${esc(m.text)}<time>${hm(new Date(ms(m.createdAt)))}</time></div>`;
    }).join('') || `<div class="empty">Напишите ${esc(o.name.split(' ')[0])} первым</div>`;
    chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${avatar(o, 38)}
      <div class="grow">${nameLink(o)}<div class="muted small">${esc(o.city || '@' + (o.nick || ''))}</div></div></div>
      <div class="msgs">${body}</div>
      ${o.deleted ? '' : `<form class="chat-form" data-form="msg" data-to="${esc(o.id)}"><input id="msgInput" placeholder="Сообщение" maxlength="2000" autocomplete="off"><button class="btn" aria-label="Отправить">${I.send}</button></form>`}`;
  }
  return `${S.chatsError ? errBox(S.chatsError) : ''}<div class="card im ${S.chatWith ? 'open' : ''}">
    <div class="dlist">${list.length ? list.map(c => {
      const oid = c.members.find(m => m !== id) || id, ou = U(oid);
      if (!ou) return '';
      const unread = !c.fresh && isUnread(c);
      return `<a class="ditem ${S.chatWith === oid ? 'on' : ''}" href="#im/${esc(oid)}">${avatar(ou, 46, false)}
        <div class="grow"><div class="row" style="gap:6px"><b class="grow" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ou.name)}</b>${c.lastAt ? `<span class="muted small">${ms(c.lastAt) >= startOfDay() ? hm(new Date(ms(c.lastAt))) : dayLabel(c.lastAt)}</span>` : ''}</div>
        <div class="last">${c.fresh ? 'Новый диалог' : (c.lastFrom === id ? 'Вы: ' : '') + esc(c.lastText || '')}</div></div>${unread ? '<span class="dot" aria-label="Непрочитано"></span>' : ''}</a>`;
    }).join('') : `<div class="empty">Диалогов пока нет</div>`}</div>
    <div class="chat">${chatHtml}</div></div>`;
}

/* ---------- Действия ---------- */
let pickTarget = null;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, id } = b.dataset;
  const twoStep = key => { if (S.confirm === key) { S.confirm = null; return true; } S.confirm = key; render(); return false; };
  if (!['delpost', 'unfriend'].includes(act)) S.confirm = null;
  try {
    switch (act) {
      case 'authtab': S.authTab = b.dataset.tab; S.authError = ''; S.fatal = null; render(); break;
      case 'google': {
        S.authError = ''; const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
        try { await signInWithPopup(auth, p); }
        catch (err) {
          if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, p);
          else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') { S.authError = errText(err); render(); }
        }
        break;
      }
      case 'reset': {
        const email = document.getElementById('aEmail')?.value.trim();
        if (!email) { S.authError = 'Введите почту, на неё придёт ссылка для сброса пароля.'; render(); return; }
        await sendPasswordResetEmail(auth, email); S.authError = ''; render(); toast('Письмо для сброса пароля отправлено на ' + email); break;
      }
      case 'logout': await signOut(auth); location.hash = ''; break;
      case 'feedtab': S.feedTab = b.dataset.tab; attachView(); break;
      case 'like': {
        const p = [...cache.feed.values()].flat().concat(cache.wall).find(x => x.id === id); if (!p) return;
        await updateDoc(doc(db, 'posts', id), { likes: (p.likes || []).includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
        break;
      }
      case 'togglec':
        if (S.openComments.has(id)) { S.openComments.delete(id); render(); break; }
        S.openComments.add(id);
        if (!commentUnsubs.has(id)) commentUnsubs.set(id, onSnapshot(query(collection(db, 'posts', id, 'comments'), orderBy('createdAt', 'asc'), limit(300)), s => {
          const list = s.docs.map(data); cache.comments.set(id, list); ensureUsers(list.map(c => c.authorId)); render();
        }, onViewErr));
        render(); document.getElementById('c_' + id)?.focus(); break;
      case 'delpost': {
        if (!twoStep('post:' + id)) return;
        const cs = await getDocs(collection(db, 'posts', id, 'comments'));
        const bt = writeBatch(db); cs.docs.slice(0, 480).forEach(d => bt.delete(d.ref)); bt.delete(doc(db, 'posts', id));
        await bt.commit(); toast('Запись удалена'); break;
      }
      case 'delc': {
        const bt = writeBatch(db);
        bt.delete(doc(db, 'posts', b.dataset.post, 'comments', id));
        bt.update(doc(db, 'posts', b.dataset.post), { commentCount: increment(-1) });
        await bt.commit(); break;
      }
      case 'attach': pickTarget = 'post'; document.getElementById('filePick').click(); break;
      case 'avatar': pickTarget = 'avatar'; document.getElementById('filePick').click(); break;
      case 'unattach': S.draft.image = ''; render(); break;
      case 'noavatar': S.editPhoto = ''; render(); break;
      case 'color': S.editColor = b.dataset.c; render(); break;
      case 'addfriend': await friendAdd(id); break;
      case 'cancelreq': await friendCancel(id); break;
      case 'accept': await friendAccept(id); break;
      case 'decline': await friendDecline(id); break;
      case 'unfriend': if (!twoStep('unf:' + id)) return; await friendRemove(id); break;
    }
  } catch (err) { console.error(err); toast(errText(err)); }
});

/* Дружба: заявка → принять / отклонить */
async function friendAdd(to) {
  if (cache.incoming.some(r => r.from === to)) return friendAccept(to);
  const bt = writeBatch(db);
  bt.set(doc(db, 'friendRequests', uid() + '_' + to), { from: uid(), to, createdAt: serverTimestamp() });
  await bt.commit(); toast('Заявка отправлена');
}
async function friendCancel(to) {
  const bt = writeBatch(db); bt.delete(doc(db, 'friendRequests', uid() + '_' + to)); await bt.commit(); toast('Заявка отменена');
}
async function friendAccept(from) {
  const bt = writeBatch(db);
  bt.update(doc(db, 'users', uid()), { friends: arrayUnion(from) });
  bt.update(doc(db, 'users', from), { friends: arrayUnion(uid()) });
  bt.delete(doc(db, 'friendRequests', from + '_' + uid()));
  if (cache.outgoing.some(r => r.to === from)) bt.delete(doc(db, 'friendRequests', uid() + '_' + from));
  await bt.commit(); cache.users.delete(from); toast('Теперь вы друзья');
}
async function friendDecline(from) {
  const bt = writeBatch(db); bt.delete(doc(db, 'friendRequests', from + '_' + uid())); await bt.commit(); toast('Заявка отклонена');
}
async function friendRemove(id) {
  const bt = writeBatch(db);
  bt.update(doc(db, 'users', uid()), { friends: arrayRemove(id) });
  bt.update(doc(db, 'users', id), { friends: arrayRemove(uid()) });
  await bt.commit(); cache.users.delete(id); toast('Удалено из друзей');
}

document.getElementById('filePick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    if (pickTarget === 'avatar') S.editPhoto = await compress(f, 256, MAX_AVATAR, true);
    else S.draft.image = await compress(f, 1280, MAX_POST_IMG);
    render();
  } catch (err) { toast(err.message === 'too-big' ? 'Фото слишком большое даже после сжатия. Выберите другое.' : 'Не получилось открыть картинку. Выберите JPG или PNG.'); }
});

document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const v = id => (document.getElementById(id)?.value || '').trim();
  const clear = id => { const el = document.getElementById(id); if (el) el.value = ''; resetIds.add(id); };
  try {
    switch (f.dataset.form) {
      case 'login':
        S.authBusy = true; S.authError = ''; render();
        try { await signInWithEmailAndPassword(auth, v('aEmail'), document.getElementById('aPass').value); }
        catch (err) { S.authBusy = false; S.authError = errText(err); render(); }
        break;
      case 'register': {
        const nick = v('rNick').toLowerCase(), name = v('rName');
        if (!NICK_RE.test(nick)) { S.authError = 'Короткое имя: от 3 до 30 символов, латиница, цифры, точка и _.'; render(); return; }
        S.authBusy = true; S.authError = ''; render();
        try {
          const taken = await getDoc(doc(db, 'usernames', nick));
          if (taken.exists()) { S.authBusy = false; S.authError = 'Короткое имя уже занято, выберите другое.'; render(); return; }
          S.pendingProfile = { name, nick };
          await createUserWithEmailAndPassword(auth, v('aEmail'), document.getElementById('aPass').value);
        } catch (err) { S.pendingProfile = null; S.authBusy = false; S.authError = errText(err); render(); }
        break;
      }
      case 'onboard': {
        const nick = v('oNick').toLowerCase();
        if (!NICK_RE.test(nick)) { S.authError = 'Короткое имя: от 3 до 30 символов, латиница, цифры, точка и _.'; render(); return; }
        S.authBusy = true; S.authError = ''; render();
        try {
          await createProfile({ name: v('oName'), nick, city: v('oCity'), photo: (S.authUser.photoURL || '').slice(0, 2000) });
          S.authBusy = false; startSession();
        } catch (err) { S.authBusy = false; S.authError = err.message === 'nick-taken' ? 'Короткое имя уже занято, выберите другое.' : errText(err); render(); }
        break;
      }
      case 'search': S.query = v('q'); go('people'); break;
      case 'post': {
        const text = v('postText');
        if (!text && !S.draft.image) { toast('Напишите текст или прикрепите фото'); return; }
        if (S.busy) return;
        S.busy = true; render();
        try {
          await addDoc(collection(db, 'posts'), { authorId: uid(), wallId: f.dataset.wall, text, image: S.draft.image || '', likes: [], commentCount: 0, createdAt: serverTimestamp() });
          S.draft = { text: '', image: '' }; clear('postText'); toast('Опубликовано');
        } finally { S.busy = false; render(); }
        break;
      }
      case 'comment': {
        const pid = f.dataset.post, text = v('c_' + pid); if (!text) return;
        clear('c_' + pid);
        const bt = writeBatch(db);
        bt.set(doc(collection(db, 'posts', pid, 'comments')), { authorId: uid(), text, createdAt: serverTimestamp() });
        bt.update(doc(db, 'posts', pid), { commentCount: increment(1) });
        await bt.commit(); break;
      }
      case 'msg': {
        const text = v('msgInput'); if (!text) return; const to = f.dataset.to, me = uid();
        clear('msgInput');
        const cid = chatId(me, to), bt = writeBatch(db);
        bt.set(doc(collection(db, 'chats', cid, 'messages')), { from: me, text, createdAt: serverTimestamp() });
        bt.set(doc(db, 'chats', cid), { members: [me, to].sort(), lastText: text.slice(0, 200), lastFrom: me, lastAt: serverTimestamp(), read: { [me]: serverTimestamp() } }, { merge: true });
        await bt.commit();
        const box = app.querySelector('.msgs'); if (box) box.scrollTop = box.scrollHeight;
        break;
      }
      case 'edit': {
        const me = S.me, nick = v('eNick').toLowerCase(), name = v('eName'), city = v('eCity');
        if (!NICK_RE.test(nick)) { toast('Короткое имя: от 3 до 30 символов, латиница, цифры, точка и _'); return; }
        S.busy = true; render();
        try {
          const bt = writeBatch(db);
          if (nick !== me.nick) {
            const taken = await getDoc(doc(db, 'usernames', nick));
            if (taken.exists()) { toast('Короткое имя уже занято'); return; }
            bt.set(doc(db, 'usernames', nick), { uid: me.id });
            bt.delete(doc(db, 'usernames', me.nick));
          }
          bt.update(doc(db, 'users', me.id), {
            name, nick, city, status: v('eStatus'), about: v('eAbout'), color: S.editColor || me.color,
            photo: S.editPhoto === undefined ? (me.photo || '') : S.editPhoto, search: buildSearch(name, nick, city),
          });
          await bt.commit(); S.editColor = null; S.editPhoto = undefined; toast('Сохранено'); go('id/' + me.id);
        } finally { S.busy = false; render(); }
        break;
      }
    }
  } catch (err) { console.error(err); toast(errText(err)); }
});

// Обновляем «5 мин назад» раз в минуту
setInterval(() => { if (S.phase === 'app' && !document.activeElement?.matches?.('input,textarea')) render(); }, 60000);
