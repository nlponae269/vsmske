/* ==========================================================================
   VСмске — социальная сеть на Firebase (Auth + Firestore).
   Хостинг: GitHub Pages. Фото и файлы хранятся прямо в Firestore (тариф Spark).
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  linkWithPopup, linkWithCredential, EmailAuthProvider, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, query, where, orderBy, limit, limitToLast,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, deleteField
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
// Обложки профиля: ключ хранится в users.cover
const COVERS = {
  blue: 'linear-gradient(135deg,#2F44D0,#6A47C9)', sunset: 'linear-gradient(135deg,#F2994A,#D0462F 55%,#B4398F)',
  sea: 'linear-gradient(135deg,#1F8A5B,#2B8BB5)', night: 'linear-gradient(135deg,#141A33,#4E5B76)',
  rose: 'linear-gradient(135deg,#B4398F,#F06C9B)', gold: 'linear-gradient(135deg,#C98A12,#F2C94C)',
};
const COLORS = ['#2F44D0','#D0462F','#1F8A5B','#B4398F','#C98A12','#2B8BB5','#6A47C9','#4E5B76'];
const NICK_RE = /^[a-z0-9._]{3,30}$/;
const MAX_POST_IMG = 700000;   // символов dataURL (~520 КБ), лимит документа Firestore — 1 МБ
const MAX_AVATAR = 120000;
const CHUNK = 700000;                                   // символов base64 в одном куске (кратно 4)
const LIMITS = { disk: 10 * 1024 * 1024, video: 20 * 1024 * 1024, music: 12 * 1024 * 1024 };
const VERSION = '2.0';
const MAX_MSG_IMG = 380000;    // фото в сообщении
const ONLINE_MS = 5 * 60 * 1000; // «в сети», если заходил не раньше 5 минут назад

/* ---------- Приложение на главном экране (PWA) ---------- */
let installPrompt = null;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(console.error);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (typeof render === 'function' && S.phase === 'app') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('VСмске установлено на главный экран'); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installCard() {
  if (isStandalone()) return '';
  if (installPrompt) return `<div class="card pad set install"><h2 class="h" style="font-size:16px">Приложение VСмске</h2>
    <div class="set-row"><span class="grow">Значок на главном экране, открывается без адресной строки</span><button class="btn" data-act="install">Установить</button></div></div>`;
  if (isIOS()) return `<div class="card pad set install"><h2 class="h" style="font-size:16px">Приложение VСмске</h2>
    <p class="hint" style="margin:0">В Safari нажмите «Поделиться» (квадрат со стрелкой) → «На экран „Домой“».</p></div>`;
  return `<div class="card pad set install"><h2 class="h" style="font-size:16px">Приложение VСмске</h2>
    <p class="hint" style="margin:0">Откройте меню браузера (⋮) → «Добавить на главный экран» или «Установить приложение».</p></div>`;
}

