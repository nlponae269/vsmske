/* ==========================================================================
   VСмске — социальная сеть на Firebase (Auth + Firestore).
   Хостинг: Firebase Hosting. Фото сжимаются в браузере и хранятся в Firestore.
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
  getDoc, getDocs, addDoc, setDoc, updateDoc, onSnapshot, writeBatch,
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
const CHUNK = 700000;                                   // символов base64 в одном куске (кратно 4)
const LIMITS = { disk: 10 * 1024 * 1024, video: 20 * 1024 * 1024 };
const VERSION = '1.2';

/* ---------- Тема ---------- */
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(lsGet('vs_theme'));

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
    'permission-denied':'Нет доступа. Проверьте, что правила Firestore опубликованы (firebase deploy).',
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
  video:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
  album:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>',
  disk:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/></svg>',
  vid:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round"/></svg>',
  gear:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
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
  draft: { text: '', image: '' }, editColor: null, editPhoto: undefined, busy: false,
  upload: null, videoDraft: null, linkForm: false, videoOwner: null, watchId: null, videoSrc: null, videoErr: null,
  albumsOwner: null, albumId: null, lightbox: null, lightboxImg: null, preview: null, newAlbum: false,
};
const cache = {
  users: new Map(), feed: new Map(), wall: [], comments: new Map(),
  chats: [], messages: [], incoming: [], outgoing: [], people: [],
  videos: [], video: null, albums: [], album: null, photos: [], files: [],
};
let globalUnsubs = [], viewUnsubs = [], commentUnsubs = new Map(), routedOnce = false;
const uid = () => S.authUser?.uid;
const app = document.getElementById('app');

function stopAll() {
  globalUnsubs.forEach(u => u()); globalUnsubs = [];
  clearView(); routedOnce = false;
  Object.assign(cache, { users: new Map(), feed: new Map(), wall: [], comments: new Map(), chats: [], messages: [], incoming: [], outgoing: [], people: [],
    videos: [], video: null, albums: [], album: null, photos: [], files: [] });
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
  else if (v === 'video' && arg) { S.view = 'watch'; S.watchId = arg; }
  else if (v === 'video') { S.view = 'video'; S.videoOwner = null; }
  else if (v === 'videos') { S.view = 'video'; S.videoOwner = arg || uid(); }
  else if (v === 'albums') { S.view = 'albums'; S.albumsOwner = arg || uid(); }
  else if (v === 'album' && arg) { S.view = 'album'; S.albumId = arg; }
  else if (['feed', 'friends', 'people', 'edit', 'disk', 'vid', 'settings', 'more'].includes(v)) S.view = v;
  else S.view = 'feed';
  if (S.view !== 'edit') { S.editColor = null; S.editPhoto = undefined; }
  if (S.view !== 'watch') { S.videoSrc = null; S.videoErr = null; }
  S.lightbox = null; S.lightboxImg = null; S.preview = null; S.linkForm = false; S.newAlbum = false;
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
  } else if (S.view === 'disk') {
    cache.files = [];
    viewUnsubs.push(onSnapshot(query(collection(db, 'files'), where('ownerId', '==', id), where('kind', '==', 'disk'), limit(500)), s => {
      cache.files = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); S.loading = false; render();
    }, onViewErr));
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

