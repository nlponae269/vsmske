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
  blue: 'linear-gradient(135deg,#6C4DFF,#B25CC0 60%,#FF6B57)', sunset: 'linear-gradient(135deg,#F2994A,#D0462F 55%,#B4398F)',
  sea: 'linear-gradient(135deg,#1F8A5B,#2B8BB5)', night: 'linear-gradient(135deg,#141A33,#4E5B76)',
  rose: 'linear-gradient(135deg,#B4398F,#F06C9B)', gold: 'linear-gradient(135deg,#C98A12,#F2C94C)',
};
const COLORS = ['#2F44D0','#D0462F','#1F8A5B','#B4398F','#C98A12','#2B8BB5','#6A47C9','#4E5B76'];
const NICK_RE = /^[a-z0-9._]{4,30}$/, NICK_ANY = /^[a-z0-9._]{1,30}$/;   // 1–3 символа — только админам и коллекционные
const NICK_MSG = 'Короткое имя: от 4 до 30 символов, латиница, цифры, точка и _. Имена короче — коллекционные, их выдаёт администрация.';
const nickUid = new Map();   // @ник → uid, чтобы адрес #@ник открывался без лишних запросов
const pageUrl = u => location.origin + location.pathname + (u?.nick ? '#@' + u.nick : '#id/' + u?.id);
const MAX_POST_IMG = 700000;   // символов dataURL (~520 КБ), лимит документа Firestore — 1 МБ
const MAX_AVATAR = 120000;
const CHUNK = 700000;                                   // символов base64 в одном куске (кратно 4)
const LIMITS = { disk: 10 * 1024 * 1024, video: 20 * 1024 * 1024, music: 12 * 1024 * 1024 };
const VERSION = '4.0';
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
const ACCENTS = [['blue', 'Фирменный', '#6C4DFF'], ['violet', 'Фиолетовый', '#6A47C9'], ['green', 'Зелёный', '#1F8A5B'], ['orange', 'Оранжевый', '#D9641E'], ['pink', 'Розовый', '#C2357A']];
function applyAccent(a) { if (a && a !== 'blue') document.documentElement.dataset.accent = a; else delete document.documentElement.dataset.accent; }
applyAccent(lsGet('vs_accent'));
if (lsGet('vs_anim') === 'off') document.documentElement.dataset.anim = 'off';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Текст с кликабельными ссылками (всё остальное экранируется)
const TAG_RE = /(#[\p{L}\d_]{2,30})/u;
// @ник → ссылка на профиль (но не внутри почтового адреса вроде a@b.ru)
const mentionify = t => {
  const parts = t.split(/(@[a-zA-Z0-9._]{3,30})/);
  return parts.map((x, i) => i % 2 && !/[a-zA-Z0-9._]$/.test(parts[i - 1]) ? `<a class="tag" href="#@${encodeURIComponent(x.slice(1).toLowerCase())}">${esc(x)}</a>` : esc(x)).join('');
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
// Фильтры для фото: попиксельно (ctx.filter работает не во всех браузерах)
const PHOTO_FILTERS = { none: 'Без фильтра', bw: 'Ч/Б', sepia: 'Сепия', warm: 'Тёплый', cool: 'Холодный', bright: 'Ярче', vivid: 'Сочный' };
const FILTER_CSS = { none: 'none', bw: 'grayscale(1)', sepia: 'sepia(.85)', warm: 'sepia(.25) saturate(1.3) hue-rotate(-10deg)', cool: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)', bright: 'brightness(1.18) contrast(1.05)', vivid: 'saturate(1.6) contrast(1.1)' };
function applyFilter(ctx, w, h, f) {
  if (!f || f === 'none') return;
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], g = p[i + 1], b = p[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (f === 'bw') r = g = b = y;
    else if (f === 'sepia') { r = y * 1.07 + 30; g = y * 0.95 + 12; b = y * 0.78; }
    else if (f === 'warm') { r = r * 1.08 + 10; g = g * 1.02; b = b * 0.88; }
    else if (f === 'cool') { r = r * 0.9; g = g * 1.0; b = b * 1.1 + 10; }
    else if (f === 'bright') { r = r * 1.15 + 8; g = g * 1.15 + 8; b = b * 1.15 + 8; }
    else if (f === 'vivid') { r = y + (r - y) * 1.6; g = y + (g - y) * 1.6; b = y + (b - y) * 1.6; r = (r - 128) * 1.1 + 128; g = (g - 128) * 1.1 + 128; b = (b - 128) * 1.1 + 128; }
    p[i] = r < 0 ? 0 : r > 255 ? 255 : r; p[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; p[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(d, 0, 0);
}
async function compress(file, maxSide, maxLen, square = false, filter = 'none') {
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
    applyFilter(ctx, c.width, c.height, filter);
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
// Аватар: только загруженное фото или фото из Google (а не ссылка на чужой сервер)
const safePhoto = s => typeof s === 'string' && (/^data:image\/(jpeg|png|webp|gif);base64,/.test(s) || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(s)) ? s : '';
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

/* Иконки 4.0 — «дуотон»: полупрозрачная заливка + мягкие скруглённые линии */
const ic = (w, body) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const du = d => `<path d="${d}" fill="currentColor" fill-opacity=".2" stroke="none"/>`;   // заливка-подложка
const I = {
  video: ic(20, du('M5.5 5h13a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z') + '<path d="M5.5 5h13a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"/><path d="M10.2 9.2v5.6l4.8-2.8z" fill="currentColor"/>'),
  album: ic(20, '<path d="M7 3.5h11a2.5 2.5 0 0 1 2.5 2.5v11"/>' + du('M5 6.5h10a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 19V9A2.5 2.5 0 0 1 5 6.5z') + '<rect x="2.5" y="6.5" width="15" height="15" rx="2.5"/><path d="M2.8 18l4.2-4 3 3 2.5-2.2 4.8 4.4"/><circle cx="12.5" cy="10.8" r="1.2"/>'),
  disk: ic(20, du('M7 19h10.5a4.5 4.5 0 0 0 .6-9A6.5 6.5 0 0 0 5.6 11.4 3.8 3.8 0 0 0 7 19z') + '<path d="M7 19h10.5a4.5 4.5 0 0 0 .6-9A6.5 6.5 0 0 0 5.6 11.4 3.8 3.8 0 0 0 7 19z"/><path d="M12 16v-5M9.8 13l2.2-2.2 2.2 2.2"/>'),
  vid: ic(20, du('M12 2.8l7.5 3v6.1c0 4.6-3.2 8-7.5 9.3-4.3-1.3-7.5-4.7-7.5-9.3V5.8z') + '<path d="M12 2.8l7.5 3v6.1c0 4.6-3.2 8-7.5 9.3-4.3-1.3-7.5-4.7-7.5-9.3V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>'),
  gear: ic(20, '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h3M11 12h9"/>' + du('M15 4.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9 14.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9 9.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z') + '<circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/><circle cx="9" cy="12" r="2.2"/>'),
  poll: ic(20, '<rect x="3.5" y="11" width="4" height="9" rx="2" fill="currentColor" fill-opacity=".2"/><rect x="10" y="4" width="4" height="16" rx="2" fill="currentColor" fill-opacity=".2"/><rect x="16.5" y="8" width="4" height="12" rx="2" fill="currentColor" fill-opacity=".2"/>'),
  eye: ic(20, du('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z') + '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".35"/>'),
  down: ic(22, '<path d="M6.5 9.5l5.5 5.5 5.5-5.5" stroke-width="2.2"/>'),
  repeat: ic(20, '<path d="M4 11.5V10a4 4 0 0 1 4-4h11"/><path d="M16 3l3 3-3 3"/><path d="M20 12.5V14a4 4 0 0 1-4 4H5"/><path d="M8 21l-3-3 3-3"/>'),
  shuffle: ic(20, '<path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8c1.1 1.6 2.3 2.6 4.3 2.6H21"/><path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M14.3 8.3c.8-.8 1.8-1.3 3.2-1.3H21"/><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>'),
  lyrics: ic(20, '<path d="M3.5 6h11M3.5 10.5h11M3.5 15h6"/>' + du('M17 14.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z') + '<circle cx="17" cy="17" r="2.5"/><path d="M19.5 17V5.5l2-1"/>'),
  radio: ic(20, du('M5 8.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z') + '<rect x="3" y="8.5" width="18" height="12" rx="2.5"/><path d="M7 8.5l9.5-5"/><circle cx="8.5" cy="14.5" r="2.3"/><path d="M14 13h3.5M14 16h3.5"/>'),
  cal: ic(20, '<path d="M3 9.5h18V7.5a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 7.5z" fill="currentColor" fill-opacity=".25" stroke="none"/><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor"/><circle cx="12" cy="14.5" r="1" fill="currentColor"/>'),
  rate: ic(20, du('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z') + '<circle cx="12" cy="12" r="9"/><path d="M7.5 10h8.5l-2.2-2.2M16.5 14H8l2.2 2.2"/>'),
  star: ic(20, du('M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6L12 17l-5.3 2.8 1-6-4.4-4.2 6-.9z') + '<path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6L12 17l-5.3 2.8 1-6-4.4-4.2 6-.9z"/>'),
  bookmark: ic(20, du('M7 3h10a1.5 1.5 0 0 1 1.5 1.5V21L12 17l-6.5 4V4.5A1.5 1.5 0 0 1 7 3z') + '<path d="M7 3h10a1.5 1.5 0 0 1 1.5 1.5V21L12 17l-6.5 4V4.5A1.5 1.5 0 0 1 7 3z"/>'),
  qr: ic(20, '<rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" fill-opacity=".2"/><rect x="14" y="3" width="7" height="7" rx="2" fill="currentColor" fill-opacity=".2"/><rect x="3" y="14" width="7" height="7" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M14 14h2.5v2.5H14zM18.5 18.5H21V21h-2.5zM18.5 14H21M14 21h2"/>'),
  music: ic(20, '<path d="M9 18V5.5l11-2.3V16"/>' + du('M6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM17 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6z') + '<circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M9 9l11-2.3"/>'),
  cart: ic(20, du('M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z') + '<path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>'),
  next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5.5 5.5l9 6.5-9 6.5z"/><rect x="17" y="5" width="2" height="14" rx="1"/></svg>',
  prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M18.5 5.5l-9 6.5 9 6.5z"/><rect x="5" y="5" width="2" height="14" rx="1"/></svg>',
  apps: ic(20, '<rect x="3" y="3" width="7.5" height="7.5" rx="2.5" fill="currentColor" fill-opacity=".2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.5" fill="currentColor" fill-opacity=".2"/><circle cx="17.25" cy="6.75" r="3.75"/><rect x="3" y="3" width="7.5" height="7.5" rx="2.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.5"/>'),
  ask: ic(20, du('M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1.3-3.8A7.3 7.3 0 0 1 3.5 11.1C3.5 6.9 7.3 3.5 12 3.5z') + '<path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1.3-3.8A7.3 7.3 0 0 1 3.5 11.1C3.5 6.9 7.3 3.5 12 3.5z"/><path d="M10 9.2a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .8-1 1.4v.4M12 15.2h.01"/>'),
  mail: ic(20, du('M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z') + '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/>'),
  note: ic(20, du('M5.5 3h13A1.5 1.5 0 0 1 20 4.5V14l-6 6.5H5.5A1.5 1.5 0 0 1 4 19V4.5A1.5 1.5 0 0 1 5.5 3z') + '<path d="M14 20.5H5.5A1.5 1.5 0 0 1 4 19V4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5V14z"/><path d="M14 20.5V15.5a1.5 1.5 0 0 1 1.5-1.5H20M8 8h8M8 11.5h5"/>'),
  sun: ic(20, du('M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z') + '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v1.5M12 20v1.5M4.6 4.6l1 1M18.4 18.4l1 1M2.5 12H4M20 12h1.5M4.6 19.4l1-1M18.4 5.6l1-1"/>'),
  game: ic(20, du('M7.5 7h9a5 5 0 0 1 4.9 6l-.6 3.2a2.6 2.6 0 0 1-4.4 1.3L14.5 16h-5l-1.9 1.5a2.6 2.6 0 0 1-4.4-1.3L2.6 13A5 5 0 0 1 7.5 7z') + '<path d="M7.5 7h9a5 5 0 0 1 4.9 6l-.6 3.2a2.6 2.6 0 0 1-4.4 1.3L14.5 16h-5l-1.9 1.5a2.6 2.6 0 0 1-4.4-1.3L2.6 13A5 5 0 0 1 7.5 7z"/><path d="M7.5 10v3M6 11.5h3"/><circle cx="15.5" cy="10.5" r=".9" fill="currentColor"/><circle cx="17.5" cy="12.5" r=".9" fill="currentColor"/>'),
  repost: ic(18, '<path d="M14 4.5l5.5 5-5.5 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0-5.5 5.5v4"/>'),
  shield: ic(20, du('M12 2.8l7.5 3v6.1c0 4.6-3.2 8-7.5 9.3-4.3-1.3-7.5-4.7-7.5-9.3V5.8z') + '<path d="M12 2.8l7.5 3v6.1c0 4.6-3.2 8-7.5 9.3-4.3-1.3-7.5-4.7-7.5-9.3V5.8z"/><path d="M12 8v4.5M12 15.8h.01"/>'),
  club: ic(20, du('M5 4h10.5l-1.8 4 1.8 4H5z') + '<path d="M5 21V3.5"/><path d="M5 4h10.5l-1.8 4 1.8 4H5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M14 21.5a4 4 0 0 1 8 0"/>'),
  mic: ic(20, du('M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z') + '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
  pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="2"/></svg>',
  bell: ic(20, du('M12 3.5a6 6 0 0 1 6 6v3.8l1.8 2.7H4.2L6 13.3V9.5a6 6 0 0 1 6-6z') + '<path d="M12 3.5a6 6 0 0 1 6 6v3.8l1.8 2.7H4.2L6 13.3V9.5a6 6 0 0 1 6-6z"/><path d="M9.8 19.5a2.3 2.3 0 0 0 4.4 0"/>'),
  reply: ic(16, '<path d="M9.5 14.5L4.5 9.5l5-5"/><path d="M4.5 9.5h9a6 6 0 0 1 6 6v4"/>'),
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="18.5" cy="12" r="2.1"/></svg>',
  play: '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8.5 5.8v12.4l9.8-6.2z"/></svg>',
  file: ic(22, du('M6.5 3H14l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z') + '<path d="M6.5 3H14l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/><path d="M14 3v5h5"/>'),
  link: ic(18, '<path d="M10 13.8a4 4 0 0 0 5.6.2l3.2-3.2a4 4 0 0 0-5.7-5.6l-1.2 1.2"/><path d="M14 10.2a4 4 0 0 0-5.6-.2L5.2 13.2a4 4 0 0 0 5.7 5.6l1.2-1.2"/>'),
  upload: ic(18, '<path d="M12 15.5V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3"/>'),
  home: ic(20, du('M12 3.5a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6zM4 20.5c.6-3.9 4-6 8-6s7.4 2.1 8 6z') + '<circle cx="12" cy="7.8" r="4.3"/><path d="M4 20.5c.6-3.9 4-6 8-6s7.4 2.1 8 6"/>'),
  feed: ic(20, '<path d="M6 3.5h12" opacity=".55"/>' + du('M5.5 7h13a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-9A2.5 2.5 0 0 1 5.5 7z') + '<rect x="3" y="7" width="18" height="14" rx="2.5"/><path d="M7 12h10M7 16h6"/>'),
  msg: ic(20, du('M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1.3-3.8A7.3 7.3 0 0 1 3.5 11.1C3.5 6.9 7.3 3.5 12 3.5z') + '<path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1.3-3.8A7.3 7.3 0 0 1 3.5 11.1C3.5 6.9 7.3 3.5 12 3.5z"/><circle cx="8.3" cy="11.1" r=".9" fill="currentColor"/><circle cx="12" cy="11.1" r=".9" fill="currentColor"/><circle cx="15.7" cy="11.1" r=".9" fill="currentColor"/>'),
  friends: ic(20, du('M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.4-3.6 3.1-5.5 6.5-5.5s6.1 1.9 6.5 5.5z') + '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.4-3.6 3.1-5.5 6.5-5.5s6.1 1.9 6.5 5.5"/><path d="M15.5 4.8a3 3 0 0 1 0 5.9M17.5 14.6c2.3.5 3.7 2.2 4 5.4"/>'),
  people: ic(20, du('M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z') + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20.5 20.5L15.3 15.3"/><circle cx="10.5" cy="9" r="1.8"/><path d="M7.3 14c.6-1.4 1.8-2.1 3.2-2.1s2.6.7 3.2 2.1"/>'),
  out: ic(20, du('M5.5 3.5H13v17H5.5A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5z') + '<path d="M13 3.5H5.5A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5H13"/><path d="M16.5 8l4 4-4 4M20.5 12H10"/>'),
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 20.5s-7.8-4.6-9.3-9.6C1.6 7.2 4 4.3 7.3 4.3c2 0 3.6 1 4.7 2.8 1.1-1.8 2.7-2.8 4.7-2.8 3.3 0 5.7 2.9 4.6 6.6-1.5 5-9.3 9.6-9.3 9.6z"/></svg>',
  heartO: ic(18, '<path d="M12 20.5s-7.8-4.6-9.3-9.6C1.6 7.2 4 4.3 7.3 4.3c2 0 3.6 1 4.7 2.8 1.1-1.8 2.7-2.8 4.7-2.8 3.3 0 5.7 2.9 4.6 6.6-1.5 5-9.3 9.6-9.3 9.6z"/>'),
  comment: ic(18, '<path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1.3-3.8A7.3 7.3 0 0 1 3.5 11.1C3.5 6.9 7.3 3.5 12 3.5z"/>'),
  photo: ic(20, du('M5 4.5h14A2.5 2.5 0 0 1 21.5 7v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 17V7A2.5 2.5 0 0 1 5 4.5z') + '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21.2 15.5l-4.7-4.5-8.3 8.3"/>'),
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 4.2l17 7.8-17 7.8 2.6-7.8z"/><path d="M6.1 12h6.4" stroke="var(--surface,#fff)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  search: ic(18, '<circle cx="10.8" cy="10.8" r="6.5"/><path d="M20 20l-4.5-4.5"/>'),
  back: ic(20, '<path d="M15 5l-7 7 7 7" stroke-width="2.1"/>'),
  map: ic(18, du('M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z') + '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  x: ic(20, '<path d="M6 6l12 12M18 6L6 18" stroke-width="2"/>'),
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
  videos: [], video: null, albums: [], album: null, photos: [], files: [], post: null, notifs: [], nicks: [],
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
const findPost = id => [...cache.feed.values()].flat().concat(cache.wall, cache.groupWall, cache.tagPosts, cache.savedPosts || [], cache.post ? [cache.post] : [], [...cache.reposted.values()]).find(x => x.id === id);

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

/* Коллекционные юзернеймы: основное имя меняется на своё коллекционное без новой записи, а старое коллекционное остаётся в коллекции */
async function dropOldNick(bt, me) {
  const old = await getDoc(doc(db, 'usernames', me.nick));
  if (old.exists() && old.data().uid === me.id && !old.data().col) bt.delete(doc(db, 'usernames', me.nick));
}
async function setMainNick(nick) {
  const me = S.me; if (nick === me.nick) return;
  const bt = writeBatch(db);
  await dropOldNick(bt, me);
  bt.update(doc(db, 'users', me.id), { nick, search: buildSearch(me.name, nick, me.city || '') });
  await bt.commit(); nickUid.set(nick, me.id); toast('Теперь ваше имя — @' + nick);
  history.replaceState(null, '', '#@' + nick);
}
const nickOf = raw => String(raw || '').trim().toLowerCase().replace(/^@/, '');
async function nickToUid(nick) {
  if (nickUid.has(nick)) return nickUid.get(nick);
  const s = await getDoc(doc(db, 'usernames', nick));
  if (!s.exists()) return null;
  nickUid.set(nick, s.data().uid); return s.data().uid;
}

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
  if (v[0] === '@') {   // #@ник — адрес страницы
    let nick = v.slice(1); try { nick = decodeURIComponent(nick); } catch (e) { }
    nick = nick.toLowerCase();
    if (!nickUid.has(nick)) {
      nickToUid(nick).then(id => { if (id) route(); else { toast('Нет пользователя @' + nick); location.replace('#feed'); } }).catch(() => location.replace('#feed'));
      S.view = 'profile'; S.profileId = null; render(); return;
    }
    S.view = 'profile'; S.profileId = nickUid.get(nick);
  }
  else if (v === 'id') { S.view = 'profile'; S.profileId = arg || uid(); prettyUrl(S.profileId); }
  else if (v === 'im') { S.view = 'messages'; S.chatWith = arg || null; }
  else if (v === 'video' && arg) { S.view = 'watch'; S.watchId = arg; }
  else if (v === 'video') { S.view = 'video'; S.videoOwner = null; }
  else if (v === 'videos') { S.view = 'video'; S.videoOwner = arg || uid(); }
  else if (v === 'albums') { S.view = 'albums'; S.albumsOwner = arg || uid(); }
  else if (v === 'album' && arg) { S.view = 'album'; S.albumId = arg; }
  else if (v === 'post' && arg) { S.view = 'post'; S.postId = arg; }
  else if (v === 'club' && arg) { S.view = 'club'; S.clubId = arg; }
  else if (v === 'q' && arg) { S.view = 'question'; S.qId = arg; }
  else if (v === 'saved') { S.view = 'saved'; }
  else if (v === 'event' && arg) { S.view = 'event'; S.eventId = arg; }
  else if (v === 'market') { S.view = 'market'; S.mktCat = arg || 'all'; }
  else if (v === 'lot' && arg) { S.view = 'lot'; S.lotId = arg; }
  else if (v === 'music') { S.view = 'music'; S.musicTab = arg || 'my'; }
  else if (v === 'u' && arg) { location.replace('#@' + arg); return; }   // старые ссылки #u/ник
  else if (v === 'answers') { S.view = 'answers'; S.ansCat = arg || 'all'; }
  else if (v === 'mail') { S.view = 'mail'; S.mailBox = arg === 'sent' ? 'sent' : arg === 'new' ? 'new' : 'in'; S.mailId = arg && !['sent', 'new', 'in'].includes(arg) ? arg : null; }
  else if (v === 'games') { S.view = 'games'; S.game = arg || null; }
  else if (v === 'tag' && arg) { S.view = 'tag'; try { S.tag = decodeURIComponent(arg).toLowerCase(); } catch (e) { S.tag = arg; } }
  else if (['feed', 'friends', 'people', 'edit', 'disk', 'vid', 'settings', 'more', 'notif', 'clubs', 'admin', 'guests', 'apps', 'notes', 'weather', 'events', 'rates', 'radio', 'horo'].includes(v)) S.view = v;
  else S.view = 'feed';
  if (S.view !== 'edit') { S.editColor = null; S.editCover = null; S.editPhoto = undefined; S.editEmoji = undefined; }
  if (S.view !== 'watch') { S.videoSrc = null; S.videoErr = null; }
  S.lightbox = null; S.lightboxImg = null; S.preview = null; S.linkForm = false; S.newAlbum = false;
  S.viewImg = null; S.postMenu = null; S.emoji = null; S.msgSel = null; S.profMenu = false; S.modOpen = false; S.report = null;
  if (S.view !== 'games' || S.game !== 'snake') { clearInterval(snakeTimer); snakeTimer = null; if (snake && !snake.over) snake = null; }
  S.newQ = false; S.noteEdit = null; S.giftFor = null; S.newLot = false; S.newEvent = false; if (S.view !== 'mail') S.mailDraft = null;
  S.newRoom = null; S.fwd = null; S.roomInfo = false; S.story = null; S.storyDraft = null; clearTimeout(storyTimer); S.clubEdit = false; S.editGroupPhoto = undefined; S.editGroupCover = null;
  if (S.view !== 'messages') S.replyTo = null;
  S.editMsg = null; S.mqOpen = false; S.mq = '';
  recStop(false); players.forEach(p => p.pause()); players.clear();
  if (S.view !== 'video') S.videoDraft = null;
  attachView();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// #id/<uid> в адресной строке заменяем на #@ник — такую ссылку понятно, кому отправить
function prettyUrl(pid) {
  const u = pid === uid() ? S.me : U(pid);
  if (!u?.nick || u.deleted || location.hash !== '#id/' + pid) return;
  nickUid.set(u.nick, pid); history.replaceState(null, '', '#@' + u.nick);
}
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
    else if (S.feedTab === 'top') listen(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(150)), 'top');
    else {
      chunk([id, ...(S.me.friends || [])], 30).forEach((c, i) =>
        listen(query(collection(db, 'posts'), where('authorId', 'in', c), orderBy('createdAt', 'desc'), limit(50)), i));
      // записи сообществ, на которые я подписан
      chunk(S.me.groups || [], 30).forEach((c, i) =>
        listen(query(collection(db, 'posts'), where('wallId', 'in', c), orderBy('createdAt', 'desc'), limit(30)), 'g' + i));
    }
  } else if (S.view === 'profile') {
    const pid = S.profileId; cache.wall = []; cache.gifts = []; cache.nicks = []; S.nickMenu = null;
    if (!pid) return;
    viewUnsubs.push(onSnapshot(query(collection(db, 'usernames'), where('uid', '==', pid)), s => {
      cache.nicks = s.docs.map(d => ({ id: d.id, ...d.data() })); render();
    }, console.error));
    viewUnsubs.push(onSnapshot(query(collection(db, 'gifts'), where('to', '==', pid), limit(60)), s => {
      cache.gifts = s.docs.map(data).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); ensureUsers(cache.gifts.map(g => g.from)); render();
    }, console.error));
    if (pid !== id) recordGuest(pid);
    if (pid !== id) viewUnsubs.push(onSnapshot(doc(db, 'users', pid), s => {
      cache.users.set(pid, s.exists() ? data(s) : { id: pid, name: 'Страница не найдена', friends: [], deleted: true }); prettyUrl(pid); render();
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
  } else if (S.view === 'events') {
    cache.events = [];
    viewUnsubs.push(onSnapshot(query(collection(db, 'events'), where('at', '>=', new Date(Date.now() - 3 * 3600e3)), orderBy('at', 'asc'), limit(60)), s => {
      cache.events = s.docs.map(data); S.loading = false; render();
    }, onViewErr));
  } else if (S.view === 'event') {
    cache.event = null;
    viewUnsubs.push(onSnapshot(doc(db, 'events', S.eventId), s => { cache.event = s.exists() ? data(s) : { id: S.eventId, missing: true }; if (s.exists()) ensureUsers([cache.event.ownerId]); S.loading = false; render(); }, onViewErr));
  } else if (S.view === 'rates') {
    S.loading = false; if (!S.rates?.v) loadRates();
  } else if (S.view === 'saved') {
    cache.savedPosts = [];
    const ids = (S.me.saved || []).slice(-100).reverse();
    Promise.all(ids.map(pid => getDoc(doc(db, 'posts', pid)).catch(() => null))).then(snaps => {
      if (S.view !== 'saved') return;
      cache.savedPosts = snaps.filter(x => x?.exists()).map(data); ensurePostPeople(cache.savedPosts); S.loading = false; render();
    });
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
  const ph = safePhoto(u?.photo);
  const inner = ph ? `<img src="${esc(ph)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u?.name));
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;background-color:${/^#[0-9a-f]{6}$/i.test(u?.color || '') ? u.color : '#8E95AB'}`;
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
const emojiOf = u => typeof u?.emoji === 'string' && u.emoji && u.emoji.length <= 16 && /\p{Extended_Pictographic}/u.test(u.emoji) && !/[<>"'&]/.test(u.emoji) ? u.emoji : '';
const emojiTag = u => emojiOf(u) ? `<span class="emoji-st" title="Статус">${emojiOf(u)}</span>` : '';
const nameLink = u => u && !u.deleted ? `<a class="name" href="#id/${esc(u.id)}" style="color:var(--fg);font-weight:600">${esc(u.name)}</a>${emojiTag(u)}${admBadge(u)}` : `<span class="name">${esc(u?.name || '…')}</span>`;
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

  if (S.phase === 'boot') app.innerHTML = `<div class="boot"><span class="boot-logo">вс</span></div>`;
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
  animate();
  if (S.fullPlayer && S.fpLyrics) { syncLyrics(); if (!lyrRaf) lyrLoop(); }
}
const resetIds = new Set();

/* ---------- Анимации ----------
   render() каждый раз пересоздаёт страницу, поэтому анимируем только то, что появилось впервые (по ключу).
   Если перерисовка случилась посреди анимации, она продолжается с того же места (отрицательная задержка). */
const ANIM_ITEMS = 'main > *, .post, .uitem, .app-tile, .msg, .comment, .gift, .login-in, .boot-logo';
const ANIM_ONCE = ['.ov', '.fp', '.ly-pick', '.post-menu', '.nick-menu', '.mod-box', '.emoji-pop'];   // окна: снова анимируются, когда открываются заново
const ANIM_POP = '.pill.liked, .fp-ic.on, .badge, .fp-chip.on';
const animSeen = new Map();
let animPage = '', animStart = 0, lastTap = 0;
document.addEventListener('pointerdown', () => { lastTap = performance.now(); }, true);
const animOff = () => document.documentElement.dataset.anim === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate() {
  if (animOff()) return;
  const now = performance.now();
  const page = S.phase + '|' + (S.phase === 'app' ? location.hash : S.authTab || '');
  if (page !== animPage) { animPage = page; animStart = now; animSeen.clear(); }
  const fresh = now - animStart < 1500;   // первые полторы секунды на странице — появление «лесенкой»
  const run = (el, key, cls, delay) => {
    const was = animSeen.get(key);
    if (!was) { animSeen.set(key, { t: now, d: delay }); el.classList.add(cls); el.style.animationDelay = delay + 'ms'; }
    else if (now - was.t < was.d + 600) { el.classList.add(cls); el.style.animationDelay = (was.d - (now - was.t)) + 'ms'; }
  };
  let n = 0, born = 0;
  app.querySelectorAll(ANIM_ITEMS).forEach((el, i) => {
    const key = 'i|' + (el.matches('.post, .uitem, .app-tile, .msg, .comment, .gift') ? el.className.split(' ')[0] : el.className.split(' ').slice(0, 3).join('.'))
      + '|' + (el.dataset.id || el.querySelector('[data-id]')?.dataset.id || el.getAttribute('href') || el.textContent.slice(0, 60));
    if (animSeen.has(key)) return run(el, key, 'a-in', 0);
    born++;
    if (born > (fresh ? 40 : 14)) { animSeen.set(key, { t: 0, d: 0 }); return; }   // пачка из сотни сообщений не анимируется
    run(el, key, 'a-in', fresh ? Math.min(n++, 12) * 40 : 0);
  });
  const present = new Set();
  ANIM_ONCE.forEach(sel => app.querySelectorAll(sel).forEach(el => { present.add('o|' + sel); run(el, 'o|' + sel, 'a-in', 0); }));
  ANIM_ONCE.forEach(sel => { if (!present.has('o|' + sel)) animSeen.delete('o|' + sel); });
  app.querySelectorAll(ANIM_POP).forEach(el => {
    const key = 'p|' + el.className + '|' + (el.dataset.id || el.closest('[href]')?.getAttribute('href') || '') + '|' + el.textContent.trim();
    // сердечко прыгает только сразу после нажатия, счётчик — когда меняется уже на открытой странице
    const ok = el.classList.contains('badge') ? !fresh : now - lastTap < 1500;
    if (!animSeen.has(key) && !ok) { animSeen.set(key, { t: 0, d: 0 }); return; }
    run(el, key, 'pop', 0);
  });
}

function viewAuth() {
  const login = S.authTab === 'login';
  return `<div class="login"><div class="login-in">
    <div class="hero"><span class="logo-mark">вс</span>
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
        <div class="field"><label for="rNick">Короткое имя</label><input id="rNick" required minlength="4" maxlength="30" placeholder="ivan.petrov" pattern="[a-zA-Z0-9._]+" title="Латиница, цифры, точка и _ (от 4 символов)" autocomplete="username"></div>`}
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
        <div class="field"><label for="oNick">Короткое имя</label><input id="oNick" required minlength="4" maxlength="30" pattern="[a-zA-Z0-9._]+" title="Латиница, цифры, точка и _ (от 4 символов)" value="${esc(nickGuess.length >= 4 ? nickGuess : '')}"></div>
        <div class="field"><label for="oCity">Город</label><input id="oCity" maxlength="40" placeholder="Необязательно"></div>
        ${S.authError ? `<div class="err">${esc(S.authError)}</div>` : ''}
        <button class="btn" type="submit" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? 'Создаём…' : 'Создать страницу'}</button>
        <button type="button" class="btn ghost" data-act="logout">Выйти</button>
      </form>
    </div></div></div>`;
}

function navHtml() {
  const me = S.me, unread = cache.chats.filter(isUnread).length, reqs = cache.incoming.length;
  const groups = { video: ['video', 'watch'], albums: ['albums', 'album'], clubs: ['clubs', 'club'], apps: ['apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'events', 'event', 'rates', 'radio', 'horo'], music: ['music'] };
  const on = v => (groups[v] ? groups[v].includes(S.view) : S.view === v) && (v !== 'profile' || S.profileId === me.id) ? 'on' : '';
  const nav = (v, href, icon, label, badge = 0, cls = '') => `<a class="navlink ${on(v)} ${cls}" href="#${href}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const moreOn = ['more', 'profile', 'people', 'albums', 'album', 'disk', 'vid', 'settings', 'edit', 'notif', 'post', 'clubs', 'club', 'admin', 'guests', 'tag', 'apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'music', 'saved', 'events', 'event', 'rates', 'radio', 'horo'].includes(S.view) ? 'on' : '';
  return `<nav class="nav">
      ${nav('profile', 'id/' + me.id, I.home, 'Профиль', 0, 'm-hide')}
      ${nav('feed', 'feed', I.feed, 'Лента')}
      ${nav('messages', 'im', I.msg, 'Чаты', unread)}
      ${nav('friends', 'friends', I.friends, 'Друзья', reqs)}
      ${nav('notif', 'notif', I.bell, 'Сигналы', unseenNotifs(), 'm-hide')}
      ${nav('saved', 'saved', I.bookmark, 'Закладки', 0, 'm-hide')}
      ${nav('people', 'people', I.people, 'Люди', 0, 'm-hide')}
      ${nav('apps', 'apps', I.apps, 'Сервисы', unreadMail(), 'm-hide')}
      ${nav('music', 'music', I.music, 'Музыка', 0, 'm-hide')}
      ${nav('clubs', 'clubs', I.club, 'Клубы', 0, 'm-hide')}
      ${nav('video', 'video', I.video, 'Видео')}
      ${nav('albums', 'albums', I.album, 'Альбомы', 0, 'm-hide')}
      ${nav('disk', 'disk', I.disk, 'Диск', 0, 'm-hide')}
      <a class="navlink m-only ${moreOn}" href="#more">${I.more}<span>Ещё</span></a>
      <hr>
      ${nav('vid', 'vid', I.vid, 'VС ID', 0, 'm-hide sub')}
      ${isSiteAdmin() ? nav('admin', 'admin', I.shield, 'Админка', cache.reports.length, 'm-hide sub') : ''}
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
  else if (S.view === 'events') main = viewEvents();
  else if (S.view === 'event') main = viewEvent();
  else if (S.view === 'rates') main = viewRates();
  else if (S.view === 'radio') main = viewRadio();
  else if (S.view === 'horo') main = viewHoro();
  else if (S.view === 'saved') main = `<div class="card pad"><h1 class="h brandh">Закладки</h1><div class="muted small">Записи, которые вы сохранили. Видите только вы.</div></div>
    ${S.loading ? loadingBox() : cache.savedPosts?.length ? cache.savedPosts.map(p => postCard(p)).join('') : '<div class="card empty"><b>Закладок пока нет</b><span>Нажмите «⋯» у записи → «В закладки».</span></div>'}`;
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
    <a class="logo" href="#feed" aria-label="VСмске, лента"><span class="logo-mark">вс</span><span class="logo-word" style="color:var(--fg)">VСмске</span></a>
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
  ${S.fullPlayer ? fullPlayer() : ''}
  ${overlay()}`;
}

/* ---------- Окна поверх страницы: просмотр фото и файлов ---------- */
const REPORT_REASONS = { spam: 'Спам', abuse: 'Оскорбления', nsfw: 'Неприемлемый контент', fraud: 'Мошенничество', other: 'Другое' };
function overlay() {
  if (S.story) return storyOverlay();
  if (S.trackForm) return trackFormModal();
  if (S.qr) {
    const u = U(S.qr.id);
    return `<div class="ov" data-act="ovx"><div class="ov-in modal qr-modal" data-stop="1">
      <div class="row"><b class="grow">${esc(u?.name || '')}</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <div class="qr-box">${S.qr.img ? `<img src="${S.qr.img}" alt="QR-код страницы">` : '<div class="spin"></div>'}</div>
      <p class="muted small" style="margin:0;text-align:center">Наведите камеру телефона, чтобы открыть страницу</p>
      <button class="btn sec" data-act="copy" data-text="${esc(S.qr.url)}">Скопировать ссылку</button></div></div>`;
  }
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
  const link = pageUrl(me);
  return `<div class="vid-card">
      <div class="vid-brand"><span class="logo-mark">вс</span><span>VС ID</span></div>
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
    <div class="card pad set"><h2 class="h" style="font-size:16px">Музыка</h2>
      <div class="set-row"><span class="grow">Показывать в профиле, что я слушаю</span>${seg('listen', lsGet('vs_listen') === '0' ? 'off' : 'on', [['on', 'Да'], ['off', 'Нет']])}</div>
      <div class="set-row"><span class="grow">Анимации</span>${seg('anim', lsGet('vs_anim') === 'off' ? 'off' : 'on', [['on', 'Вкл'], ['off', 'Выкл']])}</div></div>
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
      ${item('saved', I.bookmark, 'Закладки', 'Сохранённые записи')}
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
    <div class="card pad"><h2 class="h" style="font-size:16px">💎 Коллекционные юзернеймы</h2>
      <p class="muted small" style="margin:4px 0 10px">Выпустите имя любой длины (от 1 символа) себе или в подарок. Обычные люди могут занять имя только от 4 символов.</p>
      <form class="row" data-form="nickmint" style="flex-wrap:wrap;gap:8px"><input id="mintNick" class="inp" maxlength="31" placeholder="@имя, например vld" style="flex:1;min-width:140px">
        <input id="mintTo" class="inp" maxlength="31" placeholder="@кому (пусто — себе)" style="flex:1;min-width:140px"><button class="btn">Выпустить</button></form></div>
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
      ${tile('radio', I.radio, 'ВС Радио', 'Онлайн-радиостанции', 'c-radio')}
      ${tile('events', I.cal, 'ВС События', 'Встречи и вечеринки', 'c-event')}
      ${tile('rates', I.rate, 'ВС Курсы', 'Курсы валют и конвертер', 'c-rate')}
      ${tile('horo', I.star, 'ВС Гороскоп', 'Прогноз на сегодня', 'c-horo')}
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
const player = { audio: new Audio(), queue: [], i: -1, loading: false, repeat: lsGet('vs_repeat') || 'off', shuffle: lsGet('vs_shuffle') === '1', label: '' };
player.audio.preload = 'auto';
const curTrack = () => player.queue[player.i];
player.audio.addEventListener('timeupdate', () => {
  const a = player.audio, t = curTrack(), pct = a.duration ? a.currentTime / a.duration * 100 : 0;
  const fill = document.getElementById('mbarFill'), mt = document.getElementById('mbarTime');
  if (fill) fill.style.width = pct + '%';
  if (mt && !t?.radio) mt.textContent = fmtDur(a.currentTime) + ' / ' + fmtDur(a.duration || t?.duration);
  // полноэкранный плеер: ползунок, время и строка текста — без перерисовки всей страницы
  const seek = document.getElementById('fpSeek'), cur = document.getElementById('fpCur'), left = document.getElementById('fpLeft');
  if (seek && !seek.matches(':active')) { seek.value = String(Math.round(pct * 10)); seek.style.setProperty('--p', pct + '%'); }
  if (cur) cur.textContent = fmtDur(a.currentTime);
  if (left && a.duration) left.textContent = fmtDur(a.duration);
  syncLyrics();
});
['play', 'pause'].forEach(ev => player.audio.addEventListener(ev, () => render()));
player.audio.addEventListener('ended', () => {
  if (player.repeat === 'one') { player.audio.currentTime = 0; player.audio.play(); return; }
  nextTrack(true);
});
// следующий трек с учётом «перемешать» и «повторять всё»
function nextTrack(auto = false) {
  const n = player.queue.length; if (!n) return;
  if (player.shuffle && n > 1) { let j; do j = Math.floor(Math.random() * n); while (j === player.i); return playAt(j); }
  if (player.i + 1 < n) return playAt(player.i + 1);
  if (player.repeat === 'all' || !auto) return playAt(0);
  player.audio.pause();
}
function prevTrack() {
  if (player.audio.currentTime > 3 || player.queue.length < 2) { player.audio.currentTime = 0; return; }
  playAt(player.i > 0 ? player.i - 1 : player.queue.length - 1);
}
async function playAt(i) {
  if (i < 0 || i >= player.queue.length) { player.audio.pause(); return; }
  player.i = i; player.loading = true; render();
  const t = curTrack();
  try {
    const url = t.radio ? t.url : await getFileUrl(t.fileId, t.type || 'audio/mpeg');
    if (curTrack() !== t) return;
    player.audio.src = url; await player.audio.play();
    shareListening(t);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: 'ВС Музыка', artwork: safeImg(t.cover) ? [{ src: t.cover, sizes: '600x600', type: 'image/jpeg' }] : [] });
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    }
  } catch (e) { console.error(e); toast(t.radio ? 'Станция сейчас недоступна, попробуйте другую' : 'Не получилось включить трек'); }
  finally { player.loading = false; render(); }
}
// «Сейчас слушает» в профиле: пишем название трека (не чаще одного раза на трек), если не выключено в настройках
let lastShared = '';
function shareListening(t) {
  if (lsGet('vs_listen') === '0' || !uid()) return;
  const key = t ? (t.radio ? '📻 ' + t.title : t.title) + '|' + (t.artist || '') : '';
  if (key === lastShared) return; lastShared = key;
  updateDoc(doc(db, 'users', uid()), { listening: t ? { title: (t.radio ? '📻 ' + t.title : t.title).slice(0, 120), artist: (t.artist || '').slice(0, 120), at: serverTimestamp() } : null }).catch(console.error);
}
const listeningOf = u => u?.listening && u.listening.title && Date.now() - ms(u.listening.at) < 20 * 60 * 1000 ? u.listening : null;
function playList(list, i, label = '') {
  const t = list[i];
  if (curTrack()?.id === t.id) { player.audio.paused ? player.audio.play() : player.audio.pause(); return; }
  player.queue = list.slice(); player.label = label; playAt(i);
}

/* Текст песни: строки «[мм:сс.хх] текст» — синхронно с музыкой, иначе обычный текст */
function parseLyrics(text) {
  const lines = String(text || '').split('\n'), out = [];
  let timed = false;
  for (const raw of lines) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const body = raw.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    if (tags.length) { timed = true; tags.forEach(m => out.push({ t: Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3].padEnd(3, '0')) : 0), text: body })); }
    else if (!/^\[[a-z]+:.*\]$/i.test(raw.trim())) out.push({ t: null, text: raw.trim() });   // [ar:...], [ti:...] — служебные строки LRC
  }
  if (timed) return { timed: true, lines: out.filter(l => l.t !== null).sort((a, b) => a.t - b.t) };
  while (out.length && !out[0].text) out.shift();
  while (out.length && !out[out.length - 1].text) out.pop();
  return { timed: false, lines: out };
}
let lyricIdx = -1;
function syncLyrics() {
  const box = document.getElementById('fpLyrics'); if (!box || box.dataset.timed !== '1') return;
  const t = player.audio.currentTime, rows = box.querySelectorAll('[data-t]');
  let idx = -1; rows.forEach((r, k) => { if (Number(r.dataset.t) <= t + 0.15) idx = k; });
  const fresh = !box.dataset.synced;   // после перерисовки — встать на место сразу, без прокрутки
  if (box.dataset.style === 'ap') lyrApFill(rows, idx, t, box.dataset.v);
  if (idx === lyricIdx && !fresh) return;
  lyricIdx = idx; box.dataset.synced = '1';
  rows.forEach((r, k) => { r.classList.toggle('cur', k === idx); r.classList.toggle('past', k < idx); });
  if (box.dataset.style === 'ap') return lyrApMove(box, rows, idx, fresh);
  if (idx >= 0 && !box.matches(':hover')) rows[idx].scrollIntoView({ block: 'center', behavior: fresh ? 'auto' : 'smooth' });
}
/* Вид «как в Apple Music»: строка заливается по мере пения, дальние строки размыты, текущая едет к верхней трети */
function lyrApMove(box, rows, idx, fresh) {
  const inner = box.firstElementChild, focus = rows[Math.max(idx, 0)], at = Math.max(idx, 0);
  rows.forEach((r, k) => { r.style.setProperty('--d', Math.min(Math.abs(k - at), 5)); r.style.setProperty('--s', Math.max(Math.min(k - at, 5), -5)); });
  if (!inner || !focus) return;
  const anchor = LYR_ANCHOR[box.dataset.v];   // у этих видов строка держится серединой, у остальных — верхом на трети высоты
  const y = anchor ? focus.offsetTop + focus.offsetHeight / 2 - box.clientHeight * anchor : Math.max(focus.offsetTop - box.clientHeight * 0.3, 0);
  if (fresh) { inner.style.transition = 'none'; inner.style.transform = `translateY(${-y}px)`; inner.offsetHeight; inner.style.transition = ''; }
  else inner.style.transform = `translateY(${-y}px)`;
}
function lyrApFill(rows, idx, t) {
  rows.forEach((r, k) => {
    if (k !== idx) { r.style.removeProperty('--lp'); if (k < idx) r.querySelectorAll('.w:not(.on)').forEach(w => w.classList.add('on')); return; }
    const start = Number(r.dataset.t), end = Number(rows[k + 1]?.dataset.t ?? start + 5);
    // строка поётся не до самого конца промежутка: последние 15% (но не больше 1,5 с) — пауза перед следующей
    const len = Math.max(Math.min((end - start) * 0.85, end - start - 0.3, Math.max(end - start - 1.5, 1.2)), 0.5);
    const p = Math.min(Math.max((t - start) / len, 0), 1);
    r.style.setProperty('--lp', Math.round(p * 1000) / 10 + '%');
    r.querySelectorAll('.w').forEach(w => w.classList.toggle('on', Number(w.dataset.f) <= p));   // слова по очереди
  });
}
// плавная заливка строки: timeupdate приходит лишь 4 раза в секунду, поэтому пока виден Apple-текст — кадр за кадром
let lyrRaf = 0;
function lyrLoop() {
  cancelAnimationFrame(lyrRaf);
  const step = () => {
    const box = document.getElementById('fpLyrics');
    if (!box || box.dataset.style !== 'ap' || box.dataset.timed !== '1' || player.audio.paused) { lyrRaf = 0; return; }
    syncLyrics(); lyrRaf = requestAnimationFrame(step);
  };
  lyrRaf = requestAnimationFrame(step);
}
// виды текста песни: ключ → название и описание для окна выбора
const LYRS = [
  ['ya', 'Обычный', 'Строки по очереди подсвечиваются'],
  ['ap', 'Apple Music', 'Крупно, заливка, размытие'],
  ['ka', 'Караоке', 'Синяя заливка, только текущая и следующая'],
  ['ne', 'Неон', 'Светящиеся буквы, как вывеска'],
  ['ci', 'Кино', 'Субтитры внизу поверх обложки'],
  ['tw', 'Печатная машинка', 'Слова печатаются на бумаге'],
  ['ch', 'Переписка', 'Строки приходят как сообщения'],
  ['wa', 'Волна', 'Слова подпрыгивают в такт'],
  ['po', 'Слово за словом', 'Каждое слово выпрыгивает по центру'],
  ['te', 'Терминал', 'Зелёный текст и мигающий курсор'],
  ['ca', '3D-барабан', 'Строки крутятся на барабане'],
  ['ra', 'Радуга', 'Переливающаяся текущая строка'],
];
const LYR_STYLES = Object.fromEntries(LYRS.map(([k, n]) => [k, n]));
const LYR_ANCHOR = { ka: 0.45, po: 0.42, ca: 0.45, ch: 0.62, wa: 0.4, ne: 0.38, ra: 0.38 };   // где по высоте держать текущую строку (по умолчанию 0,3)

/* Полноэкранный плеер */
const REPEAT_LABEL = { off: 'Повтор выключен', all: 'Повторять весь список', one: 'Повторять трек' };
function fullPlayer() {
  const t = curTrack(); if (!t) { S.fullPlayer = false; return ''; }
  const a = player.audio, dur = a.duration || t.duration || 0, pct = dur ? a.currentTime / dur * 100 : 0;
  const own = !t.radio && t.ownerId === uid(), saved = !t.radio && ((S.me.tracks || []).includes(t.id) || own), owner = t.radio ? null : U(t.ownerId);
  if (owner === undefined && t.ownerId) ensureUsers([t.ownerId]);
  const cover = safeImg(t.cover), lyr = t.radio ? null : parseLyrics(t.lyrics);
  const showLyrics = S.fpLyrics && !t.radio;
  const apStyle = showLyrics && !S.lyrEdit && lyrStyle() !== 'ya' && lyr.lines.length > 0;
  const head = `<div class="fp-top"><button class="icon-btn fp-x" data-act="fpclose" aria-label="Свернуть плеер">${I.down}</button>
      <span class="fp-label">${t.radio ? 'ВС Радио · прямой эфир' : esc(player.label || 'ВС Музыка')}</span>
      ${own ? `<button class="icon-btn" data-act="tedit" data-id="cur" aria-label="Изменить трек" title="Название, исполнитель и обложка">✏️</button>` : '<span style="width:36px"></span>'}</div>`;
  const art = cover ? `<img class="fp-cover" src="${esc(cover)}" alt="Обложка">` : `<div class="fp-cover fp-cover-empty" style="${t.radio ? `--rc:${t.c}` : ''}">${t.radio ? '📻' : '🎵'}</div>`;
  const lyricsBox = showLyrics ? (S.lyrEdit ? `<form class="fp-lyrics form" data-form="lyrics">
        ${lyrFindBox(t)}
        <textarea id="lyrText" rows="12" maxlength="20000" placeholder="Текст песни. Для синхронизации с музыкой начинайте строки с тайм-кода: [00:12.50] Первая строка">${esc(t.lyrics || '')}</textarea>
        <div class="row lyr-shift"><span class="small">Сдвиг тайм-кодов:</span>${[-1, -0.1, 0.1, 1].map(d => `<button type="button" class="btn ghost small" data-act="lyrshift" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)} с</button>`).join('')}</div>
        <div class="row"><button type="button" class="btn ghost small" data-act="lyrstamp">⏱ Вставить текущее время</button><span class="grow"></span>
          <button type="button" class="btn ghost small" data-act="lyredit">Отмена</button><button class="btn small">Сохранить</button></div>
        <p class="hint" style="margin:0">Тайм-код ставится в начало строки в формате [минуты:секунды.сотые]. Включите песню и жмите «Вставить текущее время» перед каждой строкой.</p></form>`
      : lyr.lines.length && apStyle ? apLyrics(lyr, own, lyrStyle(), cover)
      : lyr.lines.length ? `<div class="fp-lyrics ${lyr.timed ? 'timed' : ''}" id="fpLyrics" data-timed="${lyr.timed ? 1 : 0}">${lyr.lines.map(l => lyr.timed ? `<p data-t="${l.t}" data-act="lyrseek">${esc(l.text) || '♪'}</p>` : `<p>${esc(l.text) || '&nbsp;'}</p>`).join('')}
          ${own ? `<button class="btn ghost small" data-act="lyredit">Изменить текст</button>` : ''}</div>`
      : `<div class="fp-lyrics fp-empty"><b>Текста пока нет</b>${own ? `<span class="small">Найдём текст с тайм-кодами сами или добавьте свой — тогда слова будут идти вместе с музыкой</span><div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn small" data-act="lyrauto">🔎 Найти текст автоматически</button><button class="btn ghost small" data-act="lyredit">Добавить вручную</button></div>` : '<span class="small">Добавить текст может только автор трека</span>'}</div>`) : '';
  return `<div class="fp ${apStyle ? 'ap fp-ly-' + lyrStyle() : ''}" role="dialog" aria-label="Плеер"><div class="fp-bg" style="${cover ? `background-image:url('${esc(cover)}')` : ''}"></div><div class="fp-in">
    ${head}
    ${apStyle ? `<div class="ap-head">${cover ? `<img src="${esc(cover)}" alt="">` : `<span class="ap-noart">🎵</span>`}<div class="grow" style="min-width:0"><b>${esc(t.title)}</b><span>${esc(t.artist || 'Неизвестный исполнитель')}</span></div></div>` : ''}
    <div class="fp-main">${showLyrics ? lyricsBox : art}</div>
    <div class="fp-info"><div class="grow" style="min-width:0"><div class="fp-title">${esc(t.title)}</div>
        <div class="fp-artist">${esc(t.artist || (t.radio ? '' : 'Неизвестный исполнитель'))}${owner ? ` · <a href="#music/${esc(owner.id)}" data-act="fpclose">${esc(owner.name)}</a>` : ''}</div></div>
      ${t.radio ? '' : `<button class="icon-btn fp-ic" data-act="copy" data-text="${esc(t.title + (t.artist ? ' — ' + t.artist : ''))}" aria-label="Скопировать название">${I.link}</button>`}</div>
    ${t.radio ? `<div class="fp-live">● Прямой эфир</div>` : `<div class="fp-seek"><input id="fpSeek" type="range" min="0" max="1000" value="${Math.round(pct * 10)}" style="--p:${pct}%" aria-label="Перемотка">
      <div class="fp-times tnum"><span id="fpCur">${fmtDur(a.currentTime)}</span><span id="fpLeft">${fmtDur(dur)}</span></div></div>`}
    <div class="fp-ctrl">
      <button class="icon-btn fp-ic ${saved ? 'on' : ''}" data-act="fplike" ${t.radio || own ? 'disabled' : ''} aria-label="${saved ? 'В моей музыке' : 'Добавить в мою музыку'}">${saved ? I.heart : I.heartO}</button>
      <button class="icon-btn fp-big" data-act="mprev" aria-label="Предыдущий">${I.prev}</button>
      <button class="fp-play" data-act="mplay" aria-label="${a.paused ? 'Играть' : 'Пауза'}">${player.loading ? '<span class="spin"></span>' : a.paused ? I.play : I.pause}</button>
      <button class="icon-btn fp-big" data-act="mnext" aria-label="Следующий">${I.next}</button>
      <button class="icon-btn fp-ic" data-act="fpclose" aria-label="Свернуть">${I.down}</button></div>
    <div class="fp-row">
      <button class="fp-chip ${player.repeat !== 'off' ? 'on' : ''}" data-act="fprepeat" aria-label="${REPEAT_LABEL[player.repeat]}" title="${REPEAT_LABEL[player.repeat]}">${I.repeat}${player.repeat === 'one' ? '<sup>1</sup>' : ''}</button>
      <button class="fp-chip ${showLyrics ? 'on' : ''}" data-act="fplyrics" ${t.radio ? 'disabled' : ''} aria-label="Текст песни" title="Текст песни">${I.lyrics}</button>
      ${showLyrics && !S.lyrEdit ? `<button class="fp-chip fp-style ${S.lyrPick ? 'on' : ''}" data-act="lyrpick" aria-label="Вид текста: ${LYR_STYLES[lyrStyle()]}" title="Вид текста: ${LYR_STYLES[lyrStyle()]}">Aa</button>` : ''}
      <button class="fp-chip ${player.shuffle ? 'on' : ''}" data-act="fpshuffle" aria-label="Перемешать" title="Перемешать">${I.shuffle}</button></div>
  </div>${S.lyrPick && showLyrics ? lyrPicker() : ''}</div>`;
}
/* Поиск текста с тайм-кодами в бесплатной открытой базе LRCLIB (без ключа) */
const lyrDefaultQ = t => [t.artist, t.title].filter(Boolean).join(' ').trim();
function lyrFindBox(t) {
  const f = S.lyrFind;
  const dur = player.audio.duration || t.duration || 0;
  const diffText = x => !dur || !x.dur ? '' : Math.abs(x.dur - dur) <= 2 ? '<span class="lf-ok">совпадает по длине</span>'
    : `<span class="lf-warn">${x.dur > dur ? 'длиннее' : 'короче'} на ${Math.round(Math.abs(x.dur - dur))} с</span>`;
  return `<div class="lyr-find"><div class="row" style="gap:6px"><input id="lyrQ" class="inp" maxlength="120" placeholder="Исполнитель и название" value="${esc(f?.q ?? lyrDefaultQ(t))}">
      <button type="button" class="btn small" data-act="lyrfind" ${f?.busy ? 'disabled' : ''}>${f?.busy ? '<span class="spin sm"></span>' : '🔎 Найти текст'}</button></div>
    ${f?.err ? `<p class="small lf-warn" style="margin:6px 0 0">${esc(f.err)}</p>` : ''}
    ${f && !f.busy && !f.err && !f.list.length ? '<p class="small" style="margin:6px 0 0;opacity:.75">Ничего не нашлось. Проверьте название и исполнителя или добавьте текст вручную.</p>' : ''}
    ${f?.list.length ? `<div class="lf-list">${f.list.map((x, i) => `<button type="button" class="lf-item ${f.took === i ? 'on' : ''}" data-act="lyrtake" data-i="${i}">
        <b>${esc(x.title)}</b><span>${esc(x.artist)}${x.album ? ' · ' + esc(x.album) : ''}</span>
        <span class="small">${x.dur ? fmtDur(x.dur) + ' · ' : ''}${x.synced ? '⏱ с тайм-кодами' : 'только текст'} ${diffText(x)}</span></button>`).join('')}</div>` : ''}</div>`;
}
async function lrclib(params) {
  const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(params));
  if (r.status === 429 || r.status === 503) throw new Error('busy');
  if (!r.ok) return [];
  const j = await r.json(); return Array.isArray(j) ? j : [];
}
async function findLyrics(auto = false) {
  const t = curTrack(); if (!t || t.ownerId !== uid()) return;
  const q = (document.getElementById('lyrQ')?.value ?? lyrDefaultQ(t)).trim();
  if (!q) { toast('Напишите исполнителя и название'); return; }
  S.lyrFind = { q, busy: true, list: [] }; render();
  const dur = player.audio.duration || t.duration || 0;
  let list = [];
  try {
    // сначала точный поиск по названию и исполнителю трека, потом — по строке целиком
    if (q === lyrDefaultQ(t) && t.title) list = await lrclib(t.artist ? { track_name: t.title, artist_name: t.artist } : { track_name: t.title });
    if (!list.length) list = await lrclib({ q });
  } catch (e) {
    S.lyrFind = { q, busy: false, list: [], err: e.message === 'busy' ? 'Сервис текстов сейчас перегружен — попробуйте через минуту' : 'Не получилось связаться с сервисом текстов. Проверьте интернет.' };
    render(); return;
  }
  const near = x => dur && x.duration ? Math.abs(x.duration - dur) : 99;
  list = list.filter(x => !x.instrumental && (x.syncedLyrics || x.plainLyrics))
    .sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || near(a) - near(b)).slice(0, 8)
    .map(x => ({ title: x.trackName || '', artist: x.artistName || '', album: x.albumName || '', dur: x.duration || 0, synced: x.syncedLyrics || '', plain: x.plainLyrics || '' }));
  S.lyrFind = { q, busy: false, list };
  // нашлась версия с тайм-кодами той же длины — подставляем сразу
  const best = list[0];
  if (best?.synced && (!dur || near({ duration: best.dur }) <= 3)) { render(); lyrTake(0, true); return; }
  render();
  if (auto && !list.length) toast('Текст не нашёлся — можно добавить вручную');
}
function lyrTake(i, auto = false) {
  const x = S.lyrFind?.list[i], ta = document.getElementById('lyrText'); if (!x || !ta) return;
  let text = (x.synced || x.plain).trim();
  if (text.length > 20000) { text = text.slice(0, 20000); toast('Текст слишком длинный — обрезан до 20 000 символов'); }
  ta.value = text; S.lyrFind.took = i;
  render();
  toast(x.synced ? (auto ? 'Нашли текст с тайм-кодами — проверьте и нажмите «Сохранить»' : 'Текст с тайм-кодами вставлен — проверьте и сохраните') : 'Вставлен текст без тайм-кодов');
}
// сдвинуть все тайм-коды в редакторе на d секунд
function shiftLrc(text, d) {
  return text.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, (m, mm, ss, fr) => {
    const t = Math.max(Number(mm) * 60 + Number(ss) + (fr ? Number('0.' + fr.padEnd(3, '0')) : 0) + d, 0);
    return `[${pad2(Math.floor(t / 60))}:${pad2(Math.floor(t % 60))}.${pad2(Math.floor(Math.round(t * 100) % 100))}]`;
  });
}
const lyrStyle = () => { const v = lsGet('vs_lyrstyle'); return LYR_STYLES[v] ? v : 'ya'; };
// строка → слова; у каждого слова доля строки, с которой оно начинается (для «слово за словом»)
function lyrWords(text) {
  const parts = text.split(/(\s+)/), total = text.replace(/\s+/g, '').length || 1;
  let done = 0;
  return parts.map(w => {
    if (!w.trim()) return w ? ' ' : '';
    const f = done / total; done += w.length;
    return `<span class="w" data-f="${f.toFixed(3)}">${esc(w)}</span>`;
  }).join('');
}
function apLyrics(lyr, own, v = 'ap', cover = '') {
  const lines = lyr.lines.map(l => ({ ...l }));
  // проигрыш в начале и пустые строки LRC — пульсирующие точки
  if (lyr.timed && lines[0].t >= 4) lines.unshift({ t: 0, text: '' });
  const row = l => lyr.timed
    ? (l.text ? `<p data-t="${l.t}" data-act="lyrseek"><span class="ln">${lyrWords(l.text)}</span></p>` : `<p class="ap-dots" data-t="${l.t}" data-act="lyrseek" aria-label="Проигрыш"><i></i><i></i><i></i></p>`)
    : `<p>${esc(l.text) || '&nbsp;'}</p>`;
  return `<div class="ap-lyrics ly-${v} ${lyr.timed ? 'timed' : 'plain'}" id="fpLyrics" data-style="ap" data-v="${v}" data-timed="${lyr.timed ? 1 : 0}" ${v === 'ci' && cover ? `style="--art:url('${esc(cover)}')"` : ''}><div class="ap-in">${lines.map(row).join('')}
    ${own ? `<button class="btn ghost small" data-act="lyredit">Изменить текст</button>` : ''}</div></div>`;
}
function lyrPicker() {
  const cur = lyrStyle();
  const sample = k => {
    if (k === 'ya') return `<div class="fp-lyrics timed ly-mini"><p class="past">Первая строка песни</p><p class="cur">Вот она, текущая</p><p>А это следующая</p></div>`;
    const ln = (t, on) => `<span class="ln">${t.split(' ').map((w, i) => `<span class="w ${i < on ? 'on' : ''}">${w}</span>`).join(' ')}</span>`;
    return `<div class="ap-lyrics timed ly-${k} ly-mini" data-v="${k}"><div class="ap-in">
      <p class="past" style="--d:1;--s:-1">${ln('Первая строка песни', 9)}</p>
      <p class="cur" style="--d:0;--s:0;--lp:55%">${ln('Вот она, текущая строка', 3)}</p>
      <p style="--d:1;--s:1">${ln('А это следующая', 0)}</p></div></div>`;
  };
  return `<div class="ly-pick" role="dialog" aria-label="Вид текста песни"><div class="ly-sheet">
    <div class="ly-head"><b>Вид текста</b><button class="icon-btn" data-act="lyrpick" aria-label="Закрыть">${I.x || '✕'}</button></div>
    <div class="ly-grid">${LYRS.map(([k, n, d]) => `<button class="ly-card ${k === cur ? 'on' : ''}" data-act="lyrset" data-v="${k}" aria-pressed="${k === cur}">
      <span class="ly-prev">${sample(k)}</span><b>${n}${k === cur ? ' ✓' : ''}</b><span class="small">${d}</span></button>`).join('')}</div></div></div>`;
}
function musicBar() {
  const t = curTrack(); if (!t) return '';
  const a = player.audio, pct = a.duration ? a.currentTime / a.duration * 100 : 0;
  return `<div class="mbar" role="region" aria-label="Плеер"><div class="mbar-fill" id="mbarFill" style="width:${pct}%"></div>
    <button class="icon-btn" data-act="mprev" aria-label="Предыдущий">${I.prev}</button>
    <button class="mbar-play" data-act="mplay" aria-label="${a.paused ? 'Играть' : 'Пауза'}">${player.loading ? '<span class="spin sm"></span>' : a.paused ? I.play : I.pause}</button>
    <button class="icon-btn" data-act="mnext" aria-label="Следующий">${I.next}</button>
    <button class="grow mbar-info" data-act="fpopen" aria-label="Открыть плеер">${safeImg(t.cover) ? `<img class="mbar-cover" src="${esc(t.cover)}" alt="">` : ''}<span class="mbar-txt"><b>${esc(t.title)}</b><span class="muted small">${esc(t.artist || (t.radio ? 'Прямой эфир' : 'Неизвестный исполнитель'))}</span></span></button>
    <span class="small muted tnum" id="mbarTime">${t.radio ? '● Прямой эфир' : fmtDur(a.currentTime) + ' / ' + fmtDur(a.duration || t.duration)}</span>
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
  const [tags, duration] = await Promise.all([readTags(f), trackDuration(f)]);
  let cover = '';
  if (tags.pic) try { cover = await compress(tags.pic, 600, 250000, true); } catch (e) { }
  // название и исполнитель — из тегов файла, иначе из имени «Исполнитель - Песня»; перед загрузкой их можно поправить
  S.trackForm = { mode: 'new', file: f, duration, cover, tags: !!(tags.title || tags.artist || cover),
    title: (tags.title || (m ? m[2] : base)).slice(0, 120), artist: (tags.artist || (m ? m[1] : '')).slice(0, 120) };
  render(); setTimeout(() => document.getElementById('tfTitle')?.focus(), 50);
}
async function saveTrackForm() {
  const tf = S.trackForm; if (!tf || S.busy) return;
  const val = id => (document.getElementById(id)?.value || '').trim();
  const title = val('tfTitle').slice(0, 120), artist = val('tfArtist').slice(0, 120);
  if (!title) { toast('Напишите название песни'); return; }
  if (tf.mode === 'edit') {
    const patch = { title, artist }; if (tf.cover !== undefined) patch.cover = tf.cover;
    await updateDoc(doc(db, 'tracks', tf.id), patch);
    for (const x of [curTrack(), ...(cache.tracks || [])]) if (x?.id === tf.id) Object.assign(x, patch);
    S.trackForm = null; toast('Трек сохранён'); render(); return;
  }
  S.trackForm = null; render();
  const fileId = await putFile(tf.file, 'music', `Загружаем «${title}»`);
  const ref = await addDoc(collection(db, 'tracks'), { ownerId: uid(), title, artist, fileId, type: tf.file.type || 'audio/mpeg', duration: tf.duration, size: tf.file.size, createdAt: serverTimestamp() });
  if (tf.cover) await updateDoc(ref, { cover: tf.cover }).catch(console.error);   // обложку правила разрешают ставить правкой трека
  toast('Трек загружен'); if (S.view === 'music') loadMusic();
}
/* Теги MP3 (ID3v2.3/2.4 и ID3v1): название, исполнитель, обложка. Русские старые теги часто в cp1251 — так и читаем */
async function readTags(f) {
  const out = {};
  const dec = (bytes, enc) => {
    const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'windows-1251';
    try { return new TextDecoder(label).decode(bytes).replace(/\0+$/g, '').replace(/\0/g, ' ').trim(); } catch (e) { return ''; }
  };
  try {
    const h = new Uint8Array(await f.slice(0, 10).arrayBuffer());
    if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33 && (h[3] === 3 || h[3] === 4)) {
      const ver = h[3], ss = (b, i) => (b[i] & 127) << 21 | (b[i + 1] & 127) << 14 | (b[i + 2] & 127) << 7 | (b[i + 3] & 127);
      const be = (b, i) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
      const size = ss(h, 6), buf = new Uint8Array(await f.slice(10, 10 + Math.min(size, 6e6)).arrayBuffer());
      let p = h[5] & 0x40 ? (ver === 4 ? ss(buf, 0) : be(buf, 0) + 4) : 0;
      while (p + 10 <= buf.length) {
        const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const sz = ver === 4 ? ss(buf, p + 4) : be(buf, p + 4);
        if (!sz || p + 10 + sz > buf.length) break;
        const body = buf.subarray(p + 10, p + 10 + sz);
        if (id === 'TIT2') out.title = dec(body.subarray(1), body[0]);
        else if (id === 'TPE1') out.artist = dec(body.subarray(1), body[0]);
        else if (id === 'APIC' && !out.pic) {
          const enc = body[0]; let i = 1; while (i < body.length && body[i]) i++;
          const mime = String.fromCharCode(...body.subarray(1, i)) || 'image/jpeg'; i += 2;   // ноль после типа и байт «вид картинки»
          if (enc === 1 || enc === 2) { while (i + 1 < body.length && (body[i] || body[i + 1])) i += 2; i += 2; } else { while (i < body.length && body[i]) i++; i++; }
          if (i < body.length) out.pic = new Blob([body.subarray(i)], { type: mime.includes('/') ? mime : 'image/' + mime.toLowerCase() });
        }
        p += 10 + sz;
      }
    }
    if (!out.title && f.size > 128) {
      const t = new Uint8Array(await f.slice(f.size - 128).arrayBuffer());
      if (t[0] === 84 && t[1] === 65 && t[2] === 71) { out.title = dec(t.subarray(3, 33)); out.artist = out.artist || dec(t.subarray(33, 63)); }
    }
  } catch (e) { console.warn('теги не прочитались', e); }
  return out;
}
function trackFormModal() {
  const tf = S.trackForm, isNew = tf.mode === 'new', cover = tf.cover === undefined ? tf.coverNow : tf.cover;
  return `<div class="ov" data-act="ovx"><div class="ov-in modal track-form" data-stop="1">
    <div class="row"><b class="grow">${isNew ? 'Новый трек' : 'Изменить трек'}</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
    <form class="tf-body" data-form="trackform">
      <button type="button" class="tf-cover" data-act="tfcover" aria-label="Выбрать обложку">${safeImg(cover) ? `<img src="${esc(cover)}" alt="Обложка">` : `<span>${I.photo}<small>Обложка</small></span>`}</button>
      <div class="tf-fields">
        <label class="field"><span>Название песни</span><input id="tfTitle" class="inp" maxlength="120" required value="${esc(tf.title)}" placeholder="Например: Кукла колдуна"></label>
        <label class="field"><span>Исполнитель</span><input id="tfArtist" class="inp" maxlength="120" value="${esc(tf.artist)}" placeholder="Например: Король и Шут"></label>
        ${cover ? `<button type="button" class="linkbtn small" data-act="tfnocover">Убрать обложку</button>` : ''}
      </div>
      <p class="hint" style="margin:0;grid-column:1/-1">${isNew && tf.tags ? '✨ Взяли название, исполнителя' + (tf.cover ? ' и обложку' : '') + ' из файла. Проверьте. ' : ''}Пишите как в оригинале — тогда автопоиск найдёт текст с тайм-кодами.</p>
      <button class="btn" style="grid-column:1/-1" ${S.busy ? 'disabled' : ''}>${isNew ? 'Загрузить' : 'Сохранить'}</button>
    </form></div></div>`;
}
// cover: undefined — обложку не трогали; '' — убрали
const openTrackEdit = t => { S.trackForm = { mode: 'edit', id: t.id, title: t.title || '', artist: t.artist || '', cover: undefined, coverNow: t.cover || '' }; render(); };
function viewMusic() {
  const tab = S.musicTab, me = S.me, other = !['my', 'all'].includes(tab) ? U(tab) : null;
  const t2 = (k, l) => `<a class="${tab === k ? 'on' : ''}" href="#music/${k}">${l}</a>`;
  const list = cache.tracks || [], cur = curTrack();
  return `<div class="card"><div class="pad" style="padding-bottom:0"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС Музыка</h1>
      <div class="muted small">mp3, m4a, ogg до ${fmtSize(LIMITS.music)}. Название, исполнителя и обложку можно поправить перед загрузкой.</div></div>
      ${banOf(me) ? '' : `<button class="btn" data-act="pickmusic" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить трек</span></button>`}</div></div>
    <div class="tabs">${t2('my', 'Моя музыка')}${t2('all', 'Новое')}${other ? `<a class="on" href="#music/${esc(tab)}">${esc(other.name)}</a>` : ''}</div></div>
    <div class="card ulist">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : list.length ? list.map((t, i) => {
      const playing = cur?.id === t.id && !player.audio.paused, mine = t.ownerId === me.id, saved = (me.tracks || []).includes(t.id);
      return `<div class="uitem track ${cur?.id === t.id ? 'cur' : ''}"><button class="track-play" data-act="tplay" data-i="${i}" aria-label="${playing ? 'Пауза' : 'Играть'}">${playing ? I.pause : I.play}</button>
        <div class="grow" style="min-width:0"><b class="track-title">${esc(t.title)}</b><div class="muted small">${esc(t.artist || 'Неизвестный исполнитель')}${!mine && U(t.ownerId) ? ' · добавил(а) ' + esc(U(t.ownerId).name) : ''}</div></div>
        <span class="muted small tnum">${fmtDur(t.duration)}</span>
        ${mine ? `<button class="icon-btn" data-act="tedit" data-id="${esc(t.id)}" aria-label="Изменить трек" title="Изменить название и обложку">✏️</button>` : ''}
        ${mine ? `<button class="icon-btn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Удалить трек">${S.confirm === 'track:' + t.id ? 'Удалить?' : '🗑'}</button>`
          : `<button class="icon-btn ${saved ? 'on' : ''}" data-act="tsave" data-id="${esc(t.id)}" aria-label="${saved ? 'Убрать из моей музыки' : 'Добавить в мою музыку'}" title="${saved ? 'Убрать из моей музыки' : 'Добавить в мою музыку'}">${saved ? '✓' : '＋'}</button>`}
        ${isSiteAdmin() && !mine ? `<button class="icon-btn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Удалить трек (админ)">${S.confirm === 'track:' + t.id ? 'Удалить?' : '🗑'}</button>` : ''}</div>`;
    }).join('') : `<div class="empty">${tab === 'my' ? 'Здесь будут ваши треки. Загрузите первый или добавьте из «Нового».' : 'Треков пока нет'}</div>`}</div>`;
}

/* ---------- ВС События ---------- */
const evDate = t => { const d = new Date(ms(t)); return d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + DAYS[d.getDay()] + ' в ' + hm(d); };
function viewEvents() {
  const list = cache.events || [];
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС События</h1><div class="muted small">Встречи, праздники и вечеринки</div></div>
      ${banOf(S.me) ? '' : `<button class="btn" data-act="newevent">Создать событие</button>`}</div>
    ${S.newEvent ? `<form class="form" data-form="event" style="margin-top:14px">
      <div class="lot-photo">${S.evCover ? `<img src="${esc(S.evCover)}" alt="Обложка">` : `<span class="muted small">Обложка</span>`}<button type="button" class="btn sec small" data-act="evcover">${S.evCover ? 'Другая' : 'Добавить обложку'}</button></div>
      <div class="field"><label for="evTitle">Название</label><input id="evTitle" required minlength="2" maxlength="100" placeholder="Пикник в парке"></div>
      <div class="row" style="gap:10px;flex-wrap:wrap"><div class="field grow"><label for="evAt">Когда</label><input id="evAt" type="datetime-local" required></div>
        <div class="field grow"><label for="evPlace">Где</label><input id="evPlace" maxlength="120" placeholder="Парк Горького, у фонтана"></div></div>
      <div class="field"><label for="evText">Подробности</label><textarea id="evText" rows="3" maxlength="2000"></textarea></div>
      <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>Создать</button><button type="button" class="btn ghost" data-act="newevent">Отмена</button></div></form>` : ''}</div>
    ${S.loading ? loadingBox() : list.length ? `<div class="ev-list">${list.map(e => {
      const d = new Date(ms(e.at)), going = (e.going || []).includes(S.me.id);
      return `<a class="card ev-card" href="#event/${esc(e.id)}">${safeImg(e.cover) ? `<img class="ev-cover" src="${esc(e.cover)}" alt="" loading="lazy">` : ''}
        <div class="ev-date"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span></div>
        <div class="ev-body"><b>${esc(e.title)}</b><span class="muted small">${DAYS[d.getDay()]}, ${hm(d)}${e.place ? ' · ' + esc(e.place) : ''}</span>
          <span class="small ${going ? 'ok' : 'muted'}">${going ? '✓ Вы идёте · ' : ''}${(e.going || []).length} ${plural((e.going || []).length, 'идёт', 'идут', 'идут')}</span></div></a>`;
    }).join('')}</div>` : `<div class="card empty"><b>Ближайших событий нет</b><span>Создайте первое — позовите друзей!</span></div>`}`;
}
function viewEvent() {
  const e = cache.event;
  if (!e) return loadingBox();
  if (e.missing) return `<div class="card empty"><b>Событие удалено</b><a class="btn sec" href="#events">Все события</a></div>`;
  const own = e.ownerId === S.me.id, going = (e.going || []).includes(S.me.id), u = U(e.ownerId), people = (e.going || []).slice(0, 30).map(U).filter(Boolean);
  ensureUsers((e.going || []).slice(0, 30));
  const past = ms(e.at) < Date.now();
  return `<div class="card ev-page">${safeImg(e.cover) ? `<img class="ev-hero" src="${esc(e.cover)}" alt="">` : `<div class="ev-hero ev-hero-empty">📅</div>`}
    <div class="pad" style="display:flex;flex-direction:column;gap:12px">
      <div class="row"><a class="icon-btn" href="#events" aria-label="Все события">${I.back}</a>${past ? '<span class="chip">Прошло</span>' : ''}</div>
      <h1 class="h" style="font-size:24px">${esc(e.title)}</h1>
      <div class="ev-facts"><div>🕒 <b>${esc(evDate(e.at))}</b></div>${e.place ? `<div>📍 ${esc(e.place)}</div>` : ''}<div>👤 Организатор: ${nameLink(u)}</div></div>
      ${e.text ? `<div class="post-text">${linkify(e.text)}</div>` : ''}
      <div class="row" style="flex-wrap:wrap">${past || banOf(S.me) ? '' : `<button class="btn ${going ? 'sec' : ''}" data-act="evgo" data-id="${esc(e.id)}">${going ? '✓ Я иду · отменить' : 'Пойду'}</button>`}
        ${own || isSiteAdmin() ? `<button class="btn ${S.confirm === 'ev:' + e.id ? 'danger' : 'ghost'}" data-act="evdel" data-id="${esc(e.id)}">${S.confirm === 'ev:' + e.id ? 'Удалить событие?' : 'Удалить'}</button>` : ''}</div>
      <b>Идут · ${(e.going || []).length}</b>
      <div class="ev-people">${people.map(p => `<a href="#id/${esc(p.id)}" title="${esc(p.name)}">${avatar(p, 40, false)}</a>`).join('')}</div>
    </div></div>`;
}

/* ---------- ВС Курсы (ЦБ РФ через cbr-xml-daily.ru, бесплатно) ---------- */
const CUR_MAIN = ['USD', 'EUR', 'CNY', 'GBP', 'JPY', 'TRY', 'KZT', 'BYN', 'AED', 'CHF', 'AMD', 'UZS'];
const CUR_FLAG = { RUB: '🇷🇺', USD: '🇺🇸', EUR: '🇪🇺', CNY: '🇨🇳', GBP: '🇬🇧', JPY: '🇯🇵', TRY: '🇹🇷', KZT: '🇰🇿', BYN: '🇧🇾', AED: '🇦🇪', CHF: '🇨🇭', AMD: '🇦🇲', UZS: '🇺🇿' };
async function loadRates() {
  S.rates = { loading: true }; render();
  try {
    const j = await (await fetch('https://www.cbr-xml-daily.ru/daily_json.js')).json();
    S.rates = { date: j.Date, v: j.Valute };
  } catch (e) { console.error(e); S.rates = { error: 'Не удалось загрузить курсы. Проверьте интернет.' }; }
  render();
}
const rubPer = (r, code) => code === 'RUB' ? 1 : r.v[code] ? r.v[code].Value / r.v[code].Nominal : NaN;
function viewRates() {
  const r = S.rates || {};
  if (!r.v) return `<div class="card pad"><h1 class="h brandh">ВС Курсы</h1></div>${r.error ? `<div class="card empty">${esc(r.error)}<button class="btn sec" data-act="ratesreload">Ещё раз</button></div>` : loadingBox()}`;
  const amt = Number(S.cvAmt ?? 100) || 0, from = S.cvFrom || 'USD', to = S.cvTo || 'RUB';
  const res = amt * rubPer(r, from) / rubPer(r, to);
  const opts = sel => ['RUB', ...CUR_MAIN].filter(c => c === 'RUB' || r.v[c]).map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${CUR_FLAG[c] || ''} ${c}</option>`).join('');
  return `<div class="card pad"><h1 class="h brandh">ВС Курсы</h1><div class="muted small">Официальный курс ЦБ РФ на ${new Date(r.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div></div>
    <div class="card pad cv"><div class="cv-row"><input id="cvAmt" class="inp" type="number" min="0" step="any" inputmode="decimal" value="${esc(String(S.cvAmt ?? 100))}"><select id="cvFrom" class="inp">${opts(from)}</select></div>
      <button class="icon-btn cv-swap" data-act="cvswap" aria-label="Поменять местами">⇅</button>
      <div class="cv-row"><div class="cv-res tnum">${isFinite(res) ? res.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—'}</div><select id="cvTo" class="inp">${opts(to)}</select></div></div>
    <div class="card ulist">${CUR_MAIN.filter(c => r.v[c]).map(c => { const x = r.v[c], ch = x.Value - x.Previous;
      return `<div class="uitem rate"><span class="rate-flag">${CUR_FLAG[c] || '💱'}</span><div class="grow"><b>${c}</b> <span class="muted small">${esc(x.Name)}</span><div class="muted small">за ${x.Nominal}</div></div>
        <b class="tnum">${x.Value.toFixed(2)} ₽</b><span class="tnum small ${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}</span></div>`; }).join('')}</div>
    <p class="hint" style="text-align:center">Данные: ЦБ РФ (cbr-xml-daily.ru)</p>`;
}

/* ---------- ВС Радио ---------- */
const RADIO = [
  { id: 'record', title: 'Радио Record', artist: 'Танцевальная музыка', url: 'https://radiorecord.hostingradio.ru/rr_main96.aacp', c: '#F2994A' },
  { id: 'europa', title: 'Европа Плюс', artist: 'Поп-хиты', url: 'https://ep256.hostingradio.ru:8052/europaplus256.mp3', c: '#2F80ED' },
  { id: 'rusradio', title: 'Русское Радио', artist: 'Русская поп-музыка', url: 'https://rusradio.hostingradio.ru/rusradio96.aacp', c: '#D0462F' },
  { id: 'dfm', title: 'DFM', artist: 'Dance FM', url: 'https://dfm.hostingradio.ru/dfm96.aacp', c: '#B4398F' },
  { id: 'maximum', title: 'Maximum', artist: 'Рок и альтернатива', url: 'https://maximum.hostingradio.ru/maximum96.aacp', c: '#4E5B76' },
  { id: 'chill', title: 'Record Chill-Out', artist: 'Спокойная музыка', url: 'https://radiorecord.hostingradio.ru/chil96.aacp', c: '#1F8A5B' },
  { id: 'rock', title: 'Record Rock', artist: 'Рок', url: 'https://radiorecord.hostingradio.ru/rock96.aacp', c: '#141A33' },
  { id: 'lofi', title: 'Record Lo-Fi', artist: 'Лоу-фай для учёбы', url: 'https://radiorecord.hostingradio.ru/lofi96.aacp', c: '#6A47C9' },
];
function viewRadio() {
  const cur = curTrack();
  return `<div class="card pad"><h1 class="h brandh">ВС Радио</h1><div class="muted small">Прямой эфир, играет в общем плеере внизу экрана</div></div>
    <div class="radio-grid">${RADIO.map((st, i) => { const on = cur?.radio && cur.id === st.id, playing = on && !player.audio.paused;
      return `<button class="radio-card ${on ? 'on' : ''}" data-act="radioplay" data-i="${i}" style="--rc:${st.c}"><span class="radio-ico">${playing ? I.pause : I.play}</span><b>${esc(st.title)}</b><span class="small">${esc(st.artist)}</span>${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : ''}</button>`; }).join('')}</div>
    <p class="hint" style="text-align:center">Если станция не включается, значит, её эфир сейчас недоступен — попробуйте другую.</p>`;
}

/* ---------- ВС Гороскоп (шуточный: прогноз собирается из фраз по дате и знаку) ---------- */
const SIGNS = [['aries', '♈', 'Овен', '21.03–19.04'], ['taurus', '♉', 'Телец', '20.04–20.05'], ['gemini', '♊', 'Близнецы', '21.05–20.06'], ['cancer', '♋', 'Рак', '21.06–22.07'],
  ['leo', '♌', 'Лев', '23.07–22.08'], ['virgo', '♍', 'Дева', '23.08–22.09'], ['libra', '♎', 'Весы', '23.09–22.10'], ['scorpio', '♏', 'Скорпион', '23.10–21.11'],
  ['sagittarius', '♐', 'Стрелец', '22.11–21.12'], ['capricorn', '♑', 'Козерог', '22.12–19.01'], ['aquarius', '♒', 'Водолей', '20.01–18.02'], ['pisces', '♓', 'Рыбы', '19.02–20.03']];
const HORO = {
  day: ['День подходит для смелых решений.', 'Звёзды советуют не торопиться и всё взвесить.', 'Сегодня всё получится легче, чем вы думаете.', 'Хороший день, чтобы закончить старые дела.', 'Удача на вашей стороне — пользуйтесь.', 'Возможны приятные сюрпризы ближе к вечеру.', 'Лучше провести день спокойно и без суеты.', 'Новые знакомства принесут пользу.'],
  love: ['В отношениях — тепло и понимание.', 'Сделайте близкому человеку маленький подарок.', 'Не спорьте по пустякам — оно того не стоит.', 'Кто-то давно хочет с вами поговорить.', 'Романтический вечер будет кстати.', 'Время откровенных разговоров.'],
  work: ['На работе или учёбе вас похвалят.', 'Неожиданная идея решит старую задачу.', 'Не берите на себя слишком много.', 'Хороший день для планов на месяц.', 'Коллеги будут рады помочь — просто попросите.', 'Отложите важные покупки на пару дней.'],
  tip: ['Выпейте стакан воды и улыбнитесь.', 'Позвоните другу, с которым давно не общались.', 'Прогуляйтесь хотя бы 20 минут.', 'Выложите запись на VСмске — её оценят.', 'Ложитесь спать пораньше.', 'Наведите порядок на рабочем столе.', 'Послушайте новую музыку в ВС Музыке.'],
  color: ['синий', 'зелёный', 'красный', 'золотой', 'фиолетовый', 'белый', 'оранжевый', 'бирюзовый'],
};
function horo(sign) {
  let h = 0; const key = sign + new Date().toDateString();
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (arr, k) => arr[(h >>> k) % arr.length];
  return { day: pick(HORO.day, 1), love: pick(HORO.love, 4), work: pick(HORO.work, 7), tip: pick(HORO.tip, 10), color: pick(HORO.color, 13), num: (h % 99) + 1, mood: (h >>> 3) % 5 + 1 };
}
function signOf(bday) {
  if (!bday) return null; const [, m, d] = bday.split('-').map(Number), md = m * 100 + d;
  const edges = [[120, 'capricorn'], [219, 'aquarius'], [321, 'pisces'], [420, 'aries'], [521, 'taurus'], [621, 'gemini'], [723, 'cancer'], [823, 'leo'], [923, 'virgo'], [1023, 'libra'], [1122, 'scorpio'], [1222, 'sagittarius']];
  for (const [e, sg] of edges) if (md < e) return sg; return 'capricorn';
}
function viewHoro() {
  const sel = S.sign || signOf(S.me.bday) || 'aries', sg = SIGNS.find(x => x[0] === sel), h = horo(sel);
  return `<div class="card pad"><h1 class="h brandh">ВС Гороскоп</h1><div class="muted small">Шуточный прогноз на ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}${signOf(S.me.bday) ? '' : ' · укажите день рождения в профиле, и знак выберется сам'}</div></div>
    <div class="sign-grid">${SIGNS.map(([k, e, n]) => `<button class="${k === sel ? 'on' : ''}" data-act="sign" data-s="${k}"><span>${e}</span>${n}</button>`).join('')}</div>
    <div class="card pad horo"><div class="row"><span class="horo-sign">${sg[1]}</span><div class="grow"><h2 class="h">${sg[2]}</h2><div class="muted small">${sg[3]}</div></div><div class="horo-mood" title="Настроение дня">${'★'.repeat(h.mood)}${'☆'.repeat(5 - h.mood)}</div></div>
      <p><b>Общее.</b> ${h.day}</p><p><b>Любовь.</b> ${h.love}</p><p><b>Дела.</b> ${h.work}</p><p><b>Совет дня.</b> ${h.tip}</p>
      <div class="row muted small" style="gap:16px;flex-wrap:wrap"><span>Число удачи: <b>${h.num}</b></span><span>Цвет дня: <b>${h.color}</b></span></div></div>`;
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
      <textarea id="nText" rows="8" maxlength="20000" placeholder="Текст заметки. Для чек-листа начинайте строку с [ ]">${esc(n?.text || '')}</textarea>
      <div><button type="button" class="btn ghost small" data-act="noteitem">☐ Добавить пункт</button></div>
      <div class="row" style="flex-wrap:wrap;gap:6px">${NOTE_COLORS.map(c => `<button type="button" class="note-dot c-${c || 'none'} ${((n?.color ?? S.noteColor) || '') === c ? 'on' : ''}" data-act="notecolor" data-c="${c}" aria-label="Цвет ${c || 'обычный'}"></button>`).join('')}
        <label class="row small" style="gap:6px;margin-left:8px"><input type="checkbox" id="nPin" ${n?.pinned ? 'checked' : ''}> Закрепить</label></div>
      <div class="row"><button class="btn" type="submit">Сохранить</button><button type="button" class="btn ghost" data-act="noteclose">Закрыть</button><span class="grow"></span>
        ${n ? `<button type="button" class="btn ${S.confirm === 'note:' + n.id ? 'danger' : 'ghost'}" data-act="notedel" data-id="${esc(n.id)}">${S.confirm === 'note:' + n.id ? 'Удалить?' : 'Удалить'}</button>` : ''}</div>
    </form></div>` : '';
  return `<div class="card pad"><div class="row"><div class="grow"><h1 class="h brandh">ВС Заметки</h1><div class="muted small">Видите только вы</div></div>
      <button class="btn" data-act="notenew">Новая заметка</button></div></div>
    ${editor}
    ${S.loading ? loadingBox() : cache.notes.length ? `<div class="note-grid">${cache.notes.map(x => `<button class="note-card c-${esc(x.color || 'none')}" data-act="noteopen" data-id="${esc(x.id)}">
        ${x.pinned ? '<span class="note-pin">📌</span>' : ''}${x.title ? `<b>${esc(x.title)}</b>` : ''}${noteBody(x)}<span class="muted small">${ago(x.updatedAt)}</span></button>`).join('')}</div>`
      : `<div class="card empty"><b>Заметок пока нет</b><span>Списки покупок, идеи, пароли от Wi-Fi — всё сюда.</span></div>`}`;
}

// Строки «[ ] дело» и «[x] дело» показываем как чек-лист
function noteBody(n) {
  const lines = n.text.split('\n').slice(0, 12);
  if (!lines.some(l => /^\[( |x)\] /i.test(l))) return `<span class="note-body">${esc(n.text.slice(0, 300))}</span>`;
  return `<span class="note-body checklist">${lines.map((l, i) => { const m = l.match(/^\[( |x)\] (.*)$/i);
    return m ? `<span class="chk ${m[1] !== ' ' ? 'done' : ''}" data-act="notecheck" data-id="${esc(n.id)}" data-i="${i}" role="checkbox" aria-checked="${m[1] !== ' '}">${m[1] !== ' ' ? '☑' : '☐'} ${esc(m[2])}</span>` : `<span>${esc(l)}</span>`; }).join('')}</span>`;
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
  if (S.game === 'snake') {
    if (!snake) setTimeout(snakeNew, 0); else setTimeout(snakeDraw, 0);
    const g = snake || { score: 0, over: false, started: false };
    return `<div class="card pad"><div class="row">${back}<h1 class="h grow">Змейка</h1><div class="g-score"><span>Счёт</span><b id="snScore">${g.score}</b></div><div class="g-score"><span>Рекорд</span><b>${Number(lsGet('vs_snake') || 0)}</b></div></div>
        <p class="muted small" style="margin:8px 0 0">Стрелки, свайп или кнопки. Ешьте яблоки и не врезайтесь в стены и в себя.</p></div>
      <div class="card pad g2048-wrap"><div class="snake-wrap"><canvas id="snake" width="432" height="432" aria-label="Поле змейки"></canvas>
        ${g.over ? `<div class="g-over"><b>Счёт: ${g.score}</b><button class="btn" data-act="snakenew">Ещё раз</button></div>` : !g.started ? `<div class="g-over light-over"><b>Нажмите стрелку, чтобы начать</b></div>` : ''}</div>
        <div class="row g-pad"><button class="btn sec" data-act="snaketurn" data-d="0">←</button><button class="btn sec" data-act="snaketurn" data-d="2">↑</button><button class="btn sec" data-act="snaketurn" data-d="3">↓</button><button class="btn sec" data-act="snaketurn" data-d="1">→</button>
          <span class="grow"></span><button class="btn ghost" data-act="snakenew">Заново</button></div></div>`;
  }
  if (S.game === 'mines') {
    const g = S.mines ||= minesNew(), flags = g.cells.filter(c => c.flag).length;
    return `<div class="card pad"><div class="row">${back}<h1 class="h grow">Сапёр</h1><div class="g-score"><span>Мины</span><b>${g.m - flags}</b></div></div>
        <p class="muted small" style="margin:8px 0 0">Открывайте клетки. Цифра — сколько мин рядом. Включите «Флажок», чтобы пометить мину.</p></div>
      <div class="card pad g2048-wrap"><div class="mines" style="--n:${g.n}">${g.cells.map((c, i) => `<button class="mc ${c.open ? 'open' : ''} ${c.open && c.mine ? 'boom' : ''}" data-act="minesopen" data-i="${i}" ${g.over ? 'disabled' : ''} data-n="${c.open && !c.mine ? c.near : ''}">${c.open ? (c.mine ? '💣' : c.near || '') : c.flag ? '🚩' : ''}</button>`).join('')}</div>
        ${g.over ? `<div class="row"><b>${g.won ? `Победа за ${g.time} с! 🎉` : 'Бах! Вы подорвались 💥'}</b><button class="btn" data-act="minesnew">Ещё раз</button></div>` : ''}
        <div class="row g-pad"><button class="btn ${g.flagMode ? '' : 'sec'}" data-act="minesflag">🚩 Флажок${g.flagMode ? ': вкл' : ''}</button><span class="grow"></span><button class="btn ghost" data-act="minesnew">Заново</button></div></div>`;
  }
  if (S.game === 'memory') {
    const g = S.mem ||= memNew();
    return `<div class="card pad"><div class="row">${back}<h1 class="h grow">Мемори</h1><div class="g-score"><span>Ходы</span><b>${g.moves}</b></div><div class="g-score"><span>Рекорд</span><b>${lsGet('vs_memory') || '—'}</b></div></div>
        <p class="muted small" style="margin:8px 0 0">Переворачивайте по две карточки и найдите все пары.</p></div>
      <div class="card pad g2048-wrap"><div class="mem">${g.deck.map((c, i) => `<button class="mcard ${c.open || c.done ? 'up' : ''} ${c.done ? 'done' : ''}" data-act="memflip" data-i="${i}" aria-label="Карточка ${i + 1}"><span>${c.open || c.done ? c.e : ''}</span></button>`).join('')}</div>
        ${g.won ? `<div class="row"><b>Все пары за ${g.moves} ходов! 🎉</b><button class="btn" data-act="memnew">Ещё раз</button></div>` : `<div class="row g-pad"><span class="grow"></span><button class="btn ghost" data-act="memnew">Заново</button></div>`}</div>`;
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
      <a class="app-tile c-album" href="#games/snake"><span class="app-ico g-ico">🐍</span><b>Змейка</b><span class="muted small">Рекорд: ${Number(lsGet('vs_snake') || 0)}</span></a>
      <a class="app-tile c-disk" href="#games/mines"><span class="app-ico g-ico">💣</span><b>Сапёр</b><span class="muted small">Поле 9×9, 10 мин</span></a>
      <a class="app-tile c-horo" href="#games/memory"><span class="app-ico g-ico">🃏</span><b>Мемори</b><span class="muted small">Найди пары · рекорд ${lsGet('vs_memory') || '—'} ходов</span></a>
    </div>`;
}

/* Змейка: игра рисуется прямо в canvas, без перерисовки страницы */
const SN = 18;
let snake = null, snakeTimer = null;
function snakeNew() { snake = { body: [[8, 9], [7, 9], [6, 9]], dir: [1, 0], next: [1, 0], food: [13, 9], score: 0, over: false, started: false }; snakeDraw(); }
function snakeFood() { let f; do { f = [Math.floor(Math.random() * SN), Math.floor(Math.random() * SN)]; } while (snake.body.some(([x, y]) => x === f[0] && y === f[1])); snake.food = f; }
function snakeTick() {
  const g = snake; if (!g || g.over) return;
  g.dir = g.next;
  const h = [g.body[0][0] + g.dir[0], g.body[0][1] + g.dir[1]];
  if (h[0] < 0 || h[1] < 0 || h[0] >= SN || h[1] >= SN || g.body.some(([x, y]) => x === h[0] && y === h[1])) {
    g.over = true; clearInterval(snakeTimer); snakeTimer = null;
    if (g.score > Number(lsGet('vs_snake') || 0)) lsSet('vs_snake', String(g.score));
    render(); return;
  }
  g.body.unshift(h);
  if (h[0] === g.food[0] && h[1] === g.food[1]) { g.score++; snakeFood(); const el = document.getElementById('snScore'); if (el) el.textContent = g.score; }
  else g.body.pop();
  snakeDraw();
}
function snakeDraw() {
  const cv = document.getElementById('snake'); if (!cv || !snake) return;
  const ctx = cv.getContext('2d'), c = cv.width / SN, css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--surface-2').trim() || '#eee'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#E2553F'; ctx.beginPath(); ctx.arc((snake.food[0] + .5) * c, (snake.food[1] + .5) * c, c * .38, 0, 7); ctx.fill();
  snake.body.forEach(([x, y], i) => { ctx.fillStyle = i ? (css.getPropertyValue('--accent').trim() || '#2F44D0') : '#1F8A5B'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x * c + 1, y * c + 1, c - 2, c - 2, 5) : ctx.rect(x * c + 1, y * c + 1, c - 2, c - 2); ctx.fill(); });
}
function snakeTurn(d) {
  const g = snake; if (!g || g.over) return;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]], nd = dirs[d];
  if (nd[0] === -g.dir[0] && nd[1] === -g.dir[1]) return;
  g.next = nd;
  if (!g.started) { g.started = true; snakeTimer = setInterval(snakeTick, 140); render(); }
}

/* Сапёр */
function minesNew() {
  const n = 9, m = 10, cells = Array.from({ length: n * n }, () => ({ mine: false, open: false, flag: false, near: 0 }));
  let k = 0; while (k < m) { const i = Math.floor(Math.random() * n * n); if (!cells[i].mine) { cells[i].mine = true; k++; } }
  cells.forEach((c, i) => { c.near = nbrs(i, n).filter(j => cells[j].mine).length; });
  return { n, m, cells, over: false, won: false, flagMode: false, first: true, start: 0 };
}
function nbrs(i, n) { const x = i % n, y = Math.floor(i / n), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < n && b < n) out.push(b * n + a); } return out; }
function minesOpen(i) {
  const g = S.mines; if (!g || g.over) return; const c = g.cells[i]; if (c.open) return;
  if (g.flagMode) { c.flag = !c.flag; return; }
  if (c.flag) return;
  if (g.first) { // первый ход никогда не на мину
    g.first = false; g.start = Date.now();
    if (c.mine) { c.mine = false; const free = g.cells.findIndex((x, j) => !x.mine && j !== i); g.cells[free].mine = true; g.cells.forEach((x, j) => { x.near = nbrs(j, g.n).filter(t => g.cells[t].mine).length; }); }
  }
  if (c.mine) { g.over = true; g.cells.forEach(x => { if (x.mine) x.open = true; }); return; }
  const stack = [i];
  while (stack.length) { const j = stack.pop(), x = g.cells[j]; if (x.open || x.flag) continue; x.open = true; if (!x.near) nbrs(j, g.n).forEach(t => { if (!g.cells[t].open && !g.cells[t].mine) stack.push(t); }); }
  if (g.cells.every(x => x.mine || x.open)) { g.over = true; g.won = true; g.time = Math.round((Date.now() - g.start) / 1000); }
}

/* Мемори */
const MEM_EMOJI = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐵', '🐙'];
function memNew() { const deck = [...MEM_EMOJI, ...MEM_EMOJI].map(e => ({ e, open: false, done: false })).sort(() => Math.random() - .5); return { deck, moves: 0, pick: [], won: false }; }
function memFlip(i) {
  const g = S.mem; if (!g || g.won || g.pick.length === 2) return; const c = g.deck[i]; if (c.open || c.done) return;
  c.open = true; g.pick.push(i);
  if (g.pick.length === 2) {
    g.moves++;
    const [a, b] = g.pick;
    if (g.deck[a].e === g.deck[b].e) { g.deck[a].done = g.deck[b].done = true; g.pick = []; if (g.deck.every(x => x.done)) { g.won = true; const best = Number(lsGet('vs_memory') || 0); if (!best || g.moves < best) lsSet('vs_memory', String(g.moves)); } }
    else setTimeout(() => { g.deck[a].open = g.deck[b].open = false; g.pick = []; render(); }, 800);
  }
}
// управление 2048 с клавиатуры и свайпом
document.addEventListener('keydown', e => {
  if (S.view !== 'games' || !['2048', 'snake'].includes(S.game) || e.target.closest?.('input,textarea')) return;
  const d = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 }[e.key];
  if (d !== undefined) { e.preventDefault(); S.game === 'snake' ? snakeTurn(d) : g2048Move(d); }
});
let touch0 = null;
document.addEventListener('touchstart', e => { if (e.target.closest?.('#g2048,#snake')) touch0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
document.addEventListener('touchmove', e => { if (touch0 && e.target.closest?.('#g2048,#snake')) e.preventDefault(); }, { passive: false });
document.addEventListener('touchend', e => {
  if (!touch0) return;
  const dx = e.changedTouches[0].clientX - touch0[0], dy = e.changedTouches[0].clientY - touch0[1]; touch0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3);
  S.game === 'snake' ? snakeTurn(dir) : g2048Move(dir);
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
const NOTIF_TEXT = { like: 'оценил(а) вашу запись', comment: 'прокомментировал(а) вашу запись', wall: 'написал(а) у вас на стене', friend: 'принял(а) вашу заявку в друзья', repost: 'поделился(ась) вашей записью', mention: 'упомянул(а) вас', gift: 'сделал(а) вам подарок', answer: 'ответил(а) на ваш вопрос', best: 'выбрал(а) ваш ответ лучшим', nick: 'подарил(а) вам коллекционный юзернейм 💎' };
function viewNotifs() {
  const list = cache.notifs.filter(n => n.from !== S.me.id);
  return `<div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Уведомления <span class="muted">${list.length}</span></h1></div>
    <div class="ulist">${list.length ? list.map(n => {
      const u = U(n.from); if (!u) return '';
      const href = n.type === 'gift' || n.type === 'nick' ? '#id/' + uid() : n.type === 'friend' ? '#id/' + n.from : ['answer', 'best'].includes(n.type) ? '#q/' + n.postId : n.postId ? '#post/' + n.postId : '#id/' + n.from;
      return `<a class="uitem notif" href="${esc(href)}" style="color:var(--fg)">${avatar(u, 46, false)}
        <div class="grow" style="min-width:0"><b>${esc(u.name)}</b> ${NOTIF_TEXT[n.type] || ''}
          ${n.text ? `<div class="muted small notif-text">«${esc(n.text)}»</div>` : ''}<div class="muted small">${ago(n.createdAt)}</div></div>
        <span class="notif-ico" data-t="${esc(n.type)}">${n.type === 'like' ? I.heart : n.type === 'comment' ? I.comment : n.type === 'friend' ? I.friends : I.feed}</span></a>`;
    }).join('') : `<div class="empty">Пока тихо<span class="small">Здесь появятся лайки, комментарии и записи на вашей стене</span></div>`}</div></div>`;
}

/* Новости */
function viewFeed() {
  const seen = new Set();
  // «Популярное»: последние 150 записей за неделю, по лайкам, комментариям и репостам
  const score = p => (p.likes || []).length + 2 * (p.commentCount || 0) + 3 * (p.reposts || 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const posts = S.feedTab === 'top'
    ? [...cache.feed.values()].flat().filter(p => ms(p.createdAt) >= weekAgo && score(p) > 0 && !p.repostOf).sort((a, b) => score(b) - score(a)).slice(0, 30)
    : [...cache.feed.values()].flat().filter(p => !seen.has(p.id) && seen.add(p.id)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 100);
  const tab = (t, l) => `<button class="${S.feedTab === t ? 'on' : ''}" data-act="feedtab" data-tab="${t}">${l}</button>`;
  const fr = S.me.friends || []; ensureUsers(fr.slice(0, 200));
  const bdays = fr.map(U).filter(u => u && isBdayToday(u.bday));
  return `${storiesBar()}${bdays.length ? `<div class="card pad bday-card"><b>🎂 Сегодня день рождения</b>
      ${bdays.map(u => `<div class="row">${avatar(u, 36)}<span class="grow">${nameLink(u)}</span><a class="btn sec small" href="#im/${esc(u.id)}">Поздравить</a></div>`).join('')}</div>` : ''}
  ${composer(S.me.id, 'Что у вас нового?')}
  <div class="card"><div class="tabs">${tab('friends', 'Друзья')}${tab('top', '🔥 Популярное')}${tab('all', 'Все записи')}</div></div>
  ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') :
    `<div class="card empty"><b>${S.feedTab === 'friends' ? 'Здесь появятся записи ваши и ваших друзей' : S.feedTab === 'top' ? 'За неделю пока ничего не залайкали' : 'Пока никто ничего не написал'}</b>
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
    ${d.files.length ? `<div class="filters" role="radiogroup" aria-label="Фильтр для фото">${Object.entries(PHOTO_FILTERS).map(([k, l]) => `<button type="button" role="radio" aria-checked="${(d.filter || 'none') === k}" class="${(d.filter || 'none') === k ? 'on' : ''}" data-act="pfilter" data-f="${k}"><img src="${d.files[0].url}" alt="" style="filter:${FILTER_CSS[k]}"><span>${l}</span></button>`).join('')}</div>` : ''}
    ${d.files.length ? `<div class="previews n${d.files.length}">${d.files.map((f, i) => `<div class="preview"><img src="${f.url}" alt="Фото ${i + 1}" style="filter:${FILTER_CSS[d.filter || 'none']}"><button type="button" data-act="unattach" data-i="${i}" aria-label="Убрать фото">×</button></div>`).join('')}</div>` : ''}
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
      <button class="btn ghost small" data-act="savepost" data-id="${esc(p.id)}">${(me.saved || []).includes(p.id) ? 'Убрать из закладок' : '🔖 В закладки'}</button>
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

/* QR-код: библиотека грузится с cdnjs только при первом нажатии */
let qrLib = null;
function qrDataUrl(text) {
  qrLib ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = () => res(window.QRCode); sc.onerror = rej; document.head.appendChild(sc); });
  return qrLib.then(QR => {
    const box = document.createElement('div');
    new QR(box, { text, width: 480, height: 480, colorDark: '#151A27', colorLight: '#FFFFFF', correctLevel: QR.CorrectLevel.M });
    const cv = box.querySelector('canvas'); return cv ? cv.toDataURL('image/png') : box.querySelector('img')?.src || '';
  });
}

/* Достижения: считаются на лету из того, что уже загружено (без записей в базу) */
function badges(u, friends, posts, likes) {
  const out = [], days = u.createdAt ? (Date.now() - ms(u.createdAt)) / 864e5 : 0, gifts = cache.gifts.length;
  if (isAdm(u)) out.push(['👑', 'Администратор', 'Следит за порядком на VСмске']);
  if (days >= 365) out.push(['🏛', 'Старожил', 'На VСмске больше года']);
  else if (days < 7) out.push(['🌱', 'Новичок', 'Зарегистрировался на этой неделе']);
  if (friends >= 50) out.push(['🤝', 'Душа компании', '50 и больше друзей']); else if (friends >= 10) out.push(['👋', 'Общительный', '10 и больше друзей']);
  if (posts >= 20) out.push(['✍️', 'Писатель', '20 и больше записей на стене']);
  if (likes >= 100) out.push(['🌟', 'Звезда', '100 и больше лайков на стене']); else if (likes >= 20) out.push(['❤️', 'Любимчик', '20 и больше лайков на стене']);
  if (gifts >= 5) out.push(['🎁', 'Счастливчик', '5 и больше подарков']);
  if ((u.tracks || []).length >= 10) out.push(['🎧', 'Меломан', '10 и больше треков в музыке']);
  if ((u.groups || []).length >= 5) out.push(['🏘', 'Активист', 'Подписан на 5 и больше сообществ']);
  if (isBdayToday(u.bday)) out.push(['🎂', 'Именинник', 'Сегодня день рождения']);
  return out;
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
const isColNick = n => !!cache.nicks.find(x => x.id === n)?.col;
function nickCollection(u, own) {
  const list = cache.nicks.filter(n => n.uid === u.id && n.id !== u.nick).sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
  if (!list.length) return '';
  const can = own || isSiteAdmin(), sel = list.find(n => n.id === S.nickMenu);
  return `<dt>Коллекция</dt><dd class="f-col"><div class="nick-col">${list.map(n => can
      ? `<button class="nick-chip ${sel?.id === n.id ? 'on' : ''}" data-act="nickmenu" data-n="${esc(n.id)}">💎 @${esc(n.id)}</button>`
      : `<a class="nick-chip" href="#@${esc(n.id)}">💎 @${esc(n.id)}</a>`).join('')}</div>
    ${sel ? `<div class="nick-menu">${own ? `<button class="btn sec small" data-act="nickmain" data-n="${esc(sel.id)}">Сделать основным</button>
        <form class="row" data-form="nickgive" data-n="${esc(sel.id)}" style="gap:6px"><input id="giftNick" class="inp" maxlength="31" placeholder="@ник получателя" style="max-width:170px"><button class="btn small">Подарить</button></form>` : ''}
      <button class="btn ${S.confirm === 'nickdel:' + sel.id ? 'danger' : 'ghost'} small" data-act="nickdel" data-n="${esc(sel.id)}">${S.confirm === 'nickdel:' + sel.id ? 'Точно удалить? Имя станет свободным' : own ? 'Отказаться' : 'Забрать'}</button></div>` : ''}</dd>`;
}
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
      <div class="prof-info"><h1 class="prof-name">${esc(u.name)}${emojiTag(u)}${admBadge(u)}</h1><div class="muted">${u.status ? esc(u.status) : own ? 'Добавьте статус в «Редактировать»' : '@' + esc(u.nick)}</div>
        ${!own && seenText(u) ? `<div class="seen small ${isOnline(u) ? 'on' : ''}">${seenText(u)}</div>` : ''}
        ${listeningOf(u) ? `<div class="listening small">🎵 ${own ? 'Вы слушаете' : 'Слушает'}: <b>${esc(listeningOf(u).title)}</b>${listeningOf(u).artist ? ' — ' + esc(listeningOf(u).artist) : ''}</div>` : ''}
        ${banOf(u) ? `<span class="chip ban-chip">⛔ Заблокирован ${banText(banOf(u))}</span>` : ''}
        ${!own && iBlocked(u.id) ? `<span class="chip">Вы заблокировали этого человека</span>` : ''}</div>
      <div class="prof-btns">${own ? `<a class="btn sec" href="#edit">Редактировать</a><button class="icon-btn" data-act="qr" data-id="${esc(u.id)}" aria-label="QR-код моей страницы" title="QR-код моей страницы">${I.qr}</button>` : `${iBlocked(u.id) ? '' : `<a class="btn" href="#im/${esc(u.id)}">Написать</a>${relButtons(u.id)}`}
        <button class="icon-btn" data-act="profmenu" aria-label="Ещё" aria-expanded="${!!S.profMenu}">${I.more}</button>`}</div>
    </div>
    ${!own && S.profMenu ? `<div class="post-menu" style="padding:0 20px 14px">
      <button class="btn ghost small" data-act="${iBlocked(u.id) ? 'unblock' : 'block'}" data-id="${esc(u.id)}">${iBlocked(u.id) ? 'Разблокировать' : S.confirm === 'block:' + u.id ? 'Точно заблокировать?' : 'Заблокировать'}</button>
      <button class="btn ghost small" data-act="qr" data-id="${esc(u.id)}">QR-код страницы</button>
      <button class="btn ghost small" data-act="report" data-type="user" data-id="${esc(u.id)}" data-user="${esc(u.id)}" data-text="${esc(u.name)}">Пожаловаться</button>
      ${isSiteAdmin() && !adm ? `<button class="btn ghost small" data-act="modopen">Модерация</button>` : ''}
    </div>` : ''}
    ${!own && isSiteAdmin() && !adm && S.modOpen ? `<div class="mod-box"><b>Модерация: ${esc(u.name)}</b>
      ${banOf(u) ? `<div class="row" style="flex-wrap:wrap"><span class="grow">Заблокирован ${banText(banOf(u))}${banOf(u).reason ? ' · ' + esc(banOf(u).reason) : ''}</span><button class="btn" data-act="unban" data-id="${esc(u.id)}">Разбанить</button></div>`
        : `<input id="banReason" class="inp" maxlength="300" placeholder="Причина (её увидит человек)">
        <div class="row" style="flex-wrap:wrap;gap:6px">${BAN_DAYS.map(([d, l]) => `<button class="btn ${d ? 'sec' : 'danger'} small" data-act="ban" data-id="${esc(u.id)}" data-d="${d}">${l}</button>`).join('')}</div>`}
    </div>` : ''}
    <dl class="facts">
      <dt>Короткое имя</dt><dd class="f-nick">@${esc(u.nick)}${isColNick(u.nick) ? ' <span title="Коллекционный юзернейм">💎</span>' : ''} <button class="linkbtn small" data-act="copy" data-text="${esc(pageUrl(u))}">${I.link} ссылка</button></dd>
      ${nickCollection(u, own)}
      ${adm ? `<dt>Роль</dt><dd><b class="adm-role">Администратор сайта</b></dd>` : ''}
      ${u.city ? `<dt>Город</dt><dd class="f-city">${esc(u.city)}</dd>` : ''}
      ${u.bday ? `<dt>День рождения</dt><dd class="f-bday">${esc(bdayText(u.bday))}${isBdayToday(u.bday) ? ' 🎂 <b>сегодня!</b>' : ''}</dd>` : ''}
      ${u.about ? `<dt>О себе</dt><dd class="f-about">${esc(u.about)}</dd>` : ''}
      ${since ? `<dt>На VСмске</dt><dd class="f-since">с ${since.getDate()} ${MONTHS[since.getMonth()]} ${since.getFullYear()}</dd>` : ''}
    </dl>
    <div class="stats">
      <div><b>${friendIds.length}</b><span>${plural(friendIds.length, 'друг', 'друга', 'друзей')}</span></div>
      <div><b>${posts.length}</b><span>${plural(posts.length, 'пост', 'поста', 'постов')}</span></div>
      <div><b>${likes}</b><span>${plural(likes, 'лайк', 'лайка', 'лайков')}</span></div>
    </div>
    ${(() => { const b = badges(u, friendIds.length, posts.length, likes); return b.length ? `<div class="badges">${b.map(([e, t, d]) => `<span class="badge-a" title="${esc(d)}">${e} ${esc(t)}</span>`).join('')}</div>` : ''; })()}
  </div>
  <div class="two">
    <div>
      ${own || (isFriend && (u.privacy?.wall || 'friends') !== 'me') ? composer(u.id, own ? 'Что у вас нового?' : 'Написать на стене у ' + u.name.split(' ')[0]) : ''}
      <div class="card pad" style="padding-block:12px"><b>${own ? 'Мои посты' : 'Посты'}</b> <span class="muted">${posts.length}</span></div>
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
    <div class="field"><label for="eNick">Короткое имя</label><input id="eNick" required minlength="1" maxlength="30" pattern="[a-zA-Z0-9._]+" value="${esc(me.nick)}"></div>
    <div class="field"><label>Эмодзи-статус (виден рядом с именем)</label><div class="emoji-pick">${['', '😎', '🔥', '💙', '🎮', '🎧', '📚', '⚽', '🌴', '😴', '🤒', '💼', '🎂', '🚀', '👑', '🐱'].map(e => `<button type="button" class="${(S.editEmoji ?? me.emoji ?? '') === e ? 'on' : ''}" data-act="pickemoji" data-e="${e}" aria-label="${e || 'Без статуса'}">${e || '✕'}</button>`).join('')}</div></div>
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
    ${sug.length ? `<div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="h" style="font-size:16px">Может, знакомы</h2></div>
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
  return `<div class="msg ${mine ? 'me' : ''} ${img ? 'has-img' : ''} ${sel ? 'sel' : ''} ${jumbo ? 'jumbo' : ''}" data-act="selmsg" data-id="${esc(m.id)}">${who}${quote}${fwd}${img ? `<img class="msg-img" src="${esc(img)}" alt="Фото" data-act="viewimg" data-kind="msg" data-id="${esc(m.id)}">` : ''}${typeof m.audio === 'string' && m.audio.startsWith('data:audio/') ? voiceHtml(m) : ''}${m.text ? `<span>${linkify(m.text)}</span>` : ''}${reactsHtml(m, id)}<time>${m.edited ? 'изменено · ' : ''}${hm(new Date(ms(m.createdAt)))}${ticks}</time>${sel ? `<div class="react-pick">${REACTS.map(e => `<button data-act="react" data-id="${esc(m.id)}" data-e="${e}" aria-label="Реакция ${e}">${e}</button>`).join('')}</div><div class="msg-acts"><button data-act="replymsg" data-id="${esc(m.id)}">${I.reply}Ответить</button><button data-act="fwdmsg" data-id="${esc(m.id)}">↪ Переслать</button>${mine && m.text && !fw ? `<button data-act="editmsg" data-id="${esc(m.id)}">✏️ Изменить</button>` : ''}${mine ? `<button data-act="delmsg" data-id="${esc(m.id)}">${S.confirm === 'msg:' + m.id ? 'Удалить у всех?' : 'Удалить'}</button>` : ''}</div>` : ''}</div>`;
}
const searchBar = () => `<div class="msg-search">${I.search}<input id="mq" type="search" placeholder="Поиск в этом диалоге" autocomplete="off" value="${esc(S.mq || '')}"><button class="icon-btn" data-act="mqtoggle" aria-label="Закрыть поиск">✕</button></div>`;
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
  const em = S.editMsg && cache.messages.find(x => x.id === S.editMsg);
  const replyBar = name => em ? `<div class="reply-bar">✏️<div class="grow" style="min-width:0"><b>Редактирование</b><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(em.text)}</div></div><button class="icon-btn" data-act="noreply" aria-label="Отменить правку">✕</button></div>`
    : rp ? `<div class="reply-bar">${I.reply}<div class="grow" style="min-width:0"><b>${esc(rp.from === id ? 'Вы' : name)}</b><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rp.text)}</div></div><button class="icon-btn" data-act="noreply" aria-label="Не отвечать">✕</button></div>` : '';
  const body = (peerRead, empty) => {
    let lastDay = '';
    return S.loading ? '<div class="loading"><div class="spin"></div></div>' : cache.messages.map(m => {
      const dl = dayLabel(m.createdAt), sep = dl !== lastDay ? `<div class="daysep">${dl}</div>` : ''; lastDay = dl;
      return sep + msgHtml(m, id, peerRead, room);
    }).join('') || `<div class="empty">${empty}</div>`;
  };
  const mq = (S.mq || '').trim().toLowerCase();
  const found = () => {
    const list = cache.messages.filter(m => (m.text || m.fwd?.text || '').toLowerCase().includes(mq));
    return list.length ? list.map(m => msgHtml(m, id, null, room)).join('') : `<div class="empty">Ничего не нашли</div>`;
  };
  if (room) {
    const c = cache.chats.find(x => x.id === key);
    if (!c) chatHtml = S.chatsLoaded ? `<div class="empty" style="height:100%">Беседа не найдена или вас в ней больше нет<a class="btn sec" href="#im">К диалогам</a></div>` : '<div class="loading"><div class="spin"></div></div>';
    else chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${roomAvatar(c, 38)}
        <div class="grow"><b>${esc(c.name)}</b><div class="small muted">${c.members.length} ${plural(c.members.length, 'участник', 'участника', 'участников')}</div></div>
        <button class="icon-btn" data-act="mqtoggle" aria-label="Поиск по сообщениям">${I.search}</button>
        <button class="icon-btn" data-act="roominfo" aria-label="Участники" aria-expanded="${!!S.roomInfo}">${I.friends}</button></div>
      ${S.roomInfo ? roomPanel(c) : ''}
      ${S.mqOpen ? searchBar() : ''}<div class="msgs">${mq ? found() : body(null, 'Напишите первое сообщение в беседу')}</div>
      ${replyBar((U(rp?.from)?.name || '').split(' ')[0])}${emojiPanel('msgInput')}${chatForm(key)}`;
  } else {
    const o = key && U(key), self = key === id;
    if (key && !o) chatHtml = '<div class="loading"><div class="spin"></div></div>';
    if (o) {
      const chat = cache.chats.find(c => c.id === chatId(id, key));
      const peerRead = self ? null : chat?.read?.[key] ? ms(chat.read[key]) : 0;
      chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${self ? `<span class="av fav" style="width:38px;height:38px">★</span>` : avatar(o, 38)}
        <div class="grow">${self ? '<b>Избранное</b>' : nameLink(o)}<div class="small seen ${!self && isOnline(o) ? 'on' : ''}">${self ? 'Только для вас' : esc(seenText(o) || o.city || '@' + (o.nick || ''))}</div></div>
        <button class="icon-btn" data-act="mqtoggle" aria-label="Поиск по сообщениям">${I.search}</button></div>
        ${S.mqOpen ? searchBar() : ''}<div class="msgs">${mq ? found() : body(peerRead, self ? 'Сохраняйте сюда заметки, ссылки и фото — их видите только вы' : 'Напишите ' + esc(o.name.split(' ')[0]) + ' первым')}</div>
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

document.addEventListener('change', e => { if (e.target.id === 'cvFrom') { S.cvFrom = e.target.value; render(); } else if (e.target.id === 'cvTo') { S.cvTo = e.target.value; render(); } });
document.addEventListener('input', e => {
  if (e.target.id === 'fpSeek') { const a = player.audio; if (a.duration) { a.currentTime = Number(e.target.value) / 1000 * a.duration; e.target.style.setProperty('--p', (Number(e.target.value) / 10) + '%'); } }
});
document.addEventListener('input', e => { if (e.target.id === 'cvAmt') { S.cvAmt = e.target.value; render(); return; } if (e.target.id === 'dq') { S.dq = e.target.value; render(); } else if (e.target.id === 'mq') { S.mq = e.target.value; render(); } });

/* ---------- Действия ---------- */
let pickTarget = null;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const stop = e.target.closest('[data-stop]'); if (stop && !stop.contains(b)) return;
  const { act, id } = b.dataset;
  const twoStep = key => { if (S.confirm === key) { S.confirm = null; return true; } S.confirm = key; render(); return false; };
  if (!['nickdel', 'delpost', 'unfriend', 'delvideo', 'delalbum', 'delfile', 'delphoto', 'delmsg', 'postmenu', 'block', 'rpost', 'profmenu', 'roomdel', 'roominfo', 'storydel', 'qdel', 'maildel', 'notedel', 'lotdel', 'tdel', 'evdel'].includes(act)) S.confirm = null;
  if (!['selmsg', 'delmsg', 'replymsg', 'playvoice', 'fwdmsg', 'editmsg'].includes(act)) S.msgSel = null;
  if (!['profmenu', 'block', 'modopen', 'ban', 'unban', 'report', 'qr'].includes(act)) S.profMenu = false;
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
      case 'anim': lsSet('vs_anim', b.dataset.v); document.documentElement.dataset.anim = b.dataset.v; render(); break;
      case 'listen': lsSet('vs_listen', b.dataset.v === 'off' ? '0' : '1'); if (b.dataset.v === 'off') { lastShared = 'off'; updateDoc(doc(db, 'users', uid()), { listening: null }).catch(console.error); } else lastShared = ''; render(); break;
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
      case 'mqtoggle': S.mqOpen = !S.mqOpen; S.mq = ''; render(); if (S.mqOpen) document.getElementById('mq')?.focus(); break;
      case 'noreply': S.replyTo = null; S.editMsg = null; render(); break;
      case 'editmsg': {
        const m = cache.messages.find(x => x.id === id); if (!m) return;
        S.editMsg = id; S.replyTo = null; S.msgSel = null; render();
        const el = document.getElementById('msgInput'); if (el) { el.value = m.text; el.focus(); }
        break;
      }
      case 'savepost': {
        const has = (S.me.saved || []).includes(id);
        await updateDoc(doc(db, 'users', uid()), { saved: has ? arrayRemove(id) : arrayUnion(id) });
        S.postMenu = null; toast(has ? 'Убрано из закладок' : 'Сохранено в закладки'); break;
      }
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
      case 'pfilter': S.draft.filter = b.dataset.f; render(); break;
      case 'unattach': { const f = S.draft.files.splice(Number(b.dataset.i) || 0, 1)[0]; if (f) URL.revokeObjectURL(f.url); render(); break; }
      case 'noavatar': S.editPhoto = ''; render(); break;
      case 'color': S.editColor = b.dataset.c; render(); break;
      case 'cover': S.editCover = b.dataset.c; render(); break;
      case 'pickemoji': S.editEmoji = b.dataset.e; render(); break;
      // ---- ВС События, Курсы, Радио, Гороскоп
      case 'newevent': S.newEvent = !S.newEvent; S.evCover = ''; render(); if (S.newEvent) document.getElementById('evTitle')?.focus(); break;
      case 'evcover': pick('evcover', 'image/*', false); break;
      case 'evgo': {
        const e = cache.event; if (!e) return; const on = (e.going || []).includes(uid());
        await updateDoc(doc(db, 'events', id), { going: on ? arrayRemove(uid()) : arrayUnion(uid()) }); toast(on ? 'Вы больше не идёте' : 'Отлично, вы идёте!'); break;
      }
      case 'evdel': if (!twoStep('ev:' + id)) return; await deleteDoc(doc(db, 'events', id)); toast('Событие удалено'); go('events'); break;
      case 'ratesreload': loadRates(); break;
      case 'cvswap': { const f = S.cvFrom || 'USD'; S.cvFrom = S.cvTo || 'RUB'; S.cvTo = f; render(); break; }
      case 'radioplay': {
        const st = RADIO[Number(b.dataset.i)], cur = curTrack();
        if (cur?.radio && cur.id === st.id) { player.audio.paused ? player.audio.play() : player.audio.pause(); break; }
        player.queue = [{ ...st, radio: true }]; playAt(0); break;
      }
      case 'sign': S.sign = b.dataset.s; render(); break;
      // ---- ВС Музыка
      case 'tfcover': pick('tfcover', 'image/*', false); break;
      case 'tfnocover': if (S.trackForm) { S.trackForm.cover = ''; render(); } break;
      case 'tedit': { const t = id === 'cur' ? curTrack() : (cache.tracks || []).find(x => x.id === id); if (t && t.ownerId === uid()) openTrackEdit(t); break; }
      case 'pickmusic': pick('music', 'audio/*', false); break;
      case 'tplay': playList(cache.tracks || [], Number(b.dataset.i), S.musicTab === 'my' ? 'Моя музыка' : S.musicTab === 'all' ? 'Новое в ВС Музыке' : 'Музыка: ' + (U(S.musicTab)?.name || '')); break;
      case 'mplay': if (player.audio.src) player.audio.paused ? player.audio.play() : player.audio.pause(); break;
      case 'mnext': nextTrack(); break;
      case 'mprev': prevTrack(); break;
      case 'fpopen': S.fullPlayer = true; S.lyrEdit = false; lyricIdx = -1; render(); break;
      case 'fpclose': S.fullPlayer = false; S.lyrEdit = false; S.lyrPick = false; S.lyrFind = null; render(); break;
      case 'fprepeat': player.repeat = { off: 'all', all: 'one', one: 'off' }[player.repeat]; lsSet('vs_repeat', player.repeat); toast(REPEAT_LABEL[player.repeat]); render(); break;
      case 'fpshuffle': player.shuffle = !player.shuffle; lsSet('vs_shuffle', player.shuffle ? '1' : '0'); toast(player.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено'); render(); break;
      case 'fplyrics': S.fpLyrics = !S.fpLyrics; S.lyrEdit = false; lyricIdx = -1; render(); setTimeout(syncLyrics, 50); break;
      case 'lyrpick': S.lyrPick = !S.lyrPick; render(); break;
      case 'lyrset': {
        const v = b.dataset.v; if (!LYR_STYLES[v]) break;
        lsSet('vs_lyrstyle', v); lyricIdx = -1; S.lyrPick = false;
        toast('Вид текста: ' + LYR_STYLES[v]); render(); break;
      }
      case 'lyredit': S.lyrEdit = !S.lyrEdit; S.lyrFind = null; render(); if (S.lyrEdit) document.getElementById('lyrText')?.focus(); break;
      case 'lyrseek': if (b.dataset.t) { player.audio.currentTime = Number(b.dataset.t); if (player.audio.paused) player.audio.play(); } break;
      case 'lyrfind': findLyrics(); break;
      case 'lyrauto': S.lyrEdit = true; S.lyrFind = null; render(); findLyrics(true); break;
      case 'lyrtake': lyrTake(Number(b.dataset.i)); break;
      case 'lyrshift': {
        const ta = document.getElementById('lyrText'); if (!ta) return;
        if (!/\[\d{1,2}:\d{2}/.test(ta.value)) { toast('В тексте нет тайм-кодов'); break; }
        ta.value = shiftLrc(ta.value, Number(b.dataset.d)); toast('Тайм-коды сдвинуты на ' + (Number(b.dataset.d) > 0 ? '+' : '') + b.dataset.d + ' с'); break;
      }
      case 'lyrstamp': {
        const ta = document.getElementById('lyrText'); if (!ta) return;
        const tm = player.audio.currentTime, stamp = `[${pad2(Math.floor(tm / 60))}:${pad2(Math.floor(tm % 60))}.${pad2(Math.floor((tm % 1) * 100))}] `;
        const at = ta.selectionStart ?? ta.value.length, lineStart = ta.value.lastIndexOf('\n', at - 1) + 1;
        const cleaned = ta.value.slice(lineStart).replace(/^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/, '');
        ta.value = ta.value.slice(0, lineStart) + stamp + cleaned;
        const nextNl = ta.value.indexOf('\n', lineStart); const pos = nextNl < 0 ? ta.value.length : nextNl + 1;
        ta.focus(); ta.setSelectionRange(pos, pos); break;
      }
      case 'fplike': { const t = curTrack(); if (!t || t.radio || t.ownerId === uid()) return;
        const has = (S.me.tracks || []).includes(t.id);
        await updateDoc(doc(db, 'users', uid()), { tracks: has ? arrayRemove(t.id) : arrayUnion(t.id) }); toast(has ? 'Убрано из вашей музыки' : 'Добавлено в вашу музыку'); break; }
      case 'mclose': player.audio.pause(); player.queue = []; player.i = -1; S.fullPlayer = false; if (lastShared) shareListening(null); render(); break;
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
      case 'noteitem': { const ta = document.getElementById('nText'); if (!ta) return; ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + '[ ] '; ta.focus(); break; }
      case 'notecheck': {
        e.stopPropagation();
        const n = cache.notes.find(x => x.id === id); if (!n) return;
        const lines = n.text.split('\n'), i = Number(b.dataset.i);
        lines[i] = lines[i].replace(/^\[( |x)\]/i, m => m.toLowerCase() === '[x]' ? '[ ]' : '[x]');
        await setDoc(doc(db, 'notes', id), { ownerId: uid(), title: n.title, text: lines.join('\n'), color: n.color || '', pinned: !!n.pinned, updatedAt: serverTimestamp() });
        break;
      }
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
      case 'snaketurn': snakeTurn(Number(b.dataset.d)); break;
      case 'snakenew': clearInterval(snakeTimer); snakeTimer = null; snakeNew(); render(); break;
      case 'minesopen': minesOpen(Number(b.dataset.i)); render(); break;
      case 'minesflag': S.mines.flagMode = !S.mines.flagMode; render(); break;
      case 'minesnew': S.mines = minesNew(); render(); break;
      case 'memflip': memFlip(Number(b.dataset.i)); render(); break;
      case 'memnew': S.mem = memNew(); render(); break;
      case 'tttnew': S.ttt.b = Array(9).fill(''); render(); break;
      case 'tttmv': {
        const t = S.ttt, i = Number(b.dataset.i); if (!t || t.b[i] || tttWin(t.b)) return;
        t.b[i] = 'X';
        if (!tttWin(t.b)) { const m = tttBest(t.b, 'O'); if (m.i !== undefined) t.b[m.i] = 'O'; }
        const w = tttWin(t.b); if (w === 'X') t.wins++; else if (w === 'O') t.losses++; else if (w === 'draw') t.draws++;
        render(); break;
      }
      case 'ovx': S.trackForm = null; S.newRoom = null; S.fwd = null; S.storyDraft = null; S.giftFor = null; S.qr = null; render(); break;
      case 'qr': {
        const url = pageUrl(id === uid() ? S.me : U(id) || { id });
        S.qr = { id, url, img: '' }; S.profMenu = false; render();
        try { S.qr.img = await qrDataUrl(url); } catch (e) { console.error(e); toast('Не получилось сделать QR-код'); S.qr = null; }
        render(); break;
      }
      case 'nickmenu': S.nickMenu = S.nickMenu === b.dataset.n ? null : b.dataset.n; render(); break;
      case 'nickmain': await setMainNick(b.dataset.n); S.nickMenu = null; render(); break;
      case 'nickdel': {
        const n = b.dataset.n; if (!twoStep('nickdel:' + n)) break;
        await deleteDoc(doc(db, 'usernames', n)); nickUid.delete(n); S.nickMenu = null; toast('@' + n + ' теперь свободно'); break;
      }
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
  if (e.key === 'Escape' && S.trackForm) { S.trackForm = null; render(); return; }
  if (e.key === 'Escape' && S.fullPlayer && S.lyrPick) { S.lyrPick = false; render(); return; }
  if (e.key === 'Escape' && S.fullPlayer && !S.lyrEdit) { S.fullPlayer = false; render(); return; }
  if (e.key === 'Escape' && (S.qr || S.giftFor || S.newRoom || S.fwd || S.storyDraft || S.report)) { S.qr = S.giftFor = S.newRoom = S.fwd = S.storyDraft = S.report = null; render(); return; }
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
    else if (pickTarget === 'tfcover') { if (S.trackForm) { S.trackForm.cover = await compress(f, 600, 250000, true); render(); } }
    else if (pickTarget === 'evcover') { S.evCover = await compress(f, 1280, 420000); render(); }
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
        if (!NICK_RE.test(nick)) { S.authError = NICK_MSG; render(); return; }
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
        if (!NICK_RE.test(nick)) { S.authError = NICK_MSG; render(); return; }
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
          for (const x of d.files) imgs.push(await compress(x.file, n > 1 ? 1080 : 1280, n > 1 ? Math.floor(880000 / n) : MAX_POST_IMG, false, d.filter || 'none'));
          const post = { authorId: uid(), wallId: wall, text, image: n === 1 ? imgs[0] : '', likes: [], commentCount: 0, createdAt: serverTimestamp() };
          if (n > 1) post.images = imgs;
          const tags = extractTags(text); if (tags.length) post.tags = tags;
          if (poll) post.poll = poll;
          if (f.dataset.group) post.groupId = wall;
          const ref = await addDoc(collection(db, 'posts'), post);
          if (wall !== uid() && !f.dataset.group) notify(wall, 'wall', ref.id, text || (poll ? poll.q : 'Фото'));
          notifyMentions(text, ref.id, [uid(), wall]);
          d.files.forEach(x => URL.revokeObjectURL(x.url));
          S.draft = { files: [], poll: false, pollN: 2, filter: 'none' }; S.emoji = null;
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
        if (S.editMsg) {
          const mid = S.editMsg; S.editMsg = null;
          await updateDoc(doc(db, 'chats', chatKeyId(f.dataset.to), 'messages', mid), { text: text.slice(0, 2000), edited: serverTimestamp() });
          render(); break;
        }
        await sendMessage(f.dataset.to, text);
        break;
      }
      case 'trackform': await saveTrackForm(); break;
      case 'lyrics': {
        if (document.activeElement?.id === 'lyrQ') { findLyrics(); return; }   // Enter в строке поиска — искать, а не сохранять
        const t = curTrack(); if (!t || t.ownerId !== uid()) return;
        const lyrics = (document.getElementById('lyrText')?.value || '').slice(0, 20000);
        await updateDoc(doc(db, 'tracks', t.id), { lyrics }); t.lyrics = lyrics;
        const c2 = (cache.tracks || []).find(x => x.id === t.id); if (c2) c2.lyrics = lyrics;
        S.lyrEdit = false; S.lyrFind = null; lyricIdx = -1; toast(parseLyrics(lyrics).timed ? 'Текст сохранён — будет идти вместе с музыкой' : 'Текст сохранён'); render(); setTimeout(syncLyrics, 50); break;
      }
      case 'event': {
        const title = v('evTitle'), at = new Date(v('evAt'));
        if (title.length < 2 || isNaN(at) || S.busy) { if (isNaN(at)) toast('Укажите дату и время'); return; }
        S.busy = true; render();
        try {
          const ref = await addDoc(collection(db, 'events'), { ownerId: uid(), title: title.slice(0, 100), text: (document.getElementById('evText')?.value || '').trim().slice(0, 2000),
            place: v('evPlace').slice(0, 120), at, cover: S.evCover || '', going: [uid()], createdAt: serverTimestamp() });
          S.newEvent = false; S.evCover = ''; toast('Событие создано'); go('event/' + ref.id);
        } finally { S.busy = false; render(); }
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
      case 'nickgive': {
        const n = f.dataset.n, to = nickOf(v('giftNick')); if (!to) return;
        nickUid.delete(to);
        const toId = await nickToUid(to);
        if (!toId) { toast('Нет человека @' + to); return; }
        if (toId === uid()) { toast('Это вы сами'); return; }
        await updateDoc(doc(db, 'usernames', n), { uid: toId });
        nickUid.set(n, toId); notify(toId, 'nick', '', '@' + n);
        S.nickMenu = null; toast('@' + n + ' подарено @' + to); break;
      }
      case 'nickmint': {
        const n = nickOf(v('mintNick')), to = nickOf(v('mintTo'));
        if (!NICK_ANY.test(n)) { toast('Имя: от 1 до 30 символов, латиница, цифры, точка и _'); return; }
        if ((await getDoc(doc(db, 'usernames', n))).exists()) { toast('@' + n + ' уже занято'); return; }
        let toId = uid();
        if (to) { nickUid.delete(to); toId = await nickToUid(to); if (!toId) { toast('Нет человека @' + to); return; } }
        await setDoc(doc(db, 'usernames', n), { uid: toId, col: true });
        nickUid.set(n, toId); if (toId !== uid()) notify(toId, 'nick', '', '@' + n);
        clear('mintNick'); clear('mintTo'); toast('💎 @' + n + ' выпущено' + (to ? ' для @' + to : '')); break;
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
        if (nick !== me.nick && !(isSiteAdmin() ? NICK_ANY : NICK_RE).test(nick) && !cache.nicks.some(n => n.id === nick)) { toast(NICK_MSG); return; }
        S.busy = true; render();
        try {
          const bt = writeBatch(db);
          if (nick !== me.nick) {
            const taken = await getDoc(doc(db, 'usernames', nick));
            if (taken.exists() && taken.data().uid !== me.id) { toast('Короткое имя уже занято'); return; }
            if (!taken.exists()) bt.set(doc(db, 'usernames', nick), { uid: me.id });
            await dropOldNick(bt, me);
            nickUid.set(nick, me.id);
          }
          bt.update(doc(db, 'users', me.id), {
            name, nick, city, status: v('eStatus'), about: v('eAbout'), color: S.editColor || me.color, cover: S.editCover || me.cover || 'blue',
            photo: S.editPhoto === undefined ? (me.photo || '') : S.editPhoto, search: buildSearch(name, nick, city),
            bday: /^\d{4}-\d{2}-\d{2}$/.test(v('eBday')) ? v('eBday') : '', emoji: S.editEmoji ?? me.emoji ?? '',
          });
          await bt.commit(); S.editColor = null; S.editCover = null; S.editPhoto = undefined; toast('Сохранено'); go('@' + nick);
        } finally { S.busy = false; render(); }
        break;
      }
    }
  } catch (err) { console.error(err); toast(errText(err)); }
});

// Обновляем «5 мин назад» раз в минуту
setInterval(() => { if (S.phase === 'app' && !document.activeElement?.matches?.('input,textarea')) render(); }, 60000);