/* ---------- Тема ---------- */
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(lsGet('vs_theme'));
const ACCENTS = [['blue', 'Синий', '#2F44D0'], ['violet', 'Фиолетовый', '#6A47C9'], ['green', 'Зелёный', '#1F8A5B'], ['orange', 'Оранжевый', '#D9641E'], ['pink', 'Розовый', '#C2357A']];
function applyAccent(a) { if (a && a !== 'blue') document.documentElement.dataset.accent = a; else delete document.documentElement.dataset.accent; }
applyAccent(lsGet('vs_accent'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Текст с кликабельными ссылками (всё остальное экранируется)
const TAG_RE = /(#[\p{L}\d_]{2,30})/u;
// @ник → ссылка на профиль (но не внутри почтового адреса вроде a@b.ru)
const mentionify = t => {
  const parts = t.split(/(@[a-zA-Z0-9._]{3,30})/);
  return parts.map((x, i) => i % 2 && !/[a-zA-Z0-9._]$/.test(parts[i - 1]) ? `<a class="tag" href="#u/${encodeURIComponent(x.slice(1).toLowerCase())}">${esc(x)}</a>` : esc(x)).join('');
};
const tagify = t => t.split(TAG_RE).map((x, i) => i % 2 ? `<a class="tag" href="#tag/${encodeURIComponent(x.slice(1).toLowerCase())}">${esc(x)}</a>` : mentionify(x)).join('');
const extractMentions = t => [...new Set([...String(t || '').matchAll(/(?:^|[\s(,.!?])@([a-z0-9._]{3,30})/gi)].map(m => m[1].toLowerCase()))].slice(0, 5);
// Уведомляем упомянутых (по короткому имени), себя и уже уведомлённого автора пропускаем
async function notifyMentions(text, postId, skip = []) {
  for (const nick of extractMentions(text)) {
    try { const s = await getDoc(doc(db, 'usernames', nick)); const to = s.exists() ? s.data().uid : null; if (to && !skip.includes(to)) notify(to, 'mention', postId, text); }
    catch (e) { console.error(e); }
  }
}
// Сообщение только из 1–3 смайликов показываем крупно
const isJumbo = t => { const s = String(t || '').trim(); if (!s || s.length > 24) return false; const em = s.match(/\p{Extended_Pictographic}/gu) || []; return em.length >= 1 && em.length <= 3 && !s.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s]/gu, '').length; };
const linkify = t => String(t ?? '').split(/(https?:\/\/[^\s<]+[^\s<.,:;!?)\]"'»])/g)
  .map((part, i) => i % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener nofollow ugc">${esc(part)}</a>` : tagify(part)).join('');
const extractTags = t => [...new Set([...String(t || '').matchAll(/#([\p{L}\d_]{2,30})/gu)].map(m => m[1].toLowerCase()))].slice(0, 10);
const ms = t => t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : Date.now());
const data = s => ({ id: s.id, ...s.data({ serverTimestamps: 'estimate' }) });
const chatId = (a, b) => [a, b].sort().join('_');
// Ключ диалога в адресе (#im/<ключ>): uid собеседника или id беседы g_…
const isRoom = k => typeof k === 'string' && k.startsWith('g_');
const chatKeyId = k => isRoom(k) ? k : chatId(uid(), k);
const chatKeyOf = c => c.group ? c.id : (c.members.find(m => m !== uid()) || uid());
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

/* ---------- Файлы в Firestore (кусками) ---------- */
const fmtSize = n => n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(0) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
const fmtDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + pad2(s % 60); };
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
}
function b64ToBytes(b64) { const bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function setUpload(label, pct) { S.upload = label ? { label, pct } : null; render(); }
async function putFile(file, kind, label) {
  const b64 = await fileToBase64(file);
  const n = Math.max(1, Math.ceil(b64.length / CHUNK));
  const ref = doc(collection(db, 'files'));
  setUpload(label, 0);
  await setDoc(ref, { ownerId: uid(), kind, name: file.name.slice(0, 200), size: file.size, type: file.type || 'application/octet-stream', chunks: n, status: 'uploading', createdAt: serverTimestamp() });
  for (let i = 0; i < n; i++) {
    await setDoc(doc(db, 'files', ref.id, 'chunks', String(i).padStart(4, '0')), { i, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    setUpload(label, (i + 1) / n);
  }
  await updateDoc(ref, { status: 'ready' });
  setUpload(null);
  return ref.id;
}
const blobCache = new Map();
async function getFileUrl(fid, type) {
  if (blobCache.has(fid)) return blobCache.get(fid);
  const s = await getDocs(query(collection(db, 'files', fid, 'chunks'), orderBy('i', 'asc')));
  const url = URL.createObjectURL(new Blob(s.docs.map(d => b64ToBytes(d.data().data)), { type: type || 'application/octet-stream' }));
  blobCache.set(fid, url);
  return url;
}
async function deleteFile(fid) {
  const s = await getDocs(collection(db, 'files', fid, 'chunks'));
  const bt = writeBatch(db); s.docs.forEach(d => bt.delete(d.ref)); bt.delete(doc(db, 'files', fid)); await bt.commit();
}
function videoMeta(file) {
  return new Promise(res => {
    const v = document.createElement('video'), url = URL.createObjectURL(file);
    let done = false; const finish = r => { if (done) return; done = true; URL.revokeObjectURL(url); res(r); };
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { finish({ thumb: '', duration: v.duration || 0 }); } };
    v.onseeked = () => {
      try {
        const k = Math.min(1, 480 / (v.videoWidth || 480)), c = document.createElement('canvas');
        c.width = Math.round((v.videoWidth || 480) * k); c.height = Math.round((v.videoHeight || 270) * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        finish({ thumb: c.toDataURL('image/jpeg', 0.7), duration: v.duration || 0 });
      } catch (e) { finish({ thumb: '', duration: v.duration || 0 }); }
    };
    v.onerror = () => finish({ thumb: '', duration: 0 });
    setTimeout(() => finish({ thumb: '', duration: 0 }), 8000);
  });
}
function parseVideoLink(raw) {
  const u = raw.trim(); let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/))) return { provider: 'youtube', vid: m[1] };
  if ((m = u.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([a-f0-9]{32})/i))) return { provider: 'rutube', vid: m[1].toLowerCase() };
  if ((m = u.match(/(?:vk\.com|vk\.ru|vkvideo\.ru)\/(?:.*[?&]z=)?video(-?\d+)_(\d+)/))) return { provider: 'vk', vid: m[1] + '_' + m[2] };
  if (/^https:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(u)) return { provider: 'direct', vid: u };
  return null;
}
function embedSrc(v) {
  if (v.provider === 'youtube' && /^[\w-]{11}$/.test(v.vid)) return 'https://www.youtube.com/embed/' + v.vid;
  if (v.provider === 'rutube' && /^[a-f0-9]{32}$/.test(v.vid)) return 'https://rutube.ru/play/embed/' + v.vid;
  if (v.provider === 'vk' && /^-?\d+_\d+$/.test(v.vid)) { const [o, i] = v.vid.split('_'); return `https://vk.com/video_ext.php?oid=${o}&id=${i}&hd=2`; }
  return '';
}
const safeImg = s => typeof s === 'string' && (s.startsWith('data:image/') || s.startsWith('https://')) ? s : '';
function videoThumb(v) {
  if (v.thumb) return safeImg(v.thumb);
  if (v.provider === 'youtube' && /^[\w-]{11}$/.test(v.vid)) return `https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg`;
  return '';
}
async function copyText(t, okMsg) {
  try { await navigator.clipboard.writeText(t); toast(okMsg || 'Скопировано'); }
  catch (e) { toast('Не получилось скопировать: ' + t); }
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
    'auth/credential-already-in-use': 'Этот аккаунт Google уже привязан к другой странице VСмске.',
    'auth/provider-already-linked': 'Этот способ входа уже подключён.',
    'auth/requires-recent-login': 'Для этого действия выйдите и войдите заново.',
    'auth/email-already-exists': 'Эта почта уже занята другим аккаунтом.',
    'permission-denied': 'Нет доступа к этому действию. Если вы владелец сайта, проверьте, что правила Firestore опубликованы в консоли.',
    'unavailable': 'Сервер недоступен. Проверьте интернет.',
  };
  if (map[code]) return map[code];
  if (code === 'failed-precondition' && /index/i.test(e.message || '')) return 'Нужен индекс Firestore. Создайте его по ссылке ниже.';
  return (e?.message || 'Что-то пошло не так').replace(/^Firebase:\s*/, '');
}
const indexLink = e => (String(e?.message || '').match(/https:\/\/console\.firebase\.google\.com\S+/) || [])[0];
function errBox(e) {
  const link = indexLink(e);
  return `<div class="err"><b>Ошибка.</b> ${esc(errText(e))}${link ? `<br><a href="${esc(link)}" target="_blank" rel="noopener">Создать индекс в консоли</a>` : ''}</div>`;
}

const I = {
  video:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
  album:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>',
  disk:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/></svg>',
  vid:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round"/></svg>',
  gear:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  poll:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  eye:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  music:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  cart:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>',
  next:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5l9 7-9 7zM17 5h2v14h-2z"/></svg>',
  prev:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 5l-9 7 9 7zM5 5h2v14H5z"/></svg>',
  apps:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  ask:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/></svg>',
  mail:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  note:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h10l4 4v14H5z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg>',
  sun:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  game:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13h.01"/></svg>',
  repost:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  shield:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16h.01"/></svg>',
  club:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>',
  mic:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  pause:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  bell:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  reply:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v5"/></svg>',
  more:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  play:'<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  file:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
  link:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  upload:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
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
  draft: { files: [], poll: false, pollN: 2 }, editColor: null, editCover: null, editPhoto: undefined, busy: false,
  upload: null, videoDraft: null, linkForm: false, videoOwner: null, watchId: null, videoSrc: null, videoErr: null,
  albumsOwner: null, albumId: null, lightbox: null, lightboxImg: null, preview: null, newAlbum: false,
  editPost: null, msgSel: null, postMenu: null, emoji: null, replyTo: null, viewImg: null, dq: '', postId: null,
};
const cache = {
  users: new Map(), feed: new Map(), wall: [], comments: new Map(),
  chats: [], messages: [], incoming: [], outgoing: [], people: [],
  videos: [], video: null, albums: [], album: null, photos: [], files: [], post: null, notifs: [],
  groups: new Map(), groupList: [], groupWall: [], reposted: new Map(), reports: [], banned: [], guests: [], tagPosts: [], stories: [],
  questions: [], question: null, answers: [], mailIn: [], mailOut: [], notes: [],
};
let reportsUnsub = null;
let globalUnsubs = [], viewUnsubs = [], commentUnsubs = new Map(), routedOnce = false;
const uid = () => S.authUser?.uid;
const app = document.getElementById('app');

function stopAll() {
  if (typeof player !== 'undefined') { player.audio.pause(); player.queue = []; player.i = -1; }
  globalUnsubs.forEach(u => u()); globalUnsubs = [];
  clearView(); routedOnce = false;
  Object.assign(cache, { users: new Map(), feed: new Map(), wall: [], comments: new Map(), chats: [], messages: [], incoming: [], outgoing: [], people: [],
    videos: [], video: null, albums: [], album: null, photos: [], files: [], post: null, notifs: [],
    groups: new Map(), groupList: [], groupWall: [], reposted: new Map(), reports: [], banned: [], guests: [], tagPosts: [], stories: [],
    questions: [], question: null, answers: [], mailIn: [], mailOut: [], notes: [] });
}
function clearView() {
  viewUnsubs.forEach(u => u()); viewUnsubs = [];
  commentUnsubs.forEach(u => u()); commentUnsubs = new Map();
  S.openComments = new Set(); S.viewError = null;
}

function ensurePostPeople(posts) {
  ensureUsers(posts.flatMap(p => p.groupId ? [p.authorId] : [p.authorId, p.wallId]));
  ensureGroups(posts.map(p => p.groupId).filter(Boolean));
}
const findPost = id => [...cache.feed.values()].flat().concat(cache.wall, cache.groupWall, cache.tagPosts, cache.post ? [cache.post] : [], [...cache.reposted.values()]).find(x => x.id === id);

/* ---------- Уведомления (лайки, комментарии, записи на стене, дружба) ----------
   Пишутся отдельно и «по возможности»: если не получилось, основное действие всё равно выполнено. */
const NOTIF_KEEP = 100;
function notify(to, type, postId = '', text = '', id = null) {
  if (!to || to === uid()) return;
  const n = { to, from: uid(), type, postId, text: String(text || '').slice(0, 120), createdAt: serverTimestamp() };
  setDoc(id ? doc(db, 'notifs', id) : doc(collection(db, 'notifs')), n).catch(console.error);
}
const unnotify = id => deleteDoc(doc(db, 'notifs', id)).catch(() => {});
const unseenNotifs = () => { const seen = ms(S.me?.notifSeenAt || 0); return cache.notifs.filter(n => n.from !== uid() && ms(n.createdAt) > seen).length; };

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

/* ---------- Сообщества (кэш) ---------- */
const pendingGroups = new Set();
function ensureGroups(ids) {
  const miss = [...new Set(ids)].filter(i => i && !cache.groups.has(i) && !pendingGroups.has(i));
  if (!miss.length) return;
  miss.forEach(i => pendingGroups.add(i));
  Promise.all(miss.map(async i => {
    try { const s = await getDoc(doc(db, 'groups', i)); cache.groups.set(i, s.exists() ? data(s) : { id: i, name: 'Удалённое сообщество', admins: [], deleted: true }); }
    catch (e) { cache.groups.set(i, { id: i, name: 'Сообщество', admins: [], deleted: true }); }
    finally { pendingGroups.delete(i); }
  })).then(render);
}
const G = id => cache.groups.get(id);
const groupAvatar = (g, size = 40, link = true) => {
  const inner = safeImg(g?.photo) ? `<img src="${esc(g.photo)}" alt="">` : esc(initials(g?.name));
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;background:${COVERS[g?.cover] || COVERS.blue}`;
  return link && g && !g.deleted ? `<a class="av gav" style="${st}" href="#club/${esc(g.id)}" aria-label="${esc(g.name)}">${inner}</a>` : `<span class="av gav" style="${st}">${inner}</span>`;
};

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
  name = name.slice(0, 60); city = city.slice(0, 40);
  b.set(doc(db, 'users', id), {
    name, nick, city, status: '', about: '', photo,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    friends: [], search: buildSearch(name, nick, city), createdAt: serverTimestamp(),
  });
  await b.commit();
}

/* «В сети»: отмечаемся раз в 4 минуты, пока вкладка открыта (≈15 записей в час) */
let seenAt = 0;
function touchSeen() {
  if (S.phase !== 'app' || document.hidden || Date.now() - seenAt < 4 * 60 * 1000) return;
  seenAt = Date.now();
  updateDoc(doc(db, 'users', uid()), { lastSeen: serverTimestamp() }).catch(console.error);
}
setInterval(touchSeen, 60 * 1000);
document.addEventListener('visibilitychange', touchSeen);
function seenText(u) {
  if (!u?.lastSeen) return '';
  const t = ms(u.lastSeen);
  return Date.now() - t < ONLINE_MS ? 'в сети' : 'был(а) в сети ' + ago(t);
}
const isOnline = u => !!u?.lastSeen && Date.now() - ms(u.lastSeen) < ONLINE_MS;

/* Уведомления браузера о новых сообщениях */
const canNotify = () => 'Notification' in window;
const notifyOn = () => canNotify() && Notification.permission === 'granted' && lsGet('vs_notify') !== '0';
function notifyChats(s, first) {
  if (first || !notifyOn()) return;
  s.docChanges().forEach(ch => {
    if (ch.type === 'removed') return;
    const c = data(ch.doc), key = chatKeyOf(c), from = c.lastFrom;
    if (c.lastFrom === uid() || !isUnread(c) || ms(c.lastAt) < sessionAt) return;
    if (!document.hidden && S.view === 'messages' && S.chatWith === key) return;
    try {
      const title = c.group ? c.name + ': ' + (U(from)?.name || '') : U(from)?.name || 'Новое сообщение';
      const n = new Notification(title, { body: c.lastText || '', tag: c.id, icon: safeImg(U(from)?.photo) || undefined });
      n.onclick = () => { window.focus(); go('im/' + key); n.close(); };
    } catch (e) { console.error(e); }
  });
}
let sessionAt = 0;

function startSession() {
  const id = uid();
  sessionAt = Date.now(); seenAt = 0;
  let firstChats = true;
  globalUnsubs.push(onSnapshot(doc(db, 'users', id), s => {
    if (!s.exists()) return;
    const prevFriends = JSON.stringify([S.me?.friends || [], S.me?.groups || []]);
    S.me = data(s); cache.users.set(id, S.me); S.phase = 'app';
    if (isSiteAdmin() && !reportsUnsub) {
      reportsUnsub = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)), r => {
        cache.reports = r.docs.map(data); ensureUsers(cache.reports.flatMap(x => [x.from, x.targetUser])); render();
      }, console.error);
      globalUnsubs.push(() => { reportsUnsub?.(); reportsUnsub = null; });
    }
    if (!routedOnce) { routedOnce = true; route(); touchSeen(); return; }
    if (S.view === 'feed' && S.feedTab === 'friends' && prevFriends !== JSON.stringify([S.me.friends || [], S.me.groups || []])) attachView();
    else render();
  }, e => { S.fatal = e; render(); }));
  globalUnsubs.push(onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', id), orderBy('lastAt', 'desc'), limit(100)), s => {
    cache.chats = s.docs.map(data); S.chatsLoaded = true;
    ensureUsers(cache.chats.flatMap(c => c.group ? [c.lastFrom] : [c.members.find(m => m !== id)]));
    notifyChats(s, firstChats); firstChats = false;
    markRead(); render();
  }, e => { console.error(e); S.chatsError = e; render(); }));
  globalUnsubs.push(onSnapshot(query(collection(db, 'friendRequests'), where('to', '==', id)), s => {
    cache.incoming = s.docs.map(data); ensureUsers(cache.incoming.map(r => r.from)); render();
  }, console.error));
  globalUnsubs.push(onSnapshot(query(collection(db, 'mail'), where('to', '==', id), limit(300)), s => {
    cache.mailIn = s.docs.map(data).filter(m => !m.delTo).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    ensureUsers(cache.mailIn.map(m => m.from)); render();
  }, console.error));
  globalUnsubs.push(onSnapshot(query(collection(db, 'notifs'), where('to', '==', id), limit(NOTIF_KEEP + 50)), s => {
    cache.notifs = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    ensureUsers(cache.notifs.map(n => n.from));
    if (S.view === 'notif' && unseenNotifs()) updateDoc(doc(db, 'users', id), { notifSeenAt: serverTimestamp() }).catch(console.error);
    render();
    // старые уведомления удаляем, чтобы коллекция не росла
    const old = cache.notifs.slice(NOTIF_KEEP);
    if (old.length) { const bt = writeBatch(db); old.forEach(n => bt.delete(doc(db, 'notifs', n.id))); bt.commit().catch(console.error); }
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
  else if (v === 'video' && arg) { S.view = 'watch'; S.watchId = arg; }
  else if (v === 'video') { S.view = 'video'; S.videoOwner = null; }
  else if (v === 'videos') { S.view = 'video'; S.videoOwner = arg || uid(); }
  else if (v === 'albums') { S.view = 'albums'; S.albumsOwner = arg || uid(); }
  else if (v === 'album' && arg) { S.view = 'album'; S.albumId = arg; }
  else if (v === 'post' && arg) { S.view = 'post'; S.postId = arg; }
  else if (v === 'club' && arg) { S.view = 'club'; S.clubId = arg; }
  else if (v === 'q' && arg) { S.view = 'question'; S.qId = arg; }
  else if (v === 'market') { S.view = 'market'; S.mktCat = arg || 'all'; }
  else if (v === 'lot' && arg) { S.view = 'lot'; S.lotId = arg; }
  else if (v === 'music') { S.view = 'music'; S.musicTab = arg || 'my'; }
  else if (v === 'u' && arg) { getDoc(doc(db, 'usernames', decodeURIComponent(arg).toLowerCase())).then(s => s.exists() ? go('id/' + s.data().uid) : (toast('Нет пользователя @' + decodeURIComponent(arg)), history.back())).catch(() => history.back()); return; }
  else if (v === 'answers') { S.view = 'answers'; S.ansCat = arg || 'all'; }
  else if (v === 'mail') { S.view = 'mail'; S.mailBox = arg === 'sent' ? 'sent' : arg === 'new' ? 'new' : 'in'; S.mailId = arg && !['sent', 'new', 'in'].includes(arg) ? arg : null; }
  else if (v === 'games') { S.view = 'games'; S.game = arg || null; }
  else if (v === 'tag' && arg) { S.view = 'tag'; try { S.tag = decodeURIComponent(arg).toLowerCase(); } catch (e) { S.tag = arg; } }
  else if (['feed', 'friends', 'people', 'edit', 'disk', 'vid', 'settings', 'more', 'notif', 'clubs', 'admin', 'guests', 'apps', 'notes', 'weather'].includes(v)) S.view = v;
  else S.view = 'feed';
  if (S.view !== 'edit') { S.editColor = null; S.editCover = null; S.editPhoto = undefined; }
  if (S.view !== 'watch') { S.videoSrc = null; S.videoErr = null; }
  S.lightbox = null; S.lightboxImg = null; S.preview = null; S.linkForm = false; S.newAlbum = false;
  S.viewImg = null; S.postMenu = null; S.emoji = null; S.msgSel = null; S.profMenu = false; S.modOpen = false; S.report = null;
  S.newQ = false; S.noteEdit = null; S.giftFor = null; S.newLot = false; if (S.view !== 'mail') S.mailDraft = null;
  S.newRoom = null; S.fwd = null; S.roomInfo = false; S.story = null; S.storyDraft = null; clearTimeout(storyTimer); S.clubEdit = false; S.editGroupPhoto = undefined; S.editGroupCover = null;
  if (S.view !== 'messages') S.replyTo = null;
  recStop(false); players.forEach(p => p.pause()); players.clear();
  if (S.view !== 'video') S.videoDraft = null;
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
      ensurePostPeople(posts); render();
    }, onViewErr));
    loadStories();
    if (S.feedTab === 'all') listen(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)), 'all');
    else {
      chunk([id, ...(S.me.friends || [])], 30).forEach((c, i) =>
        listen(query(collection(db, 'posts'), where('authorId', 'in', c), orderBy('createdAt', 'desc'), limit(50)), i));
      // записи сообществ, на которые я подписан
      chunk(S.me.groups || [], 30).forEach((c, i) =>
        listen(query(collection(db, 'posts'), where('wallId', 'in', c), orderBy('createdAt', 'desc'), limit(30)), 'g' + i));
    }
  } else if (S.view === 'profile') {
    const pid = S.profileId; cache.wall = []; cache.gifts = [];
    viewUnsubs.push(onSnapshot(query(collection(db, 'gifts'), where('to', '==', pid), limit(60)), s => {
      cache.gifts = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); ensureUsers(cache.gifts.map(g => g.from)); render();
    }, console.error));
    if (pid !== id) recordGuest(pid);
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
      const peer = S.chatWith;
      if (!isRoom(peer)) viewUnsubs.push(onSnapshot(doc(db, 'users', peer), s => {
        cache.users.set(peer, s.exists() ? data(s) : { id: peer, name: 'Удалённая страница', friends: [], deleted: true }); render();
      }, console.error));
      viewUnsubs.push(onSnapshot(query(collection(db, 'chats', chatKeyId(S.chatWith), 'messages'), orderBy('createdAt', 'asc'), limitToLast(200)), s => {
        cache.messages = s.docs.map(data); if (isRoom(S.chatWith)) ensureUsers(cache.messages.map(m => m.from)); S.loading = false; markRead(); render();
      }, e => { if (isRoom(S.chatWith) && e.code === 'permission-denied') { cache.messages = []; S.loading = false; render(); } else onViewErr(e); }));
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
  } else if (S.view === 'video') {
    cache.videos = [];
    const q = S.videoOwner
      ? query(collection(db, 'videos'), where('ownerId', '==', S.videoOwner), limit(200))
      : query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(60));
    if (S.videoOwner) ensureUsers([S.videoOwner]);
    viewUnsubs.push(onSnapshot(q, s => {
      cache.videos = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      ensureUsers(cache.videos.map(v => v.ownerId)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'watch') {
    cache.video = null; cache.videos = [];
    const wid = S.watchId;
    viewUnsubs.push(onSnapshot(doc(db, 'videos', wid), s => {
      cache.video = s.exists() ? data(s) : { id: wid, missing: true }; S.loading = false;
      const v = cache.video;
      if (!v.missing) {
        ensureUsers([v.ownerId]);
        if (v.source === 'file' && !S.videoSrc && !S.videoErr && !S.videoLoading) {
          S.videoLoading = true;
          getFileUrl(v.fileId, v.type || 'video/mp4')
            .then(u => { if (S.watchId === wid) S.videoSrc = u; })
            .catch(e => { if (S.watchId === wid) S.videoErr = e; })
            .finally(() => { S.videoLoading = false; render(); });
        }
      }
      render();
    }, onViewErr));
    getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(12))).then(s => {
      cache.videos = s.docs.map(data).filter(v => v.id !== wid); ensureUsers(cache.videos.map(v => v.ownerId)); render();
    }).catch(console.error);
  } else if (S.view === 'albums') {
    cache.albums = []; ensureUsers([S.albumsOwner]);
    viewUnsubs.push(onSnapshot(query(collection(db, 'albums'), where('ownerId', '==', S.albumsOwner), limit(200)), s => {
      cache.albums = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'album') {
    cache.album = null; cache.photos = [];
    const aid = S.albumId;
    viewUnsubs.push(onSnapshot(doc(db, 'albums', aid), s => {
      cache.album = s.exists() ? data(s) : { id: aid, missing: true };
      if (!cache.album.missing) ensureUsers([cache.album.ownerId]); render();
    }, onViewErr));
    viewUnsubs.push(onSnapshot(query(collection(db, 'photos'), where('albumId', '==', aid), limit(500)), s => {
      cache.photos = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'post') {
    cache.post = null; const pid = S.postId;
    viewUnsubs.push(onSnapshot(doc(db, 'posts', pid), s => {
      cache.post = s.exists() ? data(s) : { id: pid, missing: true }; S.loading = false;
      if (!cache.post.missing) ensureUsers([cache.post.authorId, cache.post.wallId]); render();
    }, onViewErr));
  } else if (S.view === 'market') {
    cache.lots = [];
    const q = S.mktCat === 'mine' ? query(collection(db, 'market'), where('ownerId', '==', id), limit(100))
      : S.mktCat !== 'all' ? query(collection(db, 'market'), where('category', '==', S.mktCat), limit(100))
      : query(collection(db, 'market'), orderBy('createdAt', 'desc'), limit(60));
    viewUnsubs.push(onSnapshot(q, s => { cache.lots = s.docs.map(data).sort((a, b) => (a.sold - b.sold) || ms(b.createdAt) - ms(a.createdAt)); S.loading = false; render(); }, onViewErr));
  } else if (S.view === 'lot') {
    cache.lot = null;
    viewUnsubs.push(onSnapshot(doc(db, 'market', S.lotId), s => { cache.lot = s.exists() ? data(s) : { id: S.lotId, missing: true }; if (s.exists()) ensureUsers([cache.lot.ownerId]); S.loading = false; render(); }, onViewErr));
  } else if (S.view === 'music') {
    loadMusic();
  } else if (S.view === 'answers') {
    cache.questions = [];
    const q = S.ansCat === 'mine' ? query(collection(db, 'questions'), where('authorId', '==', id), limit(100))
      : S.ansCat !== 'all' ? query(collection(db, 'questions'), where('category', '==', S.ansCat), limit(100))
      : query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(60));
    viewUnsubs.push(onSnapshot(q, s => {
      cache.questions = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      ensureUsers(cache.questions.map(x => x.authorId)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'question') {
    cache.question = null; cache.answers = []; const qid = S.qId;
    viewUnsubs.push(onSnapshot(doc(db, 'questions', qid), s => {
      cache.question = s.exists() ? data(s) : { id: qid, missing: true }; if (s.exists()) ensureUsers([cache.question.authorId]); render();
    }, onViewErr));
    viewUnsubs.push(onSnapshot(query(collection(db, 'questions', qid, 'answers'), orderBy('createdAt', 'asc'), limit(300)), s => {
      cache.answers = s.docs.map(data); ensureUsers(cache.answers.map(a => a.authorId)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'mail') {
    viewUnsubs.push(onSnapshot(query(collection(db, 'mail'), where('from', '==', id), limit(300)), s => {
      cache.mailOut = s.docs.map(data).filter(m => !m.delFrom).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      ensureUsers(cache.mailOut.map(m => m.to)); S.loading = false; render();
    }, onViewErr));
    if (S.mailId) openMail(S.mailId);
  } else if (S.view === 'notes') {
    viewUnsubs.push(onSnapshot(query(collection(db, 'notes'), where('ownerId', '==', id), limit(300)), s => {
      cache.notes = s.docs.map(data).sort((a, b) => (b.pinned - a.pinned) || ms(b.updatedAt) - ms(a.updatedAt)); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'weather') {
    S.loading = false;
    if (!S.wx) loadWeather(lsGet('vs_wx_city') || S.me.city || 'Москва');
  } else if (S.view === 'guests') {
    cache.guests = [];
    getDocs(query(collection(db, 'users', id, 'guests'), orderBy('at', 'desc'), limit(50))).then(s => {
      cache.guests = s.docs.map(data); ensureUsers(cache.guests.map(g => g.id)); S.loading = false; render();
    }).catch(onViewErr);
  } else if (S.view === 'tag') {
    cache.tagPosts = [];
    getDocs(query(collection(db, 'posts'), where('tags', 'array-contains', S.tag), limit(60))).then(s => {
      cache.tagPosts = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); ensurePostPeople(cache.tagPosts); S.loading = false; render();
    }).catch(onViewErr);
  } else if (S.view === 'admin') {
    cache.banned = [];
    if (isSiteAdmin()) getDocs(query(collection(db, 'users'), orderBy('ban.at', 'desc'), limit(100))).then(s => {
      cache.banned = s.docs.map(data).filter(u => u.ban); cache.banned.forEach(u => cache.users.set(u.id, u)); S.loading = false; render();
    }).catch(onViewErr);
    else S.loading = false;
  } else if (S.view === 'clubs') {
    ensureGroups(S.me.groups || []);
    getDocs(query(collection(db, 'groups'), orderBy('createdAt', 'desc'), limit(50))).then(s => {
      cache.groupList = s.docs.map(data); cache.groupList.forEach(g => cache.groups.set(g.id, g));
      S.loading = false; render();
    }).catch(onViewErr);
  } else if (S.view === 'club') {
    const gid = S.clubId; cache.groupWall = [];
    viewUnsubs.push(onSnapshot(doc(db, 'groups', gid), s => {
      cache.groups.set(gid, s.exists() ? data(s) : { id: gid, name: 'Сообщество не найдено', admins: [], deleted: true });
      ensureUsers(G(gid).admins || []); render();
    }, onViewErr));
    viewUnsubs.push(onSnapshot(query(collection(db, 'posts'), where('wallId', '==', gid), orderBy('createdAt', 'desc'), limit(50)), s => {
      cache.groupWall = s.docs.map(data); S.loading = false; ensurePostPeople(cache.groupWall); render();
    }, onViewErr));
  } else if (S.view === 'notif') {
    S.loading = false;
    if (unseenNotifs()) updateDoc(doc(db, 'users', id), { notifSeenAt: serverTimestamp() }).catch(console.error);
  } else if (S.view === 'friends') {
    S.loading = false;
    // свежие данные друзей (не больше 100), чтобы «Возможные друзья» учитывали новые дружбы
    (S.me.friends || []).slice(0, 100).forEach(f => { if (!pendingUsers.has(f)) cache.users.delete(f); });
    ensureUsers(S.me.friends || []);
  } else if (S.view === 'disk') {
    cache.files = [];
    viewUnsubs.push(onSnapshot(query(collection(db, 'files'), where('ownerId', '==', id), where('kind', '==', 'disk'), limit(500)), s => {
      cache.files = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); S.loading = false; render();
    }, onViewErr));
  } else S.loading = false;
  render();
}

/* ---------- Истории на 24 часа ---------- */
const STORY_MS = 24 * 3600 * 1000, STORY_SHOW = 5000;
let storyTimer = null;
async function loadStories() {
  const ids = [uid(), ...(S.me.friends || [])].slice(0, 150), since = Date.now() - STORY_MS, all = [];
  try {
    for (const c of chunk(ids, 30)) {
      const s = await getDocs(query(collection(db, 'stories'), where('ownerId', 'in', c), limit(100)));
      s.docs.forEach(d => all.push(data(d)));
    }
  } catch (e) { console.error(e); return; }
  // свои просроченные истории удаляем, чужие просто не показываем
  all.filter(x => ms(x.createdAt) < since && x.ownerId === uid()).forEach(x => deleteDoc(doc(db, 'stories', x.id)).catch(() => {}));
  cache.stories = all.filter(x => ms(x.createdAt) >= since).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  ensureUsers(cache.stories.map(x => x.ownerId)); render();
}
function storyOwners() {
  const me = uid(), by = new Map();
  cache.stories.forEach(x => { if (!by.has(x.ownerId)) by.set(x.ownerId, []); by.get(x.ownerId).push(x); });
  const seen = o => by.get(o).every(x => x.ownerId === me || (x.views || {})[me]);
  const others = [...by.keys()].filter(o => o !== me).sort((a, b) => seen(a) - seen(b));
  return { by, order: (by.has(me) ? [me] : []).concat(others), seen };
}
function storiesBar() {
  const me = S.me, { by, order, seen } = storyOwners();
  const mine = by.has(me.id);
  return `<div class="card stories" role="list">
    <div class="story-item" role="listitem"><button class="story-ring ${mine ? '' : 'add'}" data-act="${mine ? 'storyopen' : 'storyadd'}" data-id="${esc(me.id)}" aria-label="${mine ? 'Моя история' : 'Добавить историю'}">${avatar(me, 58, false)}</button>
      ${banOf(me) ? '' : `<button class="story-plus" data-act="storyadd" aria-label="Добавить историю">+</button>`}<span>${mine ? 'Моя история' : 'Добавить'}</span></div>
    ${order.filter(o => o !== me.id).map(o => { const u = U(o); if (!u) return '';
      return `<div class="story-item" role="listitem"><button class="story-ring ${seen(o) ? 'seen' : ''}" data-act="storyopen" data-id="${esc(o)}" aria-label="История ${esc(u.name)}">${avatar(u, 58, false)}</button><span>${esc(u.name.split(' ')[0])}</span></div>`; }).join('')}
  </div>`;
}
function storyOverlay() {
  const st = S.story, { by, order } = storyOwners(), list = by.get(order[st.oi]) || [], x = list[st.si];
  if (!x) return '';
  const u = U(x.ownerId), mine = x.ownerId === uid(), views = Object.keys(x.views || {}).length;
  const elapsed = Math.min(STORY_SHOW, Date.now() - (st.started || Date.now()));
  return `<div class="ov story-ov" data-act="storyclose"><div class="story-box" data-stop="1">
    <div class="story-bars">${list.map((_, i) => `<i class="${i < st.si ? 'done' : i === st.si ? 'cur' : ''}"${i === st.si ? ` style="animation-delay:-${elapsed}ms"` : ''}></i>`).join('')}</div>
    <div class="story-top">${avatar(u, 34, false)}<div class="grow"><b>${esc(u?.name || '')}</b><div class="small">${ago(x.createdAt)}</div></div>
      ${mine ? `<span class="small">👁 ${views}</span><button class="btn ghost light small" data-act="storydel" data-id="${esc(x.id)}">${S.confirm === 'story:' + x.id ? 'Удалить?' : 'Удалить'}</button>` : ''}
      <button class="btn ghost light" data-act="storyclose" aria-label="Закрыть">✕</button></div>
    <img src="${esc(safeImg(x.image))}" alt="История">
    ${x.text ? `<div class="story-text">${esc(x.text)}</div>` : ''}
    <button class="story-nav l" data-act="storystep" data-d="-1" aria-label="Назад"></button><button class="story-nav r" data-act="storystep" data-d="1" aria-label="Дальше"></button>
  </div></div>`;
}
function storyShow() {
  clearTimeout(storyTimer);
  const st = S.story; if (!st) return;
  const { by, order } = storyOwners(), x = (by.get(order[st.oi]) || [])[st.si];
  if (!x) { S.story = null; render(); return; }
  st.started = Date.now();
  if (x.ownerId !== uid() && !(x.views || {})[uid()]) {
    x.views = { ...(x.views || {}), [uid()]: Date.now() };
    updateDoc(doc(db, 'stories', x.id), { [`views.${uid()}`]: serverTimestamp() }).catch(console.error);
  }
  render();
  storyTimer = setTimeout(() => storyStep(1), STORY_SHOW);
}
function storyStep(dir) {
  const st = S.story; if (!st) return;
  const { by, order } = storyOwners(), list = by.get(order[st.oi]) || [];
  st.si += dir;
  if (st.si >= list.length) { st.oi++; st.si = 0; }
  if (st.si < 0) { st.oi--; st.si = st.oi >= 0 ? (by.get(order[st.oi]) || []).length - 1 : 0; }
  if (st.oi < 0 || st.oi >= order.length) { clearTimeout(storyTimer); S.story = null; render(); return; }
  storyShow();
}

/* Гости страницы: отмечаемся не чаще раза в 30 минут на одну страницу */
function recordGuest(pid) {
  const k = 'vs_guest_' + pid, last = Number(lsGet(k) || 0);
  if (Date.now() - last < 30 * 60 * 1000 || banOf(S.me)) return;
  lsSet(k, String(Date.now()));
  setDoc(doc(db, 'users', pid, 'guests', uid()), { at: serverTimestamp() }).catch(console.error);
}

function markRead() {
  if (S.view !== 'messages' || !S.chatWith || document.hidden) return;
  const id = uid(), c = cache.chats.find(c => c.id === chatKeyId(S.chatWith));
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
// Значок администратора у имени (admin ставится только в консоли Firestore)
// admin можно поставить в консоли как boolean true или как строку "true"
const isAdm = u => u?.admin === true || u?.admin === 'true';
const admBadge = u => isAdm(u) ? `<span class="adm-badge" title="Администратор VСмске" aria-label="Администратор">✓</span>` : '';
const isSiteAdmin = () => isAdm(S.me);

/* Бан (ставит админ) и чёрный список (каждый для себя) */
const banOf = u => { const b = u?.ban; if (!b) return null; const until = b.until ? ms(b.until) : null; return until === null || until > Date.now() ? { until, reason: b.reason || '' } : null; };
const banText = b => b.until === null ? 'навсегда' : 'до ' + new Date(b.until).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const iBlocked = id => (S.me?.blocked || []).includes(id);
const blockedMe = u => (u?.blocked || []).includes(S.me?.id);
// День рождения: users.bday = 'ГГГГ-ММ-ДД'
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const bdayText = b => { const [y, m, d] = String(b || '').split('-').map(Number); return d ? `${d} ${MONTHS_FULL[m - 1]} ${y}` : ''; };
const isBdayToday = b => { const t = new Date(); return typeof b === 'string' && b.slice(5) === pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()); };
// Подарки: ключ → [эмодзи, название]
const GIFTS = { gift: ['🎁', 'Подарок'], rose: ['🌹', 'Роза'], bear: ['🧸', 'Мишка'], cake: ['🎂', 'Торт'], heart: ['❤️', 'Сердце'], clover: ['🍀', 'На удачу'],
  cup: ['🏆', 'Кубок'], star: ['🌟', 'Звезда'], coffee: ['☕', 'Кофе'], cat: ['🐱', 'Котик'], pizza: ['🍕', 'Пицца'], car: ['🏎️', 'Машина'],
  crown: ['👑', 'Корона'], balloon: ['🎈', 'Шарик'], diamond: ['💎', 'Бриллиант'], rocket: ['🚀', 'Ракета'] };
const BAN_DAYS = [[1, '1 день'], [7, 'Неделя'], [30, 'Месяц'], [0, 'Навсегда']];
const nameLink = u => u && !u.deleted ? `<a class="name" href="#id/${esc(u.id)}" style="color:var(--fg);font-weight:600">${esc(u.name)}</a>${admBadge(u)}` : `<span class="name">${esc(u?.name || '…')}</span>`;
const loadingBox = () => `<div class="card loading"><div class="spin"></div></div>`;

const playerKey = () => { const v = cache.video; return `${S.watchId}:${v ? (v.missing ? 'x' : v.source) : '-'}:${S.videoSrc ? 1 : 0}:${S.videoErr ? 1 : 0}`; };
function render() {
  const unread = S.phase === 'app' ? cache.chats.filter(isUnread).length : 0;
  document.title = (unread ? `(${unread}) ` : '') + 'VСмске';
  // на странице видео не пересоздаём плеер, чтобы ролик не перезапускался
  if (S.phase === 'app' && S.view === 'watch' && !S.viewError) {
    const pl = app.querySelector('#player');
    if (pl && pl.dataset.key === playerKey()) {
      const swap = (sel, html) => { const el = app.querySelector(sel); if (el) el.outerHTML = html; };
      swap('nav.nav', navHtml()); swap('#watchInfo', watchInfo()); swap('#watchSide', watchSide());
      return;
    }
  }
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
  const box = app.querySelector('.msgs');
  if (box && atBottom) {
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', () => { box.scrollTop = box.scrollHeight; }, { once: true }); });
  }
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

function navHtml() {
  const me = S.me, unread = cache.chats.filter(isUnread).length, reqs = cache.incoming.length;
  const groups = { video: ['video', 'watch'], albums: ['albums', 'album'], clubs: ['clubs', 'club'], apps: ['apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot'], music: ['music'] };
  const on = v => (groups[v] ? groups[v].includes(S.view) : S.view === v) && (v !== 'profile' || S.profileId === me.id) ? 'on' : '';
  const nav = (v, href, icon, label, badge = 0, cls = '') => `<a class="navlink ${on(v)} ${cls}" href="#${href}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const moreOn = ['more', 'profile', 'people', 'albums', 'album', 'disk', 'vid', 'settings', 'edit', 'notif', 'post', 'clubs', 'club', 'admin', 'guests', 'tag', 'apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'music'].includes(S.view) ? 'on' : '';
  return `<nav class="nav">
      ${nav('profile', 'id/' + me.id, I.home, 'Моя страница', 0, 'm-hide')}
      ${nav('feed', 'feed', I.feed, 'Новости')}
      ${nav('messages', 'im', I.msg, 'Сообщения', unread)}
      ${nav('friends', 'friends', I.friends, 'Друзья', reqs)}
      ${nav('notif', 'notif', I.bell, 'Уведомления', unseenNotifs(), 'm-hide')}
      ${nav('people', 'people', I.people, 'Люди', 0, 'm-hide')}
      ${nav('apps', 'apps', I.apps, 'Сервисы', unreadMail(), 'm-hide')}
      ${nav('music', 'music', I.music, 'Музыка', 0, 'm-hide')}
      ${nav('clubs', 'clubs', I.club, 'Сообщества', 0, 'm-hide')}
      ${nav('video', 'video', I.video, 'Видео')}
      ${nav('albums', 'albums', I.album, 'Альбомы', 0, 'm-hide')}
      ${nav('disk', 'disk', I.disk, 'Диск', 0, 'm-hide')}
      <a class="navlink m-only ${moreOn}" href="#more">${I.more}<span>Ещё</span></a>
      <hr>
      ${nav('vid', 'vid', I.vid, 'VС ID', 0, 'm-hide sub')}
      ${isSiteAdmin() ? nav('admin', 'admin', I.shield, 'Админ-панель', cache.reports.length, 'm-hide sub') : ''}
      ${nav('settings', 'settings', I.gear, 'Настройки', 0, 'm-hide sub')}
      <button class="sub desk" data-act="logout">${I.out}<span>Выйти</span></button>
    </nav>`;
}

function shell() {
  const me = S.me;
  let main;
  if (S.viewError) main = errBox(S.viewError);
  else if (S.view === 'profile') main = viewProfile();
  else if (S.view === 'messages') main = viewMessages();
  else if (S.view === 'friends') main = viewFriends();
  else if (S.view === 'people') main = viewPeople();
  else if (S.view === 'edit') main = viewEdit();
  else if (S.view === 'video') main = viewVideo();
  else if (S.view === 'watch') main = viewWatch();
  else if (S.view === 'albums') main = viewAlbums();
  else if (S.view === 'album') main = viewAlbum();
  else if (S.view === 'disk') main = viewDisk();
  else if (S.view === 'vid') main = viewVID();
  else if (S.view === 'settings') main = viewSettings();
  else if (S.view === 'more') main = viewMore();
  else if (S.view === 'post') main = viewPost();
  else if (S.view === 'notif') main = viewNotifs();
  else if (S.view === 'clubs') main = viewClubs();
  else if (S.view === 'guests') main = viewGuests();
  else if (S.view === 'apps') main = viewApps();
  else if (S.view === 'market') main = viewMarket();
  else if (S.view === 'lot') main = viewLot();
  else if (S.view === 'music') main = viewMusic();
  else if (S.view === 'answers') main = viewAnswers();
  else if (S.view === 'question') main = viewQuestion();
  else if (S.view === 'mail') main = viewMail();
  else if (S.view === 'notes') main = viewNotes();
  else if (S.view === 'weather') main = viewWeather();
  else if (S.view === 'games') main = viewGames();
  else if (S.view === 'tag') main = viewTag();
  else if (S.view === 'admin') main = isSiteAdmin() ? viewAdmin() : `<div class="card empty"><b>Только для администраторов</b></div>`;
  else if (S.view === 'club') main = viewClub();
  else main = viewFeed();
  const up = S.upload ? `<div class="card pad upbar" role="status"><div class="row"><span class="grow">${esc(S.upload.label)}</span><b class="tnum">${Math.round(S.upload.pct * 100)}%</b></div><div class="bar"><i style="width:${Math.round(S.upload.pct * 100)}%"></i></div><div class="hint">Не закрывайте страницу до конца загрузки</div></div>` : '';
  return `
  <header class="top"><div class="top-in">
    <a class="logo" href="#feed" aria-label="VСмске, новости"><span class="logo-mark">VС</span><span class="logo-word" style="color:var(--fg)">VСмске</span></a>
    <form class="search" data-form="search">${I.search}<input id="q" type="search" placeholder="Поиск людей" autocomplete="off" value="${esc(S.view === 'people' ? S.query : '')}"></form>
    <a class="top-bell icon-btn ${S.view === 'notif' ? 'on' : ''}" href="#notif" aria-label="Уведомления">${I.bell}${unseenNotifs() ? `<span class="badge">${unseenNotifs()}</span>` : ''}</a>
    <a class="top-me" href="#id/${esc(me.id)}" style="color:var(--fg)">${avatar(me, 32, false)}<span>${esc(me.name.split(' ')[0])}</span></a>
  </div></header>
  <div class="wrap">
    ${navHtml()}
    <main>${banOf(me) ? `<div class="card pad ban-banner" role="alert"><b>⛔ Ваш аккаунт заблокирован ${banText(banOf(me))}</b>
      ${banOf(me).reason ? `<div class="small">Причина: ${esc(banOf(me).reason)}</div>` : ''}<div class="small">Пока действует блокировка, нельзя писать записи, комментарии и сообщения.</div></div>` : ''}${up}${main}</main>
  </div>
  ${musicBar()}
  ${overlay()}`;
}

/* ---------- Окна поверх страницы: просмотр фото и файлов ---------- */
const REPORT_REASONS = { spam: 'Спам', abuse: 'Оскорбления', nsfw: 'Неприемлемый контент', fraud: 'Мошенничество', other: 'Другое' };
function overlay() {
  if (S.story) return storyOverlay();
  if (S.giftFor) {
    const u = U(S.giftFor);
    return `<div class="ov" data-act="ovx"><div class="ov-in modal" data-stop="1">
      <div class="row"><b class="grow">Подарок для ${esc(u?.name || '')}</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <div class="gift-pick">${Object.entries(GIFTS).map(([k, [e, l]]) => `<button class="${S.giftSel === k ? 'on' : ''}" data-act="giftsel" data-k="${k}" title="${l}" aria-label="${l}">${e}<span>${l}</span></button>`).join('')}</div>
      <input id="giftText" class="inp" maxlength="200" placeholder="Подпись (необязательно)">
      <button class="btn" data-act="giftsend" ${S.giftSel ? '' : 'disabled'}>Подарить ${S.giftSel ? GIFTS[S.giftSel][0] : ''}</button></div></div>`;
  }
  if (S.storyDraft) return `<div class="ov" data-act="ovx"><div class="ov-in modal" data-stop="1">
      <div class="row"><b class="grow">Новая история</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <img class="story-prev" src="${esc(S.storyDraft.image)}" alt="Предпросмотр">
      <input id="stText" class="inp" maxlength="200" placeholder="Подпись (необязательно)">
      <p class="hint" style="margin:0">История исчезнет через 24 часа. Её увидят ваши друзья.</p>
      <button class="btn" data-act="storypub" ${S.busy ? 'disabled' : ''}>Опубликовать</button></div></div>`;
  if (S.newRoom) {
    const fr = (S.me.friends || []).map(U).filter(Boolean), sel = S.newRoom.sel;
    ensureUsers(S.me.friends || []);
    return `<div class="ov" data-act="ovx"><div class="ov-in modal" data-stop="1">
      <div class="row"><b class="grow">Новая беседа</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <input id="nrName" class="inp" maxlength="60" placeholder="Название беседы">
      <div class="muted small">Выберите друзей (${sel.size})</div>
      <div class="pick-list">${fr.length ? fr.map(u => `<button class="pick ${sel.has(u.id) ? 'on' : ''}" data-act="roompick" data-id="${esc(u.id)}">${avatar(u, 32, false)}<span class="grow">${esc(u.name)}</span><span class="tick">${sel.has(u.id) ? '✓' : ''}</span></button>`).join('') : '<div class="muted small">Сначала добавьте друзей</div>'}</div>
      <button class="btn" data-act="roomcreate" ${sel.size ? '' : 'disabled'}>Создать беседу</button></div></div>`;
  }
  if (S.fwd) {
    const id = S.me.id;
    return `<div class="ov" data-act="ovx"><div class="ov-in modal" data-stop="1">
      <div class="row"><b class="grow">Переслать в…</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <div class="pick-list">
        <button class="pick" data-act="fwdto" data-k="${esc(id)}"><span class="av fav" style="width:32px;height:32px">★</span><span class="grow">Избранное</span></button>
        ${cache.chats.filter(c => chatKeyOf(c) !== id).map(c => { const k = chatKeyOf(c), u = c.group ? null : U(k); if (!c.group && !u) return '';
          return `<button class="pick" data-act="fwdto" data-k="${esc(k)}">${c.group ? roomAvatar(c, 32) : avatar(u, 32, false)}<span class="grow">${esc(c.group ? c.name : u.name)}</span></button>`; }).join('')}
        ${(ensureUsers(S.me.friends || []), (S.me.friends || []).filter(f => !cache.chats.some(c => !c.group && c.members.includes(f))).map(U).filter(Boolean)
          .map(u => `<button class="pick" data-act="fwdto" data-k="${esc(u.id)}">${avatar(u, 32, false)}<span class="grow">${esc(u.name)}</span></button>`).join(''))}
      </div></div></div>`;
  }
  if (S.report) return `<div class="ov" data-act="reportclose"><div class="ov-in modal" data-stop="1">
      <div class="row"><b class="grow">Пожаловаться</b><button class="icon-btn" data-act="reportclose" aria-label="Закрыть">✕</button></div>
      <p class="muted small" style="margin:0">Жалобу увидит только администратор. Что не так?</p>
      ${Object.entries(REPORT_REASONS).map(([k, l]) => `<button class="btn sec" style="justify-content:flex-start" data-act="reportsend" data-r="${k}">${l}</button>`).join('')}
    </div></div>`;
  if (S.viewImg) return `<div class="ov" data-act="ovclose"><div class="ov-in" data-stop="1">
      <div class="ov-top"><span class="grow"></span><button class="btn ghost light" data-act="ovclose" aria-label="Закрыть">✕</button></div>
      <div class="ov-img"><img src="${esc(safeImg(S.viewImg))}" alt="Фото"></div></div></div>`;
  if (S.view === 'album' && S.lightbox !== null) {
    const p = cache.photos[S.lightbox]; if (!p) return '';
    const own = cache.album?.ownerId === S.me.id, n = cache.photos.length;
    return `<div class="ov" data-act="ovclose"><div class="ov-in" data-stop="1">
      <div class="ov-top"><span class="tnum">${S.lightbox + 1} из ${n}</span><span class="grow"></span>
        ${own ? `<button class="btn ${S.confirm === 'photo:' + p.id ? 'danger' : 'ghost'} light" data-act="delphoto" data-id="${esc(p.id)}">${S.confirm === 'photo:' + p.id ? 'Удалить фото?' : 'Удалить'}</button>` : ''}
        <button class="btn ghost light" data-act="ovclose" aria-label="Закрыть">✕</button></div>
      <div class="ov-img">${n > 1 ? `<button class="ov-nav l" data-act="lbstep" data-d="-1" aria-label="Предыдущее">‹</button>` : ''}
        <img src="${esc(safeImg(S.lightboxImg) || safeImg(p.thumb))}" alt="Фото ${S.lightbox + 1}">
        ${n > 1 ? `<button class="ov-nav r" data-act="lbstep" data-d="1" aria-label="Следующее">›</button>` : ''}</div>
      <div class="ov-cap muted small">${ago(p.createdAt)}</div>
    </div></div>`;
  }
  if (S.view === 'disk' && S.preview) {
    const f = S.preview, t = f.type || '';
    const body = !f.url ? '<div class="spin"></div>' : t.startsWith('image/') ? `<img src="${f.url}" alt="${esc(f.name)}">`
      : t.startsWith('video/') ? `<video src="${f.url}" controls playsinline autoplay></video>`
      : t.startsWith('audio/') ? `<audio src="${f.url}" controls autoplay></audio>` : '';
    return `<div class="ov" data-act="ovclose"><div class="ov-in" data-stop="1">
      <div class="ov-top"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
        ${f.url ? `<a class="btn sec" href="${f.url}" download="${esc(f.name)}">Скачать</a>` : ''}
        <button class="btn ghost light" data-act="ovclose" aria-label="Закрыть">✕</button></div>
      <div class="ov-img">${body}</div></div></div>`;
  }
  return '';
}

/* ---------- ВС Видео ---------- */
function videoCard(v) {
  const o = U(v.ownerId), th = videoThumb(v);
  return `<a class="vcard" href="#video/${esc(v.id)}">
    <div class="vthumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="vph">${I.play}</span>`}
      ${v.duration ? `<span class="vdur tnum">${fmtDur(v.duration)}</span>` : v.source === 'link' ? `<span class="vdur">${v.provider === 'youtube' ? 'YouTube' : v.provider === 'rutube' ? 'Rutube' : v.provider === 'vk' ? 'VK Видео' : 'Ссылка'}</span>` : ''}</div>
    <div class="vmeta"><b>${esc(v.title || 'Без названия')}</b><span class="muted small">${esc(o?.name || '')}${o ? ' · ' : ''}${ago(v.createdAt)}</span></div>
  </a>`;
}

function viewVideo() {
  const me = S.me, owner = S.videoOwner, ou = owner ? U(owner) : null, mine = owner === me.id;
  const tab = (href, l, on) => `<a class="${on ? 'on' : ''}" href="#${href}">${l}</a>`;
  const d = S.videoDraft;
  const adder = !owner || mine ? `<div class="card pad form">
      <div class="row" style="flex-wrap:wrap;gap:8px"><b class="grow">Добавить видео</b>
        <button class="btn sec" data-act="pickvideo" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить файл</span></button>
        <button class="btn sec" data-act="linkform">${I.link}<span>По ссылке</span></button></div>
      ${S.linkForm ? `<form class="form" data-form="videolink">
        <div class="field"><label for="vlUrl">Ссылка на YouTube, Rutube или VK Видео</label><input id="vlUrl" type="url" required placeholder="https://youtu.be/…" autocomplete="off"></div>
        <div class="field"><label for="vlTitle">Название</label><input id="vlTitle" required maxlength="120"></div>
        <div class="row"><button class="btn" type="submit">Добавить</button><button type="button" class="btn ghost" data-act="linkform">Отмена</button></div>
      </form>` : ''}
      ${d ? `<form class="form" data-form="videofile">
        <div class="vdraft">${d.thumb ? `<img src="${d.thumb}" alt="Кадр из видео">` : `<span class="vph">${I.play}</span>`}
          <div class="small muted">${esc(d.file.name)}<br>${fmtSize(d.file.size)}${d.duration ? ' · ' + fmtDur(d.duration) : ''}</div></div>
        <div class="field"><label for="vfTitle">Название</label><input id="vfTitle" required maxlength="120" value="${esc(d.title)}"></div>
        <div class="field"><label for="vfDesc">Описание</label><textarea id="vfDesc" rows="2" maxlength="2000" placeholder="Необязательно"></textarea></div>
        <div class="row"><button class="btn" type="submit" ${S.upload ? 'disabled' : ''}>Опубликовать</button><button type="button" class="btn ghost" data-act="canceldraft">Отмена</button></div>
      </form>` : `<p class="hint" style="margin:0">Файл до ${fmtSize(LIMITS.video)}: примерно 20–40 секунд с телефона. Длинные ролики добавляйте ссылкой, они не занимают место.</p>`}
    </div>` : '';
  return `<div class="card"><div class="pad" style="padding-bottom:0"><h1 class="h brandh">ВС Видео</h1></div>
      <div class="tabs">${tab('video', 'Все видео', !owner)}${tab('videos/' + me.id, 'Мои видео', mine)}${owner && !mine ? tab('videos/' + owner, esc(ou?.name || '…'), true) : ''}</div></div>
    ${adder}
    ${S.loading ? loadingBox() : cache.videos.length ? `<div class="vgrid">${cache.videos.map(videoCard).join('')}</div>`
      : `<div class="card empty"><b>${mine ? 'Вы ещё не добавили видео' : owner ? 'Здесь пока нет видео' : 'Видео пока нет'}</b><span>Загрузите короткий ролик или добавьте ссылку.</span></div>`}`;
}

function viewWatch() {
  const v = cache.video;
  if (!v) return loadingBox();
  if (v.missing) return `<div class="card empty"><b>Видео удалено или не найдено</b><a class="btn sec" href="#video">Все видео</a></div>`;
  let player;
  if (v.source === 'link' && v.provider === 'direct') player = `<video src="${esc(v.vid)}" controls playsinline></video>`;
  else if (v.source === 'link') { const src = embedSrc(v); player = src ? `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(v.title)}"></iframe>` : '<div class="empty">Ссылка не поддерживается</div>'; }
  else if (S.videoErr) player = `<div class="empty" style="color:#fff">Не удалось загрузить видео. ${esc(errText(S.videoErr))}</div>`;
  else if (S.videoSrc) player = `<video src="${S.videoSrc}" controls playsinline ${safeImg(v.thumb) ? `poster="${esc(v.thumb)}"` : ''}></video>`;
  else player = `<div class="loading" style="color:#fff"><div class="spin"></div><span class="small">Загружаем видео…</span></div>`;
  return `<div class="watch">
    <div class="watch-main">
      <div class="player" id="player" data-key="${esc(playerKey())}">${player}</div>
      ${watchInfo()}
    </div>
    ${watchSide()}
  </div>`;
}
function watchInfo() {
  const v = cache.video; if (!v || v.missing) return '<div id="watchInfo"></div>';
  const o = U(v.ownerId), me = S.me, likes = v.likes || [], liked = likes.includes(me.id), own = v.ownerId === me.id;
  return `<div class="card pad" id="watchInfo" style="display:flex;flex-direction:column;gap:10px">
    <h1 class="h" style="font-size:20px;text-wrap:balance">${esc(v.title || 'Без названия')}</h1>
    <div class="row" style="flex-wrap:wrap">${avatar(o, 40)}<div class="grow">${nameLink(o)}<div class="muted small">${ago(v.createdAt)}</div></div>
      <button class="pill ${liked ? 'liked' : ''}" data-act="likevideo" data-id="${esc(v.id)}" aria-pressed="${liked}">${liked ? I.heart : I.heartO}${likes.length || ''}</button>
      <button class="pill" data-act="copylink" data-id="${esc(v.id)}">${I.link}Ссылка</button>
      ${own || isSiteAdmin() ? `<button class="btn ${S.confirm === 'video:' + v.id ? 'danger' : 'ghost'} small" data-act="delvideo" data-id="${esc(v.id)}">${S.confirm === 'video:' + v.id ? 'Удалить видео?' : 'Удалить'}</button>` : ''}</div>
    ${v.description ? `<div class="post-text">${esc(v.description)}</div>` : ''}
  </div>`;
}
function watchSide() {
  const list = cache.videos.slice(0, 10);
  return `<aside class="watch-side" id="watchSide"><b>Ещё видео</b>${list.length ? list.map(videoCard).join('') : '<span class="muted small">Других видео пока нет</span>'}</aside>`;
}

/* ---------- ВС Альбомы ---------- */
function viewAlbums() {
  const me = S.me, owner = S.albumsOwner, ou = U(owner), own = owner === me.id;
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">${own ? 'ВС Альбомы' : 'Альбомы'}</h1>
      ${own ? '' : `<div class="muted small">${ou ? nameLink(ou) : '…'}</div>`}</div>
      ${own ? `<button class="btn" data-act="newalbum">Создать альбом</button>` : ''}</div>
      ${own && S.newAlbum ? `<form class="form" data-form="album" style="margin-top:14px">
        <div class="field"><label for="alTitle">Название альбома</label><input id="alTitle" required maxlength="80" placeholder="Лето на Волге"></div>
        <div class="row"><button class="btn" type="submit">Создать</button><button type="button" class="btn ghost" data-act="newalbum">Отмена</button></div></form>` : ''}
    </div>
    ${S.loading ? loadingBox() : cache.albums.length ? `<div class="agrid">${cache.albums.map(a => `<a class="acard" href="#album/${esc(a.id)}">
        <div class="acover">${safeImg(a.cover) ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : `<span class="vph">${I.album}</span>`}</div>
        <b>${esc(a.title)}</b><span class="muted small">${a.count || 0} ${plural(a.count || 0, 'фото', 'фото', 'фото')}</span></a>`).join('')}</div>`
      : `<div class="card empty"><b>${own ? 'У вас пока нет альбомов' : 'Альбомов пока нет'}</b>${own ? '<span>Создайте альбом и добавьте в него фотографии.</span>' : ''}</div>`}`;
}

function viewAlbum() {
  const a = cache.album, me = S.me;
  if (!a) return loadingBox();
  if (a.missing) return `<div class="card empty"><b>Альбом удалён или не найден</b><a class="btn sec" href="#albums">Мои альбомы</a></div>`;
  const own = a.ownerId === me.id, o = U(a.ownerId);
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap">
      <a class="icon-btn" href="#albums/${esc(a.ownerId)}" aria-label="Ко всем альбомам">${I.back}</a>
      <div class="grow"><h1 class="h">${esc(a.title)}</h1><div class="muted small">${o ? esc(o.name) + ' · ' : ''}${cache.photos.length} ${plural(cache.photos.length, 'фотография', 'фотографии', 'фотографий')}</div></div>
      ${own ? `<button class="btn" data-act="pickphotos" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Добавить фото</span></button>
        <button class="btn ${S.confirm === 'album:' + a.id ? 'danger' : 'ghost'}" data-act="delalbum" data-id="${esc(a.id)}">${S.confirm === 'album:' + a.id ? 'Удалить альбом со всеми фото?' : 'Удалить альбом'}</button>` : ''}
    </div></div>
    ${S.loading ? loadingBox() : cache.photos.length ? `<div class="pgrid">${cache.photos.map((p, i) => `<button class="pcell" data-act="lightbox" data-i="${i}" aria-label="Открыть фото ${i + 1}"><img src="${esc(safeImg(p.thumb))}" alt="" loading="lazy"></button>`).join('')}</div>`
      : `<div class="card empty"><b>В альбоме пока нет фото</b>${own ? '<span>Можно выбрать сразу несколько.</span>' : ''}</div>`}`;
}

/* ---------- ВС Диск ---------- */
function fileIcon(t = '') {
  const k = t.startsWith('image/') ? 'Фото' : t.startsWith('video/') ? 'Видео' : t.startsWith('audio/') ? 'Аудио' : t.includes('pdf') ? 'PDF' : /zip|rar|7z|tar/.test(t) ? 'Архив' : /word|document|text/.test(t) ? 'Текст' : 'Файл';
  return `<span class="ficon" data-k="${k}">${I.file}<i>${k}</i></span>`;
}
function viewDisk() {
  const used = cache.files.reduce((s, f) => s + (f.size || 0), 0);
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС Диск</h1>
      <div class="muted small">Видите только вы · занято ${fmtSize(used)} · до ${fmtSize(LIMITS.disk)} на файл</div></div>
      <button class="btn" data-act="pickdisk" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить файл</span></button></div></div>
    ${S.loading ? loadingBox() : cache.files.length ? `<div class="card ulist">${cache.files.map(f => `<div class="uitem">${fileIcon(f.type)}
        <div class="grow" style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(f.name)}</div>
          <div class="muted small tnum">${fmtSize(f.size || 0)} · ${ago(f.createdAt)}${f.status !== 'ready' ? ' · <span style="color:var(--like)">загрузка не завершена</span>' : ''}</div></div>
        <div class="acts">${f.status === 'ready' ? `<button class="btn sec" data-act="openfile" data-id="${esc(f.id)}">${/^(image|video|audio)\//.test(f.type || '') ? 'Открыть' : 'Скачать'}</button>` : ''}
          <button class="btn ${S.confirm === 'file:' + f.id ? 'danger' : 'ghost'}" data-act="delfile" data-id="${esc(f.id)}">${S.confirm === 'file:' + f.id ? 'Удалить?' : 'Удалить'}</button></div>
      </div>`).join('')}</div>`
      : `<div class="card empty"><b>На диске пока пусто</b><span>Загружайте документы, фото и архивы до ${fmtSize(LIMITS.disk)}. Их видите только вы.</span></div>`}`;
}

/* ---------- VС ID ---------- */
function viewVID() {
  const u = S.authUser, me = S.me, prov = (u.providerData || []).map(p => p.providerId);
  const hasPass = prov.includes('password'), hasGoogle = prov.includes('google.com');
  const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' в ' + hm(d); };
  const link = location.origin + location.pathname + '#id/' + me.id;
  return `<div class="vid-card">
      <div class="vid-brand"><span class="logo-mark">VС</span><span>VС ID</span></div>
      <div class="row">${avatar(me, 64, false)}<div class="grow" style="min-width:0"><div class="vid-name">${esc(me.name)}</div><div class="vid-sub">@${esc(me.nick)}</div></div></div>
      <div class="vid-id"><span>Ваш VС ID</span><code>${esc(me.id)}</code><button class="btn sec small" data-act="copy" data-text="${esc(me.id)}">Скопировать</button></div>
    </div>
    <div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Способы входа</h2></div>
      <div class="ulist">
        <div class="uitem"><span class="ficon">${I.google}</span><div class="grow"><b>Google</b><div class="muted small">${hasGoogle ? esc((u.providerData.find(p => p.providerId === 'google.com') || {}).email || 'Подключён') : 'Не подключён'}</div></div>
          <div class="acts">${hasGoogle ? '<span class="ok-chip">Подключён</span>' : `<button class="btn sec" data-act="linkgoogle">Привязать Google</button>`}</div></div>
        <div class="uitem"><span class="ficon">${I.msg}</span><div class="grow"><b>Почта и пароль</b><div class="muted small">${esc(u.email || '')}</div></div>
          <div class="acts">${hasPass ? `<span class="ok-chip">Подключено</span><button class="btn ghost" data-act="resetpass">Сменить пароль</button>` : ''}</div></div>
        ${!hasPass && u.email ? `<form class="form pad" data-form="setpass" style="padding-top:0">
          <div class="field"><label for="spPass">Придумайте пароль, чтобы входить и по почте</label><input id="spPass" type="password" minlength="6" required autocomplete="new-password" placeholder="Не меньше 6 символов"></div>
          <div><button class="btn" type="submit">Установить пароль</button></div></form>` : ''}
      </div></div>
    <div class="card pad"><h2 class="h" style="font-size:16px;margin-bottom:10px">Почта</h2>
      <div class="row" style="flex-wrap:wrap"><span class="grow">${esc(u.email || 'Не указана')}</span>
        ${u.emailVerified ? '<span class="ok-chip">Подтверждена</span>' : u.email ? `<button class="btn sec" data-act="verify">Подтвердить почту</button>` : ''}</div></div>
    <div class="card pad"><h2 class="h" style="font-size:16px;margin-bottom:10px">Активность</h2>
      <dl class="facts" style="padding:0;border:0">
        <dt>Аккаунт создан</dt><dd>${fmtDate(u.metadata?.creationTime)}</dd>
        <dt>Последний вход</dt><dd>${fmtDate(u.metadata?.lastSignInTime)}</dd>
        <dt>Ссылка на страницу</dt><dd><button class="linkbtn" data-act="copy" data-text="${esc(link)}">Скопировать ссылку</button></dd>
      </dl></div>
    <div class="row"><a class="btn ghost" href="#settings">Настройки</a><span class="grow"></span><button class="btn danger" data-act="logout">Выйти из аккаунта</button></div>`;
}

/* ---------- Настройки ---------- */
function viewSettings() {
  const me = S.me, th = lsGet('vs_theme') || 'system', pr = me.privacy || {};
  const seg = (act, cur, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="card pad"><h1 class="h brandh">Настройки</h1></div>
    <div class="card pad set"><h2 class="h" style="font-size:16px">Оформление</h2>
      <div class="set-row"><span class="grow">Тема</span>${seg('theme', th, [['system', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
      <div class="set-row"><span class="grow">Цвет</span><div class="accents" role="radiogroup">${ACCENTS.map(([k, l, c]) => `<button role="radio" aria-checked="${(lsGet('vs_accent') || 'blue') === k}" aria-label="${l}" title="${l}" class="${(lsGet('vs_accent') || 'blue') === k ? 'on' : ''}" style="background:${c}" data-act="accent" data-v="${k}"></button>`).join('')}</div></div>
      <p class="hint" style="margin:0">Сохраняется на этом устройстве.</p></div>
    ${installCard()}
    ${canNotify() ? `<div class="card pad set"><h2 class="h" style="font-size:16px">Уведомления</h2>
      <div class="set-row"><span class="grow">Новые сообщения, когда вкладка VСмске в фоне</span>${
        Notification.permission === 'denied' ? '<span class="muted small">Запрещены в настройках браузера</span>'
        : seg('notify', notifyOn() ? 'on' : 'off', [['on', 'Вкл'], ['off', 'Выкл']])}</div>
      <p class="hint" style="margin:0">Сохраняется на этом устройстве. Число непрочитанных диалогов видно и в названии вкладки.</p></div>` : ''}
    ${(me.blocked || []).length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Чёрный список <span class="muted">${me.blocked.length}</span></h2>
      <p class="hint" style="margin:4px 0 0">Эти люди не могут писать вам, комментировать ваши записи и отправлять заявки.</p></div>
      <div class="ulist">${(ensureUsers(me.blocked), me.blocked.map(U).filter(Boolean).map(u => `<div class="uitem">${avatar(u, 40)}<span class="grow">${nameLink(u)}</span>
        <button class="btn sec" data-act="unblock" data-id="${esc(u.id)}">Разблокировать</button></div>`).join(''))}</div></div>` : ''}
    <div class="card pad set"><h2 class="h" style="font-size:16px">Приватность</h2>
      <div class="set-row"><span class="grow">Кто может писать мне сообщения</span>${seg('pmsg', pr.messages || 'all', [['all', 'Все'], ['friends', 'Только друзья']])}</div>
      <div class="set-row"><span class="grow">Кто может писать на моей стене</span>${seg('pwall', pr.wall || 'friends', [['friends', 'Друзья'], ['me', 'Только я']])}</div></div>
    <div class="card"><div class="ulist">
      <a class="uitem setlink" href="#edit"><span class="ficon">${I.home}</span><span class="grow">Редактировать страницу</span>›</a>
      <a class="uitem setlink" href="#vid"><span class="ficon">${I.vid}</span><span class="grow">VС ID: вход, почта, пароль</span>›</a>
      <button class="uitem setlink" data-act="logout"><span class="ficon">${I.out}</span><span class="grow" style="text-align:left">Выйти из аккаунта</span></button>
    </div></div>
    <p class="hint" style="text-align:center">VСмске ${VERSION}</p>`;
}

/* ---------- Мобильное меню «Ещё» ---------- */
function viewMore() {
  const me = S.me;
  const item = (href, icon, label, sub = '') => `<a class="uitem setlink" href="#${href}"><span class="ficon">${icon}</span><span class="grow"><b>${label}</b>${sub ? `<br><span class="muted small">${sub}</span>` : ''}</span>›</a>`;
  return `<a class="card pad row" href="#id/${esc(me.id)}" style="color:var(--fg)">${avatar(me, 52, false)}<div class="grow"><b>${esc(me.name)}</b><div class="muted small">Моя страница</div></div>›</a>
    <div class="card ulist">
      ${item('notif', I.bell, 'Уведомления' + (unseenNotifs() ? ` <span class="badge">${unseenNotifs()}</span>` : ''), 'Лайки, комментарии, записи на стене')}
      ${item('apps', I.apps, 'Сервисы' + (unreadMail() ? ` <span class="badge">${unreadMail()}</span>` : ''), 'Почта, Ответы, Заметки, Погода, Игры')}
      ${item('clubs', I.club, 'Сообщества', 'Группы по интересам')}
      ${item('people', I.people, 'Люди', 'Поиск и новые пользователи')}
      ${item('albums', I.album, 'ВС Альбомы', 'Ваши фотографии')}
      ${item('disk', I.disk, 'ВС Диск', 'Личные файлы')}
      ${item('videos/' + me.id, I.video, 'Мои видео')}
    </div>
    <div class="card ulist">
      ${item('vid', I.vid, 'VС ID', 'Вход, почта, пароль')}
      ${isSiteAdmin() ? item('admin', I.shield, 'Админ-панель' + (cache.reports.length ? ` <span class="badge">${cache.reports.length}</span>` : ''), 'Жалобы и блокировки') : ''}
      ${item('settings', I.gear, 'Настройки', 'Тема, приватность, чёрный список')}
    </div>
    ${installCard()}`;
}

/* Одна запись (#post/<id>) */
function viewPost() {
  const p = cache.post;
  if (!p) return loadingBox();
  if (p.missing) return `<div class="card empty"><b>Запись удалена или не найдена</b><a class="btn sec" href="#feed">К новостям</a></div>`;
  return `<div class="card pad row"><a class="icon-btn" href="#id/${esc(p.wallId)}" aria-label="На стену">${I.back}</a><b class="grow">Запись</b></div>${postCard(p)}`;
}

/* ---------- Сообщества ---------- */
const memberWord = n => `${n} ${plural(n, 'подписчик', 'подписчика', 'подписчиков')}`;
function groupRow(g) {
  const sub = (S.me.groups || []).includes(g.id);
  return `<div class="uitem">${groupAvatar(g, 52)}
    <div class="grow" style="min-width:0"><a class="name" href="#club/${esc(g.id)}" style="color:var(--fg);font-weight:600">${esc(g.name)}</a>
      <div class="muted small">${memberWord(g.membersCount || 0)}${g.about ? ' · ' + esc(g.about.slice(0, 80)) : ''}</div></div>
    <div class="acts"><button class="btn ${sub ? 'ghost' : 'sec'}" data-act="${sub ? 'unsub' : 'sub'}" data-id="${esc(g.id)}">${sub ? 'Отписаться' : 'Подписаться'}</button></div></div>`;
}
function viewClubs() {
  const mine = (S.me.groups || []).map(G).filter(g => g && !g.deleted);
  const others = cache.groupList.filter(g => !(S.me.groups || []).includes(g.id));
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap"><h1 class="h brandh grow">Сообщества</h1>
      <button class="btn" data-act="newclub">Создать сообщество</button></div>
      ${S.newClub ? `<form class="form" data-form="club" style="margin-top:14px">
        <div class="field"><label for="clName">Название</label><input id="clName" required maxlength="60" placeholder="Любители кофе"></div>
        <div class="field"><label for="clAbout">Описание</label><textarea id="clAbout" rows="2" maxlength="600" placeholder="О чём сообщество (необязательно)"></textarea></div>
        <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>Создать</button><button type="button" class="btn ghost" data-act="newclub">Отмена</button></div></form>` : ''}</div>
    <div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Мои сообщества <span class="muted">${mine.length}</span></h2></div>
      <div class="ulist">${mine.length ? mine.map(groupRow).join('') : '<div class="empty">Вы пока ни на что не подписаны</div>'}</div></div>
    <div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Новые сообщества</h2></div>
      <div class="ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : others.length ? others.map(groupRow).join('') : '<div class="empty">Других сообществ пока нет — создайте первое!</div>'}</div></div>`;
}
function viewClub() {
  const g = G(S.clubId), me = S.me;
  if (!g) return loadingBox();
  if (g.deleted) return `<div class="card empty"><b>Сообщество удалено или не найдено</b><a class="btn sec" href="#clubs">Все сообщества</a></div>`;
  const admin = (g.admins || []).includes(me.id), owner = g.ownerId === me.id, sub = (me.groups || []).includes(g.id);
  const canDel = owner || isSiteAdmin(), photo = S.editGroupPhoto === undefined ? g.photo : S.editGroupPhoto, cover = S.editGroupCover || g.cover || 'blue';
  const admins = (g.admins || []).map(U).filter(Boolean);
  const manage = admin && S.clubEdit ? `<div class="card pad"><h2 class="h" style="font-size:16px;margin-bottom:12px">Управление сообществом</h2>
      <form class="form" data-form="clubedit">
        <div class="row">${groupAvatar({ ...g, photo, cover }, 64, false)}<div class="row" style="flex-wrap:wrap;gap:8px">
          <button type="button" class="btn sec" data-act="gphoto">Загрузить фото</button>${photo ? `<button type="button" class="btn ghost" data-act="nogphoto">Убрать</button>` : ''}</div></div>
        <div class="field"><label>Обложка</label><div class="swatches covers">${Object.entries(COVERS).map(([k, c]) => `<button type="button" class="${k === cover ? 'on' : ''}" style="background:${c}" data-act="gcover" data-c="${k}" aria-label="Обложка ${k}"></button>`).join('')}</div></div>
        <div class="field"><label for="geName">Название</label><input id="geName" required maxlength="60" value="${esc(g.name)}"></div>
        <div class="field"><label for="geAbout">Описание</label><textarea id="geAbout" rows="3" maxlength="600">${esc(g.about || '')}</textarea></div>
        <div class="row"><button class="btn" type="submit">Сохранить</button><button type="button" class="btn ghost" data-act="clubedit">Закрыть</button></div>
      </form>
      ${owner ? `<div class="set" style="margin-top:16px"><b>Администраторы</b>
        ${admins.map(u => `<div class="row">${avatar(u, 32)}<span class="grow">${nameLink(u)}</span>${u.id !== me.id ? `<button class="btn ghost small" data-act="gunadmin" data-id="${esc(u.id)}">Убрать</button>` : '<span class="muted small">владелец</span>'}</div>`).join('')}
        <form class="row" data-form="gadmin"><input id="gaNick" class="grow inp" placeholder="Короткое имя, например ivan.petrov" maxlength="30" autocomplete="off"><button class="btn sec">Добавить</button></form></div>` : ''}
    </div>` : '';
  return `<div class="card">
    <div class="cover" style="--cover:${COVERS[g.cover] || COVERS.blue}"></div>
    <div class="prof">${groupAvatar(g, 110, false)}
      <div class="prof-info"><h1 class="prof-name">${esc(g.name)}</h1><div class="muted">${memberWord(g.membersCount || 0)}</div></div>
      <div class="prof-btns">
        <button class="btn ${sub ? 'sec' : ''}" data-act="${sub ? 'unsub' : 'sub'}" data-id="${esc(g.id)}">${sub ? 'Вы подписаны ✓' : 'Подписаться'}</button>
        ${admin ? `<button class="btn ghost" data-act="clubedit">Управление</button>` : ''}
        ${canDel ? `<button class="btn ${S.confirm === 'club:' + g.id ? 'danger' : 'ghost'}" data-act="delclub" data-id="${esc(g.id)}">${S.confirm === 'club:' + g.id ? 'Удалить вместе с записями?' : 'Удалить'}</button>` : ''}
      </div>
    </div>
    ${g.about ? `<dl class="facts"><dt>Описание</dt><dd>${linkify(g.about)}</dd></dl>` : ''}
  </div>
  ${manage}
  ${admin ? composer(g.id, 'Написать от имени сообщества', g) : ''}
  <div class="card pad" style="padding-block:12px"><b>Записи сообщества</b> <span class="muted">${cache.groupWall.length}</span></div>
  ${S.loading ? loadingBox() : cache.groupWall.length ? cache.groupWall.map(p => postCard(p)).join('') : `<div class="card empty">${admin ? 'Напишите первую запись — её увидят подписчики в новостях.' : 'Здесь пока нет записей'}</div>`}`;
}