const playerKey = () => { const v = cache.video; return `${S.watchId}:${v ? (v.missing ? 'x' : v.source) : '-'}:${S.videoSrc ? 1 : 0}:${S.videoErr ? 1 : 0}`; };
function render() {
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

function navHtml() {
  const me = S.me, unread = cache.chats.filter(isUnread).length, reqs = cache.incoming.length;
  const groups = { video: ['video', 'watch'], albums: ['albums', 'album'] };
  const on = v => (groups[v] ? groups[v].includes(S.view) : S.view === v) && (v !== 'profile' || S.profileId === me.id) ? 'on' : '';
  const nav = (v, href, icon, label, badge = 0, cls = '') => `<a class="navlink ${on(v)} ${cls}" href="#${href}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const moreOn = ['more', 'profile', 'people', 'albums', 'album', 'disk', 'vid', 'settings', 'edit'].includes(S.view) ? 'on' : '';
  return `<nav class="nav">
      ${nav('profile', 'id/' + me.id, I.home, 'Моя страница', 0, 'm-hide')}
      ${nav('feed', 'feed', I.feed, 'Новости')}
      ${nav('messages', 'im', I.msg, 'Сообщения', unread)}
      ${nav('friends', 'friends', I.friends, 'Друзья', reqs)}
      ${nav('people', 'people', I.people, 'Люди', 0, 'm-hide')}
      ${nav('video', 'video', I.video, 'Видео')}
      ${nav('albums', 'albums', I.album, 'Альбомы', 0, 'm-hide')}
      ${nav('disk', 'disk', I.disk, 'Диск', 0, 'm-hide')}
      <a class="navlink m-only ${moreOn}" href="#more">${I.more}<span>Ещё</span></a>
      <hr>
      ${nav('vid', 'vid', I.vid, 'VС ID', 0, 'm-hide sub')}
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
  else main = viewFeed();
  const up = S.upload ? `<div class="card pad upbar" role="status"><div class="row"><span class="grow">${esc(S.upload.label)}</span><b class="tnum">${Math.round(S.upload.pct * 100)}%</b></div><div class="bar"><i style="width:${Math.round(S.upload.pct * 100)}%"></i></div><div class="hint">Не закрывайте страницу до конца загрузки</div></div>` : '';
  return `
  <header class="top"><div class="top-in">
    <a class="logo" href="#feed" aria-label="VСмске, новости"><span class="logo-mark">VС</span><span class="logo-word" style="color:var(--fg)">VСмске</span></a>
    <form class="search" data-form="search">${I.search}<input id="q" type="search" placeholder="Поиск людей" autocomplete="off" value="${esc(S.view === 'people' ? S.query : '')}"></form>
    <a class="top-me" href="#id/${esc(me.id)}" style="color:var(--fg)">${avatar(me, 32, false)}<span>${esc(me.name.split(' ')[0])}</span></a>
  </div></header>
  <div class="wrap">
    ${navHtml()}
    <main>${up}${main}</main>
  </div>
  ${overlay()}`;
}

/* ---------- Окна поверх страницы: просмотр фото и файлов ---------- */
function overlay() {
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
      ${own ? `<button class="btn ${S.confirm === 'video:' + v.id ? 'danger' : 'ghost'} small" data-act="delvideo" data-id="${esc(v.id)}">${S.confirm === 'video:' + v.id ? 'Удалить видео?' : 'Удалить'}</button>` : ''}</div>
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
      <p class="hint" style="margin:0">Сохраняется на этом устройстве.</p></div>
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
      ${item('people', I.people, 'Люди', 'Поиск и новые пользователи')}
      ${item('albums', I.album, 'ВС Альбомы', 'Ваши фотографии')}
      ${item('disk', I.disk, 'ВС Диск', 'Личные файлы')}
      ${item('videos/' + me.id, I.video, 'Мои видео')}
    </div>
    <div class="card ulist">
      ${item('vid', I.vid, 'VС ID', 'Вход, почта, пароль')}
      ${item('settings', I.gear, 'Настройки', 'Тема и приватность')}
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
      ${own || (isFriend && (u.privacy?.wall || 'friends') !== 'me') ? composer(u.id, own ? 'Что у вас нового?' : 'Написать на стене у ' + u.name.split(' ')[0]) : ''}
      <div class="card pad" style="padding-block:12px"><b>${own ? 'Мои записи' : 'Стена'}</b> <span class="muted">${posts.length}</span></div>
      ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') : `<div class="card empty">${own ? 'Напишите первую запись: её увидят ваши друзья.' : 'На стене пока нет записей'}</div>`}
    </div>
    <div>
      <div class="card pad"><div class="row"><b class="grow">Друзья</b><span class="muted small">${friendIds.length}</span></div>
        ${friends.length ? `<div class="fgrid">${friends.map(f => `<a href="#id/${esc(f.id)}" style="color:var(--fg);display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;min-width:0">${avatar(f, 52, false)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(f.name.split(' ')[0])}</span></a>`).join('')}</div>`
          : `<p class="muted small" style="margin:8px 0 0">${own ? 'Найдите знакомых в разделе «Люди»' : 'Пока никого'}</p>`}
      </div>
      <div class="card ulist">
        <a class="uitem setlink" href="#albums/${esc(u.id)}"><span class="ficon">${I.album}</span><span class="grow">Фотоальбомы</span>›</a>
        <a class="uitem setlink" href="#videos/${esc(u.id)}"><span class="ficon">${I.video}</span><span class="grow">Видео</span>›</a>
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
      ${o.deleted ? '' : o.privacy?.messages === 'friends' && !(S.me.friends || []).includes(o.id) && !cache.messages.length
        ? `<div class="chat-form muted small" style="justify-content:center">${esc(o.name.split(' ')[0])} принимает сообщения только от друзей</div>` : `<form class="chat-form" data-form="msg" data-to="${esc(o.id)}"><input id="msgInput" placeholder="Сообщение" maxlength="2000" autocomplete="off"><button class="btn" aria-label="Отправить">${I.send}</button></form>`}`;
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
  const stop = e.target.closest('[data-stop]'); if (stop && !stop.contains(b)) return;
  const { act, id } = b.dataset;
  const twoStep = key => { if (S.confirm === key) { S.confirm = null; return true; } S.confirm = key; render(); return false; };
  if (!['delpost', 'unfriend', 'delvideo', 'delalbum', 'delfile', 'delphoto'].includes(act)) S.confirm = null;
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
      case 'attach': pick('post', 'image/*', false); break;
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
      case 'ovclose': S.lightbox = null; S.lightboxImg = null; S.preview = null; render(); break;
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
      case 'pmsg': await updateDoc(doc(db, 'users', uid()), { 'privacy.messages': b.dataset.v }); toast('Сохранено'); break;
      case 'pwall': await updateDoc(doc(db, 'users', uid()), { 'privacy.wall': b.dataset.v }); toast('Сохранено'); break;
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
  if (S.lightbox === null && !S.preview) return;
  if (e.key === 'Escape') { S.lightbox = null; S.lightboxImg = null; S.preview = null; render(); }
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
    else if (pickTarget === 'post') { S.draft.image = await compress(f, 1280, MAX_POST_IMG); render(); }
    else if (pickTarget === 'photos') await uploadPhotos(files);
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