/* ---------- Админ-панель ---------- */
function viewAdmin() {
  const reps = cache.reports;
  const target = r => r.type === 'post' ? '#post/' + (r.postId || r.targetId) : r.type === 'group' ? '#club/' + r.targetId : '#id/' + (r.targetUser || r.targetId);
  const kind = { post: 'Запись', user: 'Пользователь', comment: 'Комментарий', group: 'Сообщество' };
  return `<div class="card pad admin-head"><div class="row"><span class="ficon">${I.shield}</span><div class="grow"><h1 class="h brandh">Админ-панель</h1>
      <div class="muted small">Жалоб: ${reps.length} · Заблокированных: ${cache.banned.filter(u => banOf(u)).length}</div></div></div></div>
    <div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Жалобы <span class="muted">${reps.length}</span></h2></div>
      <div class="ulist">${reps.length ? reps.map(r => {
        const from = U(r.from), who = U(r.targetUser);
        return `<div class="uitem report"><div class="grow" style="min-width:0">
            <div><span class="chip">${kind[r.type] || r.type}</span> <b>${esc(REPORT_REASONS[r.reason] || r.reason)}</b> <span class="muted small">· ${ago(r.createdAt)}</span></div>
            ${who ? `<div class="small">Нарушитель: ${nameLink(who)}${banOf(who) ? ' <span class="chip ban-chip">заблокирован</span>' : ''}</div>` : ''}
            ${r.text ? `<div class="muted small notif-text">«${esc(r.text)}»</div>` : ''}
            <div class="muted small">Пожаловался: ${from ? nameLink(from) : '…'}</div>
            <div class="acts" style="margin-top:8px;flex-wrap:wrap"><a class="btn sec small" href="${esc(target(r))}">Открыть</a>
              ${r.type === 'post' ? `<button class="btn ${S.confirm === 'rpost:' + r.id ? 'danger' : 'ghost'} small" data-act="rpost" data-id="${esc(r.id)}">${S.confirm === 'rpost:' + r.id ? 'Точно удалить запись?' : 'Удалить запись'}</button>` : ''}
              ${r.targetUser && who && !isAdm(who) && !banOf(who) ? `<button class="btn ghost small" data-act="rban" data-id="${esc(r.id)}">Бан на неделю</button>` : ''}
              <button class="btn ghost small" data-act="rdel" data-id="${esc(r.id)}">Отклонить</button></div>
          </div></div>`;
      }).join('') : '<div class="empty">Жалоб нет 🎉</div>'}</div></div>
    <div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Заблокированные</h2></div>
      <div class="ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : cache.banned.length ? cache.banned.map(u => {
        const b = banOf(u);
        return `<div class="uitem">${avatar(u, 44)}<div class="grow" style="min-width:0">${nameLink(u)}
          <div class="muted small">${b ? 'Заблокирован ' + banText(b) : 'Срок истёк'}${u.ban?.reason ? ' · ' + esc(u.ban.reason) : ''}</div></div>
          <div class="acts"><button class="btn sec" data-act="unban" data-id="${esc(u.id)}">${b ? 'Разбанить' : 'Убрать из списка'}</button></div></div>`;
      }).join('') : '<div class="empty">Никто не заблокирован</div>'}</div></div>
    <p class="hint" style="text-align:center">Забанить человека можно и с его страницы: «⋯» → «Модерация».</p>`;
}

/* ======================= Сервисы ======================= */
const unreadMail = () => cache.mailIn.filter(m => !m.read).length;
const mailAddr = u => (u?.nick || '…') + '@vsmske';
function viewApps() {
  const tile = (href, icon, name, sub, cls, badge = 0) => `<a class="app-tile ${cls}" href="#${href}"><span class="app-ico">${icon}</span><b>${name}${badge ? ` <span class="badge">${badge}</span>` : ''}</b><span class="muted small">${sub}</span></a>`;
  return `<div class="card pad"><h1 class="h brandh">Сервисы VС</h1><p class="muted small" style="margin:4px 0 0">Всё, что есть в VСмске, в одном месте</p></div>
    <div class="app-grid">
      ${tile('mail', I.mail, 'ВС Почта', mailAddr(S.me), 'c-mail', unreadMail())}
      ${tile('music', I.music, 'ВС Музыка', 'Ваши треки и плеер', 'c-music')}
      ${tile('market', I.cart, 'ВС Маркет', 'Купить и продать', 'c-market')}
      ${tile('answers', I.ask, 'ВС Ответы', 'Задайте вопрос — ответят люди', 'c-ask')}
      ${tile('notes', I.note, 'ВС Заметки', 'Списки и мысли — только для вас', 'c-note')}
      ${tile('weather', I.sun, 'ВС Погода', 'Прогноз на неделю', 'c-sun')}
      ${tile('games', I.game, 'ВС Игры', '2048 и крестики-нолики', 'c-game')}
      ${tile('video', I.video, 'ВС Видео', 'Ролики и ссылки', 'c-video')}
      ${tile('albums', I.album, 'ВС Альбомы', 'Ваши фотографии', 'c-album')}
      ${tile('disk', I.disk, 'ВС Диск', 'Личные файлы', 'c-disk')}
      ${tile('clubs', I.club, 'Сообщества', 'Группы по интересам', 'c-club')}
      ${tile('vid', I.vid, 'VС ID', 'Вход, почта, пароль', 'c-vid')}
    </div>`;
}

/* ---------- ВС Музыка ---------- */
// Плеер живёт вне #app, поэтому играет при переходах по сайту
const player = { audio: new Audio(), queue: [], i: -1, loading: false };
player.audio.preload = 'auto';
const curTrack = () => player.queue[player.i];
player.audio.addEventListener('timeupdate', () => {
  const a = player.audio, fill = document.getElementById('mbarFill'), t = document.getElementById('mbarTime');
  if (fill && a.duration) fill.style.width = (a.currentTime / a.duration * 100) + '%';
  if (t) t.textContent = fmtDur(a.currentTime) + ' / ' + fmtDur(a.duration || curTrack()?.duration);
});
['play', 'pause'].forEach(ev => player.audio.addEventListener(ev, () => render()));
player.audio.addEventListener('ended', () => playAt(player.i + 1));
async function playAt(i) {
  if (i < 0 || i >= player.queue.length) { player.audio.pause(); return; }
  player.i = i; player.loading = true; render();
  const t = curTrack();
  try {
    const url = await getFileUrl(t.fileId, t.type || 'audio/mpeg');
    if (curTrack() !== t) return;
    player.audio.src = url; await player.audio.play();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: 'ВС Музыка' });
      navigator.mediaSession.setActionHandler('nexttrack', () => playAt(player.i + 1));
      navigator.mediaSession.setActionHandler('previoustrack', () => playAt(player.i - 1));
    }
  } catch (e) { console.error(e); toast('Не получилось включить трек'); }
  finally { player.loading = false; render(); }
}
function playList(list, i) {
  const t = list[i];
  if (curTrack()?.id === t.id) { player.audio.paused ? player.audio.play() : player.audio.pause(); return; }
  player.queue = list.slice(); playAt(i);
}
function musicBar() {
  const t = curTrack(); if (!t) return '';
  const a = player.audio, pct = a.duration ? a.currentTime / a.duration * 100 : 0;
  return `<div class="mbar" role="region" aria-label="Плеер"><div class="mbar-fill" id="mbarFill" style="width:${pct}%"></div>
    <button class="icon-btn" data-act="mprev" aria-label="Предыдущий">${I.prev}</button>
    <button class="mbar-play" data-act="mplay" aria-label="${a.paused ? 'Играть' : 'Пауза'}">${player.loading ? '<span class="spin sm"></span>' : a.paused ? I.play : I.pause}</button>
    <button class="icon-btn" data-act="mnext" aria-label="Следующий">${I.next}</button>
    <a class="grow mbar-info" href="#music"><b>${esc(t.title)}</b><span class="muted small">${esc(t.artist || 'Неизвестный исполнитель')}</span></a>
    <span class="small muted tnum" id="mbarTime">${fmtDur(a.currentTime)} / ${fmtDur(a.duration || t.duration)}</span>
    <button class="icon-btn" data-act="mclose" aria-label="Закрыть плеер">✕</button></div>`;
}
async function loadMusic() {
  const tab = S.musicTab, me = uid(); cache.tracks = [];
  try {
    let list = [];
    if (tab === 'all') list = (await getDocs(query(collection(db, 'tracks'), orderBy('createdAt', 'desc'), limit(60)))).docs.map(data);
    else {
      const owner = tab === 'my' ? me : tab;
      list = (await getDocs(query(collection(db, 'tracks'), where('ownerId', '==', owner), limit(200)))).docs.map(data);
      if (tab === 'my') {
        const saved = (S.me.tracks || []).filter(id => !list.some(t => t.id === id)).slice(0, 100);
        const got = await Promise.all(saved.map(id => getDoc(doc(db, 'tracks', id)).catch(() => null)));
        got.forEach(s2 => { if (s2?.exists()) list.push({ ...data(s2), saved: true }); });
      }
      list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      ensureUsers([owner]);
    }
    if (S.view !== 'music' || S.musicTab !== tab) return;
    cache.tracks = list; ensureUsers(list.map(t => t.ownerId));
  } catch (e) { console.error(e); S.viewError = e; }
  S.loading = false; render();
}
function trackDuration(file) {
  return new Promise(res => {
    const a = new Audio(), url = URL.createObjectURL(file); let done = false;
    const fin = d => { if (done) return; done = true; URL.revokeObjectURL(url); res(isFinite(d) ? d : 0); };
    a.preload = 'metadata'; a.onloadedmetadata = () => fin(a.duration); a.onerror = () => fin(0); a.src = url; setTimeout(() => fin(0), 6000);
  });
}
async function uploadTrack(f) {
  if (!(f.type || '').startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(f.name)) { toast('Выберите аудиофайл (mp3, m4a, ogg…)'); return; }
  if (f.size > LIMITS.music) { toast(`Трек весит ${fmtSize(f.size)}, а можно до ${fmtSize(LIMITS.music)}`); return; }
  if (S.upload) return;
  const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(), m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const artist = (m ? m[1] : '').slice(0, 120), title = (m ? m[2] : base).slice(0, 120) || 'Без названия';
  const duration = await trackDuration(f);
  const fileId = await putFile(f, 'music', `Загружаем «${title}»`);
  await addDoc(collection(db, 'tracks'), { ownerId: uid(), title, artist, fileId, type: f.type || 'audio/mpeg', duration, size: f.size, createdAt: serverTimestamp() });
  toast('Трек загружен'); if (S.view === 'music') loadMusic();
}
function viewMusic() {
  const tab = S.musicTab, me = S.me, other = !['my', 'all'].includes(tab) ? U(tab) : null;
  const t2 = (k, l) => `<a class="${tab === k ? 'on' : ''}" href="#music/${k}">${l}</a>`;
  const list = cache.tracks || [], cur = curTrack();
  return `<div class="card"><div class="pad" style="padding-bottom:0"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС Музыка</h1>
      <div class="muted small">mp3, m4a, ogg до ${fmtSize(LIMITS.music)}. Название берётся из имени файла «Исполнитель - Песня».</div></div>
      ${banOf(me) ? '' : `<button class="btn" data-act="pickmusic" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить трек</span></button>`}</div></div>
    <div class="tabs">${t2('my', 'Моя музыка')}${t2('all', 'Новое')}${other ? `<a class="on" href="#music/${esc(tab)}">${esc(other.name)}</a>` : ''}</div></div>
    <div class="card ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : list.length ? list.map((t, i) => {
      const playing = cur?.id === t.id && !player.audio.paused, mine = t.ownerId === me.id, saved = (me.tracks || []).includes(t.id);
      return `<div class="uitem track ${cur?.id === t.id ? 'cur' : ''}"><button class="track-play" data-act="tplay" data-i="${i}" aria-label="${playing ? 'Пауза' : 'Играть'}">${playing ? I.pause : I.play}</button>
        <div class="grow" style="min-width:0"><b class="track-title">${esc(t.title)}</b><div class="muted small">${esc(t.artist || 'Неизвестный исполнитель')}${!mine && U(t.ownerId) ? ' · добавил(а) ' + esc(U(t.ownerId).name) : ''}</div></div>
        <span class="muted small tnum">${fmtDur(t.duration)}</span>
        ${mine ? `<button class="icon-btn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Удалить трек">${S.confirm === 'track:' + t.id ? 'Удалить?' : '🗑'}</button>`
          : `<button class="icon-btn ${saved ? 'on' : ''}" data-act="tsave" data-id="${esc(t.id)}" aria-label="${saved ? 'Убрать из моей музыки' : 'Добавить в мою музыку'}" title="${saved ? 'Убрать из моей музыки' : 'Добавить в мою музыку'}">${saved ? '✓' : '＋'}</button>`}
        ${isSiteAdmin() && !mine ? `<button class="icon-btn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Удалить трек (админ)">${S.confirm === 'track:' + t.id ? 'Удалить?' : '🗑'}</button>` : ''}</div>`;
    }).join('') : `<div class="empty">${tab === 'my' ? 'Здесь будут ваши треки. Загрузите первый или добавьте из «Нового».' : 'Треков пока нет'}</div>`}</div>`;
}

/* ---------- ВС Маркет ---------- */
const MKT_CATS = { electronics: 'Электроника', clothes: 'Одежда', home: 'Для дома', auto: 'Авто', hobby: 'Хобби и спорт', kids: 'Детям', services: 'Услуги', other: 'Другое' };
const fmtPrice = n => n ? Number(n).toLocaleString('ru-RU') + ' ₽' : 'Бесплатно';
function viewMarket() {
  const tab = (k, l) => `<a class="${S.mktCat === k ? 'on' : ''}" href="#market/${k}">${l}</a>`;
  return `<div class="card"><div class="pad" style="padding-bottom:0"><div class="row" style="flex-wrap:wrap"><h1 class="h brandh grow">ВС Маркет</h1>
      ${banOf(S.me) ? '' : `<button class="btn" data-act="newlot">Продать вещь</button>`}</div></div>
    <div class="tabs scroll-x">${tab('all', 'Все')}${tab('mine', 'Мои')}${Object.entries(MKT_CATS).map(([k, l]) => tab(k, l)).join('')}</div></div>
    ${S.newLot ? `<div class="card pad"><form class="form" data-form="lot">
      <div class="lot-photo">${S.lotImage ? `<img src="${esc(S.lotImage)}" alt="Фото товара">` : `<span class="muted small">Фото товара</span>`}<button type="button" class="btn sec small" data-act="lotphoto">${S.lotImage ? 'Другое фото' : 'Добавить фото'}</button></div>
      <div class="field"><label for="lTitle">Что продаёте</label><input id="lTitle" required minlength="2" maxlength="100" placeholder="Велосипед Stels, 26 дюймов"></div>
      <div class="row" style="gap:10px;flex-wrap:wrap"><div class="field grow"><label for="lPrice">Цена, ₽</label><input id="lPrice" type="number" min="0" max="1000000000" step="1" inputmode="numeric" placeholder="0 — бесплатно"></div>
        <div class="field grow"><label for="lCat">Раздел</label><select id="lCat" class="inp">${Object.entries(MKT_CATS).map(([k, l]) => `<option value="${k}" ${S.mktCat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="lCity">Город</label><input id="lCity" maxlength="40" value="${esc(S.me.city || '')}"></div>
      <div class="field"><label for="lText">Описание</label><textarea id="lText" rows="4" maxlength="3000" placeholder="Состояние, размеры, как забрать"></textarea></div>
      <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>Опубликовать</button><button type="button" class="btn ghost" data-act="newlot">Отмена</button></div></form></div>` : ''}
    ${S.loading ? loadingBox() : cache.lots?.length ? `<div class="lot-grid">${cache.lots.map(l => `<a class="lot-card ${l.sold ? 'sold' : ''}" href="#lot/${esc(l.id)}">
        <div class="lot-img">${safeImg(l.image) ? `<img src="${esc(l.image)}" alt="" loading="lazy">` : `<span>${I.cart}</span>`}${l.sold ? '<span class="lot-sold">Продано</span>' : ''}</div>
        <b class="lot-price">${fmtPrice(l.price)}</b><span class="lot-title">${esc(l.title)}</span><span class="muted small">${esc(l.city || '')}${l.city ? ' · ' : ''}${ago(l.createdAt)}</span></a>`).join('')}</div>`
      : `<div class="card empty">${S.mktCat === 'mine' ? 'У вас пока нет объявлений' : 'Объявлений пока нет'}</div>`}`;
}
function viewLot() {
  const l = cache.lot;
  if (!l) return loadingBox();
  if (l.missing) return `<div class="card empty"><b>Объявление снято</b><a class="btn sec" href="#market">ВС Маркет</a></div>`;
  const u = U(l.ownerId), own = l.ownerId === S.me.id;
  return `<div class="card lot-page">
    <div class="lot-big">${safeImg(l.image) ? `<img src="${esc(l.image)}" alt="${esc(l.title)}" data-act="viewlot">` : `<span>${I.cart}</span>`}</div>
    <div class="pad" style="display:flex;flex-direction:column;gap:10px">
      <div class="row"><a class="icon-btn" href="#market" aria-label="Назад">${I.back}</a><span class="chip">${esc(MKT_CATS[l.category] || '')}</span>${l.sold ? '<span class="chip ban-chip">Продано</span>' : ''}</div>
      <div class="lot-price big">${fmtPrice(l.price)}</div><h1 class="h" style="font-size:20px">${esc(l.title)}</h1>
      <div class="muted small">${esc(l.city || '')}${l.city ? ' · ' : ''}${ago(l.createdAt)}</div>
      ${l.text ? `<div class="post-text">${linkify(l.text)}</div>` : ''}
      <div class="row seller">${avatar(u, 44)}<div class="grow">${nameLink(u)}<div class="muted small">Продавец</div></div>
        ${own ? '' : `<a class="btn" href="#im/${esc(l.ownerId)}">Написать продавцу</a>`}</div>
      <div class="row" style="flex-wrap:wrap">
        ${own ? `<button class="btn sec" data-act="lotsold" data-id="${esc(l.id)}">${l.sold ? 'Снова в продаже' : 'Отметить проданным'}</button>` : ''}
        ${own || isSiteAdmin() ? `<button class="btn ${S.confirm === 'lot:' + l.id ? 'danger' : 'ghost'}" data-act="lotdel" data-id="${esc(l.id)}">${S.confirm === 'lot:' + l.id ? 'Снять объявление?' : 'Удалить'}</button>` : ''}
        ${own ? '' : `<button class="btn ghost" data-act="report" data-type="post" data-id="${esc(l.id)}" data-user="${esc(l.ownerId)}" data-post="" data-text="${esc(l.title)}">Пожаловаться</button>`}
      </div></div></div>`;
}

/* ---------- ВС Ответы ---------- */
const Q_CATS = { life: 'Жизнь', study: 'Учёба', tech: 'Техника', games: 'Игры', sport: 'Спорт', love: 'Отношения', food: 'Еда', other: 'Другое' };
function viewAnswers() {
  const tab = (k, l) => `<a class="${S.ansCat === k ? 'on' : ''}" href="#answers/${k}">${l}</a>`;
  return `<div class="card"><div class="pad" style="padding-bottom:0"><div class="row" style="flex-wrap:wrap"><h1 class="h brandh grow">ВС Ответы</h1>
      ${banOf(S.me) ? '' : `<button class="btn" data-act="newq">Задать вопрос</button>`}</div></div>
    <div class="tabs scroll-x">${tab('all', 'Все')}${tab('mine', 'Мои')}${Object.entries(Q_CATS).map(([k, l]) => tab(k, l)).join('')}</div></div>
    ${S.newQ ? `<div class="card pad"><form class="form" data-form="question">
      <div class="field"><label for="qTitle">Вопрос</label><input id="qTitle" required minlength="5" maxlength="150" placeholder="Например: как научиться плавать?"></div>
      <div class="field"><label for="qText">Подробности</label><textarea id="qText" rows="3" maxlength="2000" placeholder="Необязательно"></textarea></div>
      <div class="field"><label for="qCat">Раздел</label><select id="qCat" class="inp">${Object.entries(Q_CATS).map(([k, l]) => `<option value="${k}" ${S.ansCat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="row"><button class="btn" type="submit">Опубликовать</button><button type="button" class="btn ghost" data-act="newq">Отмена</button></div></form></div>` : ''}
    <div class="card ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : cache.questions.length ? cache.questions.map(q => {
      const u = U(q.authorId);
      return `<a class="uitem q-item" href="#q/${esc(q.id)}" style="color:var(--fg)"><div class="q-count ${q.bestId ? 'solved' : ''}"><b>${q.answersCount || 0}</b><span>${plural(q.answersCount || 0, 'ответ', 'ответа', 'ответов')}</span></div>
        <div class="grow" style="min-width:0"><b class="q-title">${esc(q.title)}</b><div class="muted small">${esc(Q_CATS[q.category] || '')} · ${esc(u?.name || '…')} · ${ago(q.createdAt)}${q.bestId ? ' · <span class="ok">✓ решён</span>' : ''}</div></div></a>`;
    }).join('') : `<div class="empty">${S.ansCat === 'mine' ? 'Вы ещё не задавали вопросов' : 'Вопросов пока нет — задайте первый!'}</div>`}</div>`;
}
function answerHtml(a, q, best) {
  const u = U(a.authorId); if (!u || iBlocked(a.authorId)) return '';
  const me = S.me.id, liked = (a.likes || []).includes(me), own = q.authorId === me;
  const canDel = a.authorId === me || own || isSiteAdmin();
  return `<div class="answer ${best ? 'best' : ''}">${best ? '<div class="best-tag">🏆 Лучший ответ</div>' : ''}
    <div class="row">${avatar(u, 36)}<div class="grow">${nameLink(u)}<div class="muted small">${ago(a.createdAt)}</div></div></div>
    <div class="post-text">${linkify(a.text)}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <button class="pill ${liked ? 'liked' : ''}" data-act="alike" data-id="${esc(a.id)}">${liked ? I.heart : I.heartO}${(a.likes || []).length || ''}</button>
      ${own && !best && a.authorId !== me ? `<button class="btn ghost small" data-act="abest" data-id="${esc(a.id)}">Лучший ответ</button>` : ''}
      <span class="grow"></span>
      ${canDel ? `<button class="btn ghost small" data-act="adel" data-id="${esc(a.id)}">Удалить</button>` : ''}</div></div>`;
}
function viewQuestion() {
  const q = cache.question;
  if (!q) return loadingBox();
  if (q.missing) return `<div class="card empty"><b>Вопрос удалён или не найден</b><a class="btn sec" href="#answers">ВС Ответы</a></div>`;
  const u = U(q.authorId), me = S.me.id, best = cache.answers.find(a => a.id === q.bestId);
  const answered = cache.answers.some(a => a.authorId === me);
  return `<div class="card pad q-card"><div class="row"><a class="icon-btn" href="#answers" aria-label="Все вопросы">${I.back}</a><span class="chip">${esc(Q_CATS[q.category] || '')}</span><span class="grow"></span>
      ${q.authorId === me || isSiteAdmin() ? `<button class="btn ${S.confirm === 'q:' + q.id ? 'danger' : 'ghost'} small" data-act="qdel" data-id="${esc(q.id)}">${S.confirm === 'q:' + q.id ? 'Удалить вопрос?' : 'Удалить'}</button>` : ''}
      ${q.authorId !== me ? `<button class="btn ghost small" data-act="report" data-type="post" data-id="${esc(q.id)}" data-user="${esc(q.authorId)}" data-post="" data-text="${esc(q.title)}">Пожаловаться</button>` : ''}</div>
    <h1 class="h q-h">${esc(q.title)}</h1>
    ${q.text ? `<div class="post-text">${linkify(q.text)}</div>` : ''}
    <div class="row">${avatar(u, 28)}<span class="muted small">${u ? nameLink(u) : ''} · ${ago(q.createdAt)}</span></div></div>
    ${q.authorId !== me && !answered && !banOf(S.me) ? `<div class="card pad"><form class="form" data-form="answer">
      <div class="field"><label for="aText">Ваш ответ</label><textarea id="aText" rows="3" maxlength="3000" required placeholder="Поделитесь, что знаете"></textarea></div>
      <div><button class="btn" type="submit">Ответить</button></div></form></div>` : ''}
    <div class="card pad" style="padding-block:12px"><b>Ответы</b> <span class="muted">${cache.answers.length}</span></div>
    ${best ? answerHtml(best, q, true) : ''}
    ${cache.answers.filter(a => a !== best).sort((a, b) => (b.likes || []).length - (a.likes || []).length).map(a => answerHtml(a, q, false)).join('')
      || (best ? '' : `<div class="card empty">Пока никто не ответил${q.authorId === me ? '. Ответы появятся здесь.' : ' — будьте первым!'}</div>`)}`;
}

/* ---------- ВС Почта ---------- */
let openingMail = null;
async function openMail(mid) {
  openingMail = mid;
  const m = cache.mailIn.find(x => x.id === mid) || cache.mailOut.find(x => x.id === mid);
  if (m) { if (m.to === uid() && !m.read) updateDoc(doc(db, 'mail', mid), { read: true }).catch(console.error); return; }
  try {
    const s2 = await getDoc(doc(db, 'mail', mid));
    if (openingMail !== mid) return;
    if (s2.exists()) { const x = data(s2); ensureUsers([x.from, x.to]); cache.mailOne = x; if (x.to === uid() && !x.read) updateDoc(doc(db, 'mail', mid), { read: true }).catch(console.error); }
    else cache.mailOne = { id: mid, missing: true };
  } catch (e) { cache.mailOne = { id: mid, missing: true }; }
  render();
}
function viewMail() {
  const box = S.mailBox, list = box === 'sent' ? cache.mailOut : cache.mailIn, me = S.me;
  const tab = (k, l, n = 0) => `<a class="${box === k && !S.mailId ? 'on' : ''}" href="#mail/${k}">${l}${n ? ` <span class="badge">${n}</span>` : ''}</a>`;
  const head = `<div class="card"><div class="pad" style="padding-bottom:0"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС Почта</h1>
      <div class="muted small">Ваш адрес: <b>${esc(mailAddr(me))}</b></div></div>${banOf(me) ? '' : `<a class="btn" href="#mail/new">Написать письмо</a>`}</div></div>
    <div class="tabs">${tab('in', 'Входящие', unreadMail())}${tab('sent', 'Отправленные')}</div></div>`;
  if (S.mailId) {
    const m = cache.mailIn.find(x => x.id === S.mailId) || cache.mailOut.find(x => x.id === S.mailId) || (cache.mailOne?.id === S.mailId ? cache.mailOne : null);
    if (!m) return head + loadingBox();
    if (m.missing) return head + `<div class="card empty"><b>Письмо удалено</b><a class="btn sec" href="#mail">Входящие</a></div>`;
    const from = U(m.from), to = U(m.to), mine = m.from === me.id;
    return head + `<div class="card pad letter"><div class="row"><a class="icon-btn" href="#mail/${mine ? 'sent' : 'in'}" aria-label="Назад">${I.back}</a><h2 class="h grow" style="font-size:18px">${esc(m.subject || '(без темы)')}</h2></div>
      <div class="row">${avatar(from, 40)}<div class="grow"><div>${nameLink(from)} <span class="muted small">&lt;${esc(mailAddr(from))}&gt;</span></div>
        <div class="muted small">кому: ${esc(to?.name || '')} &lt;${esc(mailAddr(to))}&gt; · ${ago(m.createdAt)}</div></div></div>
      <div class="post-text letter-text">${linkify(m.text)}</div>
      <div class="row" style="flex-wrap:wrap">${!mine && !banOf(me) ? `<button class="btn" data-act="mailreply" data-id="${esc(m.id)}">Ответить</button>` : ''}
        <button class="btn ghost" data-act="maildel" data-id="${esc(m.id)}">${S.confirm === 'mail:' + m.id ? 'Точно удалить?' : 'Удалить'}</button></div></div>`;
  }
  if (box === 'new') {
    const d = S.mailDraft || {};
    const friends = (me.friends || []).map(U).filter(Boolean);
    return head + `<div class="card pad"><form class="form" data-form="mail">
      <div class="field"><label for="mTo">Кому</label><input id="mTo" required list="mFriends" placeholder="короткое имя, например ivan.petrov" value="${esc(d.to || '')}" autocomplete="off">
        <datalist id="mFriends">${friends.map(u => `<option value="${esc(u.nick)}">${esc(u.name)}</option>`).join('')}</datalist></div>
      <div class="field"><label for="mSubj">Тема</label><input id="mSubj" maxlength="200" value="${esc(d.subject || '')}"></div>
      <div class="field"><label for="mText">Письмо</label><textarea id="mText" rows="8" maxlength="10000" required>${esc(d.text || '')}</textarea></div>
      <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>Отправить</button><a class="btn ghost" href="#mail">Отмена</a></div></form></div>`;
  }
  return head + `<div class="card ulist">${list.length ? list.map(m => {
    const other = U(box === 'sent' ? m.to : m.from), unread = box === 'in' && !m.read;
    return `<a class="uitem mail-item ${unread ? 'unread' : ''}" href="#mail/${esc(m.id)}" style="color:var(--fg)">${avatar(other, 40, false)}
      <div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${box === 'sent' ? 'Кому: ' : ''}${esc(other?.name || '…')}</b><span class="muted small">${ago(m.createdAt)}</span></div>
        <div class="mail-subj">${esc(m.subject || '(без темы)')}</div><div class="muted small notif-text">${esc(m.text.slice(0, 120))}</div></div>${unread ? '<span class="dot"></span>' : ''}</a>`;
  }).join('') : `<div class="empty">${box === 'sent' ? 'Вы ещё не отправляли писем' : 'Писем пока нет'}</div>`}</div>`;
}

/* ---------- ВС Заметки ---------- */
const NOTE_COLORS = ['', 'yellow', 'green', 'blue', 'pink', 'violet'];
function viewNotes() {
  const e = S.noteEdit, n = e && e !== 'new' ? cache.notes.find(x => x.id === e) : null;
  const editor = e ? `<div class="card pad note-edit c-${esc((n?.color ?? S.noteColor) || 'none')}"><form class="form" data-form="note" data-id="${esc(n?.id || '')}">
      <input id="nTitle" class="note-title" maxlength="120" placeholder="Заголовок" value="${esc(n?.title || '')}">
      <textarea id="nText" rows="8" maxlength="20000" placeholder="Текст заметки">${esc(n?.text || '')}</textarea>
      <div class="row" style="flex-wrap:wrap;gap:6px">${NOTE_COLORS.map(c => `<button type="button" class="note-dot c-${c || 'none'} ${((n?.color ?? S.noteColor) || '') === c ? 'on' : ''}" data-act="notecolor" data-c="${c}" aria-label="Цвет ${c || 'обычный'}"></button>`).join('')}
        <label class="row small" style="gap:6px;margin-left:8px"><input type="checkbox" id="nPin" ${n?.pinned ? 'checked' : ''}> Закрепить</label></div>
      <div class="row"><button class="btn" type="submit">Сохранить</button><button type="button" class="btn ghost" data-act="noteclose">Закрыть</button><span class="grow"></span>
        ${n ? `<button type="button" class="btn ${S.confirm === 'note:' + n.id ? 'danger' : 'ghost'}" data-act="notedel" data-id="${esc(n.id)}">${S.confirm === 'note:' + n.id ? 'Удалить?' : 'Удалить'}</button>` : ''}</div>
    </form></div>` : '';
  return `<div class="card pad"><div class="row"><div class="grow"><h1 class="h brandh">ВС Заметки</h1><div class="muted small">Видите только вы</div></div>
      <button class="btn" data-act="notenew">Новая заметка</button></div></div>
    ${editor}
    ${S.loading ? loadingBox() : cache.notes.length ? `<div class="note-grid">${cache.notes.map(x => `<button class="note-card c-${esc(x.color || 'none')}" data-act="noteopen" data-id="${esc(x.id)}">
        ${x.pinned ? '<span class="note-pin">📌</span>' : ''}${x.title ? `<b>${esc(x.title)}</b>` : ''}<span class="note-body">${esc(x.text.slice(0, 300))}</span><span class="muted small">${ago(x.updatedAt)}</span></button>`).join('')}</div>`
      : `<div class="card empty"><b>Заметок пока нет</b><span>Списки покупок, идеи, пароли от Wi-Fi — всё сюда.</span></div>`}`;
}

/* ---------- ВС Погода (Open-Meteo, бесплатно и без ключа) ---------- */
const WX = { 0: ['☀️', 'Ясно'], 1: ['🌤', 'Преимущественно ясно'], 2: ['⛅', 'Переменная облачность'], 3: ['☁️', 'Пасмурно'], 45: ['🌫', 'Туман'], 48: ['🌫', 'Изморозь'],
  51: ['🌦', 'Слабая морось'], 53: ['🌦', 'Морось'], 55: ['🌧', 'Сильная морось'], 56: ['🌧', 'Ледяная морось'], 57: ['🌧', 'Ледяная морось'],
  61: ['🌦', 'Небольшой дождь'], 63: ['🌧', 'Дождь'], 65: ['🌧', 'Ливень'], 66: ['🌧', 'Ледяной дождь'], 67: ['🌧', 'Ледяной дождь'],
  71: ['🌨', 'Небольшой снег'], 73: ['🌨', 'Снег'], 75: ['❄️', 'Сильный снег'], 77: ['🌨', 'Снежная крупа'], 80: ['🌦', 'Ливень'], 81: ['🌧', 'Ливень'], 82: ['⛈', 'Сильный ливень'],
  85: ['🌨', 'Снегопад'], 86: ['❄️', 'Сильный снегопад'], 95: ['⛈', 'Гроза'], 96: ['⛈', 'Гроза с градом'], 99: ['⛈', 'Гроза с градом'] };
const wx = c => WX[c] || ['🌡', '—'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
async function loadWeather(city) {
  S.wx = { loading: true, city }; render();
  try {
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`)).json();
    const place = g.results?.[0];
    if (!place) { S.wx = { error: `Не нашли город «${city}»`, city }; render(); return; }
    const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7&wind_speed_unit=ms`)).json();
    lsSet('vs_wx_city', city);
    S.wx = { city, place, f };
  } catch (e) { console.error(e); S.wx = { error: 'Не удалось загрузить погоду. Проверьте интернет.', city }; }
  render();
}
function viewWeather() {
  const w = S.wx || {};
  const form = `<form class="row" data-form="wx" style="gap:8px"><input id="wxCity" class="inp grow" placeholder="Город" value="${esc(w.city || '')}"><button class="btn sec">Показать</button></form>`;
  let body = '';
  if (w.loading) body = loadingBox();
  else if (w.error) body = `<div class="card empty">${esc(w.error)}</div>`;
  else if (w.f) {
    const c = w.f.current, d = w.f.daily, h = w.f.hourly, [ico, txt] = wx(c.weather_code);
    const nowIdx = Math.max(0, h.time.findIndex(t => new Date(t).getTime() >= Date.now() - 3600e3));
    body = `<div class="card pad wx-now"><div class="wx-ico">${ico}</div><div class="grow"><div class="wx-t">${Math.round(c.temperature_2m)}°</div>
        <b>${esc(txt)}</b><div class="muted small">${esc(w.place.name)}${w.place.admin1 ? ', ' + esc(w.place.admin1) : ''} · ощущается как ${Math.round(c.apparent_temperature)}° · ветер ${Math.round(c.wind_speed_10m)} м/с · влажность ${c.relative_humidity_2m}%</div></div></div>
      <div class="card pad"><b>Ближайшие часы</b><div class="wx-hours">${h.time.slice(nowIdx, nowIdx + 12).map((t, i) => `<div><span class="muted small">${pad2(new Date(t).getHours())}:00</span><span class="wx-e">${wx(h.weather_code[nowIdx + i])[0]}</span><b>${Math.round(h.temperature_2m[nowIdx + i])}°</b></div>`).join('')}</div></div>
      <div class="card ulist">${d.time.map((t, i) => { const dt = new Date(t + 'T12:00'); return `<div class="uitem wx-day"><b class="wx-dn">${i === 0 ? 'Сегодня' : DAYS[dt.getDay()] + ', ' + dt.getDate()}</b><span class="wx-e">${wx(d.weather_code[i])[0]}</span>
        <span class="grow muted small">${esc(wx(d.weather_code[i])[1])}${d.precipitation_probability_max?.[i] ? ` · 💧${d.precipitation_probability_max[i]}%` : ''}</span><b>${Math.round(d.temperature_2m_max[i])}°</b><span class="muted">${Math.round(d.temperature_2m_min[i])}°</span></div>`; }).join('')}</div>
      <p class="hint" style="text-align:center">Данные: Open-Meteo</p>`;
  }
  return `<div class="card pad"><h1 class="h brandh" style="margin-bottom:10px">ВС Погода</h1>${form}</div>${body}`;
}

/* ---------- ВС Игры: 2048 и крестики-нолики ---------- */
function g2048New() { const g = { grid: Array(16).fill(0), score: 0, over: false, won: false }; g2048Add(g); g2048Add(g); return g; }
function g2048Add(g) { const free = g.grid.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (free.length) g.grid[free[Math.floor(Math.random() * free.length)]] = Math.random() < 0.9 ? 2 : 4; }
function g2048Move(dir) { // 0 влево, 1 вправо, 2 вверх, 3 вниз
  const g = S.g2048; if (!g || g.over) return;
  const before = g.grid.join(',');
  for (let r = 0; r < 4; r++) {
    const idx = [0, 1, 2, 3].map(k => dir < 2 ? r * 4 + (dir === 0 ? k : 3 - k) : (dir === 2 ? k : 3 - k) * 4 + r);
    const line = idx.map(i => g.grid[i]).filter(Boolean), out = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === line[i + 1]) { out.push(line[i] * 2); g.score += line[i] * 2; if (line[i] * 2 === 2048) g.won = true; i++; } else out.push(line[i]);
    }
    idx.forEach((i, k) => { g.grid[i] = out[k] || 0; });
  }
  if (g.grid.join(',') === before) return;
  g2048Add(g);
  const can = g.grid.some((v, i) => !v || (i % 4 < 3 && v === g.grid[i + 1]) || (i < 12 && v === g.grid[i + 4]));
  if (!can) g.over = true;
  if (g.score > Number(lsGet('vs_2048') || 0)) lsSet('vs_2048', String(g.score));
  render();
}
const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tttWin = b => { for (const [a, c, d] of TTT_LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return b.every(Boolean) ? 'draw' : null; };
function tttBest(b, who) { // минимакс: компьютер — O
  const w = tttWin(b); if (w === 'O') return { s: 1 }; if (w === 'X') return { s: -1 }; if (w === 'draw') return { s: 0 };
  let best = { s: who === 'O' ? -2 : 2 };
  b.forEach((v, i) => { if (v) return; b[i] = who; const r = tttBest(b, who === 'O' ? 'X' : 'O'); b[i] = '';
    if (who === 'O' ? r.s > best.s : r.s < best.s) best = { s: r.s, i }; });
  return best;
}
function viewGames() {
  const back = `<a class="icon-btn" href="#games" aria-label="Все игры">${I.back}</a>`;
  if (S.game === '2048') {
    const g = S.g2048 ||= g2048New(), best = Number(lsGet('vs_2048') || 0);
    return `<div class="card pad"><div class="row">${back}<h1 class="h grow">2048</h1><div class="g-score"><span>Счёт</span><b>${g.score}</b></div><div class="g-score"><span>Рекорд</span><b>${best}</b></div></div>
        <p class="muted small" style="margin:8px 0 0">Сдвигайте плитки стрелками или свайпом. Одинаковые числа складываются. Цель — 2048!</p></div>
      <div class="card pad g2048-wrap"><div class="g2048" id="g2048">${g.grid.map(v => `<div class="t t${Math.min(v, 4096)}">${v || ''}</div>`).join('')}
        ${g.over ? `<div class="g-over"><b>Игра окончена</b><button class="btn" data-act="g2048new">Ещё раз</button></div>` : ''}</div>
        <div class="row g-pad"><button class="btn sec" data-act="g2048mv" data-d="0">←</button><button class="btn sec" data-act="g2048mv" data-d="2">↑</button><button class="btn sec" data-act="g2048mv" data-d="3">↓</button><button class="btn sec" data-act="g2048mv" data-d="1">→</button>
          <span class="grow"></span><button class="btn ghost" data-act="g2048new">Заново</button></div></div>`;
  }
  if (S.game === 'ttt') {
    const t = S.ttt ||= { b: Array(9).fill(''), wins: 0, losses: 0, draws: 0 }, w = tttWin(t.b);
    return `<div class="card pad"><div class="row">${back}<h1 class="h grow">Крестики-нолики</h1></div>
        <p class="muted small" style="margin:8px 0 0">Вы — ✕, компьютер — ○. Победы ${t.wins} · ничьи ${t.draws} · поражения ${t.losses}</p></div>
      <div class="card pad"><div class="ttt">${t.b.map((v, i) => `<button class="ttt-c" data-act="tttmv" data-i="${i}" ${v || w ? 'disabled' : ''}>${v === 'X' ? '✕' : v === 'O' ? '○' : ''}</button>`).join('')}</div>
        ${w ? `<div class="row" style="justify-content:center;margin-top:14px"><b>${w === 'X' ? 'Вы победили! 🎉' : w === 'O' ? 'Компьютер победил' : 'Ничья'}</b><button class="btn" data-act="tttnew">Ещё раз</button></div>` : ''}</div>`;
  }
  return `<div class="card pad"><h1 class="h brandh">ВС Игры</h1></div>
    <div class="app-grid">
      <a class="app-tile c-game" href="#games/2048"><span class="app-ico g-ico">2048</span><b>2048</b><span class="muted small">Рекорд: ${Number(lsGet('vs_2048') || 0)}</span></a>
      <a class="app-tile c-ask" href="#games/ttt"><span class="app-ico g-ico">✕○</span><b>Крестики-нолики</b><span class="muted small">Против компьютера</span></a>
    </div>`;
}
// управление 2048 с клавиатуры и свайпом
document.addEventListener('keydown', e => {
  if (S.view !== 'games' || S.game !== '2048' || e.target.closest?.('input,textarea')) return;
  const d = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 }[e.key];
  if (d !== undefined) { e.preventDefault(); g2048Move(d); }
});
let touch0 = null;
document.addEventListener('touchstart', e => { if (e.target.closest?.('#g2048')) touch0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
document.addEventListener('touchmove', e => { if (touch0 && e.target.closest?.('#g2048')) e.preventDefault(); }, { passive: false });
document.addEventListener('touchend', e => {
  if (!touch0) return;
  const dx = e.changedTouches[0].clientX - touch0[0], dy = e.changedTouches[0].clientY - touch0[1]; touch0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  g2048Move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3));
});

/* Гости и хэштеги */
function viewGuests() {
  const list = cache.guests.map(g => ({ u: U(g.id), at: g.at })).filter(x => x.u && !x.u.deleted);
  return `<div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Гости страницы <span class="muted">${list.length}</span></h1>
    <p class="hint" style="margin:4px 0 0">Кто заходил на вашу страницу. Видите только вы.</p></div>
    <div class="ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : list.length ? list.map(x => `<div class="uitem">${avatar(x.u, 46)}<div class="grow">${nameLink(x.u)}<div class="muted small">${ago(x.at)}</div></div>
      <div class="acts"><a class="btn sec" href="#im/${esc(x.u.id)}">Написать</a></div></div>`).join('') : '<div class="empty">Пока никто не заходил</div>'}</div></div>`;
}
function viewTag() {
  return `<div class="card pad row"><a class="icon-btn" href="#feed" aria-label="Назад">${I.back}</a><div class="grow"><h1 class="h">#${esc(S.tag)}</h1>
      <div class="muted small">${S.loading ? 'Ищем…' : cache.tagPosts.length + ' ' + plural(cache.tagPosts.length, 'запись', 'записи', 'записей')}</div></div></div>
    ${S.loading ? loadingBox() : cache.tagPosts.length ? cache.tagPosts.map(p => postCard(p)).join('') : `<div class="card empty">Записей с #${esc(S.tag)} пока нет</div>`}`;
}

/* Уведомления */
const NOTIF_TEXT = { like: 'оценил(а) вашу запись', comment: 'прокомментировал(а) вашу запись', wall: 'написал(а) у вас на стене', friend: 'принял(а) вашу заявку в друзья', repost: 'поделился(ась) вашей записью', mention: 'упомянул(а) вас', gift: 'сделал(а) вам подарок', answer: 'ответил(а) на ваш вопрос', best: 'выбрал(а) ваш ответ лучшим' };
function viewNotifs() {
  const list = cache.notifs.filter(n => n.from !== S.me.id);
  return `<div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Уведомления <span class="muted">${list.length}</span></h1></div>
    <div class="ulist">${list.length ? list.map(n => {
      const u = U(n.from); if (!u) return '';
      const href = n.type === 'gift' ? '#id/' + uid() : n.type === 'friend' ? '#id/' + n.from : ['answer', 'best'].includes(n.type) ? '#q/' + n.postId : n.postId ? '#post/' + n.postId : '#id/' + n.from;
      return `<a class="uitem notif" href="${esc(href)}" style="color:var(--fg)">${avatar(u, 46, false)}
        <div class="grow" style="min-width:0"><b>${esc(u.name)}</b> ${NOTIF_TEXT[n.type] || ''}
          ${n.text ? `<div class="muted small notif-text">«${esc(n.text)}»</div>` : ''}<div class="muted small">${ago(n.createdAt)}</div></div>
        <span class="notif-ico" data-t="${esc(n.type)}">${n.type === 'like' ? I.heart : n.type === 'comment' ? I.comment : n.type === 'friend' ? I.friends : I.feed}</span></a>`;
    }).join('') : `<div class="empty">Пока тихо<span class="small">Здесь появятся лайки, комментарии и записи на вашей стене</span></div>`}</div></div>`;
}

/* Новости */
function viewFeed() {
  const seen = new Set();
  const posts = [...cache.feed.values()].flat().filter(p => !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 100);
  const tab = (t, l) => `<button class="${S.feedTab === t ? 'on' : ''}" data-act="feedtab" data-tab="${t}">${l}</button>`;
  const fr = S.me.friends || []; ensureUsers(fr.slice(0, 200));
  const bdays = fr.map(U).filter(u => u && isBdayToday(u.bday));
  return `${storiesBar()}${bdays.length ? `<div class="card pad bday-card"><b>🎂 Сегодня день рождения</b>
      ${bdays.map(u => `<div class="row">${avatar(u, 36)}<span class="grow">${nameLink(u)}</span><a class="btn sec small" href="#im/${esc(u.id)}">Поздравить</a></div>`).join('')}</div>` : ''}
  ${composer(S.me.id, 'Что у вас нового?')}
  <div class="card"><div class="tabs">${tab('friends', 'Друзья')}${tab('all', 'Все записи')}</div></div>
  ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') :
    `<div class="card empty"><b>${S.feedTab === 'friends' ? 'Здесь появятся записи ваши и ваших друзей' : 'Пока никто ничего не написал'}</b>
     <span>Напишите первую запись или найдите знакомых.</span><a class="btn sec" href="#people">Найти людей</a></div>`}`;
}

const EMOJI = '😀 😂 🥲 😍 😘 😎 🤔 😴 😭 😡 🥳 😇 🙃 😉 🤗 🤯 👍 👎 👏 🙏 💪 🤝 👋 ✌️ ❤️ 🧡 💛 💚 💙 💜 🔥 ✨ 🎉 🎂 🎁 ⚽ 🎮 🎵 📷 🌞 🌙 ⭐ 🌈 🍕 🍔 ☕ 🐱 🐶'.split(' ');
const emojiPanel = target => S.emoji === target
  ? `<div class="emoji" role="group" aria-label="Смайлики">${EMOJI.map(e => `<button type="button" data-act="emoji" data-t="${target}" data-e="${e}">${e}</button>`).join('')}</div>` : '';
const emojiBtn = (target, cls = 'icon-btn') => `<button type="button" class="${cls}" data-act="emojis" data-t="${target}" aria-label="Смайлики" aria-expanded="${S.emoji === target}">😊</button>`;

function composer(wallId, ph, g = null) {
  if (banOf(S.me)) return '';
  const d = S.draft;
  return `<div class="card pad composer"><form data-form="post" data-wall="${esc(wallId)}" ${g ? 'data-group="1"' : ''}>
    <div class="row" style="align-items:flex-start">${g ? groupAvatar(g, 40, false) : avatar(S.me, 40, false)}
      <textarea id="postText" rows="2" placeholder="${esc(ph)}" maxlength="4000"></textarea></div>
    ${d.files.length ? `<div class="previews n${d.files.length}">${d.files.map((f, i) => `<div class="preview"><img src="${f.url}" alt="Фото ${i + 1}"><button type="button" data-act="unattach" data-i="${i}" aria-label="Убрать фото">×</button></div>`).join('')}</div>` : ''}
    ${d.poll ? `<div class="poll-form">
      <div class="field"><label for="pollQ">Вопрос опроса</label><input id="pollQ" maxlength="200" placeholder="Куда пойдём в субботу?"></div>
      ${Array.from({ length: d.pollN }, (_, i) => `<input id="pollO${i}" maxlength="80" placeholder="Вариант ${i + 1}">`).join('')}
      <div class="row">${d.pollN < 6 ? `<button type="button" class="btn ghost small" data-act="polladd">+ Вариант</button>` : ''}<span class="grow"></span>
        <button type="button" class="btn ghost small" data-act="polltoggle">Убрать опрос</button></div></div>` : ''}
    ${emojiPanel('postText')}
    <div class="composer-bar"><button type="button" class="icon-btn" data-act="attach">${I.photo}<span class="small">Фото</span></button>
      ${d.poll ? '' : `<button type="button" class="icon-btn" data-act="polltoggle">${I.poll}<span class="small">Опрос</span></button>`}
      ${emojiBtn('postText')}
      <span class="grow"></span><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Публикуем…' : 'Опубликовать'}</button></div>
  </form></div>`;
}

function pollHtml(p) {
  const poll = p.poll; if (!poll || !Array.isArray(poll.options)) return '';
  const votes = poll.votes || {}, all = Object.values(votes), total = all.length, mine = votes[S.me.id];
  const voted = mine !== undefined;
  return `<div class="poll"><b>${esc(poll.q || 'Опрос')}</b>
    ${poll.options.map((o, i) => {
      const n = all.filter(v => v === i).length, pct = total ? Math.round(n * 100 / total) : 0;
      return `<button class="poll-opt ${mine === i ? 'on' : ''}" data-act="vote" data-id="${esc(p.id)}" data-i="${i}">
        ${voted ? `<i style="width:${pct}%"></i>` : ''}<span class="grow">${esc(o)}</span>${voted ? `<span class="tnum">${pct}%</span>` : ''}</button>`;
    }).join('')}
    <div class="muted small">${total} ${plural(total, 'голос', 'голоса', 'голосов')}${voted ? ' · нажмите на другой вариант, чтобы переголосовать' : ''}</div></div>`;
}

// Оригинал репоста: кэшируем, грузим один раз
const pendingPosts = new Set();
function ensurePosts(ids) {
  const miss = [...new Set(ids)].filter(i => i && !cache.reposted.has(i) && !pendingPosts.has(i));
  if (!miss.length) return;
  miss.forEach(i => pendingPosts.add(i));
  Promise.all(miss.map(async i => {
    try { const s = await getDoc(doc(db, 'posts', i)); cache.reposted.set(i, s.exists() ? data(s) : { id: i, missing: true }); if (s.exists()) ensurePostPeople([data(s)]); }
    catch (e) { cache.reposted.set(i, { id: i, missing: true }); }
    finally { pendingPosts.delete(i); }
  })).then(render);
}
function postImages(p) {
  const list = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
  if (!list.length) return '';
  if (list.length === 1) return `<img class="post-img" src="${esc(safeImg(list[0]))}" alt="Фото к записи" loading="lazy" data-act="viewimg" data-kind="post" data-id="${esc(p.id)}" data-i="0">`;
  return `<div class="post-grid n${list.length}">${list.map((x, i) => `<img src="${esc(safeImg(x))}" alt="Фото ${i + 1}" loading="lazy" data-act="viewimg" data-kind="post" data-id="${esc(p.id)}" data-i="${i}">`).join('')}</div>`;
}
function repostHtml(id) {
  ensurePosts([id]);
  const o = cache.reposted.get(id);
  if (!o) return `<div class="repost muted small">Загружаем…</div>`;
  if (o.missing) return `<div class="repost muted small">Исходная запись удалена</div>`;
  const a = U(o.authorId), g = o.groupId ? G(o.groupId) : null;
  if (!a || (o.groupId && !g)) return `<div class="repost muted small">Загружаем…</div>`;
  return `<div class="repost"><div class="row">${g ? groupAvatar(g, 32) : avatar(a, 32)}<div class="grow">${g ? `<a class="name" href="#club/${esc(g.id)}" style="color:var(--fg);font-weight:600">${esc(g.name)}</a>` : nameLink(a)}
      <div class="muted small"><a href="#post/${esc(o.id)}" style="color:inherit">${ago(o.createdAt)}</a></div></div></div>
    ${o.text ? `<div class="post-text">${linkify(o.text)}</div>` : ''}
    ${postImages(o)}
    ${pollHtml(o)}</div>`;
}

function postCard(p, pinned = false) {
  const a = U(p.authorId); if (!a) return '';
  if (iBlocked(p.authorId) && p.wallId !== S.me.id) return '';
  const g = p.groupId ? G(p.groupId) : null; if (p.groupId && !g) return '';
  const me = S.me, wall = !g && p.wallId !== p.authorId ? U(p.wallId) : null;
  const likes = p.likes || [], liked = likes.includes(me.id);
  const open = S.openComments.has(p.id), comments = cache.comments.get(p.id);
  const gAdmin = g && (g.admins || []).includes(me.id);
  const canDel = p.authorId === me.id || p.wallId === me.id || gAdmin || isSiteAdmin(), canEdit = p.authorId === me.id, editing = canEdit && S.editPost === p.id;
  const canPin = !g && p.wallId === me.id, isPinned = canPin && me.pinned === p.id;
  const n = p.commentCount || 0;
  const confirmKey = 'post:' + p.id, menu = S.postMenu === p.id;
  return `<article class="card pad post">
    ${pinned ? `<div class="pin-label small">📌 Закреплённая запись</div>` : ''}
    <div class="row post-head">${g ? groupAvatar(g, 44) : avatar(a, 44)}
      <div class="grow">${g ? `<a class="name" href="#club/${esc(g.id)}" style="color:var(--fg);font-weight:600">${esc(g.name)}</a>` : nameLink(a)}${wall ? ` <span class="muted">→</span> ${nameLink(wall)}` : ''}
        <div class="muted small"><a href="#post/${esc(p.id)}" style="color:inherit">${ago(p.createdAt)}</a>${p.editedAt ? ' · изменено' : ''}</div></div>
      <button class="icon-btn" data-act="postmenu" data-id="${esc(p.id)}" aria-label="Действия с записью" aria-expanded="${menu}">${I.more}</button>
    </div>
    ${menu ? `<div class="post-menu">
      ${canEdit && !editing ? `<button class="btn ghost small" data-act="editpost" data-id="${esc(p.id)}">Изменить</button>` : ''}
      ${canPin ? `<button class="btn ghost small" data-act="pinpost" data-id="${isPinned ? '' : esc(p.id)}">${isPinned ? 'Открепить' : 'Закрепить'}</button>` : ''}
      ${canDel ? `<button class="btn ${S.confirm === confirmKey ? 'danger' : 'ghost'} small" data-act="delpost" data-id="${esc(p.id)}">${S.confirm === confirmKey ? 'Точно удалить?' : 'Удалить'}</button>` : ''}
      ${p.authorId !== me.id ? `<button class="btn ghost small" data-act="report" data-type="post" data-id="${esc(p.id)}" data-user="${esc(p.authorId)}" data-post="${esc(p.id)}" data-text="${esc((p.text || '').slice(0, 300))}">Пожаловаться</button>` : ''}
    </div>` : ''}
    ${editing ? `<form class="form" data-form="editpost" data-id="${esc(p.id)}">
        <textarea id="ep_${esc(p.id)}" rows="3" maxlength="4000">${esc(p.text)}</textarea>
        <div class="row"><button class="btn" type="submit">Сохранить</button><button type="button" class="btn ghost" data-act="editpost" data-id="">Отмена</button></div></form>`
      : p.text ? `<div class="post-text">${linkify(p.text)}</div>` : ''}
    ${postImages(p)}
    ${pollHtml(p)}
    ${p.repostOf ? repostHtml(p.repostOf) : ''}
    <div class="post-actions">
      <button class="pill ${liked ? 'liked' : ''}" data-act="like" data-id="${esc(p.id)}" aria-pressed="${liked}" aria-label="Нравится">${liked ? I.heart : I.heartO}${likes.length || ''}</button>
      <button class="pill" data-act="togglec" data-id="${esc(p.id)}" aria-label="Комментарии">${I.comment}${n || ''}</button>
      <button class="pill" data-act="repost" data-id="${esc(p.id)}" aria-label="Поделиться у себя на стене" title="Поделиться у себя на стене">${I.repost}${p.reposts || ''}</button>
      <span class="grow"></span>
      <button class="pill" data-act="copy" data-text="${esc(location.origin + location.pathname + '#post/' + p.id)}" aria-label="Скопировать ссылку на запись">${I.link}</button>
    </div>
    ${open ? `<div class="comments">
      ${!comments ? '<div class="muted small">Загружаем…</div>' : comments.map(c => {
        const ca = U(c.authorId); if (!ca || iBlocked(c.authorId)) return '';
        const del = c.authorId === me.id || canDel;
        return `<div class="comment">${avatar(ca, 32)}<div class="bubble">${nameLink(ca)} <span class="post-text">${linkify(c.text)}</span>
          <div class="muted small">${ago(c.createdAt)} · <button class="clike ${(c.likes || []).includes(me.id) ? 'on' : ''}" data-act="clike" data-post="${esc(p.id)}" data-id="${esc(c.id)}" aria-label="Нравится">${(c.likes || []).includes(me.id) ? '♥' : '♡'}${(c.likes || []).length || ''}</button>${del ? ` · <button class="btn ghost small" style="padding:0 4px" data-act="delc" data-post="${esc(p.id)}" data-id="${esc(c.id)}">удалить</button>` : ''}</div></div></div>`;
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
  const adm = isAdm(u);
  return `<div class="card ${adm ? 'admin-card' : ''}">
    ${adm ? `<div class="cover admin-cover"><div class="aurora"></div><span class="adm-tag">👑 Администратор VСмске</span></div>`
      : `<div class="cover" ${COVERS[u.cover] ? `style="--cover:${COVERS[u.cover]}"` : ''}></div>`}
    <div class="prof">${adm ? `<span class="adm-ring">${avatar(u, 120, false)}</span>` : avatar(u, 120, false)}
      <div class="prof-info"><h1 class="prof-name">${esc(u.name)}${admBadge(u)}</h1><div class="muted">${u.status ? esc(u.status) : own ? 'Добавьте статус в «Редактировать»' : '@' + esc(u.nick)}</div>
        ${!own && seenText(u) ? `<div class="seen small ${isOnline(u) ? 'on' : ''}">${seenText(u)}</div>` : ''}
        ${banOf(u) ? `<span class="chip ban-chip">⛔ Заблокирован ${banText(banOf(u))}</span>` : ''}
        ${!own && iBlocked(u.id) ? `<span class="chip">Вы заблокировали этого человека</span>` : ''}</div>
      <div class="prof-btns">${own ? `<a class="btn sec" href="#edit">Редактировать</a>` : `${iBlocked(u.id) ? '' : `<a class="btn" href="#im/${esc(u.id)}">Написать</a>${relButtons(u.id)}`}
        <button class="icon-btn" data-act="profmenu" aria-label="Ещё" aria-expanded="${!!S.profMenu}">${I.more}</button>`}</div>
    </div>
    ${!own && S.profMenu ? `<div class="post-menu" style="padding:0 20px 14px">
      <button class="btn ghost small" data-act="${iBlocked(u.id) ? 'unblock' : 'block'}" data-id="${esc(u.id)}">${iBlocked(u.id) ? 'Разблокировать' : S.confirm === 'block:' + u.id ? 'Точно заблокировать?' : 'Заблокировать'}</button>
      <button class="btn ghost small" data-act="report" data-type="user" data-id="${esc(u.id)}" data-user="${esc(u.id)}" data-text="${esc(u.name)}">Пожаловаться</button>
      ${isSiteAdmin() && !adm ? `<button class="btn ghost small" data-act="modopen">Модерация</button>` : ''}
    </div>` : ''}
    ${!own && isSiteAdmin() && !adm && S.modOpen ? `<div class="mod-box"><b>Модерация: ${esc(u.name)}</b>
      ${banOf(u) ? `<div class="row" style="flex-wrap:wrap"><span class="grow">Заблокирован ${banText(banOf(u))}${banOf(u).reason ? ' · ' + esc(banOf(u).reason) : ''}</span><button class="btn" data-act="unban" data-id="${esc(u.id)}">Разбанить</button></div>`
        : `<input id="banReason" class="inp" maxlength="300" placeholder="Причина (её увидит человек)">
        <div class="row" style="flex-wrap:wrap;gap:6px">${BAN_DAYS.map(([d, l]) => `<button class="btn ${d ? 'sec' : 'danger'} small" data-act="ban" data-id="${esc(u.id)}" data-d="${d}">${l}</button>`).join('')}</div>`}
    </div>` : ''}
    <dl class="facts">
      <dt>Короткое имя</dt><dd>@${esc(u.nick)}</dd>
      ${adm ? `<dt>Роль</dt><dd><b class="adm-role">Администратор сайта</b></dd>` : ''}
      ${u.city ? `<dt>Город</dt><dd>${esc(u.city)}</dd>` : ''}
      ${u.bday ? `<dt>День рождения</dt><dd>${esc(bdayText(u.bday))}${isBdayToday(u.bday) ? ' 🎂 <b>сегодня!</b>' : ''}</dd>` : ''}
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
      ${own || (isFriend && (u.privacy?.wall || 'friends') !== 'me') ? composer(u.id, own ? 'Что у вас нового?' : 'Написать на стене у ' + u.name.split(' ')[0]) : ''}
      <div class="card pad" style="padding-block:12px"><b>${own ? 'Мои записи' : 'Стена'}</b> <span class="muted">${posts.length}</span></div>
      ${S.loading ? loadingBox() : posts.length ? wallPosts(u, posts) : `<div class="card empty">${own ? 'Напишите первую запись: её увидят ваши друзья.' : 'На стене пока нет записей'}</div>`}
    </div>
    <div>
      <div class="card pad"><div class="row"><b class="grow">Друзья</b><span class="muted small">${friendIds.length}</span></div>
        ${friends.length ? `<div class="fgrid">${friends.map(f => `<a href="#id/${esc(f.id)}" style="color:var(--fg);display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;min-width:0">${avatar(f, 52, false)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(f.name.split(' ')[0])}</span></a>`).join('')}</div>`
          : `<p class="muted small" style="margin:8px 0 0">${own ? 'Найдите знакомых в разделе «Люди»' : 'Пока никого'}</p>`}
      </div>
      <div class="card pad"><div class="row"><b class="grow">Подарки</b><span class="muted small">${cache.gifts.length}</span></div>
        ${cache.gifts.length ? `<div class="gift-grid">${cache.gifts.slice(0, 12).map(g => { const fr = U(g.from), [e, l] = GIFTS[g.gift] || GIFTS.gift;
          return `<span class="gift" title="${esc(l + (fr ? ' от ' + fr.name : '') + (g.text ? ': ' + g.text : ''))}">${e}${own ? `<button class="gift-x" data-act="giftdel" data-id="${esc(g.id)}" aria-label="Убрать подарок">×</button>` : ''}</span>`; }).join('')}</div>
          ${cache.gifts[0]?.text ? `<p class="muted small" style="margin:8px 0 0">«${esc(cache.gifts[0].text)}» — ${esc(U(cache.gifts[0].from)?.name || '')}</p>` : ''}`
          : `<p class="muted small" style="margin:8px 0 0">${own ? 'Вам пока ничего не дарили' : 'Подарков пока нет'}</p>`}
        ${!own && !banOf(me) ? `<button class="btn sec" style="margin-top:10px;width:100%" data-act="giftopen" data-id="${esc(u.id)}">🎁 Подарить</button>` : ''}
      </div>
      <div class="card ulist">
        ${own ? `<a class="uitem setlink" href="#guests"><span class="ficon">${I.eye}</span><span class="grow">Гости страницы</span>›</a>` : ''}
        <a class="uitem setlink" href="#albums/${esc(u.id)}"><span class="ficon">${I.album}</span><span class="grow">Фотоальбомы</span>›</a>
        <a class="uitem setlink" href="#videos/${esc(u.id)}"><span class="ficon">${I.video}</span><span class="grow">Видео</span>›</a>
        <a class="uitem setlink" href="#music/${own ? 'my' : esc(u.id)}"><span class="ficon">${I.music}</span><span class="grow">Музыка</span>›</a>
      </div>
    </div>
  </div>`;
}

function wallPosts(u, posts) {
  const pin = u.pinned && posts.find(p => p.id === u.pinned);
  return (pin ? postCard(pin, true) : '') + posts.filter(p => p !== pin).map(p => postCard(p)).join('');
}

function viewEdit() {
  const me = S.me, color = S.editColor || me.color, photo = S.editPhoto === undefined ? me.photo : S.editPhoto;
  return `<div class="card pad"><h1 class="h" style="margin-bottom:16px">Редактирование страницы</h1>
  <form class="form" data-form="edit">
    <div class="row">${avatar({ ...me, color, photo }, 72, false)}
      <div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" class="btn sec" data-act="avatar">Загрузить фото</button>
      ${photo ? `<button type="button" class="btn ghost" data-act="noavatar">Убрать фото</button>` : ''}</div></div>
    <div class="field"><label>Обложка страницы</label><div class="swatches covers">${Object.entries(COVERS).map(([k, g]) => `<button type="button" class="${k === (S.editCover || me.cover || 'blue') ? 'on' : ''}" style="background:${g}" data-act="cover" data-c="${k}" aria-label="Обложка ${k}"></button>`).join('')}</div></div>
    <div class="field"><label>Цвет аватара</label><div class="swatches">${COLORS.map(c => `<button type="button" class="${c === color ? 'on' : ''}" style="background:${c}" data-act="color" data-c="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>
    <div class="field"><label for="eName">Имя и фамилия</label><input id="eName" required maxlength="60" value="${esc(me.name)}"></div>
    <div class="field"><label for="eNick">Короткое имя</label><input id="eNick" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._]+" value="${esc(me.nick)}"></div>
    <div class="field"><label for="eStatus">Статус</label><input id="eStatus" maxlength="120" value="${esc(me.status)}"></div>
    <div class="field"><label for="eCity">Город</label><input id="eCity" maxlength="40" value="${esc(me.city)}"></div>
    <div class="field"><label for="eBday">День рождения</label><input id="eBday" type="date" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}" value="${esc(me.bday || '')}"></div>
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

// Друзья друзей, отсортированные по числу общих друзей
function suggestions() {
  const me = S.me, mine = new Set(me.friends || []), count = new Map();
  const skip = new Set([me.id, ...mine, ...cache.incoming.map(r => r.from), ...cache.outgoing.map(r => r.to)]);
  mine.forEach(f => (U(f)?.friends || []).forEach(x => { if (!skip.has(x)) count.set(x, (count.get(x) || 0) + 1); }));
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  ensureUsers(top.map(([x]) => x));
  return top.map(([x, n]) => ({ u: U(x), n })).filter(s => s.u && !s.u.deleted);
}

function viewFriends() {
  const ids = S.me.friends || [];
  const sug = suggestions();
  ensureUsers([...ids, ...cache.incoming.map(r => r.from), ...cache.outgoing.map(r => r.to)]);
  const fr = ids.map(U).filter(Boolean);
  const inc = cache.incoming.map(r => U(r.from)).filter(Boolean);
  const out = cache.outgoing.map(r => U(r.to)).filter(Boolean);
  return `${inc.length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Заявки в друзья <span class="muted">${inc.length}</span></h2></div>
      <div class="ulist">${inc.map(u => userRow(u, '<div class="req">Хочет добавить вас в друзья</div>')).join('')}</div></div>` : ''}
    <div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Друзья <span class="muted">${ids.length}</span></h1></div>
    <div class="ulist">${fr.length ? fr.map(u => userRow(u)).join('') : ids.length ? '<div class="loading"><div class="spin"></div></div>' : `<div class="empty">У вас пока нет друзей<a class="btn sec" href="#people">Найти людей</a></div>`}</div></div>
    ${sug.length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Возможные друзья</h2></div>
      <div class="ulist">${sug.map(x => userRow(x.u, `<div class="muted small">${x.n} ${plural(x.n, 'общий друг', 'общих друга', 'общих друзей')}</div>`)).join('')}</div></div>` : ''}
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
const dialogName = (u, self) => self ? 'Избранное' : u.name;
const REACTS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
function reactsHtml(m, id) {
  const r = m.reacts || {}, counts = {};
  Object.entries(r).forEach(([u, e]) => { if (REACTS.includes(e)) (counts[e] ||= []).push(u); });
  const list = Object.entries(counts);
  return list.length ? `<div class="reacts">${list.map(([e, us]) => `<button class="react ${us.includes(id) ? 'mine' : ''}" data-act="react" data-id="${esc(m.id)}" data-e="${e}">${e}${us.length > 1 ? `<span>${us.length}</span>` : ''}</button>`).join('')}</div>` : '';
}
function msgHtml(m, id, peerRead, room = false) {
  const mine = m.from === id, img = safeImg(m.image), sel = S.msgSel === m.id, rp = m.replyTo, fw = m.fwd;
  const ticks = mine && peerRead !== null ? `<span class="ticks ${ms(m.createdAt) <= peerRead ? 'read' : ''}" aria-label="${ms(m.createdAt) <= peerRead ? 'Прочитано' : 'Отправлено'}">${ms(m.createdAt) <= peerRead ? '✓✓' : '✓'}</span>` : '';
  const quote = rp ? `<div class="msg-quote"><b>${esc(rp.from === id ? 'Вы' : (U(rp.from)?.name || '').split(' ')[0])}</b>${esc(rp.text || '')}</div>` : '';
  const who = room && !mine ? `<a class="msg-from" href="#id/${esc(m.from)}">${esc(U(m.from)?.name || '…')}</a>` : '';
  const fwd = fw ? `<div class="fwd"><div class="small">↪ Переслано${fw.name ? ` от <b>${esc(fw.name)}</b>` : ''}</div>${fw.text ? `<span>${linkify(fw.text)}</span>` : ''}</div>` : '';
  const jumbo = !img && !m.audio && !fw && !rp && isJumbo(m.text);
  return `<div class="msg ${mine ? 'me' : ''} ${img ? 'has-img' : ''} ${sel ? 'sel' : ''} ${jumbo ? 'jumbo' : ''}" data-act="selmsg" data-id="${esc(m.id)}">${who}${quote}${fwd}${img ? `<img class="msg-img" src="${esc(img)}" alt="Фото" data-act="viewimg" data-kind="msg" data-id="${esc(m.id)}">` : ''}${typeof m.audio === 'string' && m.audio.startsWith('data:audio/') ? voiceHtml(m) : ''}${m.text ? `<span>${linkify(m.text)}</span>` : ''}${reactsHtml(m, id)}<time>${hm(new Date(ms(m.createdAt)))}${ticks}</time>${sel ? `<div class="react-pick">${REACTS.map(e => `<button data-act="react" data-id="${esc(m.id)}" data-e="${e}" aria-label="Реакция ${e}">${e}</button>`).join('')}</div><div class="msg-acts"><button data-act="replymsg" data-id="${esc(m.id)}">${I.reply}Ответить</button><button data-act="fwdmsg" data-id="${esc(m.id)}">↪ Переслать</button>${mine ? `<button data-act="delmsg" data-id="${esc(m.id)}">${S.confirm === 'msg:' + m.id ? 'Удалить у всех?' : 'Удалить'}</button>` : ''}</div>` : ''}</div>`;
}
const roomAvatar = (c, size) => `<span class="av room-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px">${esc(initials(c?.name || 'Б'))}</span>`;

// Поле ввода внизу чата (общее для диалога и беседы)
function chatForm(key) {
  if (banOf(S.me)) return `<div class="chat-form muted small" style="justify-content:center">Ваш аккаунт заблокирован — писать сообщения нельзя</div>`;
  if (S.rec) return `<div class="chat-form rec-bar"><span class="rec-dot"></span><b id="recTime" class="tnum">${fmtDur((Date.now() - S.rec.started) / 1000)}</b><span class="grow muted small">Идёт запись, до 1 минуты</span>
          <button type="button" class="btn ghost" data-act="reccancel">Отмена</button><button type="button" class="btn" data-act="recsend">${I.send}</button></div>`;
  return `<form class="chat-form" data-form="msg" data-to="${esc(key)}"><button type="button" class="icon-btn" data-act="msgphoto" aria-label="Отправить фото" ${S.busy ? 'disabled' : ''}>${I.photo}</button>${emojiBtn('msgInput')}<input id="msgInput" placeholder="Сообщение" maxlength="2000" autocomplete="off"><button type="button" class="icon-btn" data-act="mic" aria-label="Записать голосовое">${I.mic}</button><button class="btn" aria-label="Отправить">${I.send}</button></form>`;
}

function roomPanel(c) {
  const id = S.me.id, owner = c.ownerId === id;
  const members = c.members.map(U).filter(Boolean);
  ensureUsers(c.members);
  const addable = (S.me.friends || []).filter(f => !c.members.includes(f)).map(U).filter(Boolean);
  return `<div class="room-panel">
    ${owner ? `<form class="row" data-form="roomname"><input id="rmName" class="inp grow" maxlength="60" value="${esc(c.name)}"><button class="btn sec small">Переименовать</button></form>` : ''}
    <b class="small muted">Участники · ${c.members.length}</b>
    ${members.map(u => `<div class="row">${avatar(u, 30)}<span class="grow">${nameLink(u)}${u.id === c.ownerId ? ' <span class="muted small">создатель</span>' : ''}</span>
      ${owner && u.id !== id ? `<button class="btn ghost small" data-act="roomkick" data-id="${esc(u.id)}">Убрать</button>` : ''}</div>`).join('')}
    ${owner && addable.length ? `<b class="small muted">Добавить друзей</b><div class="chips">${addable.map(u => `<button class="btn ghost small" data-act="roomadd" data-id="${esc(u.id)}">+ ${esc(u.name)}</button>`).join('')}</div>` : ''}
    <div class="row">${owner ? `<button class="btn ${S.confirm === 'room:' + c.id ? 'danger' : 'ghost'} small" data-act="roomdel">${S.confirm === 'room:' + c.id ? 'Удалить беседу у всех?' : 'Удалить беседу'}</button>`
      : `<button class="btn ghost small" data-act="roomleave">Выйти из беседы</button>`}</div>
  </div>`;
}

function viewMessages() {
  const id = S.me.id;
  const list = [...cache.chats];
  const key = S.chatWith, room = isRoom(key);
  if (key && !room && !list.some(c => c.id === chatId(id, key))) list.unshift({ id: chatId(id, key), members: [id, key], fresh: true });
  let chatHtml = `<div class="empty" style="height:100%">Выберите диалог<br><span class="small">или напишите человеку с его страницы</span></div>`;
  const rp = S.replyTo;
  const replyBar = name => rp ? `<div class="reply-bar">${I.reply}<div class="grow" style="min-width:0"><b>${esc(rp.from === id ? 'Вы' : name)}</b><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rp.text)}</div></div><button class="icon-btn" data-act="noreply" aria-label="Не отвечать">✕</button></div>` : '';
  const body = (peerRead, empty) => {
    let lastDay = '';
    return S.loading ? '<div class="loading"><div class="spin"></div></div>' : cache.messages.map(m => {
      const dl = dayLabel(m.createdAt), sep = dl !== lastDay ? `<div class="daysep">${dl}</div>` : ''; lastDay = dl;
      return sep + msgHtml(m, id, peerRead, room);
    }).join('') || `<div class="empty">${empty}</div>`;
  };
  if (room) {
    const c = cache.chats.find(x => x.id === key);
    if (!c) chatHtml = S.chatsLoaded ? `<div class="empty" style="height:100%">Беседа не найдена или вас в ней больше нет<a class="btn sec" href="#im">К диалогам</a></div>` : '<div class="loading"><div class="spin"></div></div>';
    else chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${roomAvatar(c, 38)}
        <div class="grow"><b>${esc(c.name)}</b><div class="small muted">${c.members.length} ${plural(c.members.length, 'участник', 'участника', 'участников')}</div></div>
        <button class="icon-btn" data-act="roominfo" aria-label="Участники" aria-expanded="${!!S.roomInfo}">${I.friends}</button></div>
      ${S.roomInfo ? roomPanel(c) : ''}
      <div class="msgs">${body(null, 'Напишите первое сообщение в беседу')}</div>
      ${replyBar((U(rp?.from)?.name || '').split(' ')[0])}${emojiPanel('msgInput')}${chatForm(key)}`;
  } else {
    const o = key && U(key), self = key === id;
    if (key && !o) chatHtml = '<div class="loading"><div class="spin"></div></div>';
    if (o) {
      const chat = cache.chats.find(c => c.id === chatId(id, key));
      const peerRead = self ? null : chat?.read?.[key] ? ms(chat.read[key]) : 0;
      chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${self ? `<span class="av fav" style="width:38px;height:38px">★</span>` : avatar(o, 38)}
        <div class="grow">${self ? '<b>Избранное</b>' : nameLink(o)}<div class="small seen ${!self && isOnline(o) ? 'on' : ''}">${self ? 'Только для вас' : esc(seenText(o) || o.city || '@' + (o.nick || ''))}</div></div></div>
        <div class="msgs">${body(peerRead, self ? 'Сохраняйте сюда заметки, ссылки и фото — их видите только вы' : 'Напишите ' + esc(o.name.split(' ')[0]) + ' первым')}</div>
        ${replyBar(o.name.split(' ')[0])}${emojiPanel('msgInput')}
        ${o.deleted ? '' : banOf(S.me) ? chatForm(key)
          : !self && iBlocked(o.id) ? `<div class="chat-form muted small" style="justify-content:center">Вы заблокировали этого человека · <button class="linkbtn" data-act="unblock" data-id="${esc(o.id)}">разблокировать</button></div>`
          : !self && blockedMe(o) ? `<div class="chat-form muted small" style="justify-content:center">${esc(o.name.split(' ')[0])} ограничил(а) вам доступ к сообщениям</div>`
          : !self && o.privacy?.messages === 'friends' && !(S.me.friends || []).includes(o.id) && !cache.messages.length
          ? `<div class="chat-form muted small" style="justify-content:center">${esc(o.name.split(' ')[0])} принимает сообщения только от друзей</div>` : chatForm(key)}`;
    }
  }
  const q = S.dq.trim().toLowerCase();
  const items = list.map(c => {
    const k = c.group ? c.id : (c.members.find(m => m !== id) || id), ou = c.group ? null : U(k), me1 = k === id;
    if (!c.group && !ou) return '';
    const name = c.group ? c.name : dialogName(ou, me1);
    if (q && !name.toLowerCase().includes(q) && !(c.lastText || '').toLowerCase().includes(q)) return '';
    const unread = !c.fresh && isUnread(c);
    const prefix = c.lastFrom === id && !me1 ? 'Вы: ' : c.group && c.lastFrom && U(c.lastFrom) ? U(c.lastFrom).name.split(' ')[0] + ': ' : '';
    return `<a class="ditem ${S.chatWith === k ? 'on' : ''}" href="#im/${esc(k)}">${c.group ? roomAvatar(c, 46) : me1 ? `<span class="av fav" style="width:46px;height:46px">★</span>` : avatar(ou, 46, false)}
      <div class="grow"><div class="row" style="gap:6px"><b class="grow" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</b>${c.lastAt ? `<span class="muted small">${ms(c.lastAt) >= startOfDay() ? hm(new Date(ms(c.lastAt))) : dayLabel(c.lastAt)}</span>` : ''}</div>
      <div class="last">${c.fresh ? 'Новый диалог' : esc(prefix + (c.lastText || ''))}</div></div>${unread ? '<span class="dot" aria-label="Непрочитано"></span>' : ''}</a>`;
  }).join('');
  return `${S.chatsError ? errBox(S.chatsError) : ''}<div class="card im ${S.chatWith ? 'open' : ''}">
    <div class="dlist"><div class="dsearch">${I.search}<input id="dq" type="search" placeholder="Поиск по диалогам" autocomplete="off" value="${esc(S.dq)}">
        <button class="icon-btn" data-act="newroom" aria-label="Создать беседу" title="Создать беседу">${I.friends}</button>
        ${cache.chats.some(c => c.id === chatId(id, id)) ? '' : `<a class="icon-btn" href="#im/${esc(id)}" aria-label="Избранное" title="Избранное">★</a>`}</div>
      ${items || `<div class="empty">${q ? 'Ничего не нашли' : 'Диалогов пока нет'}</div>`}</div>
    <div class="chat">${chatHtml}</div></div>`;
}

document.addEventListener('input', e => { if (e.target.id === 'dq') { S.dq = e.target.value; render(); } });

/* ---------- Действия ---------- */
let pickTarget = null;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const stop = e.target.closest('[data-stop]'); if (stop && !stop.contains(b)) return;
  const { act, id } = b.dataset;
  const twoStep = key => { if (S.confirm === key) { S.confirm = null; return true; } S.confirm = key; render(); return false; };
  if (!['delpost', 'unfriend', 'delvideo', 'delalbum', 'delfile', 'delphoto', 'delmsg', 'postmenu', 'block', 'rpost', 'profmenu', 'roomdel', 'roominfo', 'storydel', 'qdel', 'maildel', 'notedel', 'lotdel', 'tdel'].includes(act)) S.confirm = null;
  if (!['selmsg', 'delmsg', 'replymsg', 'playvoice', 'fwdmsg'].includes(act)) S.msgSel = null;
  if (!['profmenu', 'block', 'modopen', 'ban', 'unban', 'report'].includes(act)) S.profMenu = false;
  if (!['postmenu', 'delpost', 'pinpost'].includes(act)) S.postMenu = null;
  if (!['emoji', 'emojis'].includes(act)) S.emoji = null;
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
        const p = findPost(id); if (!p) return;
        const had = (p.likes || []).includes(uid()), nid = `like_${id}_${uid()}`;
        await updateDoc(doc(db, 'posts', id), { likes: had ? arrayRemove(uid()) : arrayUnion(uid()) });
        if (p.authorId !== uid()) { if (had) unnotify(nid); else notify(p.authorId, 'like', id, p.text || (p.poll ? p.poll.q : 'Фото'), nid); }
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
        await deletePostFully(id); toast('Запись удалена'); break;
      }
      case 'clike': {
        const c = (cache.comments.get(b.dataset.post) || []).find(x => x.id === id); if (!c) return;
        await updateDoc(doc(db, 'posts', b.dataset.post, 'comments', id), { likes: (c.likes || []).includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
        break;
      }
      case 'delc': {
        const bt = writeBatch(db);
        bt.delete(doc(db, 'posts', b.dataset.post, 'comments', id));
        bt.update(doc(db, 'posts', b.dataset.post), { commentCount: increment(-1) });
        await bt.commit(); break;
      }
      case 'attach': if (S.draft.files.length >= 4) { toast('Не больше 4 фото в записи'); return; } pick('post', 'image/*', true); break;
      case 'avatar': pick('avatar', 'image/*', false); break;
      case 'pickvideo': pick('video', 'video/*', false); break;
      case 'pickdisk': pick('disk', '', false); break;
      case 'pickphotos': pick('photos', 'image/*', true); break;
      case 'canceldraft': S.videoDraft = null; render(); break;
      case 'linkform': S.linkForm = !S.linkForm; render(); if (S.linkForm) document.getElementById('vlUrl')?.focus(); break;
      case 'copy': await copyText(b.dataset.text); break;
      case 'copylink': await copyText(location.origin + location.pathname + '#video/' + id, 'Ссылка на видео скопирована'); break;
      case 'likevideo': {
        const v = cache.video; if (!v) return;
        await updateDoc(doc(db, 'videos', id), { likes: (v.likes || []).includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
        break;
      }
      case 'delvideo': {
        if (!twoStep('video:' + id)) return;
        const v = cache.video, bt = writeBatch(db); bt.delete(doc(db, 'videos', id)); await bt.commit();
        if (v?.source === 'file' && v.fileId) await deleteFile(v.fileId).catch(console.error);
        toast('Видео удалено'); go('videos/' + uid()); break;
      }
      case 'newalbum': S.newAlbum = !S.newAlbum; render(); if (S.newAlbum) document.getElementById('alTitle')?.focus(); break;
      case 'delalbum': {
        if (!twoStep('album:' + id)) return;
        const ps = await getDocs(query(collection(db, 'photos'), where('albumId', '==', id)));
        const refs = []; ps.docs.forEach(d => { refs.push(d.ref); refs.push(doc(db, 'photoFull', d.id)); });
        for (const c of chunk(refs, 400)) { const bt = writeBatch(db); c.forEach(r => bt.delete(r)); await bt.commit(); }
        const bt = writeBatch(db); bt.delete(doc(db, 'albums', id)); await bt.commit();
        toast('Альбом удалён'); go('albums'); break;
      }
      case 'lightbox': openLightbox(+b.dataset.i); break;
      case 'lbstep': { const n = cache.photos.length; if (n) openLightbox((S.lightbox + Number(b.dataset.d) + n) % n); break; }
      case 'reportclose': S.report = null; render(); break;
      case 'ovclose': S.lightbox = null; S.lightboxImg = null; S.preview = null; S.viewImg = null; render(); break;
      case 'delphoto': {
        if (!twoStep('photo:' + id)) return;
        const a = cache.album, bt = writeBatch(db);
        bt.delete(doc(db, 'photos', id)); bt.delete(doc(db, 'photoFull', id));
        const patch = { count: increment(-1), updatedAt: serverTimestamp() };
        if (a.coverId === id) { const next = cache.photos.find(p => p.id !== id); patch.cover = next ? next.thumb : ''; patch.coverId = next ? next.id : ''; }
        bt.update(doc(db, 'albums', a.id), patch);
        await bt.commit(); S.lightbox = null; S.lightboxImg = null; render(); toast('Фото удалено'); break;
      }
      case 'openfile': {
        const f = cache.files.find(x => x.id === id); if (!f) return;
        const view = /^(image|video|audio)\//.test(f.type || '');
        if (view) { S.preview = { id: f.id, name: f.name, type: f.type, url: null }; render(); }
        else toast('Готовим файл…');
        const url = await getFileUrl(f.id, f.type);
        if (view) { if (S.preview?.id === f.id) { S.preview.url = url; render(); } }
        else { const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
        break;
      }
      case 'delfile': if (!twoStep('file:' + id)) return; await deleteFile(id); toast('Файл удалён'); break;
      case 'linkgoogle': {
        await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
        await auth.currentUser.reload(); S.authUser = auth.currentUser; toast('Google привязан'); render(); break;
      }
      case 'resetpass': await sendPasswordResetEmail(auth, auth.currentUser.email); toast('Письмо для смены пароля отправлено на ' + auth.currentUser.email); break;
      case 'verify': await sendEmailVerification(auth.currentUser); toast('Письмо отправлено на ' + auth.currentUser.email + '. Откройте ссылку и войдите заново.'); break;
      case 'theme': lsSet('vs_theme', b.dataset.v); applyTheme(b.dataset.v); render(); break;
      case 'accent': lsSet('vs_accent', b.dataset.v); applyAccent(b.dataset.v); render(); break;
      case 'pmsg': await updateDoc(doc(db, 'users', uid()), { 'privacy.messages': b.dataset.v }); toast('Сохранено'); break;
      case 'pwall': await updateDoc(doc(db, 'users', uid()), { 'privacy.wall': b.dataset.v }); toast('Сохранено'); break;
      case 'notify':
        if (b.dataset.v === 'on') {
          const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
          lsSet('vs_notify', r === 'granted' ? '1' : '0');
          toast(r === 'granted' ? 'Уведомления включены' : 'Браузер не разрешил уведомления');
        } else { lsSet('vs_notify', '0'); toast('Уведомления выключены'); }
        render(); break;
      case 'selmsg':
        if (e.target.closest('a')) return;
        S.msgSel = S.msgSel === id ? null : id; S.confirm = null; render(); break;
      case 'replymsg': {
        const m = cache.messages.find(x => x.id === id); if (!m) return;
        S.replyTo = { id: m.id, from: m.from, text: (m.text || (m.image ? '📷 Фото' : '')).slice(0, 100) };
        S.msgSel = null; render(); document.getElementById('msgInput')?.focus(); break;
      }
      case 'noreply': S.replyTo = null; render(); break;
      case 'postmenu': S.postMenu = S.postMenu === id ? null : id; S.confirm = null; render(); break;
      case 'pinpost':
        await updateDoc(doc(db, 'users', uid()), { pinned: id || '' });
        S.postMenu = null; toast(id ? 'Запись закреплена' : 'Запись откреплена'); break;
      case 'vote': {
        const p = findPost(id), i = Number(b.dataset.i); if (!p?.poll) return;
        await updateDoc(doc(db, 'posts', id), { [`poll.votes.${uid()}`]: i }); break;
      }
      case 'polltoggle': S.draft.poll = !S.draft.poll; S.draft.pollN = 2; render(); if (S.draft.poll) document.getElementById('pollQ')?.focus(); break;
      case 'polladd': S.draft.pollN = Math.min(6, S.draft.pollN + 1); render(); document.getElementById('pollO' + (S.draft.pollN - 1))?.focus(); break;
      case 'emojis': S.emoji = S.emoji === b.dataset.t ? null : b.dataset.t; render(); break;
      case 'emoji': {
        const el = document.getElementById(b.dataset.t); if (!el) return;
        const at = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? at, em = b.dataset.e;
        el.value = el.value.slice(0, at) + em + el.value.slice(end);
        el.focus(); el.setSelectionRange(at + em.length, at + em.length); break;
      }
      case 'viewimg': {
        const pp = b.dataset.kind === 'post' ? findPost(id) : null, i = Number(b.dataset.i) || 0;
        const src = pp ? (pp.images?.[i] || pp.image) : cache.messages.find(m => m.id === id)?.image;
        if (safeImg(src)) { S.viewImg = src; render(); }
        break;
      }
      case 'delmsg': {
        if (!twoStep('msg:' + id)) return;
        await deleteMessage(id); S.msgSel = null; render(); break;
      }
      case 'msgphoto': pick('msgphoto', 'image/*', false); break;
      case 'mic': await recStart(); break;
      case 'install': if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); } break;
      case 'recsend': recStop(true); break;
      case 'reccancel': recStop(false); break;
      case 'playvoice': { const m = cache.messages.find(x => x.id === id); if (m?.audio) playVoice(m); break; }
      case 'editpost': S.editPost = id || null; render(); if (id) document.getElementById('ep_' + id)?.focus(); break;
      case 'unattach': { const f = S.draft.files.splice(Number(b.dataset.i) || 0, 1)[0]; if (f) URL.revokeObjectURL(f.url); render(); break; }
      case 'noavatar': S.editPhoto = ''; render(); break;
      case 'color': S.editColor = b.dataset.c; render(); break;
      case 'cover': S.editCover = b.dataset.c; render(); break;
      // ---- ВС Музыка
      case 'pickmusic': pick('music', 'audio/*', false); break;
      case 'tplay': playList(cache.tracks || [], Number(b.dataset.i)); break;
      case 'mplay': if (player.audio.src) player.audio.paused ? player.audio.play() : player.audio.pause(); break;
      case 'mnext': playAt(player.i + 1); break;
      case 'mprev': if (player.audio.currentTime > 3) player.audio.currentTime = 0; else playAt(player.i - 1); break;
      case 'mclose': player.audio.pause(); player.queue = []; player.i = -1; render(); break;
      case 'tsave': {
        const has = (S.me.tracks || []).includes(id);
        await updateDoc(doc(db, 'users', uid()), { tracks: has ? arrayRemove(id) : arrayUnion(id) }); toast(has ? 'Убрано из вашей музыки' : 'Добавлено в вашу музыку'); break;
      }
      case 'tdel': {
        if (!twoStep('track:' + id)) return;
        const t = (cache.tracks || []).find(x => x.id === id);
        await deleteDoc(doc(db, 'tracks', id));
        if (t?.ownerId === uid()) await deleteFile(t.fileId).catch(console.error);
        cache.tracks = (cache.tracks || []).filter(x => x.id !== id); toast('Трек удалён'); render(); break;
      }
      // ---- ВС Маркет
      case 'newlot': S.newLot = !S.newLot; S.lotImage = ''; render(); if (S.newLot) document.getElementById('lTitle')?.focus(); break;
      case 'lotphoto': pick('lot', 'image/*', false); break;
      case 'lotsold': await updateDoc(doc(db, 'market', id), { sold: !cache.lot?.sold }); toast(cache.lot?.sold ? 'Снова в продаже' : 'Отмечено как продано'); break;
      case 'lotdel': if (!twoStep('lot:' + id)) return; await deleteDoc(doc(db, 'market', id)); toast('Объявление снято'); go('market'); break;
      case 'viewlot': if (safeImg(cache.lot?.image)) { S.viewImg = cache.lot.image; render(); } break;
      // ---- ВС Ответы
      case 'newq': S.newQ = !S.newQ; render(); if (S.newQ) document.getElementById('qTitle')?.focus(); break;
      case 'alike': {
        const a = cache.answers.find(x => x.id === id); if (!a) return;
        await updateDoc(doc(db, 'questions', S.qId, 'answers', id), { likes: (a.likes || []).includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) }); break;
      }
      case 'abest': {
        const a = cache.answers.find(x => x.id === id); if (!a) return;
        await updateDoc(doc(db, 'questions', S.qId), { bestId: id }); notify(a.authorId, 'best', S.qId, cache.question?.title || ''); toast('Лучший ответ выбран'); break;
      }
      case 'adel': {
        const bt = writeBatch(db); bt.delete(doc(db, 'questions', S.qId, 'answers', id)); bt.update(doc(db, 'questions', S.qId), { answersCount: increment(-1) });
        if (cache.question?.bestId === id && cache.question.authorId === uid()) bt.update(doc(db, 'questions', S.qId), { bestId: '' });
        await bt.commit(); toast('Ответ удалён'); break;
      }
      case 'qdel': {
        if (!twoStep('q:' + id)) return;
        const as = await getDocs(collection(db, 'questions', id, 'answers'));
        for (const c of chunk(as.docs.map(d => d.ref), 400)) { const bt = writeBatch(db); c.forEach(r => bt.delete(r)); await bt.commit(); }
        await deleteDoc(doc(db, 'questions', id)); toast('Вопрос удалён'); go('answers'); break;
      }
      // ---- ВС Почта
      case 'mailreply': {
        const m = cache.mailIn.find(x => x.id === id) || cache.mailOne; if (!m) return;
        const from = U(m.from), quote = m.text.split('\n').map(l => '> ' + l).join('\n');
        S.mailDraft = { to: from?.nick || '', subject: /^re:/i.test(m.subject) ? m.subject : 'Re: ' + (m.subject || ''), text: `\n\n${from?.name || ''} писал(а):\n${quote}`.slice(0, 9000) };
        go('mail/new'); break;
      }
      case 'maildel': {
        if (!twoStep('mail:' + id)) return;
        const m = cache.mailIn.find(x => x.id === id) || cache.mailOut.find(x => x.id === id) || cache.mailOne; if (!m) return;
        const inbox = m.to === uid() && m.from !== uid();
        if (m.from === uid() && m.to === uid()) await deleteDoc(doc(db, 'mail', id)).catch(() => updateDoc(doc(db, 'mail', id), { delTo: true }));
        else if (inbox) await (m.delFrom ? deleteDoc(doc(db, 'mail', id)) : updateDoc(doc(db, 'mail', id), { delTo: true }));
        else await (m.delTo ? deleteDoc(doc(db, 'mail', id)) : updateDoc(doc(db, 'mail', id), { delFrom: true }));
        toast('Письмо удалено'); go(inbox ? 'mail' : 'mail/sent'); break;
      }
      // ---- ВС Заметки
      case 'notenew': S.noteEdit = 'new'; S.noteColor = ''; render(); document.getElementById('nTitle')?.focus(); break;
      case 'noteopen': S.noteEdit = id; S.noteColor = null; render(); window.scrollTo(0, 0); break;
      case 'noteclose': S.noteEdit = null; render(); break;
      case 'notecolor': {
        S.noteColor = b.dataset.c;
        const n = cache.notes.find(x => x.id === S.noteEdit); if (n) n.color = b.dataset.c;
        render(); break;
      }
      case 'notedel': if (!twoStep('note:' + id)) return; await deleteDoc(doc(db, 'notes', id)); S.noteEdit = null; toast('Заметка удалена'); break;
      // ---- ВС Игры
      case 'g2048mv': g2048Move(Number(b.dataset.d)); break;
      case 'g2048new': S.g2048 = g2048New(); render(); break;
      case 'tttnew': S.ttt.b = Array(9).fill(''); render(); break;
      case 'tttmv': {
        const t = S.ttt, i = Number(b.dataset.i); if (!t || t.b[i] || tttWin(t.b)) return;
        t.b[i] = 'X';
        if (!tttWin(t.b)) { const m = tttBest(t.b, 'O'); if (m.i !== undefined) t.b[m.i] = 'O'; }
        const w = tttWin(t.b); if (w === 'X') t.wins++; else if (w === 'O') t.losses++; else if (w === 'draw') t.draws++;
        render(); break;
      }
      case 'ovx': S.newRoom = null; S.fwd = null; S.storyDraft = null; S.giftFor = null; render(); break;
      case 'giftopen': S.giftFor = id; S.giftSel = null; render(); break;
      case 'giftsel': S.giftSel = b.dataset.k; render(); break;
      case 'giftsend': {
        if (!S.giftFor || !S.giftSel) return;
        const to = S.giftFor, gift = S.giftSel, text = (document.getElementById('giftText')?.value || '').trim().slice(0, 200);
        await addDoc(collection(db, 'gifts'), { from: uid(), to, gift, text, createdAt: serverTimestamp() });
        notify(to, 'gift', '', GIFTS[gift][0] + ' ' + GIFTS[gift][1] + (text ? ': ' + text : ''));
        S.giftFor = null; toast('Подарок отправлен ' + GIFTS[gift][0]); render(); break;
      }
      case 'giftdel': await deleteDoc(doc(db, 'gifts', id)); toast('Подарок убран'); break;
      case 'storyadd': pick('story', 'image/*', false); break;
      case 'storypub': {
        if (!S.storyDraft || S.busy) return;
        S.busy = true; render();
        try {
          await addDoc(collection(db, 'stories'), { ownerId: uid(), image: S.storyDraft.image, text: (document.getElementById('stText')?.value || '').trim().slice(0, 200), views: {}, createdAt: serverTimestamp() });
          S.storyDraft = null; toast('История опубликована'); loadStories();
        } finally { S.busy = false; render(); }
        break;
      }
      case 'storyopen': { const { order } = storyOwners(), oi = order.indexOf(id); if (oi < 0) return; S.story = { oi, si: 0 }; storyShow(); break; }
      case 'storystep': storyStep(Number(b.dataset.d)); break;
      case 'storyclose': clearTimeout(storyTimer); S.story = null; render(); break;
      case 'storydel': {
        if (!twoStep('story:' + id)) { clearTimeout(storyTimer); return; }
        await deleteDoc(doc(db, 'stories', id)); cache.stories = cache.stories.filter(x => x.id !== id);
        clearTimeout(storyTimer); S.story = null; toast('История удалена'); render(); break;
      }
      case 'newroom': S.newRoom = { sel: new Set() }; render(); break;
      case 'roompick': { const sel = S.newRoom?.sel; if (!sel) return; sel.has(id) ? sel.delete(id) : sel.add(id); render(); break; }
      case 'roomcreate': {
        const sel = S.newRoom?.sel; if (!sel?.size) return;
        const name = (document.getElementById('nrName')?.value || '').trim() || 'Беседа', ref = doc(collection(db, 'chats')), rid = 'g_' + ref.id;
        await setDoc(doc(db, 'chats', rid), { members: [uid(), ...sel], group: true, name: name.slice(0, 60), ownerId: uid(), lastText: 'Беседа создана', lastFrom: uid(), lastAt: serverTimestamp(), read: { [uid()]: serverTimestamp() } });
        S.newRoom = null; go('im/' + rid); break;
      }
      case 'roominfo': S.roomInfo = !S.roomInfo; render(); break;
      case 'roomkick': await updateDoc(doc(db, 'chats', S.chatWith), { members: arrayRemove(id) }); toast('Участник убран'); break;
      case 'roomadd': await updateDoc(doc(db, 'chats', S.chatWith), { members: arrayUnion(id) }); toast('Участник добавлен'); break;
      case 'roomleave': await updateDoc(doc(db, 'chats', S.chatWith), { members: arrayRemove(uid()) }); toast('Вы вышли из беседы'); go('im'); break;
      case 'roomdel': {
        if (!twoStep('room:' + S.chatWith)) return;
        const rid = S.chatWith, ms2 = await getDocs(query(collection(db, 'chats', rid, 'messages'), limit(450)));
        const bt = writeBatch(db); ms2.docs.filter(d => d.data().from === uid()).forEach(d => bt.delete(d.ref)); bt.delete(doc(db, 'chats', rid));
        await bt.commit(); toast('Беседа удалена'); go('im'); break;
      }
      case 'fwdmsg': S.fwd = cache.messages.find(x => x.id === id) || null; S.msgSel = null; render(); break;
      case 'fwdto': {
        const m = S.fwd; if (!m) return;
        const extra = { fwd: { from: m.fwd?.from || m.from, name: (m.fwd?.name || U(m.from)?.name || '').slice(0, 60), text: (m.fwd?.text || m.text || '').slice(0, 2000) } };
        if (m.audio) { extra.audio = m.audio; extra.dur = m.dur; }
        S.fwd = null; render();
        await sendMessage(b.dataset.k, '', m.image || '', extra); toast('Сообщение переслано'); break;
      }
      case 'profmenu': S.profMenu = !S.profMenu; S.modOpen = false; render(); break;
      case 'modopen': S.modOpen = !S.modOpen; render(); document.getElementById('banReason')?.focus(); break;
      case 'block': {
        if (!twoStep('block:' + id)) return;
        const me = S.me, bt = writeBatch(db), patch = { blocked: arrayUnion(id) };
        if ((me.friends || []).includes(id)) { patch.friends = arrayRemove(id); bt.update(doc(db, 'users', id), { friends: arrayRemove(me.id) }); }
        bt.update(doc(db, 'users', me.id), patch);
        if (cache.incoming.some(r => r.from === id)) bt.delete(doc(db, 'friendRequests', id + '_' + me.id));
        if (cache.outgoing.some(r => r.to === id)) bt.delete(doc(db, 'friendRequests', me.id + '_' + id));
        await bt.commit(); S.profMenu = false; toast('Человек заблокирован'); render(); break;
      }
      case 'unblock': await updateDoc(doc(db, 'users', uid()), { blocked: arrayRemove(id) }); toast('Разблокирован'); break;
      case 'ban': {
        const d = Number(b.dataset.d), reason = (document.getElementById('banReason')?.value || '').trim().slice(0, 300);
        const until = d ? new Date(Date.now() + d * 864e5) : null;
        await banUser(id, until, reason); S.modOpen = false; S.profMenu = false; render(); break;
      }
      case 'unban': await updateDoc(doc(db, 'users', id), { ban: deleteField() }); S.modOpen = false; S.profMenu = false; toast('Блокировка снята'); refreshUser(id); render(); break;
      case 'report': S.report = { type: b.dataset.type, targetId: id, targetUser: b.dataset.user || '', postId: b.dataset.post || '', text: b.dataset.text || '' }; S.postMenu = null; render(); break;
      case 'reportsend': {
        const r = S.report; if (!r) return;
        try {
          await setDoc(doc(db, 'reports', `${r.type}_${r.targetId}_${uid()}`), { from: uid(), type: r.type, targetId: r.targetId, targetUser: r.targetUser, postId: r.postId, reason: b.dataset.r, text: r.text.slice(0, 300), createdAt: serverTimestamp() });
          toast('Жалоба отправлена. Спасибо!');
        } catch (e) { toast(e.code === 'permission-denied' ? 'Вы уже жаловались на это' : errText(e)); }
        S.report = null; render(); break;
      }
      case 'repost': {
        const p = findPost(id); if (!p) return;
        const origId = p.repostOf || p.id, orig = p.repostOf ? (cache.reposted.get(origId) || findPost(origId)) : p;
        const bt = writeBatch(db);
        bt.set(doc(collection(db, 'posts')), { authorId: uid(), wallId: uid(), text: '', image: '', repostOf: origId, likes: [], commentCount: 0, createdAt: serverTimestamp() });
        bt.update(doc(db, 'posts', origId), { reposts: increment(1) });
        await bt.commit();
        if (orig && !orig.missing) notify(orig.authorId, 'repost', origId, orig.text || 'Фото');
        toast('Запись появилась на вашей стене'); break;
      }
      case 'react': {
        const m = cache.messages.find(x => x.id === id); if (!m) return;
        const mine = (m.reacts || {})[uid()];
        await updateDoc(doc(db, 'chats', chatKeyId(S.chatWith), 'messages', id), { [`reacts.${uid()}`]: mine === b.dataset.e ? deleteField() : b.dataset.e });
        S.msgSel = null; render(); break;
      }
      case 'rdel': await deleteDoc(doc(db, 'reports', id)); toast('Жалоба закрыта'); break;
      case 'rpost': {
        const r = cache.reports.find(x => x.id === id); if (!r) return;
        if (!twoStep('rpost:' + id)) return;
        await deletePostFully(r.postId || r.targetId);
        await deleteDoc(doc(db, 'reports', id)); toast('Запись удалена'); break;
      }
      case 'rban': {
        const r = cache.reports.find(x => x.id === id); if (!r?.targetUser) return;
        await banUser(r.targetUser, new Date(Date.now() + 7 * 864e5), 'Жалоба: ' + (REPORT_REASONS[r.reason] || r.reason));
        await deleteDoc(doc(db, 'reports', id)); break;
      }
      case 'newclub': S.newClub = !S.newClub; render(); if (S.newClub) document.getElementById('clName')?.focus(); break;
      case 'sub': case 'unsub': {
        const on = act === 'sub', mine = (S.me.groups || []).includes(id);
        if (on === mine) break;
        const bt = writeBatch(db);
        bt.update(doc(db, 'users', uid()), { groups: on ? arrayUnion(id) : arrayRemove(id) });
        bt.update(doc(db, 'groups', id), { membersCount: increment(on ? 1 : -1) });
        await bt.commit();
        const g = G(id); if (g) g.membersCount = (g.membersCount || 0) + (on ? 1 : -1);
        toast(on ? 'Вы подписались' : 'Вы отписались'); break;
      }
      case 'clubedit': S.clubEdit = !S.clubEdit; S.editGroupPhoto = undefined; S.editGroupCover = null; render(); break;
      case 'gphoto': pick('gphoto', 'image/*', false); break;
      case 'nogphoto': S.editGroupPhoto = ''; render(); break;
      case 'gcover': S.editGroupCover = b.dataset.c; render(); break;
      case 'gunadmin': await updateDoc(doc(db, 'groups', S.clubId), { admins: arrayRemove(id) }); toast('Больше не администратор'); break;
      case 'delclub': {
        if (!twoStep('club:' + id)) return;
        const ps = await getDocs(query(collection(db, 'posts'), where('wallId', '==', id), limit(400)));
        for (const c of chunk(ps.docs.map(d => d.ref), 400)) { const bt = writeBatch(db); c.forEach(r => bt.delete(r)); await bt.commit(); }
        const bt = writeBatch(db); bt.delete(doc(db, 'groups', id));
        if ((S.me.groups || []).includes(id)) bt.update(doc(db, 'users', uid()), { groups: arrayRemove(id) });
        await bt.commit(); cache.groups.delete(id); toast('Сообщество удалено'); go('clubs'); break;
      }
      case 'addfriend': await friendAdd(id); break;
      case 'cancelreq': await friendCancel(id); break;
      case 'accept': await friendAccept(id); break;
      case 'decline': await friendDecline(id); break;
      case 'unfriend': if (!twoStep('unf:' + id)) return; await friendRemove(id); break;
    }
  } catch (err) { console.error(err); toast(errText(err)); }
});

async function deletePostFully(id) {
  const cs = await getDocs(collection(db, 'posts', id, 'comments'));
  const bt = writeBatch(db); cs.docs.slice(0, 480).forEach(d => bt.delete(d.ref)); bt.delete(doc(db, 'posts', id));
  await bt.commit();
}
async function banUser(id, until, reason) {
  await updateDoc(doc(db, 'users', id), { ban: { until: until || null, reason, by: uid(), at: serverTimestamp() } });
  toast(until ? 'Заблокирован до ' + until.toLocaleDateString('ru-RU') : 'Заблокирован навсегда'); refreshUser(id);
}
function refreshUser(id) { cache.users.delete(id); ensureUsers([id]); if (S.view === 'admin') attachView(); }

/* Сообщения */
async function sendMessage(to, text, image = '', extra = {}) {
  const me = uid(), cid = chatKeyId(to), bt = writeBatch(db);
  const msg = { from: me, text, createdAt: serverTimestamp(), ...extra };
  if (image) msg.image = image;
  if (S.replyTo && S.chatWith === to) { msg.replyTo = S.replyTo; S.replyTo = null; }
  bt.set(doc(collection(db, 'chats', cid, 'messages')), msg);
  const last = { lastText: (text || (extra.audio ? '🎤 Голосовое' : extra.fwd ? '↪ Пересланное сообщение' : '📷 Фото')).slice(0, 200), lastFrom: me, lastAt: serverTimestamp(), read: { [me]: serverTimestamp() } };
  bt.set(doc(db, 'chats', cid), isRoom(to) ? last : { members: [me, to].sort(), ...last }, { merge: true });
  await bt.commit();
  const box = app.querySelector('.msgs'); if (box) box.scrollTop = box.scrollHeight;
}
async function deleteMessage(mid) {
  const cid = chatKeyId(S.chatWith), bt = writeBatch(db), list = cache.messages;
  bt.delete(doc(db, 'chats', cid, 'messages', mid));
  // если удаляем последнее сообщение, поправим подпись в списке диалогов
  const chat = cache.chats.find(c => c.id === cid);
  if (list.length && list[list.length - 1].id === mid && chat?.lastFrom === uid()) bt.update(doc(db, 'chats', cid), { lastText: 'Сообщение удалено' });
  await bt.commit(); toast('Сообщение удалено');
}

/* Голосовые сообщения: запись до 1 минуты, хранится в самом сообщении (dataURL) */
const VOICE_MAX = 60, VOICE_BYTES = 500000;
let recorder = null, recChunks = [], recTimer = null, recSend = false;
async function recStart() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Этот браузер не умеет записывать звук'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast('Нет доступа к микрофону. Разрешите его в настройках браузера.'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
  recChunks = []; recSend = false;
  const to = S.chatWith, started = Date.now();
  recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(recTimer);
    const dur = Math.min(VOICE_MAX, (Date.now() - started) / 1000);
    S.rec = null; render();
    if (!recSend) return;
    if (dur < 0.7) { toast('Слишком коротко'); return; }
    const blob = new Blob(recChunks, { type: recorder.mimeType || type || 'audio/webm' });
    if (blob.size > VOICE_BYTES) { toast('Запись получилась слишком большой'); return; }
    const audio = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    try { await sendMessage(to, '', '', { audio: audio.replace(/^data:[^;,]*/, 'data:' + (blob.type.split(';')[0] || 'audio/webm')), dur: Math.round(dur * 10) / 10 }); }
    catch (e) { console.error(e); toast(errText(e)); }
  };
  recorder.start();
  S.rec = { started }; render();
  recTimer = setInterval(() => {
    const sec = (Date.now() - started) / 1000, el = document.getElementById('recTime');
    if (el) el.textContent = fmtDur(sec);
    if (sec >= VOICE_MAX) recStop(true);
  }, 250);
}
function recStop(send) { if (recorder && recorder.state !== 'inactive') { recSend = send; recorder.stop(); } }

// Плеер голосовых живёт вне DOM, поэтому перерисовка страницы его не прерывает
const players = new Map();
function voiceHtml(m) {
  const pl = players.get(m.id), playing = pl && !pl.paused;
  const pct = pl && pl.duration && isFinite(pl.duration) ? pl.currentTime / pl.duration * 100 : 0;
  return `<div class="voice"><button class="voice-btn" data-act="playvoice" data-id="${esc(m.id)}" aria-label="${playing ? 'Пауза' : 'Слушать'}">${playing ? I.pause : I.play}</button>
    <div class="voice-bar"><i data-vbar="${esc(m.id)}" style="width:${pct}%"></i></div><span class="small tnum" data-vtime="${esc(m.id)}">${fmtDur(pl && pct ? pl.currentTime : m.dur)}</span></div>`;
}
function playVoice(m) {
  let pl = players.get(m.id);
  if (!pl) {
    pl = new Audio(m.audio); players.set(m.id, pl);
    const sync = () => {
      const bar = document.querySelector(`[data-vbar="${m.id}"]`), t = document.querySelector(`[data-vtime="${m.id}"]`);
      const d = isFinite(pl.duration) && pl.duration ? pl.duration : m.dur;
      if (bar) bar.style.width = (pl.currentTime / d * 100) + '%';
      if (t) t.textContent = fmtDur(pl.currentTime || m.dur);
    };
    pl.ontimeupdate = sync;
    pl.onplay = pl.onpause = render;
    pl.onended = () => { pl.currentTime = 0; render(); };
    pl.onerror = () => toast('Не получилось воспроизвести запись в этом браузере');
  }
  players.forEach((p, id) => { if (id !== m.id && !p.paused) p.pause(); });
  if (pl.paused) pl.play().catch(e => console.error(e)); else pl.pause();
}

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
  notify(from, 'friend');
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

function pick(target, accept, multiple) {
  pickTarget = target;
  const el = document.getElementById('filePick');
  el.accept = accept; el.multiple = multiple; el.click();
}

async function openLightbox(i) {
  const p = cache.photos[i]; if (!p) return;
  S.lightbox = i; S.lightboxImg = null; render();
  try { const s = await getDoc(doc(db, 'photoFull', p.id)); if (S.lightbox === i && s.exists()) { S.lightboxImg = s.data().image; render(); } }
  catch (e) { console.error(e); }
}
document.addEventListener('keydown', e => {
  if (S.story) { if (e.key === 'Escape') { clearTimeout(storyTimer); S.story = null; render(); } else if (e.key === 'ArrowRight') storyStep(1); else if (e.key === 'ArrowLeft') storyStep(-1); return; }
  if (S.lightbox === null && !S.preview && !S.viewImg) return;
  if (e.key === 'Escape') { S.lightbox = null; S.lightboxImg = null; S.preview = null; S.viewImg = null; render(); }
  else if (S.lightbox !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const n = cache.photos.length; openLightbox((S.lightbox + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
  }
});

async function uploadPhotos(files) {
  const a = cache.album; if (!a || a.ownerId !== uid() || S.upload) return;
  let done = 0, coverSet = !!a.coverId;
  for (const f of files) {
    setUpload(`Загружаем фото ${done + 1} из ${files.length}`, done / files.length);
    try {
      const thumb = await compress(f, 400, 60000, true), image = await compress(f, 1600, MAX_POST_IMG);
      const ref = doc(collection(db, 'photos')), bt = writeBatch(db);
      bt.set(ref, { ownerId: uid(), albumId: a.id, thumb, createdAt: serverTimestamp() });
      bt.set(doc(db, 'photoFull', ref.id), { ownerId: uid(), image });
      const patch = { count: increment(1), updatedAt: serverTimestamp() };
      if (!coverSet) { patch.cover = thumb; patch.coverId = ref.id; coverSet = true; }
      bt.update(doc(db, 'albums', a.id), patch);
      await bt.commit(); done++;
    } catch (err) { console.error(err); toast('Не получилось загрузить ' + f.name); }
  }
  setUpload(null);
  toast(`Загружено ${done} фото`);
}

document.getElementById('filePick').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  const f = files[0];
  try {
    if (pickTarget === 'avatar') { S.editPhoto = await compress(f, 256, MAX_AVATAR, true); render(); }
    else if (pickTarget === 'post') {
      const room = 4 - S.draft.files.length;
      files.filter(x => (x.type || '').startsWith('image/')).slice(0, room).forEach(x => S.draft.files.push({ file: x, url: URL.createObjectURL(x) }));
      if (files.length > room) toast('Не больше 4 фото в записи');
      render();
    }
    else if (pickTarget === 'photos') await uploadPhotos(files);
    else if (pickTarget === 'lot') { S.lotImage = await compress(f, 1080, 420000); render(); }
    else if (pickTarget === 'music') await uploadTrack(f);
    else if (pickTarget === 'story') { S.storyDraft = { image: await compress(f, 1080, 420000) }; render(); document.getElementById('stText')?.focus(); }
    else if (pickTarget === 'gphoto') { S.editGroupPhoto = await compress(f, 256, MAX_AVATAR, true); render(); }
    else if (pickTarget === 'msgphoto') {
      if (!S.chatWith || S.busy) return;
      S.busy = true; render();
      try { await sendMessage(S.chatWith, '', await compress(f, 1280, MAX_MSG_IMG)); } finally { S.busy = false; render(); }
    }
    else if (pickTarget === 'video') {
      if (!(f.type || '').startsWith('video/')) { toast('Выберите видеофайл'); return; }
      if (f.size > LIMITS.video) { toast(`Видео весит ${fmtSize(f.size)}, а можно до ${fmtSize(LIMITS.video)}. Добавьте его ссылкой с YouTube, Rutube или VK.`); return; }
      toast('Готовим видео…');
      const m = await videoMeta(f);
      S.videoDraft = { file: f, thumb: m.thumb, duration: m.duration, title: f.name.replace(/\.[^.]+$/, '').slice(0, 120) };
      S.linkForm = false; render();
    } else if (pickTarget === 'disk') {
      if (S.upload) return;
      if (f.size > LIMITS.disk) { toast(`Файл весит ${fmtSize(f.size)}, а можно до ${fmtSize(LIMITS.disk)}`); return; }
      await putFile(f, 'disk', `Загружаем «${f.name}»`); toast('Файл загружен');
    }
  } catch (err) {
    console.error(err); setUpload(null);
    toast(err.message === 'too-big' ? 'Фото слишком большое даже после сжатия. Выберите другое.' : err.code ? errText(err) : 'Не получилось открыть файл.');
  }
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
      case 'videolink': {
        const p = parseVideoLink(v('vlUrl'));
        if (!p) { toast('Не узнали ссылку. Подходят YouTube, Rutube, VK Видео или прямая ссылка на .mp4'); return; }
        const ref = await addDoc(collection(db, 'videos'), { ownerId: uid(), title: v('vlTitle'), description: '', source: 'link', provider: p.provider, vid: p.vid, likes: [], createdAt: serverTimestamp() });
        S.linkForm = false; toast('Видео добавлено'); go('video/' + ref.id); break;
      }
      case 'videofile': {
        const d = S.videoDraft; if (!d || S.upload) return;
        const title = v('vfTitle'), description = v('vfDesc');
        const fileId = await putFile(d.file, 'video', 'Загружаем видео');
        const ref = await addDoc(collection(db, 'videos'), { ownerId: uid(), title, description, source: 'file', fileId, type: d.file.type || 'video/mp4', thumb: d.thumb, duration: d.duration, size: d.file.size, likes: [], createdAt: serverTimestamp() });
        S.videoDraft = null; toast('Видео опубликовано'); go('video/' + ref.id); break;
      }
      case 'album': {
        const ref = await addDoc(collection(db, 'albums'), { ownerId: uid(), title: v('alTitle'), count: 0, cover: '', coverId: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        S.newAlbum = false; go('album/' + ref.id); break;
      }
      case 'setpass': {
        const u = auth.currentUser;
        await linkWithCredential(u, EmailAuthProvider.credential(u.email, document.getElementById('spPass').value));
        await u.reload(); S.authUser = auth.currentUser; toast('Пароль установлен. Теперь можно входить и по почте.'); render(); break;
      }
      case 'post': {
        const text = v('postText'), d = S.draft, wall = f.dataset.wall;
        let poll = null;
        if (d.poll) {
          const options = Array.from({ length: d.pollN }, (_, i) => v('pollO' + i)).filter(Boolean);
          if (options.length < 2) { toast('В опросе нужно хотя бы два варианта'); return; }
          poll = { q: v('pollQ') || 'Опрос', options, votes: {} };
        }
        if (!text && !d.files.length && !poll) { toast('Напишите текст или прикрепите фото'); return; }
        if (S.busy) return;
        S.busy = true; render();
        try {
          // одно фото — крупнее, несколько — каждое меньше, чтобы запись влезла в 1 МБ
          const n = d.files.length, imgs = [];
          for (const x of d.files) imgs.push(await compress(x.file, n > 1 ? 1080 : 1280, n > 1 ? Math.floor(880000 / n) : MAX_POST_IMG));
          const post = { authorId: uid(), wallId: wall, text, image: n === 1 ? imgs[0] : '', likes: [], commentCount: 0, createdAt: serverTimestamp() };
          if (n > 1) post.images = imgs;
          const tags = extractTags(text); if (tags.length) post.tags = tags;
          if (poll) post.poll = poll;
          if (f.dataset.group) post.groupId = wall;
          const ref = await addDoc(collection(db, 'posts'), post);
          if (wall !== uid() && !f.dataset.group) notify(wall, 'wall', ref.id, text || (poll ? poll.q : 'Фото'));
          notifyMentions(text, ref.id, [uid(), wall]);
          d.files.forEach(x => URL.revokeObjectURL(x.url));
          S.draft = { files: [], poll: false, pollN: 2 }; S.emoji = null;
          ['postText', 'pollQ', 'pollO0', 'pollO1', 'pollO2', 'pollO3', 'pollO4', 'pollO5'].forEach(clear); toast('Опубликовано');
        } catch (err) { toast(err.message === 'too-big' ? 'Фото слишком большое даже после сжатия' : errText(err)); }
        finally { S.busy = false; render(); }
        break;
      }
      case 'comment': {
        const pid = f.dataset.post, text = v('c_' + pid); if (!text) return;
        clear('c_' + pid);
        const bt = writeBatch(db);
        bt.set(doc(collection(db, 'posts', pid, 'comments')), { authorId: uid(), text, createdAt: serverTimestamp() });
        bt.update(doc(db, 'posts', pid), { commentCount: increment(1) });
        await bt.commit();
        const p = findPost(pid); if (p) notify(p.authorId, 'comment', pid, text);
        notifyMentions(text, pid, [uid(), p?.authorId]);
        break;
      }
      case 'msg': {
        const text = v('msgInput'); if (!text) return;
        clear('msgInput'); S.emoji = null;
        await sendMessage(f.dataset.to, text);
        break;
      }
      case 'lot': {
        const title = v('lTitle'); if (title.length < 2 || S.busy) return;
        S.busy = true; render();
        try {
          const ref = await addDoc(collection(db, 'market'), { ownerId: uid(), title: title.slice(0, 100), price: Math.max(0, Math.min(1e9, Math.round(Number(v('lPrice')) || 0))),
            category: document.getElementById('lCat').value, city: v('lCity').slice(0, 40), text: (document.getElementById('lText')?.value || '').trim().slice(0, 3000), image: S.lotImage || '', sold: false, createdAt: serverTimestamp() });
          S.newLot = false; S.lotImage = ''; toast('Объявление опубликовано'); go('lot/' + ref.id);
        } finally { S.busy = false; render(); }
        break;
      }
      case 'question': {
        const title = v('qTitle'); if (title.length < 5) { toast('Вопрос слишком короткий'); return; }
        const ref = await addDoc(collection(db, 'questions'), { authorId: uid(), title: title.slice(0, 150), text: v('qText').slice(0, 2000), category: document.getElementById('qCat').value, answersCount: 0, bestId: '', createdAt: serverTimestamp() });
        S.newQ = false; toast('Вопрос опубликован'); go('q/' + ref.id); break;
      }
      case 'answer': {
        const text = v('aText'), q = cache.question; if (!text || !q) return;
        const bt = writeBatch(db);
        bt.set(doc(collection(db, 'questions', q.id, 'answers')), { authorId: uid(), text: text.slice(0, 3000), likes: [], createdAt: serverTimestamp() });
        bt.update(doc(db, 'questions', q.id), { answersCount: increment(1) });
        await bt.commit(); clear('aText'); notify(q.authorId, 'answer', q.id, text); toast('Ответ опубликован'); break;
      }
      case 'mail': {
        const nick = v('mTo').toLowerCase().replace(/^@/, '').replace(/@vsmske$/, ''), text = v('mText');
        if (!nick || !text || S.busy) return;
        const u2 = await getDoc(doc(db, 'usernames', nick));
        if (!u2.exists()) { toast('Нет пользователя с адресом ' + nick + '@vsmske'); return; }
        S.busy = true; render();
        try {
          const to = u2.data().uid;
          await addDoc(collection(db, 'mail'), { from: uid(), to, subject: v('mSubj').slice(0, 200), text: text.slice(0, 10000), read: to === uid(), delFrom: false, delTo: false, createdAt: serverTimestamp() });
          S.mailDraft = null; ['mTo', 'mSubj', 'mText'].forEach(clear); toast('Письмо отправлено'); go('mail/sent');
        } finally { S.busy = false; render(); }
        break;
      }
      case 'note': {
        const id = f.dataset.id, n = id ? cache.notes.find(x => x.id === id) : null;
        const color = S.noteColor ?? n?.color ?? '';
        const body = { ownerId: uid(), title: v('nTitle').slice(0, 120), text: (document.getElementById('nText')?.value || '').slice(0, 20000), color, pinned: !!document.getElementById('nPin')?.checked, updatedAt: serverTimestamp() };
        if (!body.title && !body.text.trim()) { toast('Заметка пустая'); return; }
        if (id) await setDoc(doc(db, 'notes', id), body); else await addDoc(collection(db, 'notes'), body);
        S.noteEdit = null; S.noteColor = null; toast('Сохранено'); render(); break;
      }
      case 'wx': { const c = v('wxCity'); if (c) await loadWeather(c); break; }
      case 'roomname': { const n = v('rmName'); if (n) { await updateDoc(doc(db, 'chats', S.chatWith), { name: n.slice(0, 60) }); toast('Беседа переименована'); } break; }
      case 'club': {
        const name = v('clName'); if (!name || S.busy) return;
        S.busy = true; render();
        try {
          const ref = doc(collection(db, 'groups')), bt = writeBatch(db);
          bt.set(ref, { name, about: v('clAbout'), photo: '', cover: Object.keys(COVERS)[Math.floor(Math.random() * 6)], ownerId: uid(), admins: [uid()], membersCount: 1, createdAt: serverTimestamp() });
          bt.update(doc(db, 'users', uid()), { groups: arrayUnion(ref.id) });
          await bt.commit(); S.newClub = false; toast('Сообщество создано'); go('club/' + ref.id);
        } finally { S.busy = false; render(); }
        break;
      }
      case 'clubedit': {
        const g = G(S.clubId); if (!g) return;
        await updateDoc(doc(db, 'groups', g.id), { name: v('geName'), about: v('geAbout'),
          photo: S.editGroupPhoto === undefined ? (g.photo || '') : S.editGroupPhoto, cover: S.editGroupCover || g.cover || 'blue' });
        S.clubEdit = false; S.editGroupPhoto = undefined; S.editGroupCover = null; toast('Сохранено'); render(); break;
      }
      case 'gadmin': {
        const nick = v('gaNick').toLowerCase().replace(/^@/, ''); if (!nick) return;
        const s2 = await getDoc(doc(db, 'usernames', nick));
        if (!s2.exists()) { toast('Нет человека с таким коротким именем'); return; }
        await updateDoc(doc(db, 'groups', S.clubId), { admins: arrayUnion(s2.data().uid) });
        clear('gaNick'); toast('Администратор добавлен'); break;
      }
      case 'editpost': {
        const pid = f.dataset.id, text = v('ep_' + pid);
        const p = findPost(pid);
        if (!text && !p?.image && !p?.images && !p?.poll && !p?.repostOf) { toast('Запись не может быть пустой'); return; }
        await updateDoc(doc(db, 'posts', pid), { text, tags: extractTags(text), editedAt: serverTimestamp() });
        S.editPost = null; render(); toast('Запись изменена'); break;
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
            name, nick, city, status: v('eStatus'), about: v('eAbout'), color: S.editColor || me.color, cover: S.editCover || me.cover || 'blue',
            photo: S.editPhoto === undefined ? (me.photo || '') : S.editPhoto, search: buildSearch(name, nick, city),
            bday: /^\d{4}-\d{2}-\d{2}$/.test(v('eBday')) ? v('eBday') : '',
          });
          await bt.commit(); S.editColor = null; S.editCover = null; S.editPhoto = undefined; toast('Сохранено'); go('id/' + me.id);
        } finally { S.busy = false; render(); }
        break;
      }
    }
  } catch (err) { console.error(err); toast(errText(err)); }
});

// Обновляем «5 мин назад» раз в минуту
setInterval(() => { if (S.phase === 'app' && !document.activeElement?.matches?.('input,textarea')) render(); }, 60000);
