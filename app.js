/* ==========================================================================
   VСмске — социальная сеть на Firebase (Auth + Firestore).
   Хостинг: GitHub Pages. Фото и файлы хранятся прямо в Firestore (тариф Spark).
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  linkWithPopup, linkWithCredential, EmailAuthProvider, sendEmailVerification, signInWithCredential, OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, query, where, orderBy, limit, limitToLast,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, deleteField, startAfter, getCountFromServer
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
  blue: 'linear-gradient(135deg,#4F46E5,#7C3AED 50%,#C026D3)', sunset: 'linear-gradient(135deg,#F2994A,#D0462F 55%,#B4398F)',
  sea: 'linear-gradient(135deg,#1F8A5B,#2B8BB5)', night: 'linear-gradient(135deg,#141A33,#4E5B76)',
  rose: 'linear-gradient(135deg,#B4398F,#F06C9B)', gold: 'linear-gradient(135deg,#C98A12,#F2C94C)',
};
const COLORS = ['#2F44D0','#D0462F','#1F8A5B','#B4398F','#C98A12','#2B8BB5','#6A47C9','#4E5B76'];
const NICK_RE = /^[a-z0-9._]{4,30}$/, NICK_ANY = /^[a-z0-9._]{1,30}$/;   // 1–3 символа — только админам и коллекционные
const NICK_MSG = 'Короткое имя: от 4 до 30 символов, латиница, цифры, точка и _. Имена короче — коллекционные, их выдаёт администрация.';
const nickUid = new Map();   // @ник → uid, чтобы адрес #@ник открывался без лишних запросов
/* ---------- 6.9: адреса без решётки: /video, /music/stats, /@ник вместо /#video ----------
   BASE — папка сайта (на GitHub Pages «/vsmske/»). GitHub Pages про глубокие адреса ничего не знает, поэтому 404.html
   перекидывает /vsmske/video на /vsmske/?/video, а скрипт в index.html возвращает красивый адрес. Старые ссылки с «#» тоже работают. */
const BASE = new URL('.', import.meta.url).pathname;
const curRoute = () => { let p = location.pathname; p = p.startsWith(BASE) ? p.slice(BASE.length) : p.replace(/^\/+/, ''); p = p.replace(/\/+$/, ''); return p === 'index.html' ? '' : p; };
const siteUrl = r => location.origin + BASE + r;
const pageUrl = u => siteUrl(u?.nick ? '@' + u.nick : 'id/' + u?.id);
const MAX_POST_IMG = 700000;   // символов dataURL (~520 КБ), лимит документа Firestore — 1 МБ
const MAX_AVATAR = 120000;
const CHUNK = 700000;                                   // символов base64 в одном куске (кратно 4)
const LIMITS = { disk: 10 * 1024 * 1024, video: 20 * 1024 * 1024, music: 12 * 1024 * 1024 };
const VERSION = '8.0';
const MAX_MSG_IMG = 380000;    // фото в сообщении
const ONLINE_MS = 5 * 60 * 1000; // «в сети», если заходил не раньше 5 минут назад

/* ---------- Приложение на главном экране (PWA) ---------- */
let installPrompt = null;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(new URL('sw.js', import.meta.url).href).catch(console.error);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (typeof render === 'function' && S.phase === 'app') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('VСмске установлено на главный экран'); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Android-приложение собирает GitHub Actions (папка android/) и кладёт в релиз с тегом android
const APK_URL = 'https://github.com/nlponae269/vsmske/releases/download/android/VSmske.apk';
const androidCard = () => isIOS() ? '' : `<div class="card pad set"><h2 class="h" style="font-size:16px">Приложение для Android</h2>
    <div class="set-row"><span class="grow">Настоящее приложение: музыка в фоне с управлением в шторке</span><a class="btn" href="${APK_URL}" rel="noopener">Скачать APK</a></div></div>`;
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
const ACCENTS = [['avatar', 'Из аватарки (Material You)', 'conic-gradient(#F472B6,#FBBF24,#34D399,#60A5FA,#A78BFA,#F472B6)'], ['blue', 'Фирменный', '#7C3AED'], ['violet', 'Фиолетовый', '#6A47C9'], ['green', 'Зелёный', '#1F8A5B'], ['orange', 'Оранжевый', '#D9641E'], ['pink', 'Розовый', '#C2357A']];
function applyAccent(a) { if (a && a !== 'blue' && a !== 'avatar') document.documentElement.dataset.accent = a; else delete document.documentElement.dataset.accent; queueMicrotask(() => { try { tintFromAvatar(); } catch (e) { } }); }
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
const tagify0 = t => t.split(TAG_RE).map((x, i) => i % 2 ? `<a class="tag" href="#tag/${encodeURIComponent(x.slice(1).toLowerCase())}">${esc(x)}</a>` : mentionify(x)).join('');
// 7.0: разметка как в мессенджерах — **жирный**, *курсив*, ~~зачёркнутый~~, ||спойлер||, `код` (в базе текст хранится как есть)
const spoilersOpen = new Set();   // открытые спойлеры (по тексту) остаются открытыми после перерисовки
const FMT_RE = /(\|\|(?=\S)[^|\n]{1,500}?(?<=\S)\|\||\*\*(?=\S)[^*\n]{1,500}?(?<=\S)\*\*|~~(?=\S)[^~\n]{1,500}?(?<=\S)~~|`[^`\n]{1,500}?`|(?<![\p{L}\d*])\*(?=\S)[^*\n]{1,300}?(?<=\S)\*(?![\p{L}\d*]))/u;
const tagify = t => String(t).split(FMT_RE).map((x, i) => {
  if (!(i % 2)) return tagify0(x);
  if (x.startsWith('||')) return `<span class="spoiler ${spoilersOpen.has(x.slice(2, -2)) ? 'show' : ''}" data-act="spoiler" tabindex="0" title="Спойлер — нажмите, чтобы открыть">${tagify0(x.slice(2, -2))}</span>`;
  if (x.startsWith('**')) return `<b>${tagify0(x.slice(2, -2))}</b>`;
  if (x.startsWith('~~')) return `<s>${tagify0(x.slice(2, -2))}</s>`;
  if (x.startsWith('`')) return `<code class="icode">${esc(x.slice(1, -1))}</code>`;
  return `<i>${tagify0(x.slice(1, -1))}</i>`;
}).join('');
// для превью (список чатов, сигналы, уведомления браузера): без значков разметки, спойлер скрыт
const plainText = t => String(t ?? '').split(FMT_RE).map((x, i) => !(i % 2) ? x : x.startsWith('||') ? '▒▒▒' : x.startsWith('**') || x.startsWith('~~') ? x.slice(2, -2) : x.slice(1, -1)).join('');
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('spoiler')) { e.preventDefault(); spoilersOpen.add(e.target.textContent); e.target.classList.add('show'); } });
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
  .map((part, i) => !(i % 2) ? tagify(part) : part.startsWith(siteUrl(''))   // ссылка на свой же сайт — открываем здесь; старую с решёткой (…/#video) превращаем в /video
    ? `<a href="${esc(part.charAt(siteUrl('').length) === '#' ? siteUrl(part.slice(siteUrl('').length + 1)) : part)}">${esc(part)}</a>` : `<a href="${esc(part)}" target="_blank" rel="noopener nofollow ugc">${esc(part)}</a>`).join('');
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
  const off = typeof offBlobUrl === 'function' ? await offBlobUrl(fid) : null;   // 6.6: трек, сохранённый офлайн, — без интернета
  if (off) { blobCache.set(fid, off); return off; }
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
  phone: ic(20, '<path d="M5 3.5h3.2l1.6 4.2-2.2 1.5a11 11 0 0 0 7.2 7.2l1.5-2.2 4.2 1.6V19a1.8 1.8 0 0 1-1.9 1.8A16.6 16.6 0 0 1 3.2 5.4 1.8 1.8 0 0 1 5 3.5z"/>'),
  pen: ic(24, '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
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
  if (typeof LIVE !== 'undefined' && LIVE) liveStop(true);
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
/* Вход через Google без всплывающего окна и без перехода через vsmske.firebaseapp.com.
   С иконки на главном экране всплывающие окна не работают, а старая переадресация через чужой домен ломается
   из-за защиты браузеров (разделённое хранилище) — человека «выкидывало». Здесь страница сама уходит на Google
   и возвращается на свой же адрес с токеном в #id_token, которым и входим (signInWithCredential).
   Адрес возврата должен быть в «Authorized redirect URIs» у Web client в Google Cloud. */
const GOOGLE_CLIENT = '195735209722-8tjsd33moqquhreivj07f48l5cga0r3d.apps.googleusercontent.com';
const GOOGLE_BACK = location.origin + BASE;
async function sha256hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function googleGo() {
  const raw = crypto.randomUUID(), state = crypto.randomUUID();
  lsSet('vs_gauth', JSON.stringify({ raw, state }));
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT, redirect_uri: GOOGLE_BACK, response_type: 'id_token', scope: 'openid email profile',
    prompt: 'select_account', nonce: await sha256hex(raw), state,
  });
}
async function googleFinish(p) {
  let saved = {}; try { saved = JSON.parse(lsGet('vs_gauth') || '{}'); } catch (e) { }
  try { localStorage.removeItem('vs_gauth'); } catch (e) { }
  if (p.get('error')) { S.authError = p.get('error') === 'access_denied' ? 'Вход через Google отменён' : 'Google не пустил: ' + p.get('error'); render(); return; }
  if (!saved.state || saved.state !== p.get('state')) { S.authError = 'Вход через Google не завершился — попробуйте ещё раз'; render(); return; }
  const idToken = p.get('id_token');
  S.authBusy = true; render();
  try { await signInWithCredential(auth, new OAuthProvider('google.com').credential({ idToken, rawNonce: saved.raw })); }
  catch (e) {
    try { await signInWithCredential(auth, GoogleAuthProvider.credential(idToken)); }
    catch (e2) { console.error(e, e2); S.authBusy = false; S.authError = errText(e2); render(); }
  }
}
{
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has('id_token') || (p.has('error') && p.has('state'))) {
    history.replaceState(null, '', BASE);   // токен не оставляем в адресе
    setTimeout(() => googleFinish(p));   // после того, как весь модуль загрузится (render ещё не готов)
  }
}

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
      const n = new Notification(title, { body: plainText(c.lastText), tag: c.id, icon: safeImg(U(from)?.photo) || undefined });
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
    S.me = data(s); cache.users.set(id, S.me); S.phase = 'app'; tintFromAvatar();
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
    ensureUsers(cache.notifs.map(n => n.from)); callCheck();
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
  S.drawer = false; S.compose = false; clipsStop(); clearInterval(vNextTimer);
  if (S.vcmt) { vcmtUnsub?.(); vcmtUnsub = null; S.vcmt = null; }
  // «Что нового» — один раз после обновления и только тем, кто был с нами до 7.0 (новичкам не мешаем)
  if (!S.wnChecked && S.me) { S.wnChecked = true; if (lsGet('vs_seen_ver') !== WN_VER && Date.now() - ms(S.me.createdAt) > 864e5) S.whatsNew = true; else lsSet('vs_seen_ver', WN_VER); }
  const [v, arg] = (curRoute() || 'feed').split('/');
  S.confirm = null;
  if (v[0] === '@') {   // #@ник — адрес страницы
    let nick = v.slice(1); try { nick = decodeURIComponent(nick); } catch (e) { }
    nick = nick.toLowerCase();
    if (!nickUid.has(nick)) {
      nickToUid(nick).then(id => { if (id) route(); else { toast('Нет пользователя @' + nick); goReplace('feed'); } }).catch(() => goReplace('feed'));
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
  else if (v === 'music') { S.view = 'music'; S.musicTab = { my: 'home', all: 'stream' }[arg] || arg || 'home'; S.tmenu = null; }
  else if (v === 'u' && arg) { goReplace('@' + arg); return; }   // старые ссылки u/ник
  else if (v === 'answers') { S.view = 'answers'; S.ansCat = arg || 'all'; }
  else if (v === 'mail') { S.view = 'mail'; S.mailBox = arg === 'sent' ? 'sent' : arg === 'new' ? 'new' : 'in'; S.mailId = arg && !['sent', 'new', 'in'].includes(arg) ? arg : null; }
  else if (v === 'games') { S.view = 'games'; S.game = arg || null; }
  else if (v === 'live') { S.view = 'live'; S.liveId = arg || null; }
  else if (v === 'clips') { S.view = 'clips'; S.clipId = arg || null; }
  else if (v === 'tag' && arg) { S.view = 'tag'; try { S.tag = decodeURIComponent(arg).toLowerCase(); } catch (e) { S.tag = arg; } }
  else if (['feed', 'friends', 'people', 'edit', 'disk', 'vid', 'settings', 'more', 'notif', 'clubs', 'admin', 'guests', 'apps', 'notes', 'weather', 'events', 'rates', 'radio', 'horo', 'timer', 'calc', 'dice', 'live'].includes(v)) S.view = v;
  else S.view = 'feed';
  if (S.view !== 'edit') { S.editColor = null; S.editCover = null; S.editPhoto = undefined; S.editEmoji = undefined; }
  if (S.view !== 'watch') { S.videoSrc = null; S.videoErr = null; }
  S.lightbox = null; S.lightboxImg = null; S.preview = null; S.linkForm = false; S.newAlbum = false;
  S.viewImg = null; S.postMenu = null; S.emoji = null; S.fmt = null; S.msgSel = null; S.profMenu = false; S.modOpen = false; S.report = null;
  if (S.view !== 'games' || S.game !== 'snake') { clearInterval(snakeTimer); snakeTimer = null; if (snake && !snake.over) snake = null; }
  S.liveForm = null; S.newQ = false; S.noteEdit = null; S.giftFor = null; S.newLot = false; S.newEvent = false; if (S.view !== 'mail') S.mailDraft = null;
  S.newRoom = null; S.fwd = null; S.roomInfo = false; S.story = null; S.storyDraft = null; clearTimeout(storyTimer); S.clubEdit = false; S.editGroupPhoto = undefined; S.editGroupCover = null;
  if (S.view !== 'messages') S.replyTo = null;
  S.editMsg = null; S.mqOpen = false; S.mq = ''; S.wallPick = false;
  recStop(false); players.forEach(p => p.pause()); players.clear(); vnoteClose(false);
  vnoteEls.forEach(v => { v.pause(); v.removeAttribute("src"); v.load(); }); vnoteEls.clear();
  if (S.view !== 'video') { S.videoDraft = null; S.videoAdd = false; }
  attachView();
  window.scrollTo(0, 0);
}
// 7.0: смена страницы — плавным переходом (View Transitions), где браузер умеет и анимации не выключены
function navRoute(back = false) {
  const reduce = document.documentElement.dataset.anim === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || S.phase !== 'app' || document.hidden || S.view === 'clips') return route();
  document.documentElement.dataset.nav = back ? 'back' : 'fwd';
  document.startViewTransition(() => route());
}
window.addEventListener('popstate', () => navRoute(true));
// старые ссылки с решёткой (/#video, #music/stats) превращаем в обычные адреса; решётку Google (#id_token) не трогаем
function legacyHash() {
  const h = location.hash; if (h.length < 2 || /^#(id_token|access_token|error|state)=/.test(h)) return false;
  history.replaceState(null, '', BASE + h.slice(1)); return true;
}
window.addEventListener('hashchange', () => { if (legacyHash()) route(); });
const goReplace = r => { history.replaceState(null, '', BASE + r); route(); };
legacyHash();
// ссылки, написанные как href="#video", превращаются в настоящие адреса (/video); переход по ним — без перезагрузки страницы
function fixLinks(root) {
  const fix = a => { const h = a.getAttribute('href'); if (h && h.length > 1 && !h.startsWith('#id_token')) a.setAttribute('href', BASE + h.slice(1)); };
  if (root.matches?.('a[href^="#"]')) fix(root);
  root.querySelectorAll?.('a[href^="#"]').forEach(fix);
}
new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && fixLinks(n)))).observe(document.documentElement, { childList: true, subtree: true });
fixLinks(document.documentElement);
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.('a[href]'); if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE) || /\.(apk|png|jpe?g|gif|webp|svg|ico|mp3|mp4|webm|pdf|zip|json|webmanifest|js|css|html|txt)$/i.test(u.pathname)) return;   // чужие ссылки и файлы — как обычно (ник вида @alina.sm — это не файл)
  if (/^#(id_token|access_token)=/.test(u.hash)) return;
  e.preventDefault();
  go(u.hash.length > 1 && u.pathname === BASE ? u.hash.slice(1) : u.pathname.slice(BASE.length).replace(/\/+$/, ''));   // /#video → video
});
// #id/<uid> в адресной строке заменяем на #@ник — такую ссылку понятно, кому отправить
function prettyUrl(pid) {
  const u = pid === uid() ? S.me : U(pid);
  if (!u?.nick || u.deleted || curRoute() !== 'id/' + pid) return;
  nickUid.set(u.nick, pid); history.replaceState(null, '', BASE + '@' + u.nick);
}
const go = h => { if (curRoute() === h) route(); else { history.pushState(null, '', BASE + h); navRoute(); } };

function onViewErr(e) { console.error(e); S.viewError = e; S.loading = false; render(); }

function attachView() {
  clearView();
  const id = uid();
  S.loading = true;
  if (S.view === 'feed') {
    cache.feed = new Map(); loadLiveNow();
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
  } else if (S.view === 'clips') {
    S.clipsReady = false; S.clipIdx = 0; cache.clips = []; cache.clipsLast = null; cache.clipsDone = false; cache.clipsBusy = false;
    loadClips(S.clipId).then(() => { if (S.view !== 'clips') return; S.clipsReady = true; S.loading = false; render(); });
  } else if (S.view === 'watch') {
    cache.video = null; cache.videos = [];
    const wid = S.watchId;
    viewUnsubs.push(onSnapshot(doc(db, 'videos', wid), s => {
      cache.video = s.exists() ? data(s) : { id: wid, missing: true }; S.loading = false;
      const v = cache.video;
      if (!v.missing) {
        ensureUsers([v.ownerId]);
        if (!viewedVids.has(wid)) setTimeout(() => { if (S.view === 'watch' && S.watchId === wid) countView(cache.video); }, 3000);
        if (!(wid in cmtCount)) getCountFromServer(collection(db, 'videos', wid, 'comments')).then(c => { cmtCount[wid] = c.data().count; render(); }).catch(() => { });
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
  } else if (S.view === 'live') {
    if (S.liveId) {
      cache.stream = null;
      viewUnsubs.push(onSnapshot(doc(db, 'streams', S.liveId), s => { cache.stream = s.exists() ? data(s) : { id: S.liveId, missing: true }; if (s.exists()) ensureUsers([cache.stream.ownerId]); S.loading = false; liveOnStream(); render(); liveAttach(); }, onViewErr));
    } else {
      cache.streams = [];
      viewUnsubs.push(onSnapshot(query(collection(db, 'streams'), where('live', '==', true), limit(30)), s => { cache.streams = s.docs.map(data).filter(x => x.mode !== 'call'); ensureUsers(cache.streams.map(x => x.ownerId)); liveCleanStale(); S.loading = false; render(); }, onViewErr));
    }
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
    ${x.text ? `<div class="story-text ${mine ? '' : 'st-up'}">${esc(x.text)}</div>` : ''}
    ${mine ? '' : `<div class="story-foot"><form class="story-reply" data-form="storyreply" data-id="${esc(x.id)}"><input id="stReply" maxlength="300" placeholder="Ответить ${esc((u?.name || '').split(' ')[0])}…" autocomplete="off"><button class="icon-btn" aria-label="Отправить">${I.send}</button></form>
      <div class="story-reacts">${['❤️', '🔥', '😂', '😮', '👏'].map(e => `<button data-act="streact" data-id="${esc(x.id)}" data-e="${e}" aria-label="Реакция ${e}">${e}</button>`).join('')}</div></div>`}
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
/* 8.0: истории 2.0 — надписи и стикеры поверх фото (перетаскиваются пальцем и «впекаются» в картинку при публикации),
   ответ и реакция на чужую историю приходят автору в личные сообщения с маленькой копией истории */
const ST_STICKERS = ['😍', '🔥', '😂', '🥳', '👍', '💯', '❤️', '✨', '🌈', '⭐', '🎉', '😎'];
const ST_COLORS = ['#FFFFFF', '#111111', '#FACC15', '#EF4444', '#22C55E', '#3B82F6', '#EC4899'];
function storyEditor() {
  const d = S.storyDraft, it = d.items[d.sel];
  return `<div class="ov" data-act="ovx"><div class="ov-in modal st-modal" data-stop="1">
      <div class="row"><b class="grow">Новая история</b><button class="icon-btn" data-act="ovx" aria-label="Закрыть">✕</button></div>
      <div class="st-ed" id="stEd"><img src="${esc(d.image)}" alt="Предпросмотр" draggable="false">
        ${d.items.map((x, i) => `<span class="st-it ${x.k === 'e' ? 'emo' : ''} ${d.sel === i ? 'sel' : ''}" data-i="${i}" style="left:${x.x}%;top:${x.y}%;font-size:${x.s}cqw;color:${x.c};${x.bg ? 'background:rgba(0,0,0,.55);' : ''}">${esc(x.v)}</span>`).join('')}</div>
      <div class="st-row"><input id="stOver" class="inp" maxlength="60" placeholder="Надпись на фото" autocomplete="off"><button class="btn sec small" data-act="staddt">Добавить</button></div>
      <div class="st-stk">${ST_STICKERS.map(e => `<button data-act="stadde" data-e="${e}" aria-label="Стикер ${e}">${e}</button>`).join('')}</div>
      ${it ? `<div class="st-row st-sel">${it.k === 't' ? ST_COLORS.map(c => `<button class="st-c ${it.c === c ? 'on' : ''}" data-act="stcolor" data-c="${c}" style="background:${c}" aria-label="Цвет"></button>`).join('') + `<button class="btn ghost small ${it.bg ? 'on' : ''}" data-act="stbg">Фон</button>` : ''}
        <span class="grow"></span><button class="btn ghost small" data-act="stsize" data-d="-1" aria-label="Меньше">A−</button><button class="btn ghost small" data-act="stsize" data-d="1" aria-label="Больше">A+</button>
        <button class="btn ghost small" data-act="stdel">Убрать</button></div>` : '<p class="hint" style="margin:0">Надписи и стикеры можно двигать пальцем.</p>'}
      <input id="stText" class="inp" maxlength="200" placeholder="Подпись внизу (необязательно)">
      <p class="hint" style="margin:0">История исчезнет через 24 часа. Её увидят ваши друзья.</p>
      <button class="btn" data-act="storypub" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Публикуем…' : 'Опубликовать'}</button></div></div>`;
}
function stAdd(k, v) {
  const d = S.storyDraft; if (!d || !v || d.items.length >= 12) return;
  d.items.push({ k, v, x: 50, y: k === 'e' ? 35 + d.items.length * 4 % 30 : 50, s: k === 'e' ? 16 : 8, c: '#FFFFFF', bg: k === 't' });
  d.sel = d.items.length - 1; render();
}
// перетаскивание надписей и стикеров (без перерисовки — только позиция, в конце выделяем)
let stDrag = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest?.('#stEd .st-it'); if (!el || !S.storyDraft) return;
  e.preventDefault(); const r = el.parentNode.getBoundingClientRect();
  stDrag = { el, i: +el.dataset.i, r, moved: false }; el.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove', e => {
  const g = stDrag; if (!g) return; g.moved = true;
  const it = S.storyDraft?.items[g.i]; if (!it) return;
  it.x = Math.max(2, Math.min(98, (e.clientX - g.r.left) / g.r.width * 100)); it.y = Math.max(2, Math.min(98, (e.clientY - g.r.top) / g.r.height * 100));
  g.el.style.left = it.x + '%'; g.el.style.top = it.y + '%';
});
document.addEventListener('pointerup', () => { const g = stDrag; stDrag = null; if (g && S.storyDraft) { S.storyDraft.sel = g.i; render(); } });
async function storyBurn(d) {
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = d.image; });
  const W = Math.min(1080, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.drawImage(img, 0, 0, W, H); x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const it of d.items) {
    const fs = it.s / 100 * W, cx = it.x / 100 * W, cy = it.y / 100 * H;
    x.font = it.k === 'e' ? `${fs}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif` : `700 ${fs}px "Google Sans", "PT Sans", system-ui, sans-serif`;
    if (it.k === 't' && it.bg) {
      const w = x.measureText(it.v).width + fs * 0.8, h = fs * 1.45, r = h * 0.3;
      x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.roundRect ? x.roundRect(cx - w / 2, cy - h / 2, w, h, r) : x.rect(cx - w / 2, cy - h / 2, w, h); x.fill();
    }
    x.shadowColor = it.k === 't' && !it.bg ? 'rgba(0,0,0,.5)' : 'transparent'; x.shadowBlur = fs * 0.15;
    x.fillStyle = it.c || '#FFFFFF'; x.fillText(it.v, cx, cy); x.shadowBlur = 0;
  }
  for (let q = 0.86; q >= 0.4; q -= 0.08) { const u = c.toDataURL('image/jpeg', q); if (u.length <= 420000) return u; }
  return d.image;
}
async function storyThumb(src) {
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const W = 220, H = Math.round(img.naturalHeight * W / img.naturalWidth), c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0, W, H); return c.toDataURL('image/jpeg', 0.7);
  } catch (e) { return ''; }
}
document.addEventListener('focusin', e => { if (e.target.id === 'stReply') clearTimeout(storyTimer); });   // пока пишешь ответ, история не листается
async function storyReply(id, text) {
  const x = (cache.stories || []).find(s => s.id === id); if (!x || !text) return;
  try { await sendMessage(x.ownerId, text, await storyThumb(safeImg(x.image))); toast('Отправлено в личные сообщения'); }
  catch (e) { toast(errText(e)); }
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
// 7.0: пока грузится — «скелетон» страницы вместо крутилки
const loadingBox = (n = 2) => `<div class="sk-wrap" role="status" aria-label="Загружаем…">${Array.from({ length: n }, (_, k) => `<div class="card pad sk-post">
  <div class="row"><span class="sk-av big"></span><span class="grow"><span class="sk-line" style="width:${38 + k * 9}%"></span><span class="sk-line short" style="width:24%"></span></span></div>
  <span class="sk-line" style="margin-top:16px;width:92%"></span><span class="sk-line" style="margin-top:8px;width:${70 - k * 12}%"></span>
  ${k === 0 ? '<span class="sk-box sk-media"></span>' : ''}</div>`).join('')}</div>`;

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
  // в клипах ленту не пересоздаём (ролик не перезапускается), а окна поверх неё меняем отдельно
  if (S.phase === 'app' && S.view === 'clips' && !S.viewError) {
    const box = app.querySelector('#clips'), host = app.querySelector('#clipsOv');
    if (box && host && box.dataset.key === clipsKey()) {
      const html = overlay();
      if (html !== clipsOvHtml) {
        const focusId = document.activeElement?.id, sel = document.activeElement?.selectionStart, kept = {};
        host.querySelectorAll('input[id],textarea[id]').forEach(el => { if (el.type !== 'file') kept[el.id] = el.value; });
        host.innerHTML = clipsOvHtml = html;
        for (const [k, v] of Object.entries(kept)) { const el = document.getElementById(k); if (el && !resetIds.has(k)) el.value = v; }
        resetIds.clear();
        const f = focusId && document.getElementById(focusId);
        if (f && host.contains(f)) { f.focus(); try { f.setSelectionRange(sel, sel); } catch (e) { } }
        animate();
      }
      return;
    }
  }
  // видео эфира не пересоздаём: вынимаем и возвращаем на место, чтобы картинка не мигала
  const keepVid = document.getElementById('liveVid'); if (keepVid?.parentNode) keepVid.parentNode.removeChild(keepVid);
  vnoteEls.forEach(v => v.remove());   // кружки вынимаем и сразу возвращаем (vnoteMount), чтобы не начинались заново
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
  { const ph = document.getElementById('liveVid'); if (ph && keepVid && LIVE && S.liveId === LIVE.sid) ph.replaceWith(keepVid); if (document.getElementById('liveVid')) liveAttach(); const bx = document.getElementById('liveMsgs'); if (bx) bx.scrollTop = bx.scrollHeight; }
  if (S.view === 'clips') clipsMount();
  vnoteMount();
  { const mi = document.getElementById('msgInput'); if (mi) mi.closest('form')?.classList.toggle('has-text', !!mi.value.trim()); }
  animate();
  if (S.fullPlayer && S.fpLyrics) { syncLyrics(); if (!lyrRaf) lyrLoop(); }
  if (S.fullPlayer && !fpRaf) fpLoop();
}
const resetIds = new Set();

/* Оформление: material — Material You (material.css, по умолчанию), paper — «Газета» (8.0, paper.css),
   lite — классический вид первых версий (только style.css). Сразу при загрузке это делает скрипт в index.html, чтобы не мигало.
   Liquid Glass убран в 8.0: у кого он был выбран, тот попадает в Material You. */
const SKINS = [['material', 'Material You'], ['paper', 'Газета'], ['lite', 'Классический']];
const skinNow = () => { const k = lsGet('vs_skin'); return SKINS.some(s => s[0] === k) ? k : (lsGet('vs_lite') === 'on' ? 'lite' : 'material'); };
function applySkin() {
  const k = skinNow(), html = document.documentElement, paper = document.getElementById('skinPaper'), md = document.getElementById('skinMd');
  if (paper) paper.disabled = k !== 'paper';
  if (md) md.disabled = k !== 'material';
  html.dataset.skin = k;
}
applySkin();

/* Material You: рябь от места нажатия, как у кнопок Android (только в этом оформлении) */
const RIPPLE = '.btn,.pill,.icon-btn,.seg button,.tabs button,.tabs a,.app-tile,.ditem,.fgrid button,.mbar-play,.top-me,.top-bell,.nav a,.nav button';
document.addEventListener('pointerdown', e => {
  if (document.documentElement.dataset.skin !== 'material' || document.documentElement.dataset.anim === 'off') return;
  const el = e.target.closest?.(RIPPLE); if (!el || el.disabled) return;
  const r = el.getBoundingClientRect(), d = Math.hypot(r.width, r.height) * 2;
  const box = document.createElement('span'), dot = document.createElement('i');
  box.className = 'rip';
  dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  box.appendChild(dot); el.appendChild(box);
  setTimeout(() => box.remove(), 600);
}, { passive: true });

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
  const page = S.phase + '|' + (S.phase === 'app' ? curRoute() : S.authTab || '');
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
  const groups = { video: ['video', 'watch'], albums: ['albums', 'album'], clubs: ['clubs', 'club'], apps: ['apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'events', 'event', 'rates', 'radio', 'horo', 'timer', 'calc', 'dice', 'live'], music: ['music'] };
  const on = v => (groups[v] ? groups[v].includes(S.view) : S.view === v) && (v !== 'profile' || S.profileId === me.id) ? 'on' : '';
  const nav = (v, href, icon, label, badge = 0, cls = '') => `<a class="navlink ${on(v)} ${cls}" href="#${href}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const moreOn = ['more', 'profile', 'people', 'albums', 'album', 'disk', 'vid', 'settings', 'edit', 'notif', 'post', 'clubs', 'club', 'admin', 'guests', 'tag', 'apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'saved', 'video', 'watch', 'events', 'event', 'rates', 'radio', 'horo', 'timer', 'calc', 'dice', 'live'].includes(S.view) ? 'on' : '';
  return `<nav class="nav">
      ${nav('profile', 'id/' + me.id, I.home, 'Профиль', 0, 'm-hide')}
      ${nav('feed', 'feed', I.feed, 'Лента')}
      ${nav('music', 'music', I.music, 'Музыка')}
      ${nav('messages', 'im', I.msg, 'Чаты', unread)}
      ${nav('friends', 'friends', I.friends, 'Друзья', reqs)}
      ${nav('notif', 'notif', I.bell, 'Сигналы', unseenNotifs(), 'm-hide')}
      ${nav('saved', 'saved', I.bookmark, 'Закладки', 0, 'm-hide')}
      ${nav('people', 'people', I.people, 'Люди', 0, 'm-hide')}
      ${nav('apps', 'apps', I.apps, 'Сервисы', unreadMail(), 'm-hide')}
      ${nav('clubs', 'clubs', I.club, 'Клубы', 0, 'm-hide')}
      ${nav('video', 'video', I.video, 'Видео', 0, 'm-hide')}
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
  if (S.view === 'clips' && !S.viewError) { clipsOvHtml = overlay(); return viewClips() + `<div id="clipsOv">${clipsOvHtml}</div>`; }
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
  else if (S.view === 'timer') main = viewTimer();
  else if (S.view === 'calc') main = viewCalc();
  else if (S.view === 'dice') main = viewDice();
  else if (S.view === 'live') main = viewLive();
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
  if (MD()) return mdShell(me, main, up);
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
  ${liveBar()}${musicBar()}
  ${S.fullPlayer ? fullPlayer() : ''}
  ${overlay()}`;
}

/* ---------- Новый сайт (6.1, дизайн Material You) ----------
   Своя раскладка поверх тех же страниц: на компьютере — навигационная колонка (rail) с кнопкой «Создать»,
   сверху — панель с названием страницы, поиском и аватаркой; на телефоне — нижняя панель и круглая кнопка «Создать».
   Все разделы — в боковом меню (S.drawer), новая запись — в шторке снизу (S.compose). «Газета» и Классический
   собираются по-старому (shell()). */
const MD = () => document.documentElement.dataset.skin === 'material';
const MD_TITLES = { feed: 'Лента', messages: 'Чаты', friends: 'Друзья', notif: 'Сигналы', people: 'Люди', edit: 'Редактирование',
  video: 'Видео', watch: 'Видео', albums: 'Альбомы', album: 'Альбом', disk: 'Диск', vid: 'VС ID', settings: 'Настройки', more: 'Меню',
  post: 'Запись', clubs: 'Клубы', club: 'Клуб', guests: 'Гости', apps: 'Сервисы', market: 'Маркет', lot: 'Объявление', events: 'События',
  event: 'Событие', rates: 'Курсы', radio: 'Радио', horo: 'Гороскоп', saved: 'Закладки', music: 'Музыка', answers: 'Ответы', question: 'Вопрос',
  mail: 'Почта', notes: 'Заметки', weather: 'Погода', games: 'Игры', admin: 'Админка', timer: 'Таймер', calc: 'Калькулятор', dice: 'Жребий', live: 'Эфир' };
function mdTitle() {
  if (S.view === 'profile') return S.profileId === S.me.id ? 'Моя страница' : (U(S.profileId)?.name || 'Профиль');
  if (S.view === 'tag') return '#' + (S.tag || '');
  return MD_TITLES[S.view] || 'VСмске';
}
function mdShell(me, main, up) {
  const v = S.view, on = (...vs) => vs.includes(v) ? 'on' : '';
  const n = x => x > 99 ? '99+' : x;
  const dest = (href, icon, label, cls, badge = 0) => `<a class="md-dest ${cls}" href="#${href}"><span class="md-ind">${icon}${badge ? `<span class="badge">${n(badge)}</span>` : ''}</span><span class="md-lbl">${label}</span></a>`;
  const unread = cache.chats.filter(isUnread).length, reqs = cache.incoming.length, sig = unseenNotifs();
  const prim = dest('feed', I.feed, 'Лента', on('feed')) + dest('music', I.music, 'Музыка', on('music')) + dest('im', I.msg, 'Чаты', on('messages'), unread)
    + dest('friends', I.friends, 'Друзья', on('friends', 'people'), reqs) + dest('notif', I.bell, 'Сигналы', on('notif'), sig);
  const menuBtn = `<button class="md-dest ${S.drawer ? 'on' : ''}" data-act="mddrawer" aria-label="Все разделы"><span class="md-ind">${I.more}</span><span class="md-lbl">Меню</span></button>`;
  const fabOn = ['feed', 'profile', 'tag', 'saved'].includes(v) && !banOf(me);
  const ban = banOf(me) ? `<div class="card pad ban-banner" role="alert"><b>⛔ Ваш аккаунт заблокирован ${banText(banOf(me))}</b>
      ${banOf(me).reason ? `<div class="small">Причина: ${esc(banOf(me).reason)}</div>` : ''}<div class="small">Пока действует блокировка, нельзя писать записи, комментарии и сообщения.</div></div>` : '';
  return `<div class="md-app">
  <aside class="md-rail" aria-label="Разделы">
    ${banOf(me) ? '<span class="md-fab off"></span>' : `<button class="md-fab" data-act="mdcompose" aria-label="Новая запись">${I.pen}</button>`}
    ${prim}${dest('apps', I.apps, 'Сервисы', on(...MD_APPS), unreadMail())}
    <span class="md-sp"></span>${menuBtn}
  </aside>
  <header class="md-top">
    <a class="md-brand" href="#feed" aria-label="VСмске, лента"><span class="logo-mark">вс</span></a>
    <h1 class="md-title">${esc(mdTitle())}</h1>
    <form class="search md-search" data-form="search">${I.search}<input id="q" type="search" placeholder="Поиск людей" autocomplete="off" value="${esc(v === 'people' ? S.query : '')}"></form>
    <button class="md-icon md-pal" data-act="palopen" aria-label="Быстрый поиск" title="Быстрый поиск (Ctrl+K)">${I.search}</button>
    <a class="md-me" href="#id/${esc(me.id)}" aria-label="Моя страница">${avatar(me, 40, false)}</a>
  </header>
  <main class="md-main"><div class="md-col">${ban}${up}${main}</div></main>
  <nav class="md-nav" aria-label="Разделы">${prim}${menuBtn}</nav>
  ${fabOn ? `<button class="md-fab md-fab-float" data-act="mdcompose" aria-label="Новая запись">${I.pen}</button>` : ''}
  ${S.drawer ? mdDrawer(me) : ''}
  ${S.compose ? `<div class="md-scrim" data-act="mdclose"></div><div class="md-sheet" role="dialog" aria-label="Новая запись">
    <div class="md-handle"></div><div class="row"><b class="grow md-sheet-t">Новая запись</b><button class="icon-btn" data-act="mdclose" aria-label="Закрыть">✕</button></div>
    ${composer(me.id, 'Что у вас нового?')}</div>` : ''}
  </div>
  ${liveBar()}${musicBar()}
  ${S.fullPlayer ? fullPlayer() : ''}
  ${overlay()}`;
}
const MD_APPS = ['apps', 'answers', 'question', 'mail', 'notes', 'weather', 'games', 'market', 'lot', 'events', 'event', 'rates', 'radio', 'horo', 'timer', 'calc', 'dice', 'live'];
function mdDrawer(me) {
  const v = S.view;
  const it = (href, icon, label, active, badge = 0) => `<a class="md-item ${active ? 'on' : ''}" href="#${href}">${icon}<span class="grow">${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  return `<div class="md-scrim" data-act="mdclose"></div><aside class="md-drawer" aria-label="Все разделы">
    <a class="md-drawer-me" href="#id/${esc(me.id)}">${avatar(me, 48, false)}<span class="grow"><b>${esc(me.name)}</b><span class="small muted">@${esc(me.nick || '')}</span></span></a>
    <div class="md-group">Основное</div>
    ${it('id/' + me.id, I.home, 'Моя страница', v === 'profile' && S.profileId === me.id)}${it('feed', I.feed, 'Лента', v === 'feed')}
    ${it('im', I.msg, 'Чаты', v === 'messages', cache.chats.filter(isUnread).length)}${it('friends', I.friends, 'Друзья', v === 'friends', cache.incoming.length)}
    ${it('notif', I.bell, 'Сигналы', v === 'notif', unseenNotifs())}${it('saved', I.bookmark, 'Закладки', v === 'saved')}${it('people', I.people, 'Люди', v === 'people')}
    <div class="md-group">Медиа</div>
    ${it('music', I.music, 'Музыка', v === 'music')}${it('video', I.video, 'Видео', ['video', 'watch'].includes(v))}${it('clips', I.play, 'Клипы', v === 'clips')}${it('albums', I.album, 'Альбомы', ['albums', 'album'].includes(v))}
    ${it('disk', I.disk, 'Диск', v === 'disk')}${it('clubs', I.club, 'Клубы', ['clubs', 'club'].includes(v))}
    <div class="md-group">Сервисы</div>
    ${it('apps', I.apps, 'Все сервисы', MD_APPS.includes(v), unreadMail())}
    <button class="md-item" data-act="recap">${I.star}<span class="grow">Мои итоги</span></button>
    <button class="md-item" data-act="palopen">${I.search}<span class="grow">Быстрый поиск</span><kbd>Ctrl K</kbd></button>
    <div class="md-group">Аккаунт</div>
    ${it('vid', I.vid, 'VС ID', v === 'vid')}${isSiteAdmin() ? it('admin', I.shield, 'Админка', v === 'admin', cache.reports.length) : ''}${it('settings', I.gear, 'Настройки', v === 'settings')}
    <button class="md-item" data-act="logout">${I.out}<span class="grow">Выйти</span></button>
  </aside>`;
}

/* ---------- 6.2: «Итоги», быстрый поиск, цвет из аватарки ---------- */

/* «Итоги» в стиле Spotify Wrapped: слайды-истории о себе (S.recap = { i, d }). Всё считается из того, что уже можно прочитать
   (свои записи, подарки, треки), в базу ничего не пишется — кроме записи на стене, если человек сам нажмёт «Поделиться». */
const recapMonth = () => new Date().toISOString().slice(0, 7);
async function openRecap() {
  S.recap = { i: 0, d: null }; S.pal = null; S.drawer = false; render();
  lsSet('vs_recap_seen', recapMonth());
  const me = S.me, id = me.id;
  try {
    const [ps, gs, ts] = await Promise.all([
      getDocs(query(collection(db, 'posts'), where('authorId', '==', id), orderBy('createdAt', 'desc'), limit(300))),
      getDocs(query(collection(db, 'gifts'), where('to', '==', id), limit(200))).catch(() => null),
      getDocs(query(collection(db, 'tracks'), where('ownerId', '==', id), limit(200))).catch(() => null),
    ]);
    const posts = ps.docs.map(data).filter(p => !p.groupId);
    const month = Date.now() - 30 * 864e5;
    const likes = posts.reduce((a, p) => a + (p.likes || []).length, 0);
    const comments = posts.reduce((a, p) => a + (p.commentCount || 0), 0);
    const reposts = posts.reduce((a, p) => a + (p.reposts || 0), 0);
    const top = posts.slice().sort((a, b) => ((b.likes || []).length + 2 * (b.commentCount || 0)) - ((a.likes || []).length + 2 * (a.commentCount || 0)))[0];
    const fans = new Map(); posts.forEach(p => (p.likes || []).forEach(u => { if (u !== id) fans.set(u, (fans.get(u) || 0) + 1); }));
    const fan = [...fans.entries()].sort((a, b) => b[1] - a[1])[0];
    const hours = new Array(24).fill(0); posts.forEach(p => hours[new Date(ms(p.createdAt)).getHours()]++);
    const hour = posts.length ? hours.indexOf(Math.max(...hours)) : -1;
    const tags = new Map(); posts.forEach(p => (p.tags || []).forEach(t => tags.set(t, (tags.get(t) || 0) + 1)));
    const tag = [...tags.entries()].sort((a, b) => b[1] - a[1])[0];
    if (fan) ensureUsers([fan[0]]);
    const d = {
      days: me.createdAt ? Math.max(1, Math.round((Date.now() - ms(me.createdAt)) / 864e5)) : 1,
      posts: posts.length, monthPosts: posts.filter(p => ms(p.createdAt) >= month).length, likes, comments, reposts, top,
      fan: fan ? { id: fan[0], n: fan[1] } : null, hour, tag: tag ? tag[0] : '',
      friends: (me.friends || []).length, chats: cache.chats.length, gifts: gs ? gs.size : 0,
      tracks: ts ? ts.size : 0, saved: (me.tracks || []).length,
    };
    if (S.recap) { S.recap.d = d; render(); recapTimer(); }
  } catch (e) { console.error(e); if (S.recap) { S.recap.err = errText(e); render(); } }
}
// какие слайды показывать: пустые (нет записей, нет музыки) пропускаем
function recapSlides(d) {
  const out = ['hi', 'days'];
  if (d.posts) out.push('posts', 'likes');
  if (d.top && ((d.top.likes || []).length || d.top.commentCount)) out.push('top');
  if (d.fan) out.push('fan');
  if (d.hour >= 0) out.push('habit');
  out.push('social');
  if (d.tracks || d.saved) out.push('music');
  out.push('end');
  return out;
}
let recapTick = null;
function recapTimer() {
  clearInterval(recapTick);
  recapTick = setInterval(() => {
    if (!S.recap?.d) { clearInterval(recapTick); return; }
    const n = recapSlides(S.recap.d).length;
    if (S.recap.i < n - 1) { S.recap.i++; render(); } else clearInterval(recapTick);
  }, 6500);
}
function recapGo(dir) {
  if (!S.recap?.d) return;
  const n = recapSlides(S.recap.d).length;
  S.recap.i = Math.max(0, Math.min(n - 1, S.recap.i + dir)); render(); recapTimer();
}
const hourWord = h => h < 0 ? '' : h < 5 || h >= 23 ? ['Ночная сова', '🦉', 'Больше всего ты пишешь глубокой ночью'] : h < 11 ? ['Жаворонок', '🐦', 'Твои записи появляются с утра пораньше']
  : h < 18 ? ['Человек дня', '☀️', 'Ты пишешь, пока светит солнце'] : ['Вечерний житель', '🌆', 'Самое активное время — вечер'];
const num = n => `<b class="rc-num" style="--to:${Number(n) || 0}" role="img" aria-label="${Number(n) || 0}"></b>`;
function recapOverlay() {
  const r = S.recap, me = S.me;
  if (!r.d) return `<div class="recap rc-s0"><div class="rc-in"><div class="rc-load">${r.err ? `<b>Не получилось собрать итоги</b><span>${esc(r.err)}</span>` : '<span class="spin"></span><span>Собираем твои итоги…</span>'}</div>
    <button class="rc-x" data-act="recapclose" aria-label="Закрыть">✕</button></div></div>`;
  const d = r.d, slides = recapSlides(d), k = slides[r.i], hw = hourWord(d.hour);
  const pl = (n, a, b, c) => plural(Number(n) || 0, a, b, c);
  const body = {
    hi: `<div class="rc-kicker">VСмске · ${new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
      <div class="rc-av">${avatar(me, 132, false)}</div><h2 class="rc-big">${esc(me.name.split(' ')[0])}, это твои итоги</h2>
      <p class="rc-sub">Листай вправо — посмотрим, каким было твоё время в VСмске</p>`,
    days: `<div class="rc-kicker">Ты с нами уже</div><div class="rc-huge">${num(d.days)}</div><h2 class="rc-big">${pl(d.days, 'день', 'дня', 'дней')}</h2>
      <p class="rc-sub">${me.createdAt ? 'С ' + new Date(ms(me.createdAt)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} — спасибо, что ты здесь 💜</p>`,
    posts: `<div class="rc-kicker">Твои записи</div><div class="rc-huge">${num(d.posts)}</div><h2 class="rc-big">${pl(d.posts, 'запись', 'записи', 'записей')}</h2>
      <p class="rc-sub">${d.monthPosts ? `Из них ${d.monthPosts} — за последний месяц` : 'В этом месяце пока тихо — самое время что-нибудь написать'}</p>`,
    likes: `<div class="rc-kicker">Тебя оценили</div><div class="rc-huge">♥ ${num(d.likes)}</div><h2 class="rc-big">${pl(d.likes, 'лайк', 'лайка', 'лайков')}</h2>
      <div class="rc-chips"><span>💬 ${d.comments} ${pl(d.comments, 'комментарий', 'комментария', 'комментариев')}</span><span>🔁 ${d.reposts} ${pl(d.reposts, 'репост', 'репоста', 'репостов')}</span></div>`,
    top: d.top ? `<div class="rc-kicker">Твоя лучшая запись</div><div class="rc-post">${safeImg(d.top.image || (d.top.images || [])[0]) ? `<img src="${esc(d.top.image || d.top.images[0])}" alt="">` : ''}
      ${d.top.text ? `<p>${esc(d.top.text.slice(0, 220))}${d.top.text.length > 220 ? '…' : ''}</p>` : d.top.poll ? `<p>📊 ${esc(d.top.poll.q)}</p>` : ''}
      <div class="rc-chips"><span>♥ ${(d.top.likes || []).length}</span><span>💬 ${d.top.commentCount || 0}</span></div></div>
      <a class="rc-btn" href="#post/${esc(d.top.id)}" data-act="recapclose">Открыть запись</a>` : '',
    fan: d.fan ? `<div class="rc-kicker">Твой главный фанат</div><div class="rc-av">${avatar(U(d.fan.id) || { name: '…' }, 132, false)}</div>
      <h2 class="rc-big">${esc(U(d.fan.id)?.name || '…')}</h2><p class="rc-sub">${d.fan.n} ${pl(d.fan.n, 'лайк', 'лайка', 'лайков')} на твоих записях — больше, чем от кого-либо. Напиши что-нибудь приятное в ответ 💌</p>` : '',
    habit: `<div class="rc-kicker">Твой ритм</div><div class="rc-emoji">${hw[1]}</div><h2 class="rc-big">${hw[0]}</h2><p class="rc-sub">${hw[2]} — чаще всего около ${d.hour}:00</p>
      ${d.tag ? `<div class="rc-chips"><span>Любимый хэштег: #${esc(d.tag)}</span></div>` : ''}`,
    social: `<div class="rc-kicker">Твой круг</div><div class="rc-grid"><div>${num(d.friends)}<span>${pl(d.friends, 'друг', 'друга', 'друзей')}</span></div>
      <div>${num(d.chats)}<span>${pl(d.chats, 'диалог', 'диалога', 'диалогов')}</span></div><div>${num(d.gifts)}<span>${pl(d.gifts, 'подарок', 'подарка', 'подарков')}</span></div></div>
      <p class="rc-sub">${d.friends ? 'Люди, с которыми тебе хорошо' : 'Найди своих людей — раздел «Люди»'}</p>`,
    music: `<div class="rc-kicker">Твоя музыка</div><div class="rc-emoji">🎧</div><div class="rc-grid"><div>${num(d.tracks)}<span>${pl(d.tracks, 'трек загружен', 'трека загружено', 'треков загружено')}</span></div>
      <div>${num(d.saved)}<span>${pl(d.saved, 'чужой трек', 'чужих трека', 'чужих треков')} у тебя</span></div></div><p class="rc-sub">Твой плейлист в ВС Музыке ждёт</p>`,
    end: `<div class="rc-kicker">Итого</div><h2 class="rc-big">${esc(me.name)}</h2>
      <div class="rc-sum"><div><b>${d.days}</b><span>${pl(d.days, 'день', 'дня', 'дней')}</span></div><div><b>${d.posts}</b><span>${pl(d.posts, 'запись', 'записи', 'записей')}</span></div>
        <div><b>${d.likes}</b><span>${pl(d.likes, 'лайк', 'лайка', 'лайков')}</span></div><div><b>${d.friends}</b><span>${pl(d.friends, 'друг', 'друга', 'друзей')}</span></div></div>
      ${banOf(me) ? '' : `<button class="rc-btn" data-act="recapshare" ${S.busy ? 'disabled' : ''}>✨ Поделиться на стене</button>`}
      <button class="rc-btn ghost" data-act="recapclose">Закрыть</button>`,
  }[k];
  return `<div class="recap rc-s${r.i % 6}" role="dialog" aria-label="Мои итоги">
    <div class="rc-bars">${slides.map((_, i) => `<i class="${i < r.i ? 'done' : i === r.i ? 'now' : ''}"></i>`).join('')}</div>
    <button class="rc-x" data-act="recapclose" aria-label="Закрыть">✕</button>
    <div class="rc-in rc-k-${k}" data-slide="${r.i}">${body}</div>
    ${k !== 'end' ? `<button class="rc-zone rc-prev" data-act="recapnav" data-d="-1" aria-label="Назад"></button><button class="rc-zone rc-next" data-act="recapnav" data-d="1" aria-label="Дальше"></button>` : ''}
  </div>`;
}
async function recapShare() {
  const d = S.recap?.d; if (!d || S.busy) return;
  const pl = (n, a, b, c) => plural(n, a, b, c);
  const text = `✨ Мои итоги в VСмске: ${d.days} ${pl(d.days, 'день', 'дня', 'дней')} с вами, ${d.posts} ${pl(d.posts, 'запись', 'записи', 'записей')}, ${d.likes} ${pl(d.likes, 'лайк', 'лайка', 'лайков')} и ${d.friends} ${pl(d.friends, 'друг', 'друга', 'друзей')}`
    + (d.hour >= 0 ? `. Я — ${hourWord(d.hour)[0].toLowerCase()} ${hourWord(d.hour)[1]}` : '') + ' #итоги';
  S.busy = true; render();
  try {
    await addDoc(collection(db, 'posts'), { authorId: uid(), wallId: uid(), text, image: '', likes: [], commentCount: 0, tags: extractTags(text), createdAt: serverTimestamp() });
    S.recap = null; clearInterval(recapTick); toast('Итоги на вашей стене'); go('id/' + uid());
  } finally { S.busy = false; render(); }
}

/* Быстрый поиск (Ctrl/⌘+K или кнопка): разделы, сервисы и люди из уже загруженных — мгновенно, без запросов к базе */
const PAL_SECTIONS = () => [
  ['feed', I.feed, 'Лента', 'новости записи'], ['im', I.msg, 'Чаты', 'сообщения диалоги переписка'], ['friends', I.friends, 'Друзья', 'заявки'],
  ['notif', I.bell, 'Сигналы', 'уведомления'], ['id/' + S.me.id, I.home, 'Моя страница', 'профиль стена'], ['saved', I.bookmark, 'Закладки', 'сохранённое'],
  ['people', I.people, 'Люди', 'поиск'], ['music', I.music, 'ВС Музыка', 'треки плеер песни'], ['radio', I.radio, 'ВС Радио', 'эфир станции'],
  ['video', I.video, 'ВС Видео', 'ролики'], ['albums', I.album, 'ВС Альбомы', 'фото фотографии'], ['disk', I.disk, 'ВС Диск', 'файлы'],
  ['clubs', I.club, 'Клубы', 'сообщества группы'], ['apps', I.apps, 'Все сервисы', ''], ['mail', I.mail, 'ВС Почта', 'письма'],
  ['answers', I.ask, 'ВС Ответы', 'вопросы'], ['notes', I.note, 'ВС Заметки', 'список'], ['weather', I.sun, 'ВС Погода', 'прогноз'],
  ['games', I.game, 'ВС Игры', '2048 змейка сапёр'], ['market', I.cart, 'ВС Маркет', 'купить продать объявления'], ['events', I.cal, 'ВС События', 'встречи'],
  ['rates', I.rate, 'ВС Курсы', 'валюта доллар евро'], ['horo', I.star, 'ВС Гороскоп', 'знак'], ['vid', I.vid, 'VС ID', 'пароль почта аккаунт'],
  ['settings', I.gear, 'Настройки', 'тема дизайн цвет'], ['edit', I.home, 'Редактировать страницу', 'имя фото статус'],
  ['@recap', I.star, 'Мои итоги', 'статистика wrapped'], ['music/stats', I.music, 'Моя статистика музыки', 'прослушивания любимые треки исполнители'],
  ['timer', '⏱', 'ВС Таймер', 'секундомер таймер помодоро'], ['calc', '🧮', 'ВС Калькулятор', 'посчитать'], ['dice', '🎲', 'ВС Жребий', 'монетка кубик случайное число'],
  ['games/sudoku', '🔢', 'Судоку', 'игра головоломка'], ['@whatsnew', '✨', 'Что нового в 7.0', 'обновление версия новинки'], ['live', '🔴', 'ВС Эфир', 'стрим трансляция прямой эфир'], ['clips', '🎬', 'ВС Клипы', 'короткие видео ролики reels шортс'], ['@keys', '⌨', 'Горячие клавиши', 'сочетания клавиатура'],
];
const norm = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
function palItems() {
  const q = norm(S.pal?.q).trim();
  const secs = PAL_SECTIONS().filter(([, , t, k]) => !q || norm(t + ' ' + k).includes(q)).slice(0, q ? 8 : 9)
    .map(([href, icon, t]) => ({ href, icon, t, sub: href === '@recap' ? 'Твоя статистика в стиле Wrapped' : href === '@keys' ? 'Подсказка' : 'Раздел' }));
  const people = !q ? [] : [...cache.users.values()].filter(u => u && !u.deleted && u.id !== S.me.id && (norm(u.name).includes(q) || norm(u.nick).includes(q.replace(/^@/, ''))))
    .slice(0, 6).map(u => ({ href: 'id/' + u.id, u, t: u.name, sub: '@' + (u.nick || '') }));
  const more = q.length >= 2 ? [{ href: 'people', q: S.pal.q.trim(), icon: I.search, t: `Найти людей: «${S.pal.q.trim()}»`, sub: 'Поиск по всем' }] : [];
  return [...people, ...secs, ...more];
}
function palOverlay() {
  const items = palItems(), sel = Math.min(S.pal.sel, Math.max(0, items.length - 1));
  return `<div class="pal-ov" data-act="palx"><div class="pal" role="dialog" aria-label="Быстрый поиск" data-stop="1">
    <div class="pal-q">${I.search}<input id="palQ" placeholder="Раздел, сервис или человек…" autocomplete="off" value="${esc(S.pal.q)}"><kbd>Esc</kbd></div>
    <div class="pal-list" role="listbox">${items.length ? items.map((x, i) => `<button class="pal-item ${i === sel ? 'on' : ''}" role="option" aria-selected="${i === sel}" data-act="palgo" data-i="${i}">
      <span class="pal-ico">${x.u ? avatar(x.u, 32, false) : x.icon}</span><span class="grow"><b>${esc(x.t)}</b><span class="small muted">${esc(x.sub)}</span></span></button>`).join('')
      : '<div class="empty small">Ничего не нашлось</div>'}</div>
    <div class="pal-foot small muted">↑ ↓ — выбрать · Enter — открыть · Ctrl+K — открыть отовсюду</div>
  </div></div>`;
}
function palGo(i) {
  const x = palItems()[i]; if (!x) return;
  S.pal = null;
  if (x.href === '@recap') { openRecap(); return; }
  if (x.href === '@keys') { S.keys = true; render(); return; }
  if (x.href === '@whatsnew') { S.whatsNew = true; render(); return; }
  if (x.q !== undefined) S.query = x.q;
  if (curRoute() === x.href) render(); else go(x.href);
}
function palOpen() { S.pal = { q: '', sel: 0 }; S.drawer = false; render(); setTimeout(() => document.getElementById('palQ')?.focus(), 30); }
document.addEventListener('input', async e => {
  if (e.target.id !== 'musQ') return;
  S.musicQ = e.target.value; render();
  // чтобы искать по всей платформе, догружаем Поток до конца (не больше 10 страниц)
  for (let k = 0; k < 10 && S.musicQ.trim().length >= 2 && cache.mus && !cache.mus.streamDone; k++) { await loadStream(false); render(); }
});
document.addEventListener('change', e => { if (e.target.id === 'mSort') { lsSet('vs_msort', e.target.value); render(); } });
document.addEventListener('click', e => { if (S.tmenu && !e.target.closest('[data-act], .tmenu')) { S.tmenu = null; render(); } });
document.addEventListener('input', e => { if (e.target.id === 'palQ' && S.pal) { S.pal.q = e.target.value; S.pal.sel = 0; render(); } });
document.addEventListener('keydown', e => {
  if (S.phase !== 'app') return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); if (S.pal) { S.pal = null; render(); } else palOpen(); return; }
  if (S.pal) {
    const n = palItems().length;
    if (e.key === 'Escape') { S.pal = null; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); S.pal.sel = (S.pal.sel + 1) % Math.max(1, n); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.pal.sel = (S.pal.sel - 1 + n) % Math.max(1, n); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); palGo(Math.min(S.pal.sel, n - 1)); }
    return;
  }
  if (S.recap) {
    if (e.key === 'Escape') { S.recap = null; clearInterval(recapTick); render(); }
    else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); recapGo(1); }
    else if (e.key === 'ArrowLeft') recapGo(-1);
  }
});

/* «Цвет из аватарки» — как Material You на Android берёт цвета с обоев: тон (OKLCH) из фото или цвета аватарки → --md-h / --md-c */
function oklchHue(r, g, b) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B),
    s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { h: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360, c: Math.hypot(A, Bb) };
}
let tintKey = '';
function tintFromAvatar(force = false) {
  const root = document.documentElement, me = S.me;
  if (lsGet('vs_accent') !== 'avatar' || !me) { root.style.removeProperty('--md-h'); root.style.removeProperty('--md-c'); tintKey = ''; return; }
  const src = safePhoto(me.photo), key = src.length + ':' + src.slice(-40) + me.color;
  if (key === tintKey && !force) return;
  tintKey = key;
  const apply = (h, c) => { root.style.setProperty('--md-h', h.toFixed(1)); root.style.setProperty('--md-c', Math.min(0.2, Math.max(0.07, c * 0.9)).toFixed(3)); };
  const fromHex = () => { const m = /^#([0-9a-f]{6})$/i.exec(me.color || '#6A47C9'); const n = parseInt(m ? m[1] : '6A47C9', 16); const o = oklchHue(n >> 16, (n >> 8) & 255, n & 255); apply(o.h, o.c); };
  if (!src) { fromHex(); return; }
  const img = new Image(); if (src.startsWith('https:')) img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
      const p = x.getImageData(0, 0, 32, 32).data; let sx = 0, sy = 0, sw = 0, cw = 0;
      for (let i = 0; i < p.length; i += 4) {   // средний тон по «сочным» пикселям (серые почти не влияют)
        const o = oklchHue(p[i], p[i + 1], p[i + 2]), w = o.c * o.c;
        sx += Math.cos(o.h * Math.PI / 180) * w; sy += Math.sin(o.h * Math.PI / 180) * w; sw += w; cw += o.c;
      }
      if (sw < 1e-4) { fromHex(); return; }
      apply((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360, (cw / (p.length / 4)) * 1.6);
    } catch (e) { fromHex(); }
  };
  img.onerror = fromHex; img.src = src;
}

/* ---------- Окна поверх страницы: просмотр фото и файлов ---------- */
const REPORT_REASONS = { spam: 'Спам', abuse: 'Оскорбления', nsfw: 'Неприемлемый контент', fraud: 'Мошенничество', other: 'Другое' };
function overlay() {
  if (S.recap) return recapOverlay();
  if (S.keys) return keysOverlay();
  if (S.whatsNew) return whatsNewModal();
  if (S.vcmt) return vcmtSheet();
  if (S.liveForm) return liveFormModal();
  if (S.liveRec) return liveRecModal();
  if (S.plPick || S.plForm) return playlistModal();
  if (S.pal) return palOverlay();
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
  if (S.storyDraft) return storyEditor();
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

/* ---------- ВС Видео 2.0 (7.0): главная с большим роликом, полкой Клипов и сеткой; страница просмотра с «Дальше» ---------- */
const provName = v => v.provider === 'youtube' ? 'YouTube' : v.provider === 'rutube' ? 'Rutube' : v.provider === 'vk' ? 'VK Видео' : 'Ссылка';
function videoCard(v, wide = false) {
  const o = U(v.ownerId), th = videoThumb(v), likes = (v.likes || []).length;
  return `<a class="vcard ${wide ? 'vcard-wide' : ''}" href="#video/${esc(v.id)}">
    <div class="vthumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="vph">${I.play}</span>`}
      ${v.duration ? `<span class="vdur tnum">${fmtDur(v.duration)}</span>` : v.source === 'link' ? `<span class="vdur">${provName(v)}</span>` : ''}
      <span class="vplay" aria-hidden="true">${I.play}</span></div>
    <div class="vmeta">${o ? avatar(o, 32, false) : ''}<span class="vmeta-t"><b>${esc(v.title || 'Без названия')}</b>
      <span class="muted small">${esc(o?.name || '')}${o ? ' · ' : ''}${ago(v.createdAt)}${v.views ? ` · ${fmtViews(v.views)} просм.` : ''}${likes ? ` · ♥ ${likes}` : ''}</span></span></div>
  </a>`;
}
const clipCard = v => { const th = videoThumb(v), o = U(v.ownerId);
  return `<a class="vclip" href="#clips/${esc(v.id)}"><span class="vclip-img">${th ? `<img src="${esc(th)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="vph">${I.play}</span>`}</span>
    <span class="vclip-t"><b>${esc(v.title || 'Без названия')}</b><span>${esc(o?.name || '')}</span></span></a>`; };
function videoAdder() {
  const d = S.videoDraft;
  return `<div class="card pad form vadd">
      <div class="row" style="flex-wrap:wrap;gap:8px"><b class="grow">Добавить видео</b>
        <button class="btn sec" data-act="pickvideo" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить файл</span></button>
        <button class="btn sec" data-act="linkform">${I.link}<span>По ссылке</span></button>
        <button class="icon-btn" data-act="videoadd" aria-label="Закрыть">✕</button></div>
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
      </form>` : `<p class="hint" style="margin:0">Файл до ${fmtSize(LIMITS.video)}: примерно 20–40 секунд с телефона — снятые вертикально ролики сразу попадут в Клипы. Длинные видео добавляйте ссылкой.</p>`}
    </div>`;
}
const vSkeleton = n => `<div class="vgrid">${Array.from({ length: n }, () => `<div class="vcard sk"><div class="vthumb sk-box"></div><div class="vmeta"><span class="sk-av"></span><span class="vmeta-t"><span class="sk-line"></span><span class="sk-line short"></span></span></div></div>`).join('')}</div>`;
function viewVideo() {
  const me = S.me, owner = S.videoOwner, ou = owner ? U(owner) : null, mine = owner === me.id, vids = cache.videos || [];
  const tab = (href, l, on) => `<a class="${on ? 'on' : ''}" href="#${href}">${l}</a>`;
  const canAdd = (!owner || mine) && !banOf(me), adding = S.videoAdd || S.linkForm || S.videoDraft;
  const head = `<section class="vh-head"><div class="grow" style="min-width:0"><span class="mus-kicker">ВС Видео</span>
      <h1 class="vh-title">${owner ? (mine ? 'Мои видео' : esc(ou?.name || 'Видео')) : 'Смотри, что нового'}</h1></div>
      <a class="btn sec vh-clips" href="#clips">${I.play}<span>Клипы</span></a>
      ${canAdd ? `<button class="btn" data-act="videoadd">${I.upload}<span>Добавить</span></button>` : ''}</section>
    <div class="tabs vh-tabs">${tab('video', 'Главная', !owner)}${tab('clips', 'Клипы', false)}${tab('videos/' + me.id, 'Мои видео', mine)}${owner && !mine ? tab('videos/' + owner, esc(ou?.name || '…'), true) : ''}</div>`;
  if (S.loading) return head + (adding && canAdd ? videoAdder() : '') + vSkeleton(6);
  if (!vids.length) return head + (canAdd ? videoAdder() : '') + `<div class="card empty"><b>${mine ? 'Вы ещё не добавили видео' : owner ? 'Здесь пока нет видео' : 'Видео пока нет'}</b><span>Загрузите короткий ролик или добавьте ссылку.</span></div>`;
  if (owner) return head + (adding && canAdd ? videoAdder() : '') + `<div class="vgrid">${vids.map(v => videoCard(v)).join('')}</div>`;
  const hero = vids[0], ho = U(hero.ownerId), hth = videoThumb(hero);
  const monthAgo = Date.now() - 30 * 864e5;
  const popular = vids.filter(v => (v.likes || []).length && ms(v.createdAt) > monthAgo).sort((a, b) => (b.likes || []).length - (a.likes || []).length).slice(0, 8);
  return head + (adding && canAdd ? videoAdder() : '') + `
    <a class="vhero" href="#video/${esc(hero.id)}">
      <span class="vhero-img">${hth ? `<img src="${esc(hth)}" alt="" referrerpolicy="no-referrer">` : ''}</span>
      <span class="vhero-shade"></span>
      <span class="vhero-play">${I.play}</span>
      <span class="vhero-t"><span class="mus-kicker">Новое видео</span><b>${esc(hero.title || 'Без названия')}</b>
        <span class="vhero-by">${ho ? avatar(ho, 28, false) : ''}${esc(ho?.name || '')} · ${ago(hero.createdAt)}${hero.duration ? ' · ' + fmtDur(hero.duration) : ''}</span></span></a>
    <section class="mh-shelf"><div class="mh-h"><h2>Клипы</h2><a href="#clips">Смотреть все</a></div>
      <div class="mh-row"><a class="vclip vclip-go" href="#clips"><span class="vclip-img"><span class="vclip-go-ic">${I.play}</span></span><span class="vclip-t"><b>Листать клипы</b><span>как в ленте коротких видео</span></span></a>${vids.slice(0, 12).map(clipCard).join('')}</div></section>
    ${popular.length >= 2 ? `<section class="mh-shelf"><div class="mh-h"><h2>Популярное за месяц</h2></div><div class="mh-row">${popular.map(v => videoCard(v, true)).join('')}</div></section>` : ''}
    <section class="mh-shelf"><div class="mh-h"><h2>Все видео</h2></div><div class="vgrid">${vids.slice(1).map(v => videoCard(v)).join('')}</div></section>`;
}
function watchInfo() {
  const v = cache.video; if (!v || v.missing) return '<div id="watchInfo"></div>';
  const o = U(v.ownerId), me = S.me, likes = v.likes || [], liked = likes.includes(me.id), own = v.ownerId === me.id;
  const long = (v.description || '').length > 180, open = S.vdescOpen === v.id;
  return `<div class="card pad watch-info" id="watchInfo">
    <h1 class="h watch-title">${esc(v.title || 'Без названия')}</h1>
    <div class="row watch-by">${avatar(o, 44)}<div class="grow" style="min-width:0">${nameLink(o)}<div class="muted small">${ago(v.createdAt)}${v.views ? ' · ' + fmtViews(v.views) + ' ' + plural(v.views, 'просмотр', 'просмотра', 'просмотров') : ''}${v.source === 'link' ? ' · ' + provName(v) : ''}</div></div>
      <a class="btn ghost small" href="#videos/${esc(v.ownerId)}">Все видео</a></div>
    <div class="row watch-acts">
      <button class="pill ${liked ? 'liked' : ''}" data-act="likevideo" data-id="${esc(v.id)}" aria-pressed="${liked}">${liked ? I.heart : I.heartO}${likes.length || ''}</button>
      <button class="pill" data-act="vcmt" data-id="${esc(v.id)}">${I.comment}Комментарии${cmtCount[v.id] ? ' ' + cmtCount[v.id] : ''}</button>
      <a class="pill" href="#clips/${esc(v.id)}">${I.play}Как клип</a>
      <button class="pill" data-act="copylink" data-id="${esc(v.id)}">${I.link}Ссылка</button>
      <span class="grow"></span>
      ${own || isSiteAdmin() ? `<button class="btn ${S.confirm === 'video:' + v.id ? 'danger' : 'ghost'} small" data-act="delvideo" data-id="${esc(v.id)}">${S.confirm === 'video:' + v.id ? 'Удалить видео?' : 'Удалить'}</button>` : ''}</div>
    ${v.description ? `<div class="watch-desc ${long && !open ? 'cut' : ''}"><div class="post-text">${linkify(v.description)}</div>${long ? `<button class="linkbtn small" data-act="vdesc" data-id="${esc(v.id)}">${open ? 'Свернуть' : 'Ещё'}</button>` : ''}</div>` : ''}
  </div>`;
}
const vAutoplay = () => lsGet('vs_vauto') !== '0';
function watchSide() {
  const list = cache.videos.slice(0, 12);
  return `<aside class="watch-side" id="watchSide"><div class="row watch-next-h"><b class="grow">Дальше</b>
      <button class="vauto" data-act="vautoplay" role="switch" aria-checked="${vAutoplay()}" title="Автоматически включать следующее видео"><span class="small">Автовоспроизведение</span><span class="vauto-sw ${vAutoplay() ? 'on' : ''}"></span></button></div>
    ${list.length ? list.map(v => videoCard(v, true)).join('') : '<span class="muted small">Других видео пока нет</span>'}</aside>`;
}
// конец ролика на странице просмотра → через 5 секунд следующее (можно отменить)
let vNextTimer = 0;
document.addEventListener('ended', e => {
  const vid = e.target; if (!(vid instanceof HTMLVideoElement) || !vid.closest('#player') || S.view !== 'watch' || !vAutoplay()) return;
  const next = cache.videos?.[0]; if (!next) return;
  const pl = document.getElementById('player'); if (!pl || pl.querySelector('.vnext')) return;
  let n = 5;
  pl.insertAdjacentHTML('beforeend', `<div class="vnext" role="status"><span class="small">Дальше через <b id="vnextN">${n}</b></span><b class="vnext-t">${esc(next.title || 'Без названия')}</b>
    <div class="row"><button class="btn small" data-act="vnextgo" data-id="${esc(next.id)}">Смотреть</button><button class="btn ghost small light" data-act="vnextno">Отмена</button></div></div>`);
  clearInterval(vNextTimer);
  vNextTimer = setInterval(() => { n--; const el = document.getElementById('vnextN'); if (!el || S.view !== 'watch') { clearInterval(vNextTimer); return; } el.textContent = n; if (n <= 0) { clearInterval(vNextTimer); go('video/' + next.id); } }, 1000);
}, true);

/* ---------- ВС Клипы (7.0): вертикальная лента роликов — листается свайпом, играет по кругу, двойной тап — «нравится» ----------
   Страница рисуется один раз за заход: обновления сайта её не перерисовывают (иначе ролик начинался бы заново), всё меняется точечно. */
const CLIP_PAGE = 16;
let clipObs = null, clipTapT = 0, clipTapTimer = 0, clipViewT = 0;
const clipsKey = () => S.clipsReady ? 'ready' : 'wait';
let clipsOvHtml = '';
async function loadClips(startId) {
  if (cache.clipsBusy || cache.clipsDone) return [];
  cache.clipsBusy = true;
  try {
    const parts = [orderBy('createdAt', 'desc'), limit(CLIP_PAGE)];
    if (cache.clipsLast) parts.splice(1, 0, startAfter(cache.clipsLast));
    const s = await getDocs(query(collection(db, 'videos'), ...parts));
    cache.clipsLast = s.docs[s.docs.length - 1] || cache.clipsLast; if (s.size < CLIP_PAGE) cache.clipsDone = true;
    let list = s.docs.map(data);
    if (startId && !cache.clips.length) {
      let first = list.find(v => v.id === startId);
      if (!first) { const d = await getDoc(doc(db, 'videos', startId)).catch(() => null); if (d?.exists()) first = data(d); }
      if (first) list = [first, ...list.filter(v => v.id !== startId)];
    }
    const have = new Set(cache.clips.map(v => v.id)), add = list.filter(v => !have.has(v.id));
    cache.clips.push(...add); ensureUsers(add.map(v => v.ownerId));
    return add;
  } catch (e) { console.error(e); return []; } finally { cache.clipsBusy = false; }
}
function clipHtml(v, i) {
  const o = U(v.ownerId), likes = v.likes || [], liked = likes.includes(S.me.id), th = videoThumb(v);
  return `<section class="clip" data-i="${i}" data-id="${esc(v.id)}">
    <div class="clip-bg" style="${th ? `background-image:url('${esc(th)}')` : ''}"></div>
    <div class="clip-media" data-act="cliptap" data-id="${esc(v.id)}">${th ? `<img class="clip-poster" src="${esc(th)}" alt="" referrerpolicy="no-referrer">` : ''}</div>
    <div class="clip-paused" aria-hidden="true">${I.play}</div>
    <div class="clip-info"><a class="clip-author" href="#id/${esc(v.ownerId)}">${avatar(o, 38, false)}<b>${esc(o?.name || '')}</b></a>
      <div class="clip-title">${esc(v.title || '')}${v.views ? `<span class="clip-views">${I.eye}${fmtViews(v.views)}</span>` : ''}</div>${v.description ? `<div class="clip-desc">${esc(v.description)}</div>` : ''}</div>
    <div class="clip-side">
      <button class="clip-btn ${liked ? 'on' : ''}" data-act="cliplike" data-id="${esc(v.id)}" aria-label="Нравится" aria-pressed="${liked}"><span class="clip-ic">${liked ? I.heart : I.heartO}</span><span class="clip-n">${likes.length || ''}</span></button>
      <button class="clip-btn" data-act="clipcmt" data-id="${esc(v.id)}" aria-label="Комментарии"><span class="clip-ic">${I.comment}</span><span class="clip-n">${cmtCount[v.id] ?? ''}</span></button>
      <a class="clip-btn" href="#video/${esc(v.id)}" aria-label="Открыть ролик"><span class="clip-ic">${I.video}</span><span class="clip-n">Открыть</span></a>
      <button class="clip-btn" data-act="clipshare" data-id="${esc(v.id)}" aria-label="Скопировать ссылку"><span class="clip-ic">${I.link}</span><span class="clip-n">Ссылка</span></button>
    </div>
    <div class="clip-prog"><i></i></div>
  </section>`;
}
function viewClips() {
  const list = cache.clips || [];
  const top = `<div class="clips-top"><a class="clips-x" href="#video" aria-label="Назад к видео">${I.back}</a><b>Клипы</b><span class="grow"></span>
    <button class="clips-x" data-act="clipmute" id="clipMute" aria-label="${S.clipMuted ? 'Включить звук' : 'Выключить звук'}">${S.clipMuted ? '🔇' : '🔊'}</button></div>`;
  if (!S.clipsReady) return `<div class="clips" id="clips" data-key="wait">${top}<div class="clip-load"><div class="spin"></div></div></div>`;
  if (!list.length) return `<div class="clips" id="clips" data-key="ready">${top}<div class="clip-load"><b>Клипов пока нет</b><span>Загрузите короткое видео — оно появится здесь</span><a class="btn" href="#video">В ВС Видео</a></div></div>`;
  return `<div class="clips" id="clips" data-key="ready">${top}
    <div class="clips-feed" id="clipsFeed">${list.map(clipHtml).join('')}</div>
    <div class="clips-nav"><button class="clips-x" data-act="clipstep" data-d="-1" aria-label="Предыдущий">${I.back}</button><button class="clips-x" data-act="clipstep" data-d="1" aria-label="Следующий">${I.back}</button></div>
  </div>`;
}
// после полной перерисовки: следим, какой ролик на экране, и возвращаемся к тому, что смотрели
function clipsMount() {
  const feed = document.getElementById('clipsFeed'); if (!feed || feed.dataset.on) return;
  feed.dataset.on = '1';
  clipObs?.disconnect();
  clipObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio >= 0.6) clipActivate(+e.target.dataset.i); }), { root: feed, threshold: [0.6] });
  feed.querySelectorAll('.clip').forEach(el => clipObs.observe(el));
  const i = Math.min(S.clipIdx || 0, (cache.clips || []).length - 1);
  if (i > 0) feed.scrollTop = i * feed.clientHeight;
}
function clipsStop() {
  clipObs?.disconnect(); clipObs = null; clearTimeout(clipTapTimer);
  document.querySelectorAll('#clipsFeed video').forEach(v => v.pause());
}
function clipsAppend(add) {
  const feed = document.getElementById('clipsFeed'); if (!feed) return;
  const start = cache.clips.length - add.length;
  feed.insertAdjacentHTML('beforeend', add.map((v, k) => clipHtml(v, start + k)).join(''));
  feed.querySelectorAll('.clip').forEach(el => { if (+el.dataset.i >= start) clipObs?.observe(el); });
}
async function clipActivate(i) {
  if (S.view !== 'clips' || S.clipIdx === i && document.querySelector(`#clipsFeed .clip[data-i="${i}"].on`)) return;
  const list = cache.clips, v = list[i]; if (!v) return;
  S.clipIdx = i;
  if (curRoute() !== 'clips/' + v.id) history.replaceState(null, '', BASE + 'clips/' + v.id);
  document.querySelectorAll('#clipsFeed .clip').forEach(el => { const k = +el.dataset.i; if (k !== i) clipPause(el, Math.abs(k - i) > 2); });
  const el = document.querySelector(`#clipsFeed .clip[data-i="${i}"]`); if (el) { el.classList.add('on'); clipPlay(el, v); }
  clearTimeout(clipViewT); clipViewT = setTimeout(() => { if (S.view === 'clips' && S.clipIdx === i) countView(v); }, 2000);   // просмотр — после 2 секунд
  if (!(v.id in cmtCount)) getCountFromServer(collection(db, 'videos', v.id, 'comments')).then(c => { cmtCount[v.id] = c.data().count; clipCmtUi(v.id); }).catch(() => { });
  const nx = list[i + 1]; if (nx?.source === 'file') getFileUrl(nx.fileId, nx.type || 'video/mp4').catch(() => { });   // следующий качаем заранее
  if (i >= list.length - 3 && !cache.clipsDone) { const add = await loadClips(); if (add.length) clipsAppend(add); }
}
async function clipPlay(el, v) {
  const media = el.querySelector('.clip-media');
  if (v.source === 'link' && v.provider !== 'direct') {   // YouTube / Rutube / VK — их собственный плеер
    if (!media.querySelector('iframe')) {
      let src = embedSrc(v); if (!src) return;
      if (v.provider === 'youtube') src += `?autoplay=1&mute=${S.clipMuted ? 1 : 0}&playsinline=1&loop=1&playlist=${v.vid}&controls=0&rel=0`;
      else src += (src.includes('?') ? '&' : '?') + 'autoplay=1';
      media.insertAdjacentHTML('beforeend', `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(v.title)}"></iframe>`);
      el.classList.add('playing');
    }
    return;
  }
  let vid = media.querySelector('video');
  if (!vid) {
    vid = document.createElement('video'); vid.className = 'clip-v'; vid.loop = true; vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.preload = 'auto';
    vid.muted = !!S.clipMuted; media.appendChild(vid);
    const bar = el.querySelector('.clip-prog i');
    vid.addEventListener('timeupdate', () => { if (vid.duration) bar.style.width = (vid.currentTime / vid.duration * 100) + '%'; });
    vid.addEventListener('playing', () => el.classList.add('playing'));
    try { vid.src = v.source === 'file' ? await getFileUrl(v.fileId, v.type || 'video/mp4') : v.vid; }
    catch (e) { console.error(e); el.classList.add('err'); return; }
  }
  if (S.view !== 'clips' || S.clipIdx !== +el.dataset.i) return;   // пока качали, уже пролистали дальше
  el.classList.remove('paused'); vid.muted = !!S.clipMuted;
  vid.play().then(() => { if (!vid.muted && !player.audio.paused) player.audio.pause(); })   // музыка не мешает ролику со звуком
    .catch(() => { vid.muted = true; S.clipMuted = true; clipMuteUi(); vid.play().catch(() => { }); });
}
function clipPause(el, unload) {
  el.classList.remove('on');
  const vid = el.querySelector('video');
  if (vid) {
    vid.pause();
    if (unload) {   // далеко ушли — отпускаем память
      const v = cache.clips[+el.dataset.i];
      vid.removeAttribute('src'); vid.load(); vid.remove(); el.classList.remove('playing');
      if (v?.source === 'file' && blobCache.has(v.fileId) && cache.video?.fileId !== v.fileId) { URL.revokeObjectURL(blobCache.get(v.fileId)); blobCache.delete(v.fileId); }
    }
  }
  const fr = el.querySelector('iframe'); if (fr) { fr.remove(); el.classList.remove('playing'); }
}
function clipToggle(el) {
  const vid = el?.querySelector('video'); if (!vid) return;
  if (vid.paused) { vid.play().catch(() => { }); el.classList.remove('paused'); } else { vid.pause(); el.classList.add('paused'); }
}
function clipMuteUi() { const b = document.getElementById('clipMute'); if (b) { b.textContent = S.clipMuted ? '🔇' : '🔊'; b.setAttribute('aria-label', S.clipMuted ? 'Включить звук' : 'Выключить звук'); } }
function clipHeart(el, x, y) {   // летящее сердце на месте двойного тапа
  if (!el) return; const r = el.getBoundingClientRect();
  const h = document.createElement('span'); h.className = 'tap-heart'; h.innerHTML = I.heart;
  h.style.left = (x - r.left) + 'px'; h.style.top = (y - r.top) + 'px'; h.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
  el.appendChild(h); setTimeout(() => h.remove(), 900);
  try { navigator.vibrate?.(12); } catch (e) { }
}
async function clipLike(id, onlyAdd) {
  const v = (cache.clips || []).find(x => x.id === id); if (!v) return;
  const me = uid(), has = (v.likes || []).includes(me);
  if (has && onlyAdd) return;
  v.likes = has ? v.likes.filter(x => x !== me) : [...(v.likes || []), me];
  document.querySelectorAll(`#clipsFeed .clip[data-id="${CSS.escape(id)}"] [data-act=cliplike]`).forEach(b => {
    b.classList.toggle('on', !has); b.setAttribute('aria-pressed', String(!has));
    b.querySelector('.clip-ic').innerHTML = !has ? I.heart : I.heartO; b.querySelector('.clip-n').textContent = v.likes.length || '';
    if (!has) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  });
  try { await updateDoc(doc(db, 'videos', id), { likes: has ? arrayRemove(me) : arrayUnion(me) }); }
  catch (e) { toast(errText(e)); }
}
/* 8.0: комментарии к видео и клипам (videos/{id}/comments) и просмотры (videos.views, только +1, раз за заход) */
const cmtCount = {}, viewedVids = new Set();
let vcmtUnsub = null;
const fmtViews = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' млн' : n >= 1e4 ? Math.round(n / 1e3) + ' тыс.' : String(n);
function countView(v) {
  if (!v || viewedVids.has(v.id)) return; viewedVids.add(v.id);
  updateDoc(doc(db, 'videos', v.id), { views: increment(1) }).then(() => { v.views = (v.views || 0) + 1; }).catch(() => { });
}
function clipCmtUi(id) { document.querySelectorAll(`#clipsFeed .clip[data-id="${CSS.escape(id)}"] [data-act=clipcmt] .clip-n`).forEach(n => { n.textContent = cmtCount[id] || ''; }); }
function openVcmt(id) {
  vcmtUnsub?.(); S.vcmt = { id, list: null };
  vcmtUnsub = onSnapshot(query(collection(db, 'videos', id, 'comments'), orderBy('createdAt', 'desc'), limit(100)), s => {
    if (S.vcmt?.id !== id) return;
    S.vcmt.list = s.docs.map(data); cmtCount[id] = s.size; clipCmtUi(id);
    ensureUsers(S.vcmt.list.map(c => c.authorId)); render();
  }, e => { console.error(e); if (S.vcmt?.id === id) { S.vcmt.list = []; render(); } });
  render(); setTimeout(() => document.getElementById('vcIn')?.focus({ preventScroll: true }), 80);
}
function closeVcmt() { vcmtUnsub?.(); vcmtUnsub = null; S.vcmt = null; render(); }
function vcmtSheet() {
  const c = S.vcmt, me = S.me, v = (cache.clips || []).find(x => x.id === c.id) || (cache.video?.id === c.id ? cache.video : null);
  const canDel = cm => cm.authorId === me.id || v?.ownerId === me.id || isSiteAdmin();
  return `<div class="ov vc-ov" data-act="vcclose"><div class="vc-sheet" data-stop="1" role="dialog" aria-label="Комментарии">
    <div class="vc-head"><b>Комментарии${c.list?.length ? ` <span class="muted">${c.list.length}</span>` : ''}</b><button class="icon-btn" data-act="vcclose" aria-label="Закрыть">✕</button></div>
    <div class="vc-list">${!c.list ? '<div class="muted small" style="padding:16px">Загружаем…</div>' : !c.list.length ? '<div class="empty"><b>Пока тихо</b><span>Напишите первым</span></div>'
      : c.list.map(cm => { const a = U(cm.authorId); if (!a || iBlocked(cm.authorId)) return '';
        return `<div class="comment">${avatar(a, 32)}<div class="bubble">${nameLink(a)} <span class="post-text">${linkify(cm.text)}</span>
          <div class="muted small">${ago(cm.createdAt)}${canDel(cm) ? ` · <button class="btn ghost small" style="padding:0 4px" data-act="vcdel" data-id="${esc(cm.id)}">удалить</button>` : ''}</div></div></div>`; }).join('')}</div>
    ${banOf(me) ? '' : `<form class="cform vc-form" data-form="vcomment">${avatar(me, 32, false)}<input id="vcIn" placeholder="Комментарий…" maxlength="1000" autocomplete="off"><button class="icon-btn" aria-label="Отправить">${I.send}</button></form>`}
  </div></div>`;
}
function clipStep(d) {
  const feed = document.getElementById('clipsFeed'); if (!feed) return;
  const i = Math.max(0, Math.min((cache.clips || []).length - 1, (S.clipIdx || 0) + d));
  feed.scrollTo({ top: i * feed.clientHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
document.addEventListener('keydown', e => {
  if (S.view !== 'clips' || clipsOvHtml || S.fullPlayer || e.target.matches?.('input,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = document.querySelector(`#clipsFeed .clip[data-i="${S.clipIdx || 0}"]`);
  if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'о') { e.preventDefault(); clipStep(1); }
  else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'л') { e.preventDefault(); clipStep(-1); }
  else if (e.key === ' ') { e.preventDefault(); clipToggle(el); }
  else if (e.key === 'm' || e.key === 'ь') { S.clipMuted = !S.clipMuted; document.querySelectorAll('#clipsFeed video').forEach(v => { v.muted = S.clipMuted; }); clipMuteUi(); }
  else if (e.key === 'Escape') go('video');
});

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
      <div class="set-row"><span class="grow">Дизайн<br><span class="muted small">Material You — как на Android, Газета — бумага и типографика, Классический — простой и быстрый</span></span>${seg('skin', skinNow(), SKINS)}</div>
      <p class="hint" style="margin:0">Сохраняется на этом устройстве.</p></div>
    ${androidCard()}${installCard()}
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
    <p class="hint" style="text-align:center">VСмске ${VERSION} · <button class="linkbtn" data-act="whatsnew">Что нового</button></p>`;
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
      <button class="uitem setlink" data-act="recap"><span class="ficon">${I.star}</span><span class="grow"><b>Мои итоги</b><br><span class="muted small">Твоя статистика в стиле Wrapped</span></span></button>
      ${item('clubs', I.club, 'Сообщества', 'Группы по интересам')}
      ${item('people', I.people, 'Люди', 'Поиск и новые пользователи')}
      ${item('albums', I.album, 'ВС Альбомы', 'Ваши фотографии')}
      ${item('disk', I.disk, 'ВС Диск', 'Личные файлы')}
      ${item('videos/' + me.id, I.video, 'Мои видео')}
      ${item('clips', I.play, 'ВС Клипы', 'Короткие видео — листай свайпом')}
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
      ${tile('clips', '🎬', 'ВС Клипы', 'Короткие видео — листай свайпом', 'c-clips')}
      ${tile('live', '🔴', 'ВС Эфир', 'Прямые эфиры с камеры и экрана', 'c-live')}
      ${tile('timer', '⏱', 'ВС Таймер', 'Секундомер, таймер, помодоро', 'c-timer')}
      ${tile('calc', '🧮', 'ВС Калькулятор', 'Со скобками и историей', 'c-calc')}
      ${tile('dice', '🎲', 'ВС Жребий', 'Монетка, кубики, случайное число', 'c-dice')}
      ${tile('market', I.cart, 'ВС Маркет', 'Купить и продать', 'c-market')}
      ${tile('answers', I.ask, 'ВС Ответы', 'Задайте вопрос — ответят люди', 'c-ask')}
      ${tile('notes', I.note, 'ВС Заметки', 'Списки и мысли — только для вас', 'c-note')}
      ${tile('weather', I.sun, 'ВС Погода', 'Прогноз на неделю', 'c-sun')}
      ${tile('games', I.game, 'ВС Игры', '2048, судоку, змейка и другие', 'c-game')}
      ${tile('video', I.video, 'ВС Видео', 'Ролики и ссылки', 'c-video')}
      ${tile('albums', I.album, 'ВС Альбомы', 'Ваши фотографии', 'c-album')}
      ${tile('disk', I.disk, 'ВС Диск', 'Личные файлы', 'c-disk')}
      ${tile('clubs', I.club, 'Сообщества', 'Группы по интересам', 'c-club')}
      ${tile('vid', I.vid, 'VС ID', 'Вход, почта, пароль', 'c-vid')}
    </div>`;
}

/* ---------- ВС Музыка ---------- */
// Плеер живёт вне #app, поэтому играет при переходах по сайту
const player = { audio: new Audio(), queue: [], i: -1, loading: false, repeat: lsGet('vs_repeat') || 'off', shuffle: lsGet('vs_shuffle') === '1', label: '',
  rate: Number(lsGet('vs_rate')) || 1, pitch: lsGet('vs_pitch') !== '0', vol: lsGet('vs_vol') ? Math.min(Math.max(Number(lsGet('vs_vol')) || 0, 0), 1) : 1, sleep: null };
player.audio.preload = 'auto';
player.audio.volume = player.vol;
// обработчики <audio> запоминаем: эквалайзеру иногда нужен свежий элемент (см. eqPrepare)
const AUDIO_EV = [];
function audioOn(ev, fn) { AUDIO_EV.push([ev, fn]); player.audio.addEventListener(ev, fn); }
function freshAudio() {
  const old = player.audio; AUDIO_EV.forEach(([ev, fn]) => old.removeEventListener(ev, fn));
  old.pause(); old.removeAttribute('src'); old.load();
  try { eqSrcNode?.disconnect(); } catch (e) { }
  eqSrcNode = null; eqSrcEl = null;
  const a = new Audio(); a.preload = 'auto';
  AUDIO_EV.forEach(([ev, fn]) => a.addEventListener(ev, fn));
  player.audio = a; applyRate(); applyVol();
}
// скорость и «сохранять высоту голоса» (выключено — получается slowed / speed up)
function applyRate() {
  const a = player.audio; a.defaultPlaybackRate = a.playbackRate = player.rate;
  a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = player.pitch;
}
applyRate();
/* Эквалайзер и усиление басов (6.4): <audio> → 10 полос → «басы» (lowshelf 90 Гц) → запас громкости → лимитер → выход.
   Через Web Audio звук идёт, только когда эквалайзер включён и что-то поднято/опущено — иначе <audio> играет напрямую
   (так надёжнее в фоне на телефоне). Радио с чужих серверов через Web Audio молчит (нет CORS) — для него берём свежий <audio>. */
const EQ_F = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_PRESETS = {
  flat: ['Обычный', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], bass: ['Басы', [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]],
  pop: ['Поп', [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2]], rock: ['Рок', [5, 3, -1, -3, -1, 2, 4, 5, 5, 5]],
  edm: ['Электроника', [6, 5, 1, 0, -2, 1, 0, 2, 4, 5]], hiphop: ['Хип-хоп', [6, 5, 2, 3, -1, -1, 1, 0, 2, 3]],
  vocal: ['Вокал', [-2, -3, -2, 1, 4, 4, 3, 1, 0, -1]], jazz: ['Джаз', [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]],
  classic: ['Классика', [4, 3, 2, 1, -1, -1, 0, 2, 3, 4]], acoustic: ['Акустика', [4, 3, 2, 1, 1, 1, 2, 3, 3, 2]],
};
const clampDb = (v, lo = -12, hi = 12) => Math.min(Math.max(Math.round(Number(v) || 0), lo), hi);
function eqLoad() {
  try {
    const e = JSON.parse(lsGet('vs_eq') || 'null');
    if (e && Array.isArray(e.bands) && e.bands.length === EQ_F.length)
      return { on: !!e.on, preset: EQ_PRESETS[e.preset] ? e.preset : '', bass: clampDb(e.bass, 0, 12), bands: e.bands.map(v => clampDb(v)) };
  } catch (e) { }
  return { on: false, preset: 'flat', bass: 0, bands: EQ_F.map(() => 0) };
}
player.eq = eqLoad();
const eqActive = () => player.eq.on && (player.eq.bass > 0 || player.eq.bands.some(Boolean));
const dbTxt = v => v > 0 ? '+' + v : v < 0 ? '−' + -v : '0';
const fLabel = f => f >= 1000 ? f / 1000 + 'к' : String(f);
function eqTxt() {
  const e = player.eq; if (!e.on) return 'выключен';
  const name = e.preset ? EQ_PRESETS[e.preset][0] : 'свои настройки';
  return name + (e.bass ? `, басы +${e.bass} дБ` : '');
}
let eqCtx = null, eqNodes = null, eqSrcEl = null, eqSrcNode = null;
function eqGraph() {
  if (eqNodes) return eqNodes;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { eqCtx = new AC(); } catch (e) { return null; }
  const bands = EQ_F.map((f, i) => { const b = eqCtx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === EQ_F.length - 1 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 1.1; return b; });
  const bass = eqCtx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 90;
  const pre = eqCtx.createGain(), lim = eqCtx.createDynamicsCompressor();
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
  [...bands, bass, pre, lim].reduce((a, b) => (a.connect(b), b)).connect(eqCtx.destination);
  eqNodes = { bands, bass, pre, input: bands[0] }; eqApply();
  return eqNodes;
}
function eqApply() {
  if (!eqNodes) return; const e = player.eq;
  eqNodes.bands.forEach((b, i) => { b.gain.value = e.on ? e.bands[i] : 0; });
  eqNodes.bass.gain.value = e.on ? e.bass : 0;
  // запас громкости, чтобы подъём не хрипел (остальное ловит лимитер)
  const boost = e.on ? Math.max(0, ...e.bands) + e.bass * 0.7 : 0;
  eqNodes.pre.gain.value = Math.pow(10, -boost * 0.5 / 20);
}
function eqHook() {
  if (eqSrcEl !== player.audio) {
    const g = eqGraph(); if (!g) return;
    try { eqSrcNode = eqCtx.createMediaElementSource(player.audio); eqSrcNode.connect(g.input); eqSrcEl = player.audio; } catch (e) { console.warn(e); return; }
  }
  if (eqCtx.state !== 'running') eqCtx.resume().catch(() => { });
}
// перед новым треком: подключённый к Web Audio <audio> обратно не отцепить, поэтому для радио и выключенного эквалайзера — свежий
function eqPrepare(t) {
  const want = eqActive() && !t.radio;
  if (eqSrcEl && eqSrcEl === player.audio && !want) freshAudio();
  if (want) eqHook();
}
function eqChanged() {
  lsSet('vs_eq', JSON.stringify(player.eq)); eqApply();
  const t = curTrack(); if (t && !t.radio && eqActive()) eqHook();
  eqDom();
}
// шторка обновляется на месте, без render() — чтобы ползунки не сбивались и шторка не прыгала наверх
function eqDom() {
  const e = player.eq, box = document.querySelector('.eq-wrap'); if (!box) return;
  box.classList.toggle('off', !e.on);
  const sw = document.querySelector('[data-act="eqon"]');
  if (sw) { sw.querySelector('.fs-sw').classList.toggle('on', e.on); sw.querySelector('.grow span').textContent = e.on ? 'включён' : 'выключен'; }
  const st = document.getElementById('eqState'); if (st) st.textContent = eqTxt();
  box.querySelectorAll('[data-act="eqpreset"]').forEach(b => b.classList.toggle('on', b.dataset.v === e.preset));
  box.querySelectorAll('.eq-sl').forEach(sl => { const v = e.bands[+sl.dataset.i]; if (!sl.matches(':active')) sl.value = String(v); sl.parentElement.querySelector('output').textContent = dbTxt(v); });
  const bs = document.getElementById('eqBass'); if (bs && !bs.matches(':active')) bs.value = String(e.bass);
  const bv = document.getElementById('eqBassV'); if (bv) bv.textContent = `+${e.bass} дБ`;
  const c = document.getElementById('eqCurve'); if (c) c.innerHTML = eqCurve();
}
// кривая АЧХ: сумма откликов всех фильтров от 20 Гц до 20 кГц
function eqCurve() {
  const g = eqGraph(); if (!g) return '';
  const N = 120, fr = new Float32Array(N), mag = new Float32Array(N), ph = new Float32Array(N), tot = new Float32Array(N);
  for (let i = 0; i < N; i++) fr[i] = 20 * Math.pow(1000, i / (N - 1));
  [...g.bands, g.bass].forEach(b => { b.getFrequencyResponse(fr, mag, ph); for (let i = 0; i < N; i++) tot[i] += 20 * Math.log10(mag[i] || 1e-6); });
  const pts = Array.from(tot, (db, i) => `${(i / (N - 1) * 300).toFixed(1)},${(40 - Math.max(-18, Math.min(18, db)) * 2).toFixed(1)}`).join(' ');
  return `<svg class="eq-curve" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="40" x2="300" y2="40"/><polyline points="${pts}"/></svg>`;
}
document.addEventListener('input', e => {
  const el = e.target, bass = el.id === 'eqBass'; if (!bass && !el.classList?.contains('eq-sl')) return;
  const q = player.eq;
  if (bass) q.bass = clampDb(el.value, 0, 12); else { q.bands[+el.dataset.i] = clampDb(el.value); q.preset = ''; }
  q.on = true; eqChanged();
});
// Safari и Chrome запускают звук Web Audio только после нажатия
document.addEventListener('pointerdown', () => { if (eqCtx && eqSrcEl && eqCtx.state !== 'running') eqCtx.resume().catch(() => { }); }, { passive: true });
/* 6.5: итоговая громкость = ползунок × затухание таймера сна × плавный переход × выравнивание громкости */
function applyVol() {
  const v = player.vol * (player.sleepMul ?? 1) * (player.fadeMul ?? 1) * (player.normMul ?? 1);
  player.audio.volume = Math.min(1, Math.max(0, v));
}
// плавные переходы: последние N секунд трек затихает, следующий (если перешли сами) плавно нарастает
const xfadeSec = () => { const v = Number(lsGet('vs_xfade')); return [0, 2, 4, 6, 8, 12].includes(v) ? v : 0; };
const normOn = () => lsGet('vs_norm') === '1';
let fadePrefetched = '';
setInterval(() => {
  const a = player.audio, t = curTrack(), X = xfadeSec();
  let mul = 1;
  if (t && !t.radio && X && !a.paused && a.duration > X * 3) {
    const left = a.duration - a.currentTime;
    if (left < X) mul = Math.max(0, left / X);
    if (player.fadeIn && a.currentTime < X / 2) mul = Math.min(mul, a.currentTime / (X / 2));
    // заранее качаем следующий трек, чтобы после затухания не было тишины
    const nx = player.queue[player.i + 1];
    if (left < X + 8 && nx && !nx.radio && fadePrefetched !== nx.id) { fadePrefetched = nx.id; getFileUrl(nx.fileId, nx.type || 'audio/mpeg').catch(() => { }); }
  }
  if (player.fadeIn && a.currentTime >= X / 2) player.fadeIn = false;
  if (mul !== (player.fadeMul ?? 1)) { player.fadeMul = mul; applyVol(); }
}, 80);
// выравнивание громкости: громкие треки делаем тише по их средней громкости (RMS из analyzeTrack), тихие не трогаем
function normApply() {
  const t = curTrack(), d = t && !t.radio ? audioData.get(t.id) : null;
  player.normMul = normOn() && d && d.rms ? Math.max(0.35, Math.min(1, 0.14 / d.rms)) : 1;
  applyVol();
}
/* Статистика прослушиваний — только на этом устройстве (localStorage vs_plays): прослушивание засчитывается после 30 секунд
   (или половины короткого трека), время слушания копится секундами */
function playStats() { try { const o = JSON.parse(lsGet('vs_plays') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
let statT = -1, statSec = 0, statCounted = false, statSaveAt = 0;
function statTick() {
  const a = player.audio, t = curTrack(); if (!t || t.radio || a.paused) { statT = -1; return; }
  const d = a.currentTime - statT; statT = a.currentTime;
  if (!(d > 0 && d < 2)) return;
  statSec += d;
  if (!statCounted && (statSec >= 30 || (a.duration && statSec >= a.duration / 2))) { statCounted = true; statAdd(t, 1, 0); }
  if (Date.now() - statSaveAt > 15000) statFlush();
}
function statAdd(t, n, sec) {
  const o = playStats(), x = o[t.id] || { n: 0, s: 0 };
  Object.assign(x, { n: x.n + n, s: Math.round((x.s || 0) + sec), title: t.title, artist: t.artist || '', fileId: t.fileId, type: t.type || '', duration: t.duration || 0, ownerId: t.ownerId, last: Date.now() });
  o[t.id] = x;
  const ids = Object.keys(o);
  if (ids.length > 400) ids.sort((a, b) => (o[a].last || 0) - (o[b].last || 0)).slice(0, ids.length - 400).forEach(k => delete o[k]);
  lsSet('vs_plays', JSON.stringify(o));
}
function statFlush() {
  statSaveAt = Date.now(); const t = curTrack(); if (!t || t.radio || statSec < 1) return;
  const sec = statSec; statSec = 0; statAdd(t, 0, sec);
  lsSet('vs_listen_total', String(Math.round((Number(lsGet('vs_listen_total')) || 0) + sec)));
}
window.addEventListener('pagehide', () => statFlush());
function statReset() { statFlush(); statT = -1; statSec = 0; statCounted = false; }
function topTracks(n = 50) {
  const o = playStats();
  return Object.entries(o).filter(([, x]) => x.n > 0 && x.fileId).sort((a, b) => b[1].n - a[1].n || b[1].s - a[1].s).slice(0, n)
    .map(([id, x]) => ({ ...(trackCache.get(id) || { id, title: x.title, artist: x.artist, fileId: x.fileId, type: x.type, duration: x.duration, ownerId: x.ownerId }), plays: x.n }));
}
function topArtists(n = 10) {
  const m = new Map();
  for (const x of Object.values(playStats())) if (x.artist && x.n) { const k = x.artist.trim(), v = m.get(k) || { name: k, n: 0, s: 0 }; v.n += x.n; v.s += x.s || 0; m.set(k, v); }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);
}
function setVolume(v) {
  player.vol = Math.min(Math.max(Math.round(v * 100) / 100, 0), 1); lsSet('vs_vol', String(player.vol));
  applyVol();
  const r = document.getElementById('fpVol'); if (r && !r.matches(':active')) r.value = String(Math.round(player.vol * 100));
}
document.addEventListener('input', e => { if (e.target.id === 'fpVol') setVolume(Number(e.target.value) / 100); });
// жесты: свайп по обложке — соседний трек, вниз по плееру — свернуть, вверх по мини-плееру — развернуть
let fpTouch = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest?.('.fp-art,.fp-viz,.fp-top,.mbar'); if (!el || e.target.closest('input,button:not(.mbar-info)')) return;
  fpTouch = { x: e.clientX, y: e.clientY, t: Date.now(), art: !!el.closest('.fp-art,.fp-viz'), bar: !!el.closest('.mbar') };
}, { passive: true });
document.addEventListener('pointerup', e => {
  const ft = fpTouch; fpTouch = null; if (!ft || Date.now() - ft.t > 1500) return;
  const dx = e.clientX - ft.x, dy = e.clientY - ft.y;
  if (ft.bar) { if (dy < -40 && Math.abs(dx) < 60 && curTrack()) { S.fullPlayer = true; render(); } return; }
  if (dy > 90 && Math.abs(dx) < 80) { S.fullPlayer = false; S.fpSheet = null; render(); return; }
  if (ft.art && Math.abs(dx) > 60 && Math.abs(dy) < 70) dx < 0 ? nextTrack() : prevTrack();
}, { passive: true });
function sleepStop() {
  player.audio.pause(); player.sleep = null; player.sleepMul = 1; applyVol();
  toast('Спокойной ночи 🌙 Музыка выключена по таймеру'); render();
}
const curTrack = () => player.queue[player.i];
// позиция на экране блокировки (раз в 5 секунд хватает — дальше система считает сама)
let msPosAt = 0;
function msPos() {
  const a = player.audio, t = curTrack();
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !t || t.radio || !(a.duration > 0) || Date.now() - msPosAt < 5000) return;
  msPosAt = Date.now();
  try { navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: a.playbackRate || 1 }); } catch (e) { }
}
audioOn('timeupdate', () => {
  statTick(); msPos();
  const a = player.audio, t = curTrack(), pct = a.duration ? a.currentTime / a.duration * 100 : 0;
  const fill = document.getElementById('mbarFill'), mt = document.getElementById('mbarTime');
  if (fill) fill.style.width = pct + '%';
  if (mt && !t?.radio) mt.textContent = fmtDur(a.currentTime) + ' / ' + fmtDur(a.duration || t?.duration);
  // полноэкранный плеер: ползунок, время и строка текста — без перерисовки всей страницы
  const seek = document.getElementById('fpSeek'), cur = document.getElementById('fpCur'), left = document.getElementById('fpLeft');
  if (seek && !seek.matches(':active')) { seek.value = String(Math.round(pct * 10)); seek.style.setProperty('--p', pct + '%'); }
  if (cur) cur.textContent = fmtDur(a.currentTime);
  if (left && a.duration) left.textContent = fmtDur(a.duration);
  // таймер сна: последние 10 секунд музыка плавно затихает
  if (player.sleep?.at) {
    const ms2 = player.sleep.at - Date.now();
    if (ms2 <= 0) sleepStop();
    else { player.sleepMul = ms2 < 10000 ? ms2 / 10000 : 1; applyVol(); const sl = document.getElementById('fpSleep'); if (sl) sl.textContent = fmtDur(ms2 / 1000); }
  }
  syncLyrics();
});
['play', 'pause'].forEach(ev => audioOn(ev, () => render()));
audioOn('play', () => { if (eqCtx && eqSrcEl === player.audio && eqCtx.state !== 'running') eqCtx.resume().catch(() => { }); });
audioOn('ended', () => {
  statReset(); player.autoNext = true;
  if (player.sleep?.end) { player.sleep = null; toast('Спокойной ночи 🌙 Трек доиграл — музыка выключена'); render(); return; }
  if (player.repeat === 'one') { player.audio.currentTime = 0; player.audio.play(); return; }
  nextTrack(true);
});
// следующий трек с учётом «перемешать» и «повторять всё»
function nextTrack(auto = false) {
  const n = player.queue.length; if (!n) return;
  if (player.shuffle && n > 1) { let j; do j = Math.floor(Math.random() * n); while (j === player.i); return playAt(j); }
  if (player.i + 1 < n) return playAt(player.i + 1);
  if (player.repeat === 'all' || !auto) return playAt(0);
  // 6.6: очередь кончилась — дальше Микс дня (выключается в «Ещё» → «Автопродолжение»)
  if (auto && autoplayOn() && !curTrack()?.radio) {
    const have = new Set(player.queue.map(t => t.id)), more = (cache.mus?.mix?.length ? cache.mus.mix : buildMix()).filter(t => !have.has(t.id));
    if (more.length) { player.queue.push(...more.slice(0, 30)); player.label = 'Микс дня'; toast('✦ Дальше — Микс дня'); return playAt(player.i + 1); }
  }
  player.audio.pause();
}
function prevTrack() {
  if (player.audio.currentTime > 3 || player.queue.length < 2) { player.audio.currentTime = 0; return; }
  playAt(player.i > 0 ? player.i - 1 : player.queue.length - 1);
}
async function playAt(i) {
  if (i < 0 || i >= player.queue.length) { player.audio.pause(); return; }
  statReset(); player.i = i; player.loading = true; render();
  const t = curTrack();
  try {
    const url = t.radio ? t.url : await getFileUrl(t.fileId, t.type || 'audio/mpeg');
    if (curTrack() !== t) return;
    eqPrepare(t); player.normMul = 1;
    player.fadeIn = !!player.autoNext && xfadeSec() > 0; player.autoNext = false; player.fadeMul = player.fadeIn ? 0 : 1; applyVol();
    player.audio.src = url; applyRate(); await player.audio.play(); normApply();
    shareListening(t); analyzeTrack(t); coverPalette(t); pushRecent(t);
    if (player.stream && player.i >= player.queue.length - 3) extendStream();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: 'ВС Музыка', artwork: safeImg(t.cover) ? [{ src: t.cover, sizes: '600x600', type: 'image/jpeg' }] : [] });
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      try {
        navigator.mediaSession.setActionHandler('seekbackward', t.radio ? null : d => { player.audio.currentTime = Math.max(0, player.audio.currentTime - (d.seekOffset || 10)); });
        navigator.mediaSession.setActionHandler('seekforward', t.radio ? null : d => { const a = player.audio; a.currentTime = Math.min((a.duration || 0) - 0.5, a.currentTime + (d.seekOffset || 10)); });
      } catch (e) { }
      try { navigator.mediaSession.setActionHandler('seekto', d => { if (!t.radio && d.seekTime != null) player.audio.currentTime = d.seekTime; }); } catch (e) { }
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
  player.queue = list.slice(); player.label = label; player.stream = false; player.autoNext = false; playAt(i);
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

/* ---------- Плеер 2.0: анализ звука, волна, спектр, цвета обложки ----------
   Файл трека декодируется отдельно (OfflineAudioContext, 11 кГц, моно) — так у нас есть настоящая форма волны и спектр,
   а сам звук идёт как раньше, через обычный <audio> (радио с чужих серверов так тоже работает). */
const AN_SR = 11025, audioData = new Map();   // id трека → { peaks, env, pcm } | 'busy' | null
async function analyzeTrack(t) {
  if (!t || t.radio || !t.fileId || audioData.has(t.id)) return;
  if ((t.duration || 0) > 900) { audioData.set(t.id, null); return; }
  audioData.set(t.id, 'busy');
  try {
    const buf = await (await fetch(await getFileUrl(t.fileId, t.type || 'audio/mpeg'))).arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new OAC(1, 1, AN_SR).decodeAudioData(buf);
    const n = ab.length, chs = ab.numberOfChannels, pcm = new Float32Array(n);
    for (let c = 0; c < chs; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) pcm[i] += d[i] / chs; }
    const B = 240, step = Math.max(1, Math.floor(n / B)), peaks = new Float32Array(B);
    for (let b = 0; b < B; b++) { let m = 0; for (let i = b * step, e = Math.min(n, i + step); i < e; i += 3) { const v = Math.abs(pcm[i]); if (v > m) m = v; } peaks[b] = m; }
    const hop = Math.round(AN_SR / 30), env = new Float32Array(Math.ceil(n / hop));
    for (let k = 0; k < env.length; k++) { let sum = 0, cnt = 0; for (let i = k * hop, e = Math.min(n, i + hop); i < e; i += 2) { sum += pcm[i] * pcm[i]; cnt++; } env[k] = Math.sqrt(sum / (cnt || 1)); }
    const norm = a => { let m = 0; for (const v of a) if (v > m) m = v; if (m) for (let i = 0; i < a.length; i++) a[i] /= m; };
    norm(peaks); norm(env);
    for (const [k, v] of audioData) if (v && v.pcm && k !== t.id) v.pcm = null;   // сырой звук держим только у текущего трека
    let sq = 0, cnt = 0; for (let i = 0; i < n; i += 4) { sq += pcm[i] * pcm[i]; cnt++; }
    audioData.set(t.id, { peaks, env, pcm, rms: Math.sqrt(sq / (cnt || 1)) });
    if (curTrack()?.id === t.id) normApply();
  } catch (e) { console.warn('анализ трека не удался', e); audioData.set(t.id, null); }
}
// быстрое преобразование Фурье на 512 точек — спектр в момент воспроизведения
const FFT_N = 512, fftRe = new Float32Array(FFT_N), fftIm = new Float32Array(FFT_N), BANDS = 48;
const hann = Float32Array.from({ length: FFT_N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_N - 1)));
const bandEdges = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(2 * Math.pow(220 / 2, i / BANDS)));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai;
        const t2 = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t2;
      }
    }
  }
}
const spec = new Float32Array(BANDS);
function spectrumAt(d, time, playing, radio) {
  if (radio && playing) {   // у радио нет файла — мягкое «живое» движение
    const ts = performance.now() / 1000;
    for (let b = 0; b < BANDS; b++) spec[b] = spec[b] * 0.8 + 0.2 * (0.35 + 0.3 * Math.sin(ts * 3 + b * 0.7) * Math.sin(ts * 1.3 + b * 0.31) + 0.15 * Math.random()) * (1 - b / BANDS * 0.5);
    return spec;
  }
  if (!d?.pcm || !playing) { for (let b = 0; b < BANDS; b++) spec[b] *= 0.9; return spec; }
  const start = Math.floor(time * AN_SR) - FFT_N / 2;
  for (let i = 0; i < FFT_N; i++) { const j = start + i; fftRe[i] = j >= 0 && j < d.pcm.length ? d.pcm[j] * hann[i] : 0; fftIm[i] = 0; }
  fft(fftRe, fftIm);
  for (let b = 0; b < BANDS; b++) {
    let m = 0; const lo = bandEdges[b], hi = Math.max(bandEdges[b + 1], lo + 1);
    for (let k = lo; k < hi; k++) m += Math.hypot(fftRe[k], fftIm[k]);
    const v = Math.min(1, Math.sqrt(m / (hi - lo) / 22) * (1 + b / BANDS * 1.6));
    spec[b] = v > spec[b] ? v * 0.65 + spec[b] * 0.35 : spec[b] * 0.86 + v * 0.14;
  }
  return spec;
}
// цвета обложки: три самых «сочных» оттенка — для фона и визуализатора
const palettes = new Map(), DEF_PAL = { c1: '#7C3AED', c2: '#C026D3', c3: '#4F46E5', img: null };
function coverPalette(t) {
  if (!t) return DEF_PAL;
  const key = (t.radio ? 'r:' : '') + t.id;
  if (palettes.has(key)) return palettes.get(key);
  const base = t.radio && t.c ? { ...DEF_PAL, c1: t.c } : { ...DEF_PAL };
  palettes.set(key, base);
  const src = safeImg(t.cover); if (!src) return base;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 36;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 36, 36);
      const px = x.getImageData(0, 0, 36, 36).data, box = new Map();
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 28 || mn > 238) continue;
        const k = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5), sat = (mx - mn) / mx;
        const e = box.get(k) || { w: 0, r: 0, g: 0, b: 0 }; const w = 0.2 + sat * sat * 2;
        e.w += w; e.r += r * w; e.g += g * w; e.b += b * w; box.set(k, e);
      }
      const cols = [...box.values()].sort((a, b) => b.w - a.w).map(e => [e.r / e.w, e.g / e.w, e.b / e.w]);
      const pick = [];
      for (const cl of cols) { if (pick.every(p => Math.hypot(p[0] - cl[0], p[1] - cl[1], p[2] - cl[2]) > 70)) pick.push(cl); if (pick.length === 3) break; }
      // для фона: насыщеннее и не светлее середины — иначе белый текст на светлой обложке не читается
      const css = cl => {
        if (!cl) return null;
        let [r, g, b] = cl.map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, sl = 0, l = (mx + mn) / 2;
        if (mx !== mn) { const d = mx - mn; sl = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
        sl = sl < 0.08 ? sl : Math.max(sl, 0.5); l = Math.min(Math.max(l, 0.28), 0.52);
        return `hsl(${Math.round(h * 360)} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
      };
      palettes.set(key, { c1: css(pick[0]) || base.c1, c2: css(pick[1]) || base.c2, c3: css(pick[2]) || base.c3, img });
      if (S.fullPlayer && curTrack()?.id === t.id) render();
    } catch (e) { palettes.set(key, { ...base, img }); }
  };
  img.src = src;
  return base;
}
// один цикл отрисовки на всё: волна перемотки, визуализатор «Винил», «дыхание» обложки
let fpRaf = 0, fpLast = 0, vinylAngle = 0, pulse = 0, coverK = 1;
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w, h, dpr };
}
function drawWave(cv, d, p) {
  const { w, h, dpr } = fitCanvas(cv), x = cv.getContext('2d');
  x.clearRect(0, 0, w, h);
  const bw = 2.2 * dpr, gap = 1.8 * dpr, n = Math.max(1, Math.floor(w / (bw + gap))), peaks = d && d.peaks;
  for (let i = 0; i < n; i++) {
    let v = 0.18;
    if (peaks) { const a = Math.floor(i / n * peaks.length), b = Math.max(a + 1, Math.floor((i + 1) / n * peaks.length)); v = 0; for (let k = a; k < b; k++) v = Math.max(v, peaks[k]); v = 0.08 + Math.pow(v, 0.8) * 0.92; }
    const bh = Math.max(2 * dpr, v * h * 0.92), xx = i * (bw + gap);
    x.fillStyle = (i + 0.5) / n <= p ? '#fff' : 'rgba(255,255,255,.3)';
    x.beginPath(); x.roundRect ? x.roundRect(xx, (h - bh) / 2, bw, bh, bw / 2) : x.rect(xx, (h - bh) / 2, bw, bh); x.fill();
  }
}
function drawVinyl(cv, sp, pal, dt, playing) {
  const { w, h, dpr } = fitCanvas(cv), x = cv.getContext('2d');
  x.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, sz = Math.min(w, h), R = sz * 0.3;
  if (playing) vinylAngle += dt * 0.9;
  // свечение в цвет обложки
  const glow = x.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9);
  glow.addColorStop(0, pal.c1); glow.addColorStop(1, 'transparent');
  x.globalAlpha = 0.35 + pulse * 0.4; x.fillStyle = glow; x.fillRect(0, 0, w, h); x.globalAlpha = 1;
  // столбики спектра по кругу (зеркально)
  const N = 96, lw = Math.max(2 * dpr, 2 * Math.PI * R / N * 0.5);
  x.lineCap = 'round'; x.lineWidth = lw;
  for (let i = 0; i < N; i++) {
    const half = N / 2, bi = Math.floor((i < half ? i : N - 1 - i) / half * BANDS), v = sp[Math.min(bi, BANDS - 1)];
    const a = i / N * Math.PI * 2 - Math.PI / 2, len = 4 * dpr + v * sz * 0.17;
    const r1 = R + 8 * dpr, r2 = r1 + len;
    x.strokeStyle = i % 2 ? pal.c2 : pal.c1; x.globalAlpha = 0.55 + v * 0.45;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke();
  }
  x.globalAlpha = 1;
  // пластинка: чёрный диск с бороздками, обложка — «яблоко» в центре, крутится
  x.save(); x.translate(cx, cy); x.rotate(vinylAngle);
  x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fillStyle = '#0d0b12'; x.fill();
  x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1 * dpr;
  for (let r = R * 0.66; r < R * 0.98; r += 3 * dpr) { x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
  const shine = x.createLinearGradient(-R, -R, R, R);
  shine.addColorStop(0.35, 'rgba(255,255,255,0)'); shine.addColorStop(0.5, 'rgba(255,255,255,.12)'); shine.addColorStop(0.65, 'rgba(255,255,255,0)');
  x.fillStyle = shine; x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fill();
  const lr = R * 0.6;
  x.save(); x.beginPath(); x.arc(0, 0, lr, 0, Math.PI * 2); x.clip();
  if (pal.img) x.drawImage(pal.img, -lr, -lr, lr * 2, lr * 2);
  else { const g = x.createLinearGradient(-lr, -lr, lr, lr); g.addColorStop(0, pal.c1); g.addColorStop(1, pal.c2); x.fillStyle = g; x.fillRect(-lr, -lr, lr * 2, lr * 2); }
  x.restore();
  x.beginPath(); x.arc(0, 0, R * 0.05, 0, Math.PI * 2); x.fillStyle = '#0d0b12'; x.fill();
  x.restore();
}
function fpLoop() {
  cancelAnimationFrame(fpRaf);
  const step = now => {
    if (!S.fullPlayer || !document.querySelector('.fp')) { fpRaf = 0; return; }
    const dt = Math.min(0.1, (now - (fpLast || now)) / 1000); fpLast = now;
    const t = curTrack(), a = player.audio, d = t && !t.radio ? audioData.get(t.id) : null, data = d && d !== 'busy' ? d : null;
    const playing = !a.paused, time = a.currentTime;
    const e = data?.env ? data.env[Math.min(data.env.length - 1, Math.floor(time * 30))] || 0 : (t?.radio && playing ? 0.35 + 0.15 * Math.sin(now / 400) : 0);
    pulse = playing ? pulse * 0.7 + e * 0.3 : pulse * 0.9;
    coverK += ((playing ? 1 : 0.86) - coverK) * Math.min(1, dt * 8);   // на паузе обложка чуть уменьшается, как в Apple Music
    const cover = document.getElementById('fpCover');
    if (cover) cover.style.transform = `scale(${(coverK + pulse * 0.045).toFixed(4)})`;
    const fp = document.querySelector('.fp'); if (fp) fp.style.setProperty('--pulse', pulse.toFixed(3));
    const wave = document.getElementById('fpWave');
    if (wave) {
      const seek = document.getElementById('fpSeek'), dur = a.duration || t?.duration || 0;
      drawWave(wave, data, seek && seek.matches(':active') ? seek.value / 1000 : dur ? time / dur : 0);
    }
    const viz = document.getElementById('fpViz');
    if (viz) drawVinyl(viz, spectrumAt(data, time, playing, t?.radio), coverPalette(t), dt, playing);
    fpRaf = requestAnimationFrame(step);
  };
  fpRaf = requestAnimationFrame(step);
}

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
  const pal = coverPalette(t), view = showLyrics ? 'lyrics' : S.fpMode || 'cover';
  // 6.7: сверху — переключатель «Трек · Текст · Очередь»
  const tab = (v, l, dis = false) => `<button role="tab" aria-selected="${view === v}" class="${view === v ? 'on' : ''}" data-act="fpview" data-v="${v}" ${dis ? 'disabled' : ''}>${l}</button>`;
  const head = `<div class="fp-top"><button class="icon-btn fp-x" data-act="fpclose" aria-label="Свернуть плеер">${I.down}</button>
      <div class="fp-tabs" role="tablist">${tab('cover', 'Трек')}${tab('lyrics', 'Текст', t.radio)}${tab('queue', 'Очередь')}</div>
      <button class="icon-btn fp-x" data-act="fpsheet" data-v="more" aria-label="Ещё">${I.more}</button></div>`;
  const art = `<div class="fp-art">${cover ? `<img class="fp-cover" id="fpCover" src="${esc(cover)}" alt="Обложка" draggable="false">` : `<div class="fp-cover fp-cover-empty" id="fpCover" style="${t.radio ? `--rc:${t.c}` : ''}">${t.radio ? '📻' : '🎵'}</div>`}</div>`;
  const viz = `<div class="fp-viz"><canvas id="fpViz" aria-label="Визуализатор"></canvas></div>`;
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
  const sleepTxt = player.sleep ? (player.sleep.end ? 'до конца' : fmtDur((player.sleep.at - Date.now()) / 1000)) : '';
  const act = (a, ic, label, on, extra = '', dis = false) => `<button class="fp-act ${on ? 'on' : ''}" data-act="${a}" ${extra} ${dis ? 'disabled' : ''}><span class="fp-act-ic">${ic}</span><span class="fp-act-l">${label}</span></button>`;
  return `<div class="fp ${apStyle ? 'ap fp-ly-' + lyrStyle() : ''} fp-v-${view} ${a.paused ? 'paused' : ''}" role="dialog" aria-label="Плеер" style="--c1:${pal.c1};--c2:${pal.c2};--c3:${pal.c3}">
    <div class="fp-bg" style="${cover ? `background-image:url('${esc(cover)}')` : ''}"></div><div class="fp-glow" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="fp-in">
    ${head}
    <div class="fp-main">${apStyle ? `<div class="ap-head">${cover ? `<img src="${esc(cover)}" alt="">` : `<span class="ap-noart">🎵</span>`}<div class="grow" style="min-width:0"><b>${esc(t.title)}</b><span>${esc(t.artist || 'Неизвестный исполнитель')}</span></div></div>` : ''}
      ${view === 'lyrics' ? lyricsBox : view === 'viz' ? viz : view === 'queue' ? fpQueue() : art}</div>
    <div class="fp-side">
    <div class="fp-info"><div class="grow" style="min-width:0"><div class="fp-from"><span>${t.radio ? 'ВС Радио · прямой эфир' : 'Играет из'}</span> <b class="fp-label">${t.radio ? '' : esc(player.label || 'ВС Музыка')}</b></div><div class="fp-title"><span>${esc(t.title)}</span></div>
        <div class="fp-artist">${esc(t.artist || (t.radio ? '' : 'Неизвестный исполнитель'))}${owner ? ` · <a href="#music/${esc(owner.id)}" data-act="fpclose">${esc(owner.name)}</a>` : ''}</div></div>
      ${own ? `<button class="icon-btn fp-ic" data-act="tedit" data-id="cur" aria-label="Изменить трек" title="Название, исполнитель и обложка">✏️</button>` : ''}
      ${t.radio ? '' : `<button class="icon-btn fp-ic fp-round" data-act="tpl" data-id="${esc(t.id)}" aria-label="Добавить в плейлист" title="Добавить в плейлист">＋</button>`}
      <button class="icon-btn fp-ic fp-round fp-heart ${saved ? 'on' : ''}" data-act="fplike" ${t.radio || own ? 'disabled' : ''} aria-label="${saved ? 'В моей музыке' : 'Добавить в мою музыку'}">${saved ? I.heart : I.heartO}</button></div>
    ${t.radio ? `<div class="fp-live"><span class="eq"><i></i><i></i><i></i><i></i></span> Прямой эфир</div>` : `<div class="fp-seek"><div class="fp-wave"><canvas id="fpWave" aria-hidden="true"></canvas>
        <input id="fpSeek" class="fp-range" type="range" min="0" max="1000" value="${Math.round(pct * 10)}" style="--p:${pct}%" aria-label="Перемотка"></div>
      <div class="fp-times tnum"><span id="fpCur">${fmtDur(a.currentTime)}</span>${player.rate !== 1 ? `<span class="fp-rate">${player.rate}×${player.pitch ? '' : ' 🎚'}</span>` : ''}<span id="fpLeft">${fmtDur(dur)}</span></div></div>`}
    <div class="fp-ctrl">
      <button class="icon-btn fp-ic fp-mode ${player.shuffle ? 'on' : ''}" data-act="fpshuffle" aria-label="Перемешать" title="Перемешать">${I.shuffle}</button>
      <button class="icon-btn fp-big" data-act="mprev" aria-label="Предыдущий">${I.prev}</button>
      <button class="fp-play" data-act="mplay" aria-label="${a.paused ? 'Играть' : 'Пауза'}">${player.loading ? '<span class="spin"></span>' : a.paused ? I.play : I.pause}</button>
      <button class="icon-btn fp-big" data-act="mnext" aria-label="Следующий">${I.next}</button>
      <button class="icon-btn fp-ic fp-mode ${player.repeat !== 'off' ? 'on' : ''}" data-act="fprepeat" aria-label="${REPEAT_LABEL[player.repeat]}" title="${REPEAT_LABEL[player.repeat]}">${I.repeat}${player.repeat === 'one' ? '<sup>1</sup>' : ''}</button></div>
    <div class="fp-acts">
      ${act('fpsheet', '🎛', 'Звук', eqActive(), 'data-v="eq"', t.radio)}
      ${showLyrics && !S.lyrEdit ? act('lyrpick', 'Aa', 'Вид текста', S.lyrPick) : act('fpmode', I.radio, 'Винил', view === 'viz', 'data-v="viz"')}
      ${act('fpsheet', '⏩', player.rate !== 1 ? player.rate + '×' : 'Скорость', player.rate !== 1 || !player.pitch, 'data-v="speed"', t.radio)}
      ${act('fpsheet', '🌙', `<span id="fpSleep">${sleepTxt || 'Сон'}</span>`, !!player.sleep, 'data-v="sleep"')}
      ${act('toff', isOff(t) ? '✓' : '📥', isOff(t) ? 'Офлайн' : 'Скачать', isOff(t), 'data-id="cur"', t.radio)}
      ${act('tlink', I.link, 'Ссылка', false, 'data-id="cur"', t.radio)}</div>
    </div>
  </div>${S.lyrPick && showLyrics ? lyrPicker() : ''}${fpSheet(t, own, showLyrics)}</div>`;
}
// очередь: что играет, что дальше, что уже звучало
function fpQueue() {
  const q = player.queue, item = i => { const x = q[i]; return `<div class="fq-row"><button class="fq-item ${i === player.i ? 'on' : ''}" data-act="fqplay" data-i="${i}">
      ${safeImg(x.cover) ? `<img src="${esc(x.cover)}" alt="">` : `<span class="fq-noart">${x.radio ? '📻' : '🎵'}</span>`}
      <span class="grow" style="min-width:0"><b>${esc(x.title)}</b><span>${esc(x.artist || (x.radio ? 'Прямой эфир' : 'Неизвестный исполнитель'))}</span></span>
      ${i === player.i && !player.audio.paused ? '<span class="eq"><i></i><i></i><i></i><i></i></span>' : `<span class="tnum small">${x.radio ? '' : fmtDur(x.duration)}</span>`}</button>
      ${i === player.i ? '' : `<button class="icon-btn fq-rm" data-act="fqrm" data-i="${i}" aria-label="Убрать из очереди" title="Убрать из очереди">✕</button>`}</div>`; };
  const next = q.map((_, i) => i).slice(player.i + 1), before = q.map((_, i) => i).slice(0, player.i);
  return `<div class="fp-queue"><div class="fq-h">Сейчас играет</div>${item(player.i)}
    <div class="fq-h">Далее${next.length ? ' · ' + next.length : ''}${player.shuffle ? ' · вперемешку' : ''}
      ${next.length > 1 ? '<button class="fq-act" data-act="fqshuffle">Перемешать</button>' : ''}${next.length ? '<button class="fq-act" data-act="fqclear">Очистить</button>' : ''}</div>${next.length ? next.map(item).join('') : '<p class="fq-empty">Это последний трек в списке</p>'}
    ${before.length ? `<div class="fq-h">Уже звучали</div>${before.map(item).join('')}` : ''}</div>`;
}
// нижние «шторки» плеера: ещё, скорость, таймер сна
const RATES = [[0.5, '0.5×'], [0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']];
function fpSheet(t, own, showLyrics) {
  const v = S.fpSheet; if (!v) return '';
  const row = (act, icon, label, sub = '', extra = '') => `<button class="fs-row" data-act="${act}" ${extra}><span class="fs-ico">${icon}</span><span class="grow"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span></button>`;
  const rateTxt = player.rate === 1 && player.pitch ? 'обычная' : player.rate + '×' + (player.pitch ? '' : ', без сохранения тона');
  const sleepTxt = player.sleep ? (player.sleep.end ? 'до конца трека' : 'осталось ' + fmtDur((player.sleep.at - Date.now()) / 1000)) : 'выключен';
  let body = '';
  if (v === 'more') body = `<div class="fs-title">${esc(t.title)}<span>${esc(t.artist || '')}</span></div>
      ${t.radio ? '' : row('fpsheet', '⏩', 'Скорость', rateTxt, 'data-v="speed"')}
      ${t.radio ? '' : row('fpsheet', '🎛', 'Эквалайзер и басы', eqTxt(), 'data-v="eq"')}
      ${t.radio ? '' : row('fpsheet', '🌊', 'Плавные переходы', xfadeSec() ? `затухание ${xfadeSec()} с` : 'выключены', 'data-v="xfade"')}
      ${t.radio ? '' : `<button class="fs-row" data-act="autoplaytoggle"><span class="fs-ico">✦</span><span class="grow"><b>Автопродолжение</b><span>${autoplayOn() ? 'когда очередь кончится, заиграет Микс дня' : 'выключено — музыка остановится'}</span></span><span class="fs-sw ${autoplayOn() ? 'on' : ''}"></span></button>`}
      ${t.radio ? '' : row('toff', isOff(t) ? '✓' : '📥', isOff(t) ? 'Сохранён офлайн' : 'Сохранить офлайн', isOff(t) ? 'нажмите, чтобы убрать' : 'будет играть без интернета', 'data-id="cur"')}
      ${t.radio ? '' : `<button class="fs-row" data-act="normtoggle"><span class="fs-ico">📏</span><span class="grow"><b>Ровная громкость</b><span>${normOn() ? 'громкие треки звучат тише, все — ровно' : 'выключено'}</span></span><span class="fs-sw ${normOn() ? 'on' : ''}"></span></button>`}
      ${t.radio ? '' : row('tdl', '⬇', 'Скачать трек', 'файл mp3 на устройство', 'data-id="cur"')}
      ${t.radio ? '' : row('tlink', '🔗', 'Ссылка на трек', 'откроется и заиграет у друга', 'data-id="cur"')}
      ${t.radio || !t.artist ? '' : `<a class="fs-row" href="#music/a_${encodeURIComponent(t.artist)}" data-act="fpclose"><span class="fs-ico">🎤</span><span class="grow"><b>Все треки исполнителя</b><span>${esc(t.artist)}</span></span></a>`}
      ${row('fpsheet', '🌙', 'Таймер сна', sleepTxt, 'data-v="sleep"')}
      <label class="fs-vol"><span class="fs-ico">🔊</span><input id="fpVol" type="range" min="0" max="100" value="${Math.round(player.vol * 100)}" aria-label="Громкость"></label>
      ${showLyrics ? row('lyrpick', 'Aa', 'Вид текста', LYR_STYLES[lyrStyle()]) : ''}
      ${own ? row('tedit', '✏️', 'Изменить трек', 'название, исполнитель, обложка', 'data-id="cur"') : ''}
      ${t.radio ? '' : row('copy', I.link, 'Скопировать название', '', `data-text="${esc(t.title + (t.artist ? ' — ' + t.artist : ''))}"`)}
      <p class="fs-keys">Клавиши: пробел — пауза, ← → — перемотка на 5 с, ↑ ↓ — громкость, M — без звука</p>`;
  if (v === 'speed') body = `<div class="fs-title">Скорость<span>${rateTxt}</span></div>
      <div class="fs-grid">${RATES.map(([r, l]) => `<button class="fs-pill ${player.rate === r ? 'on' : ''}" data-act="fprate" data-v="${r}">${l}</button>`).join('')}</div>
      <div class="fs-grid fs-two"><button class="fs-pill ${player.rate === 0.85 && !player.pitch ? 'on' : ''}" data-act="fpfx" data-v="slowed">🐢 Slowed</button>
        <button class="fs-pill ${player.rate === 1.25 && !player.pitch ? 'on' : ''}" data-act="fpfx" data-v="speedup">⚡ Speed up</button></div>
      <button class="fs-row" data-act="fppitch"><span class="fs-ico">🎚</span><span class="grow"><b>Сохранять тон голоса</b><span>${player.pitch ? 'включено — голос не меняется' : 'выключено — как на пластинке'}</span></span><span class="fs-sw ${player.pitch ? 'on' : ''}"></span></button>`;
  if (v === 'eq') { const e = player.eq;
    body = `<div class="fs-title">Эквалайзер<span id="eqState">${t.radio ? 'Для радио не работает — только для треков' : eqTxt()}</span></div>
      <button class="fs-row" data-act="eqon"><span class="fs-ico">🎛</span><span class="grow"><b>Эквалайзер</b><span>${e.on ? 'включён' : 'выключен'}</span></span><span class="fs-sw ${e.on ? 'on' : ''}"></span></button>
      <div class="eq-wrap ${e.on ? '' : 'off'}">
        <label class="eq-bass"><span class="fs-ico">🔊</span><span class="grow"><b>Усиление басов <output id="eqBassV">+${e.bass} дБ</output></b>
          <input id="eqBass" type="range" min="0" max="12" step="1" value="${e.bass}" aria-label="Усиление басов"></span></label>
        <div class="eq-pre">${Object.entries(EQ_PRESETS).map(([k, [l]]) => `<button class="fs-pill ${e.preset === k ? 'on' : ''}" data-act="eqpreset" data-v="${k}">${l}</button>`).join('')}</div>
        <div id="eqCurve" class="eq-graph">${eqCurve()}</div>
        <div class="eq-bands">${EQ_F.map((f, i) => `<label class="eq-band"><output>${dbTxt(e.bands[i])}</output><input type="range" class="eq-sl" data-i="${i}" min="-12" max="12" step="1" value="${e.bands[i]}" aria-label="${fLabel(f)} Гц"><span>${fLabel(f)}</span></label>`).join('')}</div>
        <button class="fs-pill wide" data-act="eqreset">Сбросить</button>
      </div>
      <p class="fs-keys">Если на телефоне музыка с эквалайзером замолкает при выключенном экране — выключи эквалайзер</p>`; }
  if (v === 'xfade') body = `<div class="fs-title">Плавные переходы<span>${xfadeSec() ? 'Конец трека затихает за ' + xfadeSec() + ' с, следующий плавно нарастает' : 'Выключены — треки идут как есть'}</span></div>
      <div class="fs-grid">${[0, 2, 4, 6, 8, 12].map(x => `<button class="fs-pill ${xfadeSec() === x ? 'on' : ''}" data-act="xfadeset" data-v="${x}">${x ? x + ' с' : 'Выкл'}</button>`).join('')}</div>
      <p class="fs-keys">Следующий трек загружается заранее, чтобы между песнями не было тишины</p>`;
  if (v === 'sleep') body = `<div class="fs-title">Таймер сна<span>${sleepTxt}</span></div>
      <div class="fs-grid">${[5, 15, 30, 45, 60, 90].map(m => `<button class="fs-pill" data-act="fpsleep" data-v="${m}">${m} мин</button>`).join('')}</div>
      ${t.radio ? '' : `<button class="fs-pill wide" data-act="fpsleep" data-v="end">До конца трека</button>`}
      ${player.sleep ? `<button class="fs-pill wide off" data-act="fpsleep" data-v="off">Выключить таймер</button>` : ''}
      <p class="fs-keys">За 10 секунд до конца музыка плавно затихнет</p>`;
  return `<div class="fp-sheet" data-act="fpsheet" data-v=""><div class="fs-box" data-stop="1"><span class="fs-grab"></span>${body}</div></div>`;
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
  const pal = coverPalette(t), saved = !t.radio && ((S.me.tracks || []).includes(t.id) || t.ownerId === uid());
  return `<div class="mbar mbar3 ${a.paused ? '' : 'playing'}" role="region" aria-label="Плеер" style="--c1:${pal.c1};--c2:${pal.c2}"><div class="mbar-fill" id="mbarFill" style="width:${pct}%"></div>
    <button class="grow mbar-info" data-act="fpopen" aria-label="Открыть плеер"><span class="mbar-art">${safeImg(t.cover) ? `<img class="mbar-cover" src="${esc(t.cover)}" alt="">` : `<span class="mbar-noart">${t.radio ? '📻' : '🎵'}</span>`}</span><span class="mbar-txt"><b>${esc(t.title)}</b><span class="muted small">${esc(t.artist || (t.radio ? 'Прямой эфир' : 'Неизвестный исполнитель'))}</span></span></button>
    <span class="small muted tnum" id="mbarTime">${t.radio ? '● Прямой эфир' : fmtDur(a.currentTime) + ' / ' + fmtDur(a.duration || t.duration)}</span>
    ${t.radio || t.ownerId === uid() ? '' : `<button class="icon-btn mbar-like ${saved ? 'on' : ''}" data-act="fplike" aria-label="${saved ? 'В моей музыке' : 'В мои треки'}">${saved ? I.heart : I.heartO}</button>`}
    <button class="icon-btn mbar-prev" data-act="mprev" aria-label="Предыдущий">${I.prev}</button>
    <button class="mbar-play" data-act="mplay" aria-label="${a.paused ? 'Играть' : 'Пауза'}">${player.loading ? '<span class="spin sm"></span>' : a.paused ? I.play : I.pause}</button>
    <button class="icon-btn" data-act="mnext" aria-label="Следующий">${I.next}</button>
    <button class="icon-btn mbar-x" data-act="mclose" aria-label="Закрыть плеер">✕</button></div>`;
}
/* ---------- ВС Музыка 6.3: Поток, Мои треки, Мои загрузки, свои плейлисты ----------
   S.musicTab: home | stream | liked | uploads | pl_<id> | <uid> (загрузки человека). Данные — в cache.mus. */
const STREAM_PAGE = 50;
const trackCache = new Map();   // id → трек: чтобы не читать один и тот же документ дважды
const sortNew = l => l.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
const findTrack = id => id === 'cur' ? curTrack() : trackCache.get(id) || topTracks(400).find(t => t.id === id) || recentTracks().find(t => t.id === id);
const keepTracks = l => { l.forEach(t => trackCache.set(t.id, t)); return l; };
async function tracksById(ids) {
  const miss = [...new Set(ids)].filter(id => !trackCache.has(id)).slice(0, 300);
  await Promise.all(miss.map(id => getDoc(doc(db, 'tracks', id)).then(x => { if (x.exists()) trackCache.set(id, data(x)); else trackCache.set(id, null); }).catch(() => { })));
  return ids.map(id => trackCache.get(id)).filter(Boolean);
}
const streamOrder = () => lsGet('vs_stream_order') === 'old' ? 'asc' : 'desc';
// Поток — все треки платформы подряд, страницами по 50 (без рекомендаций: только по дате)
async function loadStream(reset) {
  const M = cache.mus;
  // идёт загрузка: если просят «с начала» — дожидаемся её и начинаем заново, иначе просто ждём (раньше вызов тихо уходил и список оставался пустым)
  while (M.streamBusy) { const was = M.streamBusy; await was.catch(() => { }); if (!reset) return; if (M.streamBusy === was) M.streamBusy = null; }
  if (reset) { M.stream = []; M.streamLast = null; M.streamDone = false; }
  if (M.streamDone) return;
  const job = M.streamBusy = (async () => {
    const parts = [orderBy('createdAt', streamOrder()), limit(STREAM_PAGE)];
    if (M.streamLast) parts.splice(1, 0, startAfter(M.streamLast));
    const snap = await getDocs(query(collection(db, 'tracks'), ...parts));
    M.streamLast = snap.docs[snap.docs.length - 1] || M.streamLast;
    M.stream = M.stream.concat(keepTracks(snap.docs.map(data)).filter(t => !M.stream.some(x => x.id === t.id)));
    if (snap.size < STREAM_PAGE) M.streamDone = true;
    ensureUsers(M.stream.map(t => t.ownerId));
  })();
  try { await job; } finally { if (M.streamBusy === job) M.streamBusy = null; }
}
// когда Поток доигрывает загруженное — подгружаем следующую страницу прямо в очередь
async function extendStream() {
  const M = cache.mus; if (!player.stream || !M || M.streamDone || M.streamBusy) return;
  await loadStream(false);
  if (!player.stream) return;
  const have = new Set(player.queue.map(t => t.id));
  player.queue.push(...M.stream.filter(t => !have.has(t.id)));
  render();
}
async function loadMusic() {
  const tab = S.musicTab, me = uid();
  const M = cache.mus ||= { stream: [], liked: [], uploads: [], pls: [], other: [], pl: null };
  try {
    const jobs = [getDocs(query(collection(db, 'playlists'), where('ownerId', '==', me), limit(100)))
      .then(x => { M.pls = x.docs.map(data).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)); M.plsErr = false; })
      .catch(e => { console.error(e); M.plsErr = true; })];
    if (tab === 'home' || tab === 'stream') jobs.push(loadStream(true));
    if (tab === 'home' || tab === 'uploads') jobs.push(getDocs(query(collection(db, 'tracks'), where('ownerId', '==', me), limit(300))).then(x => { M.uploads = sortNew(keepTracks(x.docs.map(data))); }));
    if (tab === 'home' || tab === 'liked') jobs.push(tracksById((S.me.tracks || []).slice().reverse()).then(l => { M.liked = l; }));
    if (tab.startsWith('pl_')) jobs.push(getDoc(doc(db, 'playlists', tab.slice(3))).then(async x => {
      if (!x.exists()) { M.pl = { id: tab.slice(3), missing: true, list: [] }; return; }
      const p = data(x); ensureUsers([p.ownerId]); M.pl = { ...p, list: await tracksById(p.tracks || []) };
    }));
    if (tab.startsWith('a_')) {   // исполнитель: запрос по одному полю, индекс не нужен
      const name = tabArtist(tab);
      jobs.push(getDocs(query(collection(db, 'tracks'), where('artist', '==', name), limit(300))).then(x => { M.artist = { name, list: sortNew(keepTracks(x.docs.map(data))) }; }));
    }
    if (tab.startsWith('t_')) jobs.push(getDoc(doc(db, 'tracks', tab.slice(2))).then(x => { M.one = x.exists() ? keepTracks([data(x)]) : []; M.oneId = tab.slice(2); }));
    if (tab === 'stats') jobs.push(tracksById(topTracks(50).map(t => t.id)).catch(() => []));
    if (tab === 'mix') jobs.push(loadStream(true), tracksById((S.me.tracks || []).slice().reverse()).then(l => { M.liked = l; }));
    if (tab === 'friends' || tab === 'home' || tab === 'mix') jobs.push(loadFriendsChart().then(l => { M.fchart = l; }).catch(e => { console.error(e); M.fchart = []; }));
    if (!['home', 'stream', 'liked', 'uploads', 'stats', 'mix', 'friends', 'offline'].includes(tab) && !/^(pl|a|t)_/.test(tab)) {
      ensureUsers([tab]);
      jobs.push(getDocs(query(collection(db, 'tracks'), where('ownerId', '==', tab), limit(300))).then(x => { M.other = sortNew(keepTracks(x.docs.map(data))); }));
    }
    await Promise.all(jobs);
    if (tab === 'home' || tab === 'mix') M.mix = buildMix();
    if (S.view !== 'music' || S.musicTab !== tab) return;
    [M.liked, M.uploads, M.other, M.pl?.list || []].forEach(l => ensureUsers(l.map(t => t.ownerId)));
  } catch (e) { console.error(e); S.viewError = e; }
  S.loading = false; render();
}
// список по ключу (для кнопок «играть»): stream | liked | uploads | pl | other | artist | one | top | search | recent
function musicList(key) {
  const M = cache.mus || {};
  if (key === 'stream') return M.stream || [];
  if (key === 'liked') return sortTracks(M.liked || []);
  if (key === 'uploads') return sortTracks(M.uploads || []);
  if (key === 'pl') return sortTracks(M.pl?.list || []);
  if (key === 'other') return sortTracks(M.other || []);
  if (key === 'artist') return sortTracks(M.artist?.list || []);
  if (key === 'one') return M.one || [];
  if (key === 'top') return topTracks(50);
  if (key === 'mix') return M.mix || [];
  if (key === 'fchart') return M.fchart || [];
  if (key === 'offline') return offTracks();
  if (key === 'search') return musicSearch();
  if (key === 'recent') return recentTracks();
  return [];
}
const LIST_LABEL = { mix: 'Микс дня', fchart: 'Популярное у друзей', offline: 'Офлайн', stream: 'Поток', liked: 'Мои треки', uploads: 'Мои загрузки', search: 'Поиск', recent: 'Недавно играло', top: 'Чаще всего слушаю', one: 'Трек по ссылке' };
const tabArtist = tab => { try { return decodeURIComponent(tab.slice(2)); } catch (e) { return tab.slice(2); } };
// сортировка списков (кроме Потока): как добавлены, по названию, исполнителю, длине — localStorage vs_msort
const MSORTS = { added: 'Как добавлены', title: 'По названию', artist: 'По исполнителю', dur: 'По длительности', plays: 'Чаще слушаю' };
const msort = () => MSORTS[lsGet('vs_msort')] ? lsGet('vs_msort') : 'added';
function sortTracks(list) {
  const k = msort(); if (k === 'added') return list;
  const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'ru', { sensitivity: 'base' });
  const pl = k === 'plays' ? playStats() : null;
  return list.slice().sort(k === 'title' ? (a, b) => cmp(a.title, b.title) : k === 'artist' ? (a, b) => cmp(a.artist, b.artist) || cmp(a.title, b.title)
    : k === 'dur' ? (a, b) => (a.duration || 0) - (b.duration || 0) : (a, b) => (pl[b.id]?.n || 0) - (pl[a.id]?.n || 0));
}
function musicPlay(key, i, shuffle = false) {
  const list = musicList(key); if (!list.length) return;
  if (shuffle) { player.shuffle = true; lsSet('vs_shuffle', '1'); i = Math.floor(Math.random() * list.length); }
  const label = key === 'pl' ? (cache.mus.pl?.title || 'Плейлист') : key === 'other' ? 'Музыка: ' + (U(S.musicTab)?.name || '') : key === 'artist' ? cache.mus.artist?.name || 'Исполнитель' : LIST_LABEL[key] || '';
  playList(list, i, label);
  player.stream = key === 'stream';
}
// поиск: по всему, что уже загружено (Поток догружается целиком, пока человек ищет)
function musicSearch() {
  const q = norm(S.musicQ).trim(); if (q.length < 2) return [];
  const M = cache.mus || {}, seen = new Set();
  return [...(M.stream || []), ...(M.uploads || []), ...(M.liked || [])].filter(t => !seen.has(t.id) && seen.add(t.id) && norm(t.title + ' ' + (t.artist || '')).includes(q)).slice(0, 100);
}
// «Недавно играло» — на этом устройстве, без обложек (они тяжёлые)
function recentTracks() { try { return JSON.parse(lsGet('vs_recent') || '[]'); } catch (e) { return []; } }
function pushRecent(t) {
  if (!t || t.radio) return;
  const slim = { id: t.id, title: t.title, artist: t.artist || '', fileId: t.fileId, type: t.type || '', duration: t.duration || 0, ownerId: t.ownerId };
  lsSet('vs_recent', JSON.stringify([slim, ...recentTracks().filter(x => x.id !== t.id)].slice(0, 20)));
}
const plSum = l => l.reduce((a, t) => a + (Number(t.duration) || 0), 0);
const durWords = sec => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
async function savePlaylist(id, fields) {
  if (id) await updateDoc(doc(db, 'playlists', id), { ...fields, updatedAt: serverTimestamp() });
  else return (await addDoc(collection(db, 'playlists'), { ownerId: uid(), title: '', tracks: [], color: '', ...fields, updatedAt: serverTimestamp() })).id;
}
async function plToggleTrack(plId, trackId) {
  const p = (cache.mus?.pls || []).find(x => x.id === plId); if (!p) return;
  const has = (p.tracks || []).includes(trackId);
  if (!has && (p.tracks || []).length >= 500) { toast('В плейлисте уже 500 треков'); return; }
  await updateDoc(doc(db, 'playlists', plId), { tracks: has ? arrayRemove(trackId) : arrayUnion(trackId), updatedAt: serverTimestamp() });
  p.tracks = has ? p.tracks.filter(x => x !== trackId) : [...(p.tracks || []), trackId];
  if (cache.mus.pl?.id === plId) { cache.mus.pl.tracks = p.tracks; cache.mus.pl.list = await tracksById(p.tracks); }
  toast(has ? `Убрано из «${p.title}»` : `Добавлено в «${p.title}»`); render();
}
const PL_COLORS = ['#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#0891B2', '#2563EB', '#4B5563'];

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
    for (const x of [curTrack(), ...(cache.tracks || []), trackCache.get(tf.id), ...Object.values(cache.mus || {}).filter(Array.isArray).flat(), ...(cache.mus?.pl?.list || [])]) if (x?.id === tf.id) Object.assign(x, patch);
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
const eqBars = '<span class="eq-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
const trackCover = (t, cls = '') => `<span class="tcv ${cls}">${safeImg(t.cover) ? `<img src="${esc(t.cover)}" alt="" loading="lazy">` : `<span class="tcv-ph">${I.music}</span>`}</span>`;
function trackRow(t, i, key, num = false) {
  const me = S.me, cur = curTrack(), on = cur?.id === t.id, playing = on && !player.audio.paused, mine = t.ownerId === me.id, saved = (me.tracks || []).includes(t.id);
  const mk = key + ':' + t.id, owner = U(t.ownerId), inMyPl = key === 'pl' && cache.mus?.pl?.ownerId === me.id;
  return `<div class="trow ${on ? 'cur' : ''} ${playing ? 'playing' : ''}">
    <button class="trow-main" data-act="mplay2" data-list="${key}" data-i="${i}" aria-label="${playing ? 'Пауза' : 'Играть'}: ${esc(t.title)}">
      ${num ? `<span class="trow-n tnum">${on ? (playing ? eqBars : I.pause) : i + 1}</span>` : ''}
      <span class="trow-cv">${trackCover(t)}<span class="trow-pl">${playing ? I.pause : I.play}</span></span>
      <span class="trow-t"><b>${esc(t.title)}</b><span>${esc(t.artist || 'Неизвестный исполнитель')}${!mine && owner && key !== 'other' ? ' · ' + esc(owner.name) : ''}</span></span>
    </button>
    ${isOff(t) ? '<span class="trow-off" title="Сохранён офлайн">📥</span>' : ''}
    <span class="trow-d tnum">${key === 'fchart' && t.fans ? `<span class="trow-plays" title="У скольких друзей">${t.fans} 👥</span>` : key === 'top' && t.plays ? `<span class="trow-plays" title="Прослушиваний">${t.plays} ▶</span>` : t.duration ? fmtDur(t.duration) : ''}</span>
    ${mine ? '' : `<button class="icon-btn trow-like ${saved ? 'on' : ''}" data-act="tsave" data-id="${esc(t.id)}" aria-label="${saved ? 'Убрать из моих треков' : 'В мои треки'}" title="${saved ? 'Убрать из моих треков' : 'В мои треки'}">${saved ? '♥' : '♡'}</button>`}
    <button class="icon-btn trow-more" data-act="tmenu" data-id="${esc(t.id)}" data-list="${key}" data-i="${i}" aria-label="Ещё" aria-expanded="${S.tmenu === mk}">${I.more}</button>
    ${S.tmenu === mk ? `<div class="tmenu" role="menu">
      <button data-act="tnext" data-id="${esc(t.id)}" data-list="${key}" data-i="${i}">⏭ Играть следующим</button>
      <button data-act="tpl" data-id="${esc(t.id)}">＋ Добавить в плейлист…</button>
      ${inMyPl ? `<button data-act="plrm" data-id="${esc(t.id)}">✕ Убрать из плейлиста</button>` : ''}
      ${t.artist && key !== 'artist' ? `<a href="#music/a_${encodeURIComponent(t.artist)}">🎤 Исполнитель: ${esc(t.artist)}</a>` : ''}
      ${!mine && owner ? `<a href="#music/${esc(t.ownerId)}">👤 Все загрузки: ${esc(owner.name)}</a>` : ''}
      <button data-act="tlink" data-id="${esc(t.id)}">🔗 Скопировать ссылку</button>
      <button data-act="tshare" data-id="${esc(t.id)}">📣 Поделиться на стене</button>
      <button data-act="toff" data-id="${esc(t.id)}">${isOff(t) ? '✕ Убрать из офлайна' : '📥 Сохранить офлайн'}</button>
      ${inMyPl && msort() === 'added' ? `${i > 0 ? `<button data-act="plmove" data-id="${esc(t.id)}" data-d="-1">⬆ Выше</button>` : ''}${i < musicList('pl').length - 1 ? `<button data-act="plmove" data-id="${esc(t.id)}" data-d="1">⬇ Ниже</button>` : ''}` : ''}
      <button data-act="tdl" data-id="${esc(t.id)}">⬇ Скачать</button>
      ${mine ? `<button data-act="tedit" data-id="${esc(t.id)}">✏️ Название, обложка</button>` : ''}
      ${mine || isSiteAdmin() ? `<button class="danger" data-act="tdel" data-id="${esc(t.id)}">${S.confirm === 'track:' + t.id ? '🗑 Точно удалить?' : '🗑 Удалить трек'}</button>` : ''}
    </div>` : ''}
  </div>`;
}
// обложка списка: до 4 обложек треков коллажем, иначе значок на цвете плейлиста
function listArt(list, icon, color) {
  const cv = list.map(t => t.cover).filter(safeImg).slice(0, 4);
  return `<span class="mus-art" style="--plc:${/^#[0-9a-f]{6}$/i.test(color || '') ? color : 'var(--accent)'}">${cv.length >= 4
    ? cv.map(c => `<img src="${esc(c)}" alt="">`).join('') : cv.length ? `<img class="one" src="${esc(cv[0])}" alt="">` : `<span class="mus-art-ico">${icon}</span>`}</span>`;
}
function viewMusic() {
  const tab = S.musicTab, me = S.me, M = cache.mus || {};
  if (S.loading && !M.stream?.length && tab === 'home') return loadingBox();
  if (tab === 'home') return musicHome();
  if (tab === 'stats') return musicStats();
  if (tab === 'mix' && S.loading && !M.mix) return loadingBox();
  // страница списка: Поток, Мои треки, Мои загрузки, плейлист, загрузки человека
  let key, title, kicker, icon, color = '', list, sub = '', own = false;
  if (tab === 'stream') { key = 'stream'; title = 'Поток'; kicker = 'Вся музыка VСмске подряд'; icon = '∞'; list = M.stream || []; sub = 'Без рекомендаций — просто все треки по очереди'; }
  else if (tab === 'liked') { key = 'liked'; title = 'Мои треки'; kicker = 'Плейлист'; icon = '♥'; color = '#DB2777'; list = M.liked || []; sub = 'Треки, которые вы добавили себе'; }
  else if (tab === 'uploads') { key = 'uploads'; title = 'Мои загрузки'; kicker = 'Плейлист'; icon = I.upload; color = '#0891B2'; list = M.uploads || []; sub = 'Всё, что вы загрузили'; }
  else if (tab.startsWith('pl_')) {
    const p = M.pl; if (!p || p.id !== tab.slice(3)) return loadingBox();
    if (p.missing) return `<div class="card empty"><b>Плейлист удалён</b><a class="btn sec" href="#music">В музыку</a></div>`;
    key = 'pl'; title = p.title; kicker = 'Плейлист'; icon = I.music; color = p.color; list = p.list; own = p.ownerId === me.id;
    sub = own ? 'Ваш плейлист' : 'Плейлист ' + esc(U(p.ownerId)?.name || '');
  } else if (tab === 'mix') { key = 'mix'; title = 'Микс дня'; kicker = 'Собран для тебя'; icon = '✦'; color = '#DB2777'; list = M.mix || []; sub = 'Твои треки, любимое и любимые исполнители — новый микс каждый день';
  } else if (tab === 'friends') { key = 'fchart'; title = 'Популярное у друзей'; kicker = 'Чарт'; icon = '🔥'; color = '#EA580C'; list = M.fchart || []; sub = 'Что чаще всего добавляют себе твои друзья';
  } else if (tab === 'offline') { key = 'offline'; title = 'Офлайн'; kicker = 'На этом устройстве'; icon = '📥'; color = '#16A34A'; list = offTracks(); sub = 'Играют без интернета';
  } else if (tab.startsWith('a_')) {
    const A = M.artist; if (!A || A.name !== tabArtist(tab)) return loadingBox();
    key = 'artist'; title = A.name; kicker = 'Исполнитель'; icon = '🎤'; color = '#EA580C'; list = A.list; sub = 'Все треки исполнителя на VСмске';
  } else if (tab.startsWith('t_')) {
    if (M.oneId !== tab.slice(2)) return loadingBox();
    if (!M.one?.length) return `<div class="card empty"><b>Трек удалён или ссылка неверная</b><a class="btn sec" href="#music">В музыку</a></div>`;
    const t = M.one[0]; key = 'one'; title = t.title; kicker = 'Трек по ссылке'; icon = I.music; list = M.one; sub = esc(t.artist || 'Неизвестный исполнитель');
  } else { key = 'other'; const u = U(tab); title = u ? u.name : 'Музыка'; kicker = 'Загрузки'; icon = I.music; list = M.other || []; sub = 'Треки, которые загрузил(а) ' + esc(u?.name || 'человек'); }
  if (['liked', 'uploads', 'pl', 'other', 'artist'].includes(key)) list = musicList(key);   // тот же порядок, что у кнопок «играть»
  const n = list.length, curKey = player.stream ? 'stream' : null, playingThis = curTrack() && list.some(t => t.id === curTrack().id) && !player.audio.paused && (key !== 'stream' || curKey);
  return `<section class="card mus-head" style="--plc:${/^#[0-9a-f]{6}$/i.test(color || '') ? color : 'var(--accent)'}">
    <a class="icon-btn mus-back" href="#music" aria-label="В музыку">${I.back}</a>
    ${key === 'stream' ? `<span class="mus-art mus-art-stream"><span class="mus-art-ico">∞</span></span>` : listArt(list, icon, color)}
    <div class="mus-head-t"><span class="mus-kicker">${kicker}</span><h1 class="mus-title">${esc(title)}</h1>
      <div class="muted small">${sub}${n ? ` · ${n}${key === 'stream' && !M.streamDone ? '+' : ''} ${plural(n, 'трек', 'трека', 'треков')} · ${durWords(plSum(list))}` : ''}</div>
      <div class="mus-acts">
        <button class="mus-play" data-act="mlistplay" data-list="${key}" ${n ? '' : 'disabled'}>${playingThis ? I.pause : I.play}<span>${playingThis ? 'Пауза' : 'Слушать'}</span></button>
        <button class="btn sec" data-act="mlistplay" data-list="${key}" data-shuffle="1" ${n ? '' : 'disabled'}>${I.shuffle}<span>Перемешать</span></button>
        ${key === 'stream' ? `<button class="btn ghost" data-act="mstreamorder">${streamOrder() === 'desc' ? 'Сначала новые' : 'Сначала старые'} ⇅</button>` : ''}
        ${['liked', 'uploads', 'pl', 'other', 'artist'].includes(key) && n > 1 ? `<select id="mSort" class="inp mus-sort" aria-label="Сортировка">${Object.entries(MSORTS).map(([k, l]) => `<option value="${k}" ${msort() === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        ${n && !['offline', 'stream'].includes(key) ? `<button class="btn ghost" data-act="offall" data-list="${key}" ${OFF.busy ? 'disabled' : ''}>${OFF.busy ? `📥 ${OFF.busy.done}/${OFF.busy.n}` : list.every(isOff) ? '✓ Офлайн' : '📥 Скачать офлайн'}</button>` : ''}
        ${key === 'pl' && !own && M.pl ? `<button class="btn ghost" data-act="plcopy" data-id="${esc(M.pl.id)}">＋ Сохранить себе</button>` : ''}
        ${key === 'one' && list[0].artist ? `<a class="btn ghost" href="#music/a_${encodeURIComponent(list[0].artist)}">🎤 ${esc(list[0].artist)}</a>` : ''}
        ${key === 'uploads' && !banOf(me) ? `<button class="btn ghost" data-act="pickmusic" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить</span></button>` : ''}
        ${key === 'pl' ? `<button class="icon-btn" data-act="plshare" data-id="${esc(M.pl.id)}" aria-label="Скопировать ссылку" title="Скопировать ссылку">${I.link}</button>` : ''}
        ${own ? `<button class="icon-btn" data-act="pledit" data-id="${esc(M.pl.id)}" aria-label="Переименовать" title="Название и цвет">✏️</button>
          <button class="icon-btn" data-act="pldel" data-id="${esc(M.pl.id)}" aria-label="Удалить плейлист">${S.confirm === 'pl:' + M.pl.id ? 'Удалить?' : '🗑'}</button>` : ''}
      </div></div></section>
    <div class="card mus-list">${S.loading ? '<div class="loading"><div class="spin"></div></div>' : n ? list.map((t, i) => trackRow(t, i, key, true)).join('')
      : `<div class="empty"><b>${key === 'offline' ? 'Офлайн пока пусто' : key === 'fchart' ? 'Друзья пока ничего не добавили' : key === 'liked' ? 'Пока пусто' : key === 'uploads' ? 'Вы ещё ничего не загрузили' : key === 'pl' ? 'В плейлисте пока нет треков' : 'Треков пока нет'}</b>
        <span>${key === 'offline' ? 'Нажмите «⋯» → «Сохранить офлайн» или «Скачать офлайн» у плейлиста' : key === 'liked' ? 'Нажмите ♡ у любого трека в Потоке' : key === 'pl' ? 'Добавляйте треки через «⋯» → «Добавить в плейлист»' : ''}</span></div>`}
      ${key === 'stream' && !M.streamDone && n ? `<button class="btn sec mus-more" data-act="mstreammore" ${M.streamBusy ? 'disabled' : ''}>Показать ещё</button>` : ''}</div>`;
}
/* ---------- 6.6 «Музыка 2.0»: офлайн, Микс дня, популярное у друзей, треки в записях, пакетная загрузка ---------- */
// Офлайн: файлы треков целиком в IndexedDB этого устройства — store blobs {id: fileId, blob} и meta {id: fileId, track, at}
const OFF = { db: null, meta: new Map(), busy: null };
function offDb() {
  return OFF.db ||= new Promise((res, rej) => {
    const r = indexedDB.open('vs-offline', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('blobs', { keyPath: 'id' }); r.result.createObjectStore('meta', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function offReq(store, mode, fn) {
  const d = await offDb();
  return new Promise((res, rej) => { const tx = d.transaction(store, mode), q = fn(tx.objectStore(store)); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
try { offReq('meta', 'readonly', s => s.getAll()).then(l => { (l || []).forEach(x => OFF.meta.set(x.id, x)); if (S.view === 'music') render(); }).catch(() => { }); } catch (e) { }
const isOff = t => !!t && !t.radio && OFF.meta.has(t.fileId);
async function offBlobUrl(fid) {
  if (!OFF.meta.has(fid)) return null;
  try { const r = await offReq('blobs', 'readonly', s => s.get(fid)); return r?.blob ? URL.createObjectURL(r.blob) : null; } catch (e) { return null; }
}
async function offSave(t) {
  if (!t || t.radio || isOff(t)) return;
  const blob = await (await fetch(await getFileUrl(t.fileId, t.type || 'audio/mpeg'))).blob();
  const track = { id: t.id, title: t.title, artist: t.artist || '', fileId: t.fileId, type: t.type || '', duration: t.duration || 0, ownerId: t.ownerId, cover: safeImg(t.cover) ? t.cover : '' };
  await offReq('blobs', 'readwrite', s => s.put({ id: t.fileId, blob }));
  await offReq('meta', 'readwrite', s => s.put({ id: t.fileId, track, at: Date.now() }));
  OFF.meta.set(t.fileId, { id: t.fileId, track, at: Date.now() });
  try { navigator.storage?.persist?.(); } catch (e) { }
}
async function offDel(t) {
  if (!t) return;
  await offReq('blobs', 'readwrite', s => s.delete(t.fileId)); await offReq('meta', 'readwrite', s => s.delete(t.fileId));
  OFF.meta.delete(t.fileId);
}
const offTracks = () => [...OFF.meta.values()].sort((a, b) => b.at - a.at).map(x => trackCache.get(x.track.id) || x.track);
async function offSaveAll(list) {
  const todo = list.filter(t => !isOff(t)); if (!todo.length) { toast('Всё уже сохранено офлайн'); return; }
  if (OFF.busy) return; OFF.busy = { done: 0, n: todo.length }; render();
  let ok = 0;
  for (const t of todo) { try { await offSave(t); ok++; } catch (e) { console.error(e); } OFF.busy.done++; render(); }
  OFF.busy = null; toast(`📥 Сохранено офлайн: ${ok} ${plural(ok, 'трек', 'трека', 'треков')}`); render();
}
// Микс дня: твои треки, любимое и всё твоих любимых исполнителей — перемешано одинаково весь день (без чужих алгоритмов)
function seededRng(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function buildMix() {
  const M = cache.mus || {}, seen = new Set(), pool = [];
  const add = l => l.forEach(t => { if (t && t.fileId && !seen.has(t.id)) { seen.add(t.id); pool.push(trackCache.get(t.id) || t); } });
  const arts = new Set(topArtists(8).map(a => a.name.toLowerCase()));
  add(M.liked || []); add(topTracks(30));
  add((M.stream || []).filter(t => arts.has((t.artist || '').toLowerCase())));
  add((S.me.friends || []).map(U).flatMap(u => (u?.tracks || []).slice(-10)).map(id => trackCache.get(id)).filter(Boolean));
  if (pool.length < 20) add((M.stream || []).slice(0, 60));
  const r = seededRng(new Date().toDateString() + uid());
  for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
  return pool.slice(0, 40);
}
// Популярное у друзей: какие треки чаще всего добавлены в «Мои треки» у друзей (данные профилей уже в кэше)
async function loadFriendsChart() {
  const fr = S.me.friends || [];
  await Promise.all(fr.filter(i => !cache.users.has(i)).slice(0, 300).map(i => getDoc(doc(db, 'users', i)).then(x => { if (x.exists()) cache.users.set(i, data(x)); }).catch(() => { })));
  const cnt = new Map();
  fr.map(U).forEach(u => (u?.tracks || []).forEach(id => cnt.set(id, (cnt.get(id) || 0) + 1)));
  const ids = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => x[0]);
  const list = await tracksById(ids);
  return keepTracks(list).map(t => ({ ...t, fans: cnt.get(t.id) || 0 }));
}
// Трек в записи или сообщении: ссылка …#music/t_<id> превращается в карточку с кнопкой «играть»
const embedAsked = new Set();
function trackEmbed(text) {
  const m = /(?:#|\/)music\/t_([A-Za-z0-9]{1,40})/.exec(String(text || '')); if (!m) return '';
  const id = m[1], t = trackCache.get(id);
  if (t === undefined) { if (!embedAsked.has(id)) { embedAsked.add(id); tracksById([id]).then(() => render()); } return `<div class="tembed"><span class="spin sm"></span></div>`; }
  if (!t) return '';
  const on = curTrack()?.id === t.id && !player.audio.paused;
  return `<div class="tembed ${on ? 'on' : ''}"><button class="tembed-play" data-act="tplayid" data-id="${esc(t.id)}" aria-label="${on ? 'Пауза' : 'Играть'}: ${esc(t.title)}">${trackCover(t)}<span class="tembed-ic">${on ? I.pause : I.play}</span></button>
    <a class="tembed-t" href="#music/t_${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(t.artist || 'Неизвестный исполнитель')}${t.duration ? ' · ' + fmtDur(t.duration) : ''}</span></a>
    ${t.ownerId !== uid() ? `<button class="icon-btn trow-like ${(S.me.tracks || []).includes(t.id) ? 'on' : ''}" data-act="tsave" data-id="${esc(t.id)}" aria-label="В мои треки">${(S.me.tracks || []).includes(t.id) ? '♥' : '♡'}</button>` : ''}</div>`;
}
// Несколько треков сразу: без окна правки — название, исполнитель и обложка из тегов или имени файла
async function uploadTracksBatch(files) {
  const ok = files.filter(f => ((f.type || '').startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(f.name)) && f.size <= LIMITS.music);
  if (ok.length < files.length) toast(`Пропущено ${files.length - ok.length}: не аудио или больше ${fmtSize(LIMITS.music)}`);
  let done = 0;
  for (const [k, f] of ok.entries()) {
    try {
      const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(), m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      const [tags, duration] = await Promise.all([readTags(f), trackDuration(f)]);
      const title = (tags.title || (m ? m[2] : base)).slice(0, 120) || 'Без названия', artist = (tags.artist || (m ? m[1] : '')).slice(0, 120);
      const fileId = await putFile(f, 'music', `Загружаем ${k + 1} из ${ok.length}: «${title}»`);
      const ref = await addDoc(collection(db, 'tracks'), { ownerId: uid(), title, artist, fileId, type: f.type || 'audio/mpeg', duration, size: f.size, createdAt: serverTimestamp() });
      if (tags.pic) try { await updateDoc(ref, { cover: await compress(tags.pic, 600, 250000, true) }); } catch (e) { }
      done++;
    } catch (e) { console.error(e); }
  }
  toast(`🎵 Загружено ${done} ${plural(done, 'трек', 'трека', 'треков')}`); if (S.view === 'music') loadMusic();
}
const autoplayOn = () => lsGet('vs_autoplay') !== '0';
// «Моя статистика» — по этому устройству: сколько слушал, любимые треки и исполнители
function musicStats() {
  const top = topTracks(50), arts = topArtists(10), total = (Number(lsGet('vs_listen_total')) || 0) + statSec, plays = Object.values(playStats()).reduce((a, x) => a + (x.n || 0), 0);
  const maxA = arts[0]?.n || 1;
  return `<section class="card mus-head" style="--plc:#16A34A"><a class="icon-btn mus-back" href="#music" aria-label="В музыку">${I.back}</a>
      <span class="mus-art"><span class="mus-art-ico">📊</span></span>
      <div class="mus-head-t"><span class="mus-kicker">ВС Музыка</span><h1 class="mus-title">Моя статистика</h1>
        <div class="muted small">Считается на этом устройстве</div>
        <div class="mus-acts"><button class="mus-play" data-act="mlistplay" data-list="top" ${top.length ? '' : 'disabled'}>${I.play}<span>Слушать любимое</span></button>
          ${plays ? `<button class="btn ghost" data-act="statclear">${S.confirm === 'stats' ? 'Точно стереть?' : 'Стереть статистику'}</button>` : ''}</div></div></section>
    <div class="mus-stat-grid">
      <div class="card mus-stat"><b class="tnum">${total >= 3600 ? Math.floor(total / 3600) + ' ч ' + Math.round(total % 3600 / 60) + ' мин' : Math.round(total / 60) + ' мин'}</b><span>слушал(а) музыку</span></div>
      <div class="card mus-stat"><b class="tnum">${plays}</b><span>${plural(plays, 'прослушивание', 'прослушивания', 'прослушиваний')}</span></div>
      <div class="card mus-stat"><b class="tnum">${Object.keys(playStats()).length}</b><span>разных треков</span></div>
    </div>
    ${arts.length ? `<h2 class="mus-h">Любимые исполнители</h2><div class="card mus-arts">${arts.map((a, i) => `<a class="mus-art-row" href="#music/a_${encodeURIComponent(a.name)}">
      <span class="tnum mus-rank">${i + 1}</span><span class="grow"><b>${esc(a.name)}</b><span class="mus-bar"><i style="width:${Math.max(6, a.n / maxA * 100)}%"></i></span></span>
      <span class="small muted tnum">${a.n} ${plural(a.n, 'раз', 'раза', 'раз')}</span></a>`).join('')}</div>` : ''}
    <h2 class="mus-h">Чаще всего слушаю</h2>
    <div class="card mus-list">${top.length ? top.map((t, i) => trackRow(t, i, 'top', true)).join('') : '<div class="empty"><b>Пока пусто</b><span>Прослушивание засчитывается после 30 секунд</span></div>'}</div>`;
}
// в поиске: исполнители (страница исполнителя) и свои плейлисты
function musicSearchExtra() {
  const q = norm(S.musicQ).trim(), M = cache.mus || {}, arts = new Map();
  [...(M.stream || []), ...(M.uploads || []), ...(M.liked || [])].forEach(t => { const a = (t.artist || '').trim(); if (a && norm(a).includes(q)) arts.set(a, (arts.get(a) || 0) + 1); });
  const pls = (M.pls || []).filter(p => norm(p.title).includes(q));
  const A = [...arts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (A.length ? `<div class="card mus-list"><div class="mus-sec-t">Исполнители</div><div class="mus-chips">${A.map(([a, n]) => `<a class="mus-chip" href="#music/a_${encodeURIComponent(a)}">🎤 ${esc(a)} <span class="muted small">${n}</span></a>`).join('')}</div></div>` : '')
    + (pls.length ? `<div class="card mus-list"><div class="mus-sec-t">Плейлисты</div><div class="mus-chips">${pls.map(p => `<a class="mus-chip" href="#music/pl_${esc(p.id)}">♫ ${esc(p.title)}</a>`).join('')}</div></div>` : '');
}
/* Главная Музыки 3.0 (6.7): приветствие, быстрые плитки, «Поток», полки с прокруткой вбок */
function musicHome() {
  const me = S.me, M = cache.mus || {}, q = S.musicQ || '', cur = curTrack(), paused = player.audio.paused;
  const streamOn = player.stream && cur && !paused;
  const h = new Date().getHours(), hi = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  const nT = n => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;
  const quick = (href, art, title, sub, list) => `<div class="mh-q"><a href="#${href}"><span class="mh-q-art">${art}</span><span class="mh-q-t"><b>${title}</b><span>${sub}</span></span></a>
    ${list ? `<button class="mh-q-play" data-act="mlistplay" data-list="${list}" aria-label="Слушать: ${title}">${I.play}</button>` : ''}</div>`;
  const ico = (c, e) => `<span class="mus-art" style="--plc:${c}"><span class="mus-art-ico">${e}</span></span>`;
  const card = (t, key, i, sub) => { const on = cur?.id === t.id;
    return `<button class="mh-card ${on ? 'cur' : ''}" data-act="mplay2" data-list="${key}" data-i="${i}" aria-label="${on && !paused ? 'Пауза' : 'Играть'}: ${esc(t.title)}">
      <span class="mh-cv">${trackCover(t)}<span class="mh-pl">${on && !paused ? I.pause : I.play}</span>${on && !paused ? `<span class="mh-eq">${eqBars}</span>` : ''}</span>
      <b>${esc(t.title)}</b><span>${sub ?? esc(t.artist || 'Неизвестный исполнитель')}</span></button>`; };
  const shelf = (title, more, items) => items ? `<section class="mh-shelf"><div class="mh-h"><h2>${title}</h2>${more ? `<a href="#${more}">Все</a>` : ''}</div><div class="mh-row">${items}</div></section>` : '';
  const friends = (me.friends || []).map(U).filter(u => u && listeningOf(u)).slice(0, 12);
  const recent = recentTracks().slice(0, 12), fresh = (M.stream || []).slice(0, 14), fchart = (M.fchart || []).slice(0, 14), mix = (M.mix || []).slice(0, 14);
  // исполнители — из загруженного Потока, по числу треков; картинка — обложка любого их трека
  const arts = new Map();
  (M.stream || []).forEach(t => { const a = (t.artist || '').trim(); if (!a) return; const x = arts.get(a) || { name: a, n: 0, cover: '' }; x.n++; if (!x.cover && safeImg(t.cover)) x.cover = t.cover; arts.set(a, x); });
  const artists = [...arts.values()].sort((a, b) => b.n - a.n).slice(0, 14);
  const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<section class="mh-head">
      <div class="grow"><span class="mus-kicker">ВС Музыка</span><h1 class="mh-hi">${hi}, ${esc((me.name || '').split(' ')[0])}</h1></div>
      ${banOf(me) ? '' : `<button class="btn sec mh-up" data-act="pickmusic" ${S.upload ? 'disabled' : ''}>${I.upload}<span>Загрузить</span></button>`}
    </section>
    <div class="card mus-search">${I.search}<input id="musQ" type="search" placeholder="Трек, исполнитель или плейлист" autocomplete="off" value="${esc(q)}"></div>
    ${q.trim().length >= 2 ? `${musicSearchExtra()}<div class="card mus-list"><div class="mus-sec-t">Треки${!M.streamDone ? ' <span class="spin sm"></span>' : ''}</div>
      ${musicSearch().map((t, i) => trackRow(t, i, 'search')).join('') || '<div class="empty small">Ничего не нашлось</div>'}</div>` : `
    <div class="mh-quick">
      ${quick('music/liked', listArt(M.liked || [], '♥', '#DB2777'), 'Мои треки', nT((me.tracks || []).length), (M.liked || []).length ? 'liked' : '')}
      ${quick('music/mix', ico('#7C3AED', '✦'), 'Микс дня', mix.length ? nT((M.mix || []).length) : 'собирается…', mix.length ? 'mix' : '')}
      ${quick('music/offline', ico('#16A34A', '📥'), 'Офлайн', nT(OFF.meta.size), OFF.meta.size ? 'offline' : '')}
      ${quick('music/friends', ico('#EA580C', '🔥'), 'Популярное у друзей', fchart.length ? 'топ ' + fchart.length : 'чарт друзей', fchart.length ? 'fchart' : '')}
      ${quick('music/uploads', listArt(M.uploads || [], I.upload, '#0891B2'), 'Мои загрузки', nT((M.uploads || []).length), (M.uploads || []).length ? 'uploads' : '')}
      ${quick('music/stats', ico('#2563EB', '📊'), 'Статистика', `${Object.values(playStats()).reduce((a, x) => a + (x.n || 0), 0)} прослушиваний`, '')}
    </div>
    <section class="mh-stream ${streamOn ? 'on' : ''}">
      <div class="mh-stream-bg" aria-hidden="true">${Array.from({ length: 28 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div>
      <div class="mh-stream-t"><span class="mus-kicker">Поток</span><b>Вся музыка VСмске подряд</b>
        <span>${streamOn ? `Сейчас: ${esc(cur.title)}${cur.artist ? ' — ' + esc(cur.artist) : ''}` : `Без рекомендаций — все треки по очереди, ${streamOrder() === 'desc' ? 'от новых к старым' : 'от старых к новым'}`}</span>
        <a class="mh-stream-all" href="#music/stream">Все треки →</a></div>
      <button class="mh-stream-play" data-act="mstream" aria-label="${streamOn ? 'Пауза' : 'Слушать поток'}">${streamOn ? I.pause : I.play}</button>
    </section>
    ${shelf('Микс дня', 'music/mix', mix.map((t, i) => card(t, 'mix', i)).join(''))}
    ${shelf('Твои плейлисты', '', [
      `<a class="mh-card" href="#music/liked"><span class="mh-cv">${listArt(M.liked || [], '♥', '#DB2777')}</span><b>Мои треки</b><span>${nT((me.tracks || []).length)}</span></a>`,
      ...(M.pls || []).map(p => `<a class="mh-card" href="#music/pl_${esc(p.id)}"><span class="mh-cv">${listArt((p.tracks || []).map(id => trackCache.get(id)).filter(Boolean), I.music, p.color)}</span><b>${esc(p.title)}</b><span>${nT((p.tracks || []).length)}</span></a>`),
      M.plsErr ? '' : `<button class="mh-card mh-new" data-act="plnew"><span class="mh-cv"><span class="mus-art"><span class="mus-art-ico">＋</span></span></span><b>Новый плейлист</b><span>Соберите свой</span></button>`].join(''))}
    ${M.plsErr ? '<div class="card pad small muted">Свои плейлисты заработают, когда владелец сайта обновит правила базы.</div>' : ''}
    ${friends.length ? shelf('Друзья слушают', '', friends.map(u => `<a class="mh-friend" href="#id/${esc(u.id)}">${avatar(u, 64, false)}<b>${esc(u.name.split(' ')[0])}</b><span>🎵 ${esc(listeningOf(u).title)}</span></a>`).join('')) : ''}
    ${shelf('Новое в Потоке', 'music/stream', fresh.map((t, i) => card(t, 'stream', i)).join(''))}
    ${shelf('Популярное у друзей', 'music/friends', fchart.map((t, i) => card(t, 'fchart', i, `${t.fans} ${plural(t.fans, 'друг', 'друга', 'друзей')} добавили`)).join(''))}
    ${shelf('Исполнители', '', artists.map(a => `<a class="mh-artist" href="#music/a_${encodeURIComponent(a.name)}"><span class="mh-av" style="--h:${hue(a.name)}">${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : esc(a.name.slice(0, 1).toUpperCase())}</span><b>${esc(a.name)}</b><span>${nT(a.n)}</span></a>`).join(''))}
    ${shelf('Недавно играло', '', recent.map((t, i) => card(trackCache.get(t.id) || t, 'recent', i)).join(''))}
    ${topTracks(1).length ? `<section class="mh-shelf"><div class="mh-h"><h2>Чаще всего слушаю</h2><a href="#music/stats">Статистика</a></div><div class="card mus-list">${topTracks(5).map((t, i) => trackRow(t, i, 'top', true)).join('')}</div></section>` : ''}
    ${!fresh.length ? '<div class="card empty"><b>Пока никто ничего не загрузил</b><span>Будьте первым — нажмите «Загрузить»</span></div>' : ''}`}`;
}
function playlistModal() {
  if (S.plPick) {
    const pls = cache.mus?.pls || [], id = S.plPick;
    return `<div class="ov" data-act="plclose"><div class="ov-in modal pl-modal" data-stop="1"><div class="row"><b class="grow h">Добавить в плейлист</b><button class="icon-btn" data-act="plclose" aria-label="Закрыть">✕</button></div>
      <div class="pl-pick">${pls.map(p => { const has = (p.tracks || []).includes(id);
        return `<button class="pl-opt ${has ? 'on' : ''}" data-act="pltoggle" data-pl="${esc(p.id)}" data-id="${esc(id)}">${listArt([], I.music, p.color)}<span class="grow"><b>${esc(p.title)}</b><span class="small muted">${(p.tracks || []).length} ${plural((p.tracks || []).length, 'трек', 'трека', 'треков')}</span></span><span class="pl-check">${has ? '✓' : '＋'}</span></button>`; }).join('')
        || '<div class="muted small">Плейлистов пока нет</div>'}</div>
      <button class="btn" data-act="plnew" data-id="${esc(id)}">＋ Новый плейлист</button></div></div>`;
  }
  const f = S.plForm, p = f.id ? (cache.mus?.pls || []).find(x => x.id === f.id) || cache.mus?.pl : null;
  return `<div class="ov" data-act="plclose"><div class="ov-in modal pl-modal" data-stop="1"><b class="h">${f.id ? 'Плейлист' : 'Новый плейлист'}</b>
    <form class="form" data-form="playlist"><div class="field"><label for="plTitle">Название</label><input id="plTitle" required maxlength="60" placeholder="Например, «В дорогу»" value="${esc(p?.title || '')}"></div>
      <div class="field"><label>Цвет</label><div class="swatches">${PL_COLORS.map(c => `<button type="button" class="${f.color === c ? 'on' : ''}" style="background:${c}" data-act="plcolor" data-v="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>
      ${f.track ? '<div class="muted small">Трек сразу попадёт в новый плейлист</div>' : ''}
      <div class="row"><button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>${f.id ? 'Сохранить' : 'Создать'}</button><button type="button" class="btn ghost" data-act="plclose">Отмена</button></div></form></div></div>`;
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

/* ---------- 6.5: ВС Таймер — секундомер, таймер, помодоро. Без базы; цифры обновляются без перерисовки страницы ---------- */
const TM = {
  tab: 'sw',
  sw: { run: false, start: 0, acc: 0, laps: [] },
  cd: { total: 300, left: 300, run: false, end: 0 },
  po: { phase: 'work', run: false, end: 0, left: 1500, done: 0 },
};
const PO_LEN = { work: 1500, short: 300, long: 900 }, PO_NAME = { work: 'Работа', short: 'Короткий перерыв', long: 'Длинный перерыв' };
let beepCtx = null;
function beep(times = 3) {
  try {
    beepCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    beepCtx.resume?.();
    for (let k = 0; k < times; k++) {
      const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t0 = beepCtx.currentTime + k * 0.45;
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(beepCtx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.4);
    }
  } catch (e) { }
  try { navigator.vibrate?.([200, 120, 200, 120, 200]); } catch (e) { }
}
const swMs = () => TM.sw.acc + (TM.sw.run ? Date.now() - TM.sw.start : 0);
const cdLeft = () => TM.cd.run ? Math.max(0, (TM.cd.end - Date.now()) / 1000) : TM.cd.left;
const poLeft = () => TM.po.run ? Math.max(0, (TM.po.end - Date.now()) / 1000) : TM.po.left;
function clock(sec, tenths = false) {
  const s = Math.max(0, sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
  return (h ? h + ':' + pad2(m) : pad2(m)) + ':' + pad2(x) + (tenths ? ',' + Math.floor(s * 10 % 10) : '');
}
function tmNow() {
  if (TM.tab === 'sw') return { txt: clock(swMs() / 1000, true), pct: (swMs() / 1000 % 60) / 60 };
  if (TM.tab === 'cd') { const l = cdLeft(); return { txt: clock(Math.ceil(l)), pct: TM.cd.total ? l / TM.cd.total : 0 }; }
  const l = poLeft(); return { txt: clock(Math.ceil(l)), pct: l / PO_LEN[TM.po.phase] };
}
setInterval(() => {
  if (TM.cd.run && cdLeft() <= 0) { TM.cd.run = false; TM.cd.left = 0; beep(); toast('⏰ Время вышло!'); render(); }
  if (TM.po.run && poLeft() <= 0) {
    const was = TM.po.phase; TM.po.run = false;
    if (was === 'work') { TM.po.done++; TM.po.phase = TM.po.done % 4 ? 'short' : 'long'; } else TM.po.phase = 'work';
    TM.po.left = PO_LEN[TM.po.phase]; beep(2);
    toast(was === 'work' ? '🍅 Помидор готов! Время отдохнуть' : '💪 Перерыв окончен — за работу'); render();
  }
  const big = document.getElementById('tmBig'); if (!big) return;
  const n = tmNow(); big.textContent = n.txt;
  document.getElementById('tmRing')?.style.setProperty('--p', String(Math.max(0, Math.min(1, n.pct))));
}, 100);
function viewTimer() {
  const tab = TM.tab, n = tmNow(), run = tab === 'sw' ? TM.sw.run : tab === 'cd' ? TM.cd.run : TM.po.run;
  const tabs = [['sw', '⏱', 'Секундомер'], ['cd', '⏳', 'Таймер'], ['po', '🍅', 'Помодоро']];
  let below = '', btns = '';
  if (tab === 'sw') {
    btns = `<button class="btn" data-act="tmgo">${run ? 'Пауза' : swMs() ? 'Дальше' : 'Старт'}</button>
      <button class="btn sec" data-act="tmlap" ${run ? '' : 'disabled'}>Круг</button><button class="btn ghost" data-act="tmreset" ${swMs() ? '' : 'disabled'}>Сброс</button>`;
    const L = TM.sw.laps;
    below = L.length ? `<div class="card ulist tm-laps">${L.map((x, i) => `<div class="uitem"><b class="grow">Круг ${L.length - i}</b><span class="tnum muted small">+${clock(x.d / 1000, true)}</span><b class="tnum">${clock(x.t / 1000, true)}</b></div>`).join('')}</div>` : '';
  } else if (tab === 'cd') {
    const idle = !run && TM.cd.left === TM.cd.total;
    btns = `<button class="btn" data-act="tmgo" ${!run && TM.cd.left <= 0 ? 'disabled' : ''}>${run ? 'Пауза' : idle ? 'Старт' : 'Дальше'}</button><button class="btn ghost" data-act="tmreset">Сброс</button>`;
    below = idle ? `<div class="card pad"><div class="tm-pre">${[1, 3, 5, 10, 15, 20, 30, 45, 60].map(m => `<button class="pill ${TM.cd.total === m * 60 ? 'on' : ''}" data-act="tmset" data-v="${m * 60}">${m} мин</button>`).join('')}</div>
      <div class="row" style="margin-top:10px"><input id="tmMin" class="inp" type="number" min="1" max="600" inputmode="numeric" placeholder="Своё время, мин"><button class="btn sec" data-act="tmcustom">Поставить</button></div></div>` : '';
  } else {
    btns = `<button class="btn" data-act="tmgo">${run ? 'Пауза' : poLeft() < PO_LEN[TM.po.phase] ? 'Дальше' : 'Старт'}</button><button class="btn sec" data-act="tmskip">Пропустить</button><button class="btn ghost" data-act="tmreset">Сброс</button>`;
    below = `<div class="card pad small muted">25 минут работы → 5 минут отдыха. После каждого четвёртого «помидора» — отдых 15 минут.<div class="tm-tomatoes">${TM.po.done ? '🍅'.repeat(Math.min(TM.po.done, 24)) + ` · ${TM.po.done} ${plural(TM.po.done, 'помидор', 'помидора', 'помидоров')} сегодня` : 'Пока ни одного помидора'}</div></div>`;
  }
  return `<div class="card pad"><h1 class="h brandh">ВС Таймер</h1><div class="muted small">Таймер работает, даже если уйти в другой раздел</div></div>
    <div class="seg tm-tabs" role="tablist">${tabs.map(([k, e, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="tmtab" data-v="${k}">${e} ${l}</button>`).join('')}</div>
    <div class="card pad tm-main"><div class="tm-ring ${run ? 'run' : ''}" id="tmRing" style="--p:${Math.max(0, Math.min(1, n.pct))}">
      <div class="tm-in">${tab === 'po' ? `<span class="tm-phase">${PO_NAME[TM.po.phase]}</span>` : ''}<b id="tmBig" class="tnum">${n.txt}</b></div></div>
      <div class="row tm-btns">${btns}</div></div>${below}`;
}
function tmAction(act, b) {
  const tab = TM.tab;
  beepCtx ||= (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } })();   // звук разрешается только после нажатия
  if (act === 'tmtab') TM.tab = b.dataset.v;
  else if (act === 'tmgo') {
    if (tab === 'sw') { const w = TM.sw; if (w.run) { w.acc += Date.now() - w.start; w.run = false; } else { w.start = Date.now(); w.run = true; } }
    if (tab === 'cd') { const c = TM.cd; if (c.run) { c.left = cdLeft(); c.run = false; } else if (c.left > 0) { c.end = Date.now() + c.left * 1000; c.run = true; } }
    if (tab === 'po') { const p = TM.po; if (p.run) { p.left = poLeft(); p.run = false; } else { p.end = Date.now() + p.left * 1000; p.run = true; } }
  } else if (act === 'tmlap') { const t = swMs(), prev = TM.sw.laps[0]?.t || 0; TM.sw.laps.unshift({ t, d: t - prev }); }
  else if (act === 'tmreset') {
    if (tab === 'sw') TM.sw = { run: false, start: 0, acc: 0, laps: [] };
    if (tab === 'cd') { TM.cd.run = false; TM.cd.left = TM.cd.total; }
    if (tab === 'po') TM.po = { phase: 'work', run: false, end: 0, left: PO_LEN.work, done: TM.po.done };
  } else if (act === 'tmset') { TM.cd.total = TM.cd.left = Number(b.dataset.v); }
  else if (act === 'tmcustom') {
    const m = Number(document.getElementById('tmMin')?.value); if (!(m > 0 && m <= 600)) { toast('Укажите от 1 до 600 минут'); return; }
    TM.cd.total = TM.cd.left = Math.round(m * 60); TM.cd.end = Date.now() + TM.cd.left * 1000; TM.cd.run = true;
  } else if (act === 'tmskip') { const p = TM.po; p.run = false; p.phase = p.phase === 'work' ? 'short' : 'work'; p.left = PO_LEN[p.phase]; }
  render();
}

/* ---------- 6.5: ВС Калькулятор — свой разбор выражения (без eval), история на устройстве ---------- */
function calcEval(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const num = () => { const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\./i.exec(s.slice(i)); if (!m) throw new Error('syntax'); i += m[0].length; return parseFloat(m[0]); };
  const primary = () => {
    if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; return v; }
    return num();
  };
  const factor = () => {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    let v = primary();
    while (peek() === '%') { i++; v /= 100; }
    if (peek() === '^') { i++; v = Math.pow(v, factor()); }
    return v;
  };
  const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  if (!s) return NaN;
  const v = expr(); if (i < s.length) throw new Error('syntax');
  return v;
}
const calcFmt = v => !isFinite(v) ? (isNaN(v) ? 'Ошибка' : 'Деление на 0') : String(Number(v.toPrecision(12))).replace('.', ',');
function calcTry(e) { try { const v = calcEval(e); return isFinite(v) ? calcFmt(v) : ''; } catch (x) { return ''; } }
const calcHist = () => { try { return JSON.parse(lsGet('vs_calc') || '[]'); } catch (e) { return []; } };
function viewCalc() {
  const c = S.calc ||= { e: '', last: '' }, prev = /[+\-−×÷*/^(]/.test(c.e.replace(/^−/, '')) ? calcTry(c.e) : '';
  const K = [['C', 'calcc', 'fn'], ['(', 'calck', 'fn'], [')', 'calck', 'fn'], ['÷', 'calck', 'op'], ['7'], ['8'], ['9'], ['×', 'calck', 'op'], ['4'], ['5'], ['6'], ['−', 'calck', 'op'],
    ['1'], ['2'], ['3'], ['+', 'calck', 'op'], ['%', 'calck', 'fn'], ['0'], [',', 'calck'], ['=', 'calceq', 'ck-eq']];
  const hist = calcHist();
  return `<div class="card pad"><h1 class="h brandh">ВС Калькулятор</h1><div class="muted small">Можно печатать с клавиатуры · Enter — посчитать · Esc — очистить</div></div>
    <div class="calc-wrap"><div class="card calc">
      <div class="calc-scr"><div class="calc-last small muted">${esc(c.last)}</div><div class="calc-e tnum" id="calcE">${esc(c.e.replace(/\./g, ',')) || '0'}</div><div class="calc-prev tnum muted">${prev ? '= ' + esc(prev) : '&nbsp;'}</div></div>
      <div class="calc-keys">${K.map(([l, act = 'calck', cls = '']) => `<button class="ck ${cls}" data-act="${act}" data-v="${esc(l)}">${l}</button>`).join('')}
        <button class="ck fn" data-act="calcbs" aria-label="Стереть">⌫</button><button class="ck fn" data-act="calck" data-v="^" aria-label="Степень">xʸ</button><button class="ck fn" data-act="calcsqrt">√</button><button class="ck fn" data-act="calcneg">±</button></div></div>
      ${hist.length ? `<div class="card calc-hist"><div class="row"><b class="grow">История</b><button class="btn ghost small" data-act="calchc">Очистить</button></div>
        ${hist.map((h, i) => `<button class="calc-h" data-act="calch" data-i="${i}"><span class="muted small">${esc(h.e)}</span><b class="tnum">= ${esc(h.r)}</b></button>`).join('')}</div>` : ''}</div>`;
}
function calcAction(act, v) {
  const c = S.calc ||= { e: '', last: '' };
  if (c.done && act === 'calck' && /[0-9,(√]/.test(v)) { c.e = ''; }
  c.done = false;
  if (act === 'calck') { if (c.e.length < 120) c.e += v === ',' ? '.' : v; }
  else if (act === 'calcc') { c.e = ''; c.last = ''; }
  else if (act === 'calcbs') c.e = c.e.slice(0, -1);
  else if (act === 'calcneg') c.e = c.e.startsWith('−(') && c.e.endsWith(')') ? c.e.slice(2, -1) : c.e ? '−(' + c.e + ')' : '−';
  else if (act === 'calcsqrt') { try { const r = Math.sqrt(calcEval(c.e)); c.last = '√(' + c.e.replace(/\./g, ',') + ') ='; c.e = String(Number(r.toPrecision(12))); c.done = true; } catch (e) { toast('Сначала введите число'); } }
  else if (act === 'calceq') {
    let r; try { r = calcEval(c.e); } catch (e) { toast('Проверьте выражение'); render(); return; }
    if (!isFinite(r)) { toast(isNaN(r) ? 'Проверьте выражение' : 'На ноль делить нельзя'); render(); return; }
    const res = calcFmt(r), shown = c.e.replace(/\./g, ',');
    lsSet('vs_calc', JSON.stringify([{ e: shown, r: res }, ...calcHist()].slice(0, 12)));
    c.last = shown + ' ='; c.e = String(Number(r.toPrecision(12))); c.done = true;
  }
  render();
}

/* ---------- 6.5: ВС Жребий — монетка, кубики, случайное число, выбор из списка ---------- */
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
function viewDice() {
  const d = S.dice ||= { mode: 'coin', n: 2, from: 1, to: 100, res: null, k: 0, hist: [] };
  const modes = [['coin', '🪙 Монетка'], ['dice', '🎲 Кубики'], ['num', '🔢 Число'], ['list', '📝 Из списка']];
  let body = '';
  if (d.mode === 'coin') body = `<button class="dice-coin ${d.res ? 'flip' : ''}" data-act="diceroll" data-k="${d.k}" aria-label="Подбросить монетку">${d.res ? (d.res.v ? 'Орёл' : 'Решка') : '?'}</button>
    <p class="muted small">Нажмите на монетку</p>`;
  if (d.mode === 'dice') body = `<div class="seg dice-n">${[1, 2, 3, 4, 5, 6].map(k => `<button class="${d.n === k ? 'on' : ''}" data-act="dicen" data-v="${k}">${k}</button>`).join('')}</div>
    <div class="dice-row ${d.res ? 'roll' : ''}" data-k="${d.k}">${d.res ? d.res.v.map(x => `<span>${DICE[x - 1]}</span>`).join('') : DICE.slice(0, d.n).map(x => `<span class="dim">${x}</span>`).join('')}</div>
    ${d.res ? `<b class="dice-sum">Сумма: ${d.res.v.reduce((a, b) => a + b, 0)}</b>` : ''}<button class="btn" data-act="diceroll">Бросить</button>`;
  if (d.mode === 'num') body = `<div class="row dice-range"><label>от <input id="dFrom" class="inp" type="number" value="${d.from}"></label><label>до <input id="dTo" class="inp" type="number" value="${d.to}"></label></div>
    <div class="dice-big tnum ${d.res ? 'roll' : ''}" data-k="${d.k}">${d.res ? d.res.v : '—'}</div><button class="btn" data-act="diceroll">Случайное число</button>`;
  if (d.mode === 'list') body = `<textarea id="dList" class="inp" rows="5" placeholder="Каждый вариант — с новой строки&#10;Пицца&#10;Суши&#10;Бургеры">${esc(d.list || '')}</textarea>
    ${d.res ? `<div class="dice-big dice-pick roll" data-k="${d.k}">${esc(d.res.v)}</div>` : ''}<div class="row"><button class="btn" data-act="diceroll">Выбрать</button><button class="btn sec" data-act="diceshuf">Перемешать список</button></div>`;
  return `<div class="card pad"><h1 class="h brandh">ВС Жребий</h1><div class="muted small">Честный случай: числа берутся из генератора браузера</div></div>
    <div class="seg dice-modes">${modes.map(([k, l]) => `<button class="${d.mode === k ? 'on' : ''}" data-act="dicemode" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="card pad dice">${body}</div>
    ${d.hist.length ? `<div class="card pad small"><b>Последние результаты</b><div class="dice-hist">${d.hist.map(h => `<span class="chip">${esc(h)}</span>`).join('')}</div></div>` : ''}`;
}
function diceAction(act, b) {
  const d = S.dice;
  if (act === 'dicemode') { d.mode = b.dataset.v; d.res = null; }
  else if (act === 'dicen') { d.n = Number(b.dataset.v); d.res = null; }
  else if (act === 'diceshuf') {
    const l = (document.getElementById('dList')?.value || '').split('\n').map(x => x.trim()).filter(Boolean);
    for (let k = l.length - 1; k > 0; k--) { const j = rnd(k + 1); [l[k], l[j]] = [l[j], l[k]]; }
    d.list = l.join('\n'); resetIds.add('dList'); d.res = null;
  } else if (act === 'diceroll') {
    d.k++;
    if (d.mode === 'coin') { d.res = { v: rnd(2) }; d.hist.unshift(d.res.v ? 'Орёл' : 'Решка'); }
    if (d.mode === 'dice') { d.res = { v: Array.from({ length: d.n }, () => rnd(6) + 1) }; d.hist.unshift(d.res.v.map(x => DICE[x - 1]).join('') + ' = ' + d.res.v.reduce((a, x) => a + x, 0)); }
    if (d.mode === 'num') {
      let a = Math.round(Number(document.getElementById('dFrom')?.value)), z = Math.round(Number(document.getElementById('dTo')?.value));
      if (!isFinite(a) || !isFinite(z)) { toast('Укажите оба числа'); return; }
      if (a > z) [a, z] = [z, a]; if (z - a > 1e9) { toast('Слишком большой диапазон'); return; }
      d.from = a; d.to = z; d.res = { v: a + rnd(z - a + 1) }; d.hist.unshift(String(d.res.v));
    }
    if (d.mode === 'list') {
      d.list = document.getElementById('dList')?.value || '';
      const l = d.list.split('\n').map(x => x.trim()).filter(Boolean);
      if (l.length < 2) { toast('Напишите хотя бы два варианта, каждый с новой строки'); return; }
      d.res = { v: l[rnd(l.length)] }; d.hist.unshift(d.res.v);
    }
    d.hist = d.hist.slice(0, 12);
  }
  render();
}

/* ---------- 6.5: Судоку — генерация с единственным решением (битовые маски, клетка с наименьшим выбором) ---------- */
const SDK_LEVELS = { easy: ['Лёгкий', 40], mid: ['Средний', 48], hard: ['Сложный', 54] };
function sdkSolve(g, limit, rand = false) {
  const R = new Uint16Array(9), C = new Uint16Array(9), B = new Uint16Array(9), bx = i => Math.floor(i / 27) * 3 + Math.floor(i % 9 / 3);
  for (let i = 0; i < 81; i++) if (g[i]) { const m = 1 << g[i], r = Math.floor(i / 9), c = i % 9, b = bx(i); if ((R[r] | C[c] | B[b]) & m) return 0; R[r] |= m; C[c] |= m; B[b] |= m; }
  let found = 0;
  const pop = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  (function rec() {
    let best = -1, bm = 0, bc = 10;
    for (let i = 0; i < 81; i++) if (!g[i]) { const m = ~(R[Math.floor(i / 9)] | C[i % 9] | B[bx(i)]) & 0x3FE, n = pop(m); if (n < bc) { best = i; bm = m; bc = n; if (!n) return; } }
    if (best < 0) { found++; return; }
    const ds = []; for (let d = 1; d <= 9; d++) if (bm & (1 << d)) ds.push(d);
    if (rand) for (let k = ds.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [ds[k], ds[j]] = [ds[j], ds[k]]; }
    const r = Math.floor(best / 9), c = best % 9, b = bx(best);
    for (const d of ds) {
      const m = 1 << d; g[best] = d; R[r] |= m; C[c] |= m; B[b] |= m;
      rec();
      if (found >= limit) return;
      g[best] = 0; R[r] &= ~m; C[c] &= ~m; B[b] &= ~m;
    }
  })();
  return found;
}
function sdkNew(level = 'easy') {
  const sol = new Array(81).fill(0); sdkSolve(sol, 1, true);
  const puz = sol.slice(), order = [...Array(81).keys()].sort(() => Math.random() - 0.5);
  let removed = 0; const want = SDK_LEVELS[level][1];
  for (const i of order) {
    if (removed >= want) break;
    const keep = puz[i]; puz[i] = 0;
    if (sdkSolve(puz.slice(), 2) !== 1) puz[i] = keep; else removed++;
  }
  return { level, sol, given: puz.map(Boolean), cur: puz.slice(), sel: -1, start: Date.now(), mistakes: 0, won: false, time: 0 };
}
setInterval(() => { const el = document.getElementById('sdkTime'), g = S.sdk; if (el && g && !g.won) el.textContent = clock((Date.now() - g.start) / 1000); }, 1000);
function viewSudoku(back) {
  const g = S.sdk ||= sdkNew('easy'), sel = g.sel, sv = sel >= 0 ? g.cur[sel] : 0;
  const best = Number(lsGet('vs_sudoku_' + g.level)) || 0;
  const same = i => sel >= 0 && (Math.floor(i / 9) === Math.floor(sel / 9) || i % 9 === sel % 9 || (Math.floor(i / 27) === Math.floor(sel / 27) && Math.floor(i % 9 / 3) === Math.floor(sel % 9 / 3)));
  const left = d => 9 - g.cur.filter(x => x === d).length;
  return `<div class="card pad"><div class="row">${back}<h1 class="h grow">Судоку</h1><div class="g-score"><span>Время</span><b id="sdkTime">${clock((g.won ? g.time : Date.now() - g.start) / 1000)}</b></div><div class="g-score"><span>Ошибки</span><b>${g.mistakes}</b></div></div>
      <p class="muted small" style="margin:8px 0 0">Заполните поле так, чтобы в каждой строке, столбце и квадрате 3×3 были цифры от 1 до 9. Рекорд (${SDK_LEVELS[g.level][0].toLowerCase()}): ${best ? clock(best) : '—'}</p></div>
    <div class="card pad g2048-wrap"><div class="seg sdk-lv">${Object.entries(SDK_LEVELS).map(([k, [l]]) => `<button class="${g.level === k ? 'on' : ''}" data-act="sdknew" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="sdk" role="grid" aria-label="Поле судоку">${g.cur.map((v, i) => `<button class="sc ${g.given[i] ? 'giv' : ''} ${i === sel ? 'sel' : same(i) ? 'hl' : ''} ${v && v === sv && i !== sel ? 'same' : ''} ${v && !g.given[i] && v !== g.sol[i] ? 'bad' : ''}" data-act="sdksel" data-i="${i}" aria-label="Клетка ${Math.floor(i / 9) + 1}-${i % 9 + 1}${v ? ': ' + v : ''}">${v || ''}</button>`).join('')}
        ${g.won ? `<div class="g-over"><b>Решено за ${clock(g.time / 1000)}! 🎉</b><button class="btn" data-act="sdknew" data-v="${g.level}">Новая игра</button></div>` : ''}</div>
      <div class="sdk-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="btn sec" data-act="sdknum" data-v="${d}" ${left(d) ? '' : 'disabled'}><b>${d}</b><span>${left(d) || ''}</span></button>`).join('')}
        <button class="btn ghost" data-act="sdknum" data-v="0" aria-label="Стереть">⌫</button></div>
      <div class="row g-pad"><button class="btn ghost" data-act="sdkhint" ${g.won ? 'disabled' : ''}>💡 Подсказка</button><span class="grow"></span><button class="btn ghost" data-act="sdknew" data-v="${g.level}">Заново</button></div></div>`;
}
function sdkPut(d) {
  const g = S.sdk; if (!g || g.won || g.sel < 0 || g.given[g.sel]) return;
  g.cur[g.sel] = d;
  if (d && d !== g.sol[g.sel]) g.mistakes++;
  if (g.cur.every((v, i) => v === g.sol[i])) {
    g.won = true; g.time = Date.now() - g.start;
    const k = 'vs_sudoku_' + g.level, best = Number(lsGet(k)) || 0, sec = Math.round(g.time / 1000);
    if (!best || sec < best) { lsSet(k, String(sec)); toast('🏆 Новый рекорд!'); }
  }
  render();
}
function sdkAction(act, b) {
  const g = S.sdk;
  if (act === 'sdknew') { S.sdk = sdkNew(b.dataset.v || 'easy'); render(); }
  else if (act === 'sdksel') { g.sel = Number(b.dataset.i); render(); }
  else if (act === 'sdknum') sdkPut(Number(b.dataset.v));
  else if (act === 'sdkhint') {
    let i = g.sel >= 0 && !g.given[g.sel] && g.cur[g.sel] !== g.sol[g.sel] ? g.sel : g.cur.findIndex((v, k) => v !== g.sol[k]);
    if (i < 0) return; g.sel = i; g.mistakes++; sdkPut(g.sol[i]); toast('💡 Подсказка стоит одну ошибку');
  }
}

/* ---------- 6.5: горячие клавиши — окно по «?» ---------- */
function keysOverlay() {
  const rows = [['Везде', [['Ctrl/⌘ + K', 'быстрый поиск разделов и людей'], ['?', 'эта подсказка'], ['Esc', 'закрыть окно, меню или плеер']]],
    ['Плеер (открыт на весь экран)', [['Пробел', 'пауза / играть'], ['← →', 'перемотка на 5 секунд'], ['Shift + ← →', 'предыдущий / следующий трек'], ['↑ ↓', 'громкость'], ['M', 'без звука']]],
    ['Калькулятор', [['0–9 + − * / ( ) %', 'ввод'], ['Enter', 'посчитать'], ['Backspace', 'стереть'], ['Esc', 'очистить']]],
    ['Игры', [['Стрелки', '2048, змейка, выбор клетки в судоку'], ['1–9, Backspace', 'цифра в судоку']]],
    ['Итоги', [['← → , пробел', 'листать слайды']]]];
  return `<div class="ov" data-act="keysx"><div class="ov-in modal keys-modal" data-stop="1"><div class="row"><b class="grow h">Горячие клавиши</b><button class="icon-btn" data-act="keysx" aria-label="Закрыть">✕</button></div>
    ${rows.map(([h, l]) => `<div class="keys-sec"><div class="small muted">${h}</div>${l.map(([k, t]) => `<div class="keys-row"><kbd>${k}</kbd><span>${t}</span></div>`).join('')}</div>`).join('')}</div></div>`;
}
document.addEventListener('keydown', e => {
  if (S.phase !== 'app' || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.matches?.('input,textarea,select,[contenteditable]');
  if (S.keys) { if (e.key === 'Escape') { S.keys = false; render(); } return; }
  if (typing || S.pal || S.recap || S.fullPlayer) return;
  if (e.key === '?') { e.preventDefault(); S.keys = true; render(); return; }
  if (S.view === 'calc') {
    const map = { '*': '×', '/': '÷', '-': '−', '+': '+', '(': '(', ')': ')', '%': '%', '^': '^', '.': ',', ',': ',' };
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); calcAction('calck', e.key); }
    else if (map[e.key]) { e.preventDefault(); calcAction('calck', map[e.key]); }
    else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); calcAction('calceq'); }
    else if (e.key === 'Backspace') { e.preventDefault(); calcAction('calcbs'); }
    else if (e.key === 'Escape' || e.key === 'Delete') calcAction('calcc');
  }
  if (S.view === 'games' && S.game === 'sudoku' && S.sdk) {
    const g = S.sdk;
    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); sdkPut(Number(e.key)); }
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); sdkPut(0); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault(); const s = g.sel < 0 ? 40 : g.sel, r = Math.floor(s / 9), c = s % 9;
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      g.sel = ((r + dr + 9) % 9) * 9 + (c + dc + 9) % 9; render();
    }
  }
});
// черновик записи: текст из поля новой записи сохраняется на устройстве и возвращается, если уйти со страницы
document.addEventListener('input', e => { if (e.target.id === 'postText') lsSet('vs_draft', e.target.value.slice(0, 4000)); });

/* ---------- 6.8: ВС Эфир — прямые эфиры из браузера, без сторонних платформ ----------
   Видео идёт между устройствами (WebRTC): стример → зрители, а зрители сами передают его дальше по цепочке (каждый — ещё двоим).
   В базе только «знакомство»: заявка зрителя (peers), список тех, кто может передавать дальше (nodes), сам эфир (streams).
   Чат и счётчик зрителей идут по тем же прямым каналам, в базу не пишутся. Всё служебное стирается, когда эфир заканчивается. */
const ICE = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // бесплатный открытый ретранслятор (нужен тем, у кого прямое соединение не пробивается); можно заменить своим — см. README
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }],
};
const LIVE_ROOT = 3, LIVE_RELAY = 2, LIVE_DEPTH = 4, LIVE_STALE = 150000;
let LIVE = null;   // {sid, host, title, mode, stream, kids: Map, cap, depth, up, chat[], count, status, ...}
const rid = () => Math.random().toString(36).slice(2, 10);
const liveFresh = s => !!s && s.live && Date.now() - ms(s.beat) < LIVE_STALE;
const liveCanScreen = () => !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const liveCanCam = () => !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined';
const iceDone = (pc, to = 2500) => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res();
  const ch = () => { if (pc.iceGatheringState === 'complete') done(); };
  const t = setTimeout(done, to);
  function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res(); }
  pc.addEventListener('icegatheringstatechange', ch);
});
function limitBitrate(pc, bps) {
  pc.getSenders().forEach(s => { if (s.track?.kind !== 'video') return; try { const p = s.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = bps; s.setParameters(p).catch(() => { }); } catch (e) { } });
}
// экран не гаснет, пока идёт эфир
let wakeLock = null;
async function liveWake(on) { try { if (on) wakeLock = await navigator.wakeLock?.request('screen'); else { await wakeLock?.release(); wakeLock = null; } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (LIVE && document.visibilityState === 'visible') liveWake(true); });

/* ---- общая часть: передаём видео тем, кто к нам подключается (стример и зрители-«ретрансляторы») ---- */
function liveListen(L) {
  L.unsubs.push(onSnapshot(query(collection(db, 'streams', L.sid, 'peers'), where('to', '==', uid())),
    s => s.docChanges().forEach(ch => { if (ch.type === 'added') liveAccept(L, ch.doc); }), e => console.error(e)));
}
async function liveAccept(L, snap) {
  const p = snap.data(); if (!p || p.answer || p.rej || L.seen.has(snap.id)) return; L.seen.add(snap.id);
  if (L.dead || !L.stream || L.kids.size >= L.cap || p.uid === uid()) { updateDoc(snap.ref, { rej: true }).catch(() => { }); return; }
  const pc = new RTCPeerConnection(ICE), kid = { pc, uid: p.uid, dc: null, pres: [], presAt: 0 };
  L.kids.set(snap.id, kid); nodeSoon(L);
  pc.ondatachannel = e => liveKidChannel(L, kid, e.channel);
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'failed' || st === 'closed') liveKidDrop(L, snap.id);
    else if (st === 'disconnected') setTimeout(() => { if (pc.connectionState !== 'connected') liveKidDrop(L, snap.id); }, 7000);
  };
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: p.offer });
    L.stream.getTracks().forEach(t => pc.addTrack(t, L.stream));
    limitBitrate(pc, L.host ? (L.mode === 'screen' ? 2500000 : 1500000) : 1300000);
    await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
    await updateDoc(snap.ref, { answer: pc.localDescription.sdp });
    setTimeout(() => { if (pc.connectionState !== 'connected' && L.kids.get(snap.id) === kid) liveKidDrop(L, snap.id); }, 20000);
  } catch (e) { console.error(e); liveKidDrop(L, snap.id); }
}
function liveKidDrop(L, id) {
  const k = L.kids.get(id); if (!k) return; L.kids.delete(id);
  try { k.pc.close(); } catch (e) { }
  nodeSoon(L);
}
let nodeTimer = 0;
function nodeSoon(L) { clearTimeout(nodeTimer); nodeTimer = setTimeout(() => nodePut(L), 1200); }
function nodePut(L) {
  if (L.dead || !L.stream || (!L.host && (L.status !== 'live' || L.cap === 0))) return;
  setDoc(doc(db, 'streams', L.sid, 'nodes', uid()), { uid: uid(), depth: L.depth, free: Math.max(0, Math.min(8, L.cap - L.kids.size)), up: L.up?.uid || '', at: serverTimestamp() }).catch(() => { });
}
const nodeDel = L => deleteDoc(doc(db, 'streams', L.sid, 'nodes', uid())).catch(() => { });

/* ---- чат по прямым каналам: сообщение идёт вверх к стримеру, стример рассылает вниз всем ---- */
function liveKidChannel(L, kid, dc) {
  kid.dc = dc;
  dc.onopen = () => { try { dc.send(JSON.stringify({ t: 'h', list: L.chat.slice(-30) })); dc.send(JSON.stringify({ t: 'c', n: L.count })); } catch (e) { } };
  dc.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'p') { kid.pres = Array.isArray(m.u) ? m.u.slice(0, 400).map(String) : []; kid.presAt = Date.now(); }
    else if (m.t === 'm') {
      const msg = { id: String(m.id || rid()).slice(0, 16), u: String(m.u || kid.uid).slice(0, 40), x: String(m.x || '').trim().slice(0, 200), ts: Date.now() };
      if (msg.x) liveRoute(L, msg);
    }
  };
}
function liveRoute(L, msg) {   // сообщение пришло снизу: стример принимает, остальные пересылают выше
  if (L.host) {
    if (L.muted.has(msg.u) || Date.now() - (L.last.get(msg.u) || 0) < 1200) return;
    L.last.set(msg.u, Date.now()); liveBroadcast(L, msg);
  } else if (L.up?.dc?.readyState === 'open') L.up.dc.send(JSON.stringify({ t: 'm', id: msg.id, u: msg.u, x: msg.x }));
}
function liveBroadcast(L, msg) {
  liveShow(L, msg);
  L.kids.forEach(k => { if (k.dc?.readyState === 'open') try { k.dc.send(JSON.stringify({ t: 'b', ...msg })); } catch (e) { } });
}
function liveShow(L, msg) {
  if (L.seenMsg.has(msg.id)) return; L.seenMsg.add(msg.id); if (L.seenMsg.size > 400) L.seenMsg.delete(L.seenMsg.values().next().value);
  L.chat.push(msg); if (L.chat.length > 100) L.chat.shift();
  ensureUsers([msg.u]);
  const box = document.getElementById('liveMsgs');
  if (box && S.view === 'live' && S.liveId === L.sid) {
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    box.insertAdjacentHTML('beforeend', liveMsgHtml(msg)); while (box.children.length > 100) box.firstChild.remove();
    if (near) box.scrollTop = box.scrollHeight;
  }
}
function liveSay(text) {
  const L = LIVE, x = String(text || '').trim().slice(0, 200); if (!L || !x) return false;
  if (Date.now() - (L.mine || 0) < 1200) { toast('Не так быстро — подождите секунду'); return false; }
  L.mine = Date.now();
  const msg = { id: rid(), u: uid(), x, ts: Date.now() };
  if (L.host) { L.last.set(uid(), 0); liveBroadcast(L, msg); } else { liveShow(L, msg); liveRoute(L, msg); }
  return true;
}
const liveMsgHtml = m => { const u = U(m.u); return `<div class="lv-m" data-u="${esc(m.u)}"><a href="#id/${esc(m.u)}" class="lv-n">${esc(u?.name || 'Гость')}</a> <span>${linkify(m.x)}</span>${LIVE?.host && m.u !== uid() ? `<button class="lv-mute" data-act="livemute" data-u="${esc(m.u)}" title="Заглушить" aria-label="Заглушить">🔇</button>` : ''}</div>`; };
// сколько людей смотрит: каждый узел раз в 4 секунды присылает вверх список «кто в моей ветке», стример считает и рассылает число
function liveTick(L) {
  const set = new Set([uid()]); const now = Date.now();
  L.kids.forEach(k => { if (now - k.presAt < 12000) k.pres.forEach(u => set.add(u)); });
  if (L.host) {
    L.count = set.size - 1; liveDom();
    const m = JSON.stringify({ t: 'c', n: L.count }); L.kids.forEach(k => { if (k.dc?.readyState === 'open') try { k.dc.send(m); } catch (e) { } });
  } else if (L.up?.dc?.readyState === 'open') try { L.up.dc.send(JSON.stringify({ t: 'p', u: [...set].slice(0, 400) })); } catch (e) { }
}

/* ---- стример ---- */
function mixAudio(streams) {
  const tr = streams.filter(Boolean).flatMap(s => s.getAudioTracks()); if (!tr.length) return null; if (tr.length === 1) return tr[0];
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination(); tr.forEach(t => ac.createMediaStreamSource(new MediaStream([t])).connect(dest)); return dest.stream.getAudioTracks()[0]; } catch (e) { return tr[0]; }
}
async function liveStart(f) {
  if (LIVE) { toast('Вы уже в эфире'); return; }
  if (!liveCanCam()) { toast('Этот браузер не умеет эфиры — попробуйте Chrome или Safari'); return; }
  let stream;
  try {
    if (f.mode === 'screen') {
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      let mic = null; try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { }
      const a = mixAudio([disp, mic]);
      stream = new MediaStream([...disp.getVideoTracks(), ...(a ? [a] : [])]);
      disp.getVideoTracks()[0].addEventListener('ended', () => liveStop());
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f.facing || 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    }
  } catch (e) { console.error(e); toast(e?.name === 'NotAllowedError' ? 'Нет доступа к камере или экрану — разрешите его в браузере' : 'Не получилось включить ' + (f.mode === 'screen' ? 'экран' : 'камеру')); return; }
  let ref;
  try { ref = await addDoc(collection(db, 'streams'), { ownerId: uid(), title: f.title, mode: f.mode, live: true, beat: serverTimestamp(), createdAt: serverTimestamp(), endedAt: null }); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); toast(errText(e)); return; }
  const L = LIVE = { sid: ref.id, host: true, title: f.title, mode: f.mode, stream, kids: new Map(), cap: LIVE_ROOT, depth: 0, up: null, chat: [], seenMsg: new Set(), seen: new Set(), muted: new Set(), last: new Map(), count: 0, status: 'live', unsubs: [], timers: [], dead: false, facing: f.facing || 'user', t0: Date.now() };
  if (f.rec && typeof MediaRecorder !== 'undefined') {
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported?.(m));
    try { L.recChunks = []; L.rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 }); L.rec.ondataavailable = e => { if (e.data?.size) L.recChunks.push(e.data); }; L.rec.start(2000); } catch (e) { console.warn(e); L.rec = null; }
  }
  liveListen(L); nodePut(L);
  L.timers.push(setInterval(() => { updateDoc(doc(db, 'streams', L.sid), { beat: serverTimestamp() }).catch(() => { }); nodePut(L); }, 60000), setInterval(() => liveTick(L), 4000));
  liveWake(true); S.liveForm = null; go('live/' + L.sid);
}
async function liveStop(silent) {
  const L = LIVE; if (!L) return; LIVE = null; L.dead = true;
  L.timers.forEach(clearInterval); clearTimeout(nodeTimer); L.unsubs.forEach(u => { try { u(); } catch (e) { } });
  let rec = null;
  if (L.rec && L.rec.state !== 'inactive') rec = await new Promise(res => { L.rec.onstop = () => res(new Blob(L.recChunks, { type: L.rec.mimeType || 'video/webm' })); try { L.rec.stop(); } catch (e) { res(null); } });
  L.kids.forEach(k => { try { k.pc.close(); } catch (e) { } }); L.kids.clear();
  try { L.up?.pc.close(); } catch (e) { }
  if (L.host) L.stream?.getTracks().forEach(t => t.stop());
  liveWake(false);
  try {
    if (L.host) {
      await updateDoc(doc(db, 'streams', L.sid), { live: false, endedAt: serverTimestamp() });
      for (const sub of ['peers', 'nodes']) { const s = await getDocs(collection(db, 'streams', L.sid, sub)); if (s.size) { const b = writeBatch(db); s.docs.slice(0, 450).forEach(d => b.delete(d.ref)); await b.commit(); } }
    } else await nodeDel(L);
  } catch (e) { console.error(e); }
  if (rec && rec.size > 0) { S.liveRec = { blob: rec, url: URL.createObjectURL(rec), title: L.title, secs: Math.round((Date.now() - L.t0) / 1000) }; }
  if (!silent) render();
}

/* ---- зритель ---- */
async function liveJoin(sid) {
  if (!liveCanCam()) { toast('Этот браузер не умеет смотреть эфиры'); return; }
  if (LIVE?.sid === sid) return;
  if (LIVE) await liveStop(true);
  const L = LIVE = { sid, host: false, title: cache.stream?.title || '', mode: cache.stream?.mode || 'camera', stream: null, kids: new Map(), cap: 0, depth: 9, up: null, chat: [], seenMsg: new Set(), seen: new Set(), muted: new Set(), last: new Map(), count: 0, status: 'connecting', unsubs: [], timers: [], tried: new Set(), dead: false, t0: Date.now() };
  L.timers.push(setInterval(() => liveTick(L), 4000), setInterval(() => nodePut(L), 60000));
  liveWake(true); liveListen(L); render(); liveConnect(L, 0);
}
async function liveConnect(L, tries) {
  if (L.dead) return;
  L.status = 'connecting'; liveDom();
  let nodes = []; try { nodes = (await getDocs(collection(db, 'streams', L.sid, 'nodes'))).docs.map(data); } catch (e) { }
  const byUid = new Map(nodes.map(n => [n.uid, n])), under = n => { for (let i = 0, x = n; x && i < 12; i++, x = byUid.get(x.up)) if (x.up === uid()) return true; return false; };   // не цепляться к своим же потомкам
  const cands = nodes.filter(n => n.uid !== uid() && n.free > 0 && Date.now() - ms(n.at) < LIVE_STALE && !L.tried.has(n.uid) && !under(n))
    .sort((a, b) => a.depth - b.depth || Math.random() - 0.5).slice(0, 6);
  for (const n of cands) { L.tried.add(n.uid); if (await liveTry(L, n)) return; if (L.dead) return; }
  L.tried.clear();
  if (tries >= 5) { L.status = 'failed'; liveDom(); return; }
  setTimeout(() => liveConnect(L, tries + 1), 2500 + tries * 1500);
}
async function liveTry(L, n) {
  const pc = new RTCPeerConnection(ICE), dc = pc.createDataChannel('chat'), stream = new MediaStream();
  pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = e => { stream.addTrack(e.track); L.stream = stream; liveAttach(); };
  let ref;
  try {
    await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
    ref = await addDoc(collection(db, 'streams', L.sid, 'peers'), { uid: uid(), to: n.uid, offer: pc.localDescription.sdp, createdAt: serverTimestamp() });
  } catch (e) { console.error(e); try { pc.close(); } catch (x) { } return false; }
  const ok = await new Promise(res => {
    let done = false, unsub = () => { };
    const fin = v => { if (done) return; done = true; unsub(); clearTimeout(tm); res(v); };
    const tm = setTimeout(() => fin(false), 14000);
    unsub = onSnapshot(ref, s => { const p = s.data(); if (!p) return; if (p.rej) fin(false); else if (p.answer && !pc.remoteDescription) pc.setRemoteDescription({ type: 'answer', sdp: p.answer }).catch(() => fin(false)); }, () => fin(false));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') fin(true); else if (pc.connectionState === 'failed') fin(false); };
  });
  deleteDoc(ref).catch(() => { });
  if (!ok || L.dead) { try { pc.close(); } catch (e) { } if (!ok) L.stream = null; return false; }
  const up = L.up = { pc, dc, uid: n.uid };
  L.depth = n.depth + 1; L.cap = L.depth < LIVE_DEPTH ? LIVE_RELAY : 0; L.status = 'live'; L.stream = stream;
  dc.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'b') { const msg = { id: String(m.id).slice(0, 16), u: String(m.u).slice(0, 40), x: String(m.x).slice(0, 200), ts: m.ts || Date.now() }; liveShow(L, msg); L.kids.forEach(k => { if (k.dc?.readyState === 'open') try { k.dc.send(e.data); } catch (x) { } }); }
    else if (m.t === 'h') (m.list || []).forEach(x => liveShow(L, { id: String(x.id).slice(0, 16), u: String(x.u).slice(0, 40), x: String(x.x).slice(0, 200), ts: x.ts || Date.now() }));
    else if (m.t === 'c') { L.count = Number(m.n) || 0; liveDom(); L.kids.forEach(k => { if (k.dc?.readyState === 'open') try { k.dc.send(e.data); } catch (x) { } }); }
  };
  const lost = () => { if (L.dead || L.up !== up) return; liveUpLost(L); };
  pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'failed' || s === 'closed') lost(); else if (s === 'disconnected') setTimeout(() => { if (pc.connectionState !== 'connected') lost(); }, 6000); };
  liveAttach(); liveDom(); nodePut(L); return true;
}
function liveUpLost(L) {
  // потеряли того, от кого брали видео: отключаем тех, кто смотрит через нас (они переподключатся сами), и ищем нового
  try { L.up?.pc.close(); } catch (e) { } L.up = null; L.stream = null; L.status = 'connecting'; L.depth = 9; L.cap = 0; L.tried.clear();
  L.kids.forEach(k => { try { k.pc.close(); } catch (e) { } }); L.kids.clear(); nodeDel(L); liveDom(); liveConnect(L, 0);
}
function liveOnStream() {   // изменился документ эфира
  const s = cache.stream, L = LIVE;
  if (L && !L.host && s && s.id === L.sid && !s.missing && !s.live) { liveStop(true).then(() => { render(); }); }
}

/* ---- экран ---- */
function liveAttach() {
  const v = document.getElementById('liveVid'), L = LIVE; if (!v || !L?.stream || S.liveId !== L.sid) return;
  if (v.srcObject !== L.stream) { v.srcObject = L.stream; v.muted = !!L.host; }
  v.play().catch(() => { v.muted = true; v.play().catch(() => { }); const h = document.getElementById('liveSound'); if (h) h.hidden = false; });
}
function liveDom() {   // мелкие обновления без перерисовки страницы
  const L = LIVE;
  const c = document.getElementById('liveCount'); if (c) c.textContent = '👁 ' + (L ? L.count : 0);
  const o = document.getElementById('liveOver'); if (o && L) { const t = L.status === 'connecting' ? 'Подключаемся…' : L.status === 'failed' ? 'Не получилось подключиться' : ''; o.hidden = !t; if (t) o.querySelector('span').textContent = t; const r = o.querySelector('button'); if (r) r.hidden = L.status !== 'failed'; }
  const m = document.getElementById('liveMiniCount'); if (m && L) m.textContent = '👁 ' + L.count;
}
function liveBar() {
  const L = LIVE; if (!L || (S.view === 'live' && S.liveId === L.sid)) return '';
  return `<div class="live-mini" role="status"><span class="live-dot"></span><a class="grow" href="#live/${esc(L.sid)}"><b>${L.host ? 'Вы в эфире' : 'Вы смотрите эфир'}</b> · ${esc(L.title || 'эфир')}</a><span class="small" id="liveMiniCount">👁 ${L.count}</span>
    <button class="btn small ${L.host ? 'danger' : 'sec'}" data-act="livestop">${L.host ? 'Завершить' : 'Выйти'}</button></div>`;
}
function viewLive() {
  if (!S.liveId) return viewLiveList();
  const s = cache.stream, L = LIVE && LIVE.sid === S.liveId ? LIVE : null;
  if (!s) return loadingBox();
  if (s.missing) return `<div class="card empty"><b>Эфир удалён</b><a class="btn sec" href="#live">Все эфиры</a></div>`;
  const host = U(s.ownerId), mine = s.ownerId === S.me.id, live = L ? true : liveFresh(s);
  if (!live && !L) return `<div class="card pad live-end"><div class="row">${host ? avatar(host, 44) : ''}<div class="grow"><h1 class="h">${esc(s.title)}</h1><div class="muted small">${host ? esc(host.name) + ' · ' : ''}эфир закончился</div></div></div>
      ${mine && s.live ? `<p class="muted small">Эфир прервался (закрыта вкладка). <button class="btn small" data-act="liveclose" data-id="${esc(s.id)}">Завершить</button></p>` : ''}
      <a class="btn sec" href="#live">Все эфиры</a></div>`;
  const status = L ? (L.status === 'connecting' ? 'Подключаемся…' : L.status === 'failed' ? 'Не получилось подключиться' : '') : '';
  return `<section class="live-room"><div class="live-stage" id="liveStage">
      <video id="liveVid" playsinline autoplay ${L?.host ? 'muted' : ''}></video>
      <span class="live-badge"><span class="live-dot"></span>В ЭФИРЕ</span><span class="live-count" id="liveCount">👁 ${L ? L.count : 0}</span>
      ${L ? `<div class="live-over" id="liveOver" ${status ? '' : 'hidden'}><span>${status}</span><button class="btn small" data-act="livetry" ${L.status === 'failed' ? '' : 'hidden'}>Повторить</button></div>`
        : `<div class="live-over" id="liveOver"><button class="live-go" data-act="livejoin" data-id="${esc(s.id)}" aria-label="Смотреть эфир">${I.play}<span>Смотреть</span></button></div>`}
      <button class="live-sound" id="liveSound" data-act="livesound" hidden>🔇 Включить звук</button>
      <button class="live-fs" data-act="livefs" aria-label="На весь экран">⛶</button></div>
    <div class="card pad live-info"><div class="row">${host ? avatar(host, 44) : ''}<div class="grow" style="min-width:0"><h1 class="h live-title">${esc(s.title)}</h1><div class="muted small">${host ? `<a href="#id/${esc(host.id)}">${esc(host.name)}</a> · ` : ''}${s.mode === 'screen' ? 'показ экрана' : 'камера'}</div></div></div>
      ${L ? `<div class="row live-ctl">${L.host ? `<button class="btn sec" data-act="livemic">${L.micOff ? '🎙 Включить микрофон' : '🎤 Выключить микрофон'}</button>${s.mode === 'camera' && L.stream?.getVideoTracks().length ? `<button class="btn sec" data-act="liveflip">🔄 Камера</button>` : ''}` : ''}
        <span class="grow"></span><button class="btn ${L.host ? 'danger' : 'ghost'}" data-act="livestop">${L.host ? (S.confirm === 'livestop' ? 'Точно завершить?' : 'Завершить эфир') : 'Выйти'}</button></div>` : ''}</div>
    <div class="card live-chat"><div class="live-msgs" id="liveMsgs">${(L?.chat || []).map(liveMsgHtml).join('') || ''}</div>
      ${L && !banOf(S.me) ? `<form class="live-form" data-form="livechat"><input id="liveIn" maxlength="200" autocomplete="off" placeholder="Написать в чат"><button class="btn" type="submit" aria-label="Отправить">➤</button></form>` : `<div class="live-form muted small" style="padding:12px 14px">${L ? '' : 'Нажмите «Смотреть», чтобы войти в чат'}</div>`}</div></section>`;
}
function viewLiveList() {
  const list = (cache.streams || []).filter(liveFresh).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const can = liveCanCam() && !banOf(S.me);
  return `<div class="card pad"><div class="row" style="flex-wrap:wrap"><div class="grow"><h1 class="h brandh">ВС Эфир</h1><div class="muted small">Прямые эфиры прямо из браузера — с камеры или с экрана</div></div>
      ${can ? `<button class="btn" data-act="liveform">🔴 Начать эфир</button>` : ''}</div>
      ${LIVE ? `<div class="small" style="margin-top:10px"><a href="#live/${esc(LIVE.sid)}">${LIVE.host ? 'Ваш эфир идёт — вернуться' : 'Вы смотрите эфир — вернуться'}</a></div>` : ''}</div>
    ${S.loading ? loadingBox() : list.length ? `<div class="live-grid">${list.map(s => { const h = U(s.ownerId);
      return `<a class="card live-card" href="#live/${esc(s.id)}"><span class="live-card-ic">${s.mode === 'screen' ? '🖥' : '📹'}</span><span class="live-badge sm"><span class="live-dot"></span>LIVE</span>
        <b>${esc(s.title)}</b><span class="muted small">${h ? esc(h.name) : ''}${s.ownerId === S.me.id ? ' · это вы' : ''}</span></a>`; }).join('')}</div>`
      : `<div class="card empty"><b>Сейчас никто не в эфире</b><span>${can ? 'Начните первым — нажмите «Начать эфир»' : ''}</span></div>`}`;
}
function liveFormModal() {
  const f = S.liveForm, scr = liveCanScreen();
  return `<div class="ov" data-act="liveformx"><div class="ov-in modal live-modal" data-stop="1"><div class="row"><b class="grow h">Начать эфир</b><button class="icon-btn" data-act="liveformx" aria-label="Закрыть">✕</button></div>
    <form class="form" data-form="livestart">
      <div class="field"><label for="lvTitle">Название</label><input id="lvTitle" required minlength="2" maxlength="100" placeholder="Например, «Играем в Майнкрафт»" value="${esc(f.title || '')}"></div>
      <div class="field"><label>Что показываем</label><div class="seg" role="radiogroup">
        <button type="button" role="radio" aria-checked="${f.mode === 'camera'}" class="${f.mode === 'camera' ? 'on' : ''}" data-act="livemode" data-v="camera">📹 Камера</button>
        <button type="button" role="radio" aria-checked="${f.mode === 'screen'}" class="${f.mode === 'screen' ? 'on' : ''}" data-act="livemode" data-v="screen" ${scr ? '' : 'disabled'}>🖥 Экран</button></div>
        ${scr ? '' : '<div class="hint">Показ экрана работает только на компьютере. С телефона — камера.</div>'}</div>
      ${f.mode === 'camera' ? `<div class="field"><label>Камера</label><div class="seg"><button type="button" class="${f.facing === 'user' ? 'on' : ''}" data-act="livefacing" data-v="user">Фронтальная</button><button type="button" class="${f.facing === 'environment' ? 'on' : ''}" data-act="livefacing" data-v="environment">Основная</button></div></div>` : ''}
      <button type="button" class="fs-row live-rec" data-act="liverec"><span class="grow"><b>Записывать эфир</b><span class="small muted">Запись сохранится у вас на устройстве, а до 20 МБ (около 3 минут) можно выложить в ВС Видео</span></span><span class="fs-sw ${f.rec ? 'on' : ''}"></span></button>
      <p class="hint" style="margin:0">Эфир идёт напрямую между устройствами — вкладку нужно держать открытой. Зрителей передаёт друг другу цепочкой: чем больше смотрят, тем легче вам.</p>
      <div class="row"><button class="btn" type="submit">🔴 В эфир</button><button type="button" class="btn ghost" data-act="liveformx">Отмена</button></div></form></div></div>`;
}
function liveRecModal() {
  const r = S.liveRec, mb = r.blob.size / 1048576, fits = r.blob.size <= LIMITS.video;
  return `<div class="ov" data-act="liverecx"><div class="ov-in modal live-modal" data-stop="1"><div class="row"><b class="grow h">Запись эфира готова</b><button class="icon-btn" data-act="liverecx" aria-label="Закрыть">✕</button></div>
    <video class="live-recv" src="${esc(r.url)}" controls playsinline></video>
    <p class="muted small" style="margin:0">«${esc(r.title)}» · ${fmtDur(r.secs)} · ${mb.toFixed(1)} МБ</p>
    <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="livesave">⬇ Сохранить на устройство</button>
      ${fits ? `<button class="btn sec" data-act="livepub" ${S.busy ? 'disabled' : ''}>Выложить в ВС Видео</button>` : `<span class="hint" style="margin:0">В ВС Видео не влезает (больше ${fmtSize(LIMITS.video)}) — сохраните на устройство</span>`}</div></div></div>`;
}
async function livePublish() {
  const r = S.liveRec; if (!r || S.busy) return; S.busy = true; render();
  try {
    const ext = /mp4/.test(r.blob.type) ? 'mp4' : 'webm', file = new File([r.blob], `эфир.${ext}`, { type: r.blob.type || 'video/webm' });
    const fileId = await putFile(file, 'video', 'Загружаем запись эфира');
    await addDoc(collection(db, 'videos'), { ownerId: uid(), title: ('Эфир: ' + r.title).slice(0, 120), description: 'Запись прямого эфира', source: 'file', fileId, type: file.type, thumb: '', duration: r.secs, size: file.size, likes: [], createdAt: serverTimestamp() });
    URL.revokeObjectURL(r.url); S.liveRec = null; toast('Запись выложена в ВС Видео'); go('video');
  } catch (e) { toast(errText(e)); } finally { S.busy = false; render(); }
}
// плашка «в эфире сейчас» в ленте
async function loadLiveNow() {
  try { const s = await getDocs(query(collection(db, 'streams'), where('live', '==', true), limit(10))); cache.liveNow = s.docs.map(data).filter(x => liveFresh(x) && x.mode !== 'call'); ensureUsers(cache.liveNow.map(x => x.ownerId)); if (S.view === 'feed') render(); } catch (e) { }
}
function liveNowCard() {
  const l = cache.liveNow || []; if (!l.length) return '';
  return `<div class="card live-now"><span class="live-badge sm"><span class="live-dot"></span>В ЭФИРЕ</span>${l.slice(0, 3).map(s => { const h = U(s.ownerId); return `<a href="#live/${esc(s.id)}"><b>${esc(s.title)}</b><span class="muted small">${h ? esc(h.name) : ''}</span></a>`; }).join('')}${l.length > 3 ? '<a href="#live"><b>Ещё…</b></a>' : ''}</div>`;
}
// если вкладка с эфиром была закрыта и эфир «завис», хозяин закрывает его при следующем заходе
async function liveCleanStale() {
  for (const s of cache.streams || []) if (s.ownerId === uid() && s.live && !liveFresh(s) && LIVE?.sid !== s.id) updateDoc(doc(db, 'streams', s.id), { live: false, endedAt: serverTimestamp() }).catch(() => { });
}
window.addEventListener('pagehide', () => { const L = LIVE; if (!L) return; nodeDel(L); if (L.host) updateDoc(doc(db, 'streams', L.sid), { live: false, endedAt: serverTimestamp() }).catch(() => { }); });

/* ---------- 8.0: звонки один на один — голос и видео напрямую между двумя устройствами (WebRTC, как ВС Эфир) ----------
   Звонок — запись streams с mode 'call' и to = кому звоним; позвать — уведомление type 'call' (postId = id звонка).
   Тот, кому звонят, берёт трубку заявкой peers с offer (в ней его звук и видео), звонящий отвечает answer. «Отклонить» — заявка с offer 'no'.
   По каналу данных: {t:'end'} — положили трубку, {t:'tog'} и {t:'mus'} — «Слушать вместе» (ведущий раз в 1,5 с шлёт трек и позицию).
   Экран звонка живёт вне #app (#callBox) и не зависит от render() — звонок продолжается при переходах по сайту. */
let CALL = null, ringT = 0, ringAC = null, togTimer = 0;
const callSeen = new Set();
const callBox = () => document.getElementById('callBox') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'callBox' }));
const callMedia = video => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
const callSend = m => { const dc = CALL?.dc; if (dc?.readyState === 'open') try { dc.send(JSON.stringify(m)); } catch (e) { } };
function ringTone(on, kind = 'in') {
  clearInterval(ringT); ringT = 0; if (!on) return;
  const beep = () => {
    try {
      ringAC ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ringAC.createOscillator(), g = ringAC.createGain(), t = ringAC.currentTime, len = kind === 'in' ? 0.9 : 1.2;
      o.frequency.value = kind === 'in' ? 880 : 425; o.connect(g); g.connect(ringAC.destination);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.08);
      o.start(t); o.stop(t + len + 0.1);
    } catch (e) { }
  };
  beep(); ringT = setInterval(beep, kind === 'in' ? 2000 : 4000);
}
function callNew(o) {
  return CALL = { local: null, remote: null, pc: null, dc: null, t0: 0, timers: [], unsubs: [], mic: true, cam: !!o.video, min: false, together: false, lead: false, ...o };
}
async function callStart(to, video) {
  if (CALL) { toast('Вы уже в звонке'); return; }
  if (LIVE) { toast('Сначала завершите эфир'); return; }
  if (!liveCanCam()) { toast('Этот браузер не умеет звонки — попробуйте Chrome или Safari'); return; }
  let local;
  try { local = await callMedia(video); }
  catch (e) { toast(e?.name === 'NotAllowedError' ? `Нет доступа к микрофону${video ? ' или камере' : ''} — разрешите его в браузере` : `Не получилось включить ${video ? 'камеру' : 'микрофон'}`); return; }
  let ref;
  try { ref = await addDoc(collection(db, 'streams'), { ownerId: uid(), title: video ? 'Видеозвонок' : 'Звонок', mode: 'call', to, live: true, beat: serverTimestamp(), createdAt: serverTimestamp(), endedAt: null }); }
  catch (e) { local.getTracks().forEach(t => t.stop()); toast(errText(e)); return; }
  const C = callNew({ sid: ref.id, host: true, peer: to, video, local, state: 'ring' });
  notify(to, 'call', ref.id, video ? 'Видеозвонок' : 'Звонок');
  C.unsubs.push(onSnapshot(query(collection(db, 'streams', ref.id, 'peers'), where('to', '==', uid())),
    s => s.docChanges().forEach(ch => { if (ch.type === 'added') callAnswer(C, ch.doc); }), e => console.error(e)));
  C.timers.push(setTimeout(() => { if (CALL === C && C.state === 'ring') callEnd('noanswer'); }, 45000));
  C.timers.push(setInterval(() => updateDoc(doc(db, 'streams', C.sid), { beat: serverTimestamp() }).catch(() => { }), 60000));
  ringTone(true, 'out'); liveWake(true); callDom();
}
async function callAnswer(C, snap) {
  const p = snap.data(); if (!p || CALL !== C || p.uid !== C.peer || C.pc) return;   // трубку берёт только тот, кому звонили
  if (p.offer === 'no') { callEnd('declined'); return; }
  C.state = 'connecting'; ringTone(false); callDom();
  const pc = C.pc = new RTCPeerConnection(ICE); callWire(C, pc);
  pc.ondatachannel = e => callChannel(C, e.channel);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: p.offer });
    C.local.getTracks().forEach(t => pc.addTrack(t, C.local));
    await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
    await updateDoc(snap.ref, { answer: pc.localDescription.sdp });
    C.timers.push(setTimeout(() => { if (CALL === C && C.state !== 'live') callEnd('failed'); }, 25000));
  } catch (e) { console.error(e); callEnd('failed'); }
}
function callWire(C, pc) {
  pc.ontrack = e => { C.remote ||= new MediaStream(); if (!C.remote.getTracks().includes(e.track)) C.remote.addTrack(e.track); callAttach(); };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState; if (CALL !== C) return;
    if (st === 'connected' && C.state !== 'live') {
      C.state = 'live'; C.t0 = Date.now(); callDom();
      C.timers.push(setInterval(() => { const el = document.getElementById('callTime'); if (el) el.textContent = fmtDur((Date.now() - C.t0) / 1000); }, 1000));
    } else if (st === 'failed') callEnd('failed');
    else if (st === 'disconnected') setTimeout(() => { if (CALL === C && pc.connectionState !== 'connected') callEnd('lost'); }, 8000);
  };
}
function callChannel(C, dc) {
  C.dc = dc;
  dc.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (CALL !== C) return;
    if (m.t === 'end') callEnd('hangup', true);
    else if (m.t === 'tog') { C.together = !!m.on; C.lead = false; clearInterval(togTimer); toast(m.on ? `🎧 ${(U(C.peer)?.name || 'Собеседник').split(' ')[0]} включает музыку для вас двоих` : '🎧 «Слушать вместе» выключено'); callDom(); }
    else if (m.t === 'mus' && C.together && !C.lead) togetherRecv(C, m);
  };
}
// входящий: уведомление type 'call' свежее 45 секунд, звонок ещё идёт и адресован мне
function callCheck() {
  for (const n of cache.notifs) {
    if (n.type !== 'call' || n.from === uid() || callSeen.has(n.id)) continue;
    callSeen.add(n.id);
    if (Date.now() - ms(n.createdAt) < 45000) callIncoming(n);
  }
}
async function callIncoming(n) {
  if (CALL || LIVE?.host) return;   // занято — у звонящего будет «не отвечает»
  let s = null; try { const d = await getDoc(doc(db, 'streams', n.postId)); s = d.exists() ? d.data() : null; } catch (e) { return; }
  if (!s || !s.live || s.mode !== 'call' || s.to !== uid() || s.ownerId !== n.from || CALL) return;
  ensureUsers([n.from]);
  const C = callNew({ sid: n.postId, host: false, peer: n.from, video: s.title === 'Видеозвонок', nid: n.id, state: 'incoming', cam: false });
  C.unsubs.push(onSnapshot(doc(db, 'streams', C.sid), d => { const x = d.data(); if (CALL === C && (!x || !x.live)) callEnd(C.state === 'live' ? 'hangup' : 'cancelled', true); }, () => { }));
  C.timers.push(setTimeout(() => { if (CALL === C && C.state === 'incoming') callEnd('missed', true); }, 45000));
  ringTone(true, 'in'); try { navigator.vibrate?.([500, 300, 500, 300, 500]); } catch (e) { }
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification(`${U(n.from)?.name || 'Вам'} звонит`, { body: C.video ? 'Видеозвонок в VСмске' : 'Звонок в VСмске', tag: 'call' + C.sid }); } catch (e) { }
  callDom();
}
async function callPick() {
  const C = CALL; if (!C || C.host || C.state !== 'incoming') return;
  ringTone(false); C.state = 'connecting'; callDom(); unnotify(C.nid);
  try { C.local = await callMedia(C.video); C.cam = C.video; }
  catch (e) { toast(`Нет доступа к микрофону${C.video ? ' или камере' : ''} — разрешите его в браузере`); callDecline(); return; }
  if (CALL !== C) { C.local.getTracks().forEach(t => t.stop()); return; }
  const pc = C.pc = new RTCPeerConnection(ICE); callWire(C, pc);
  callChannel(C, pc.createDataChannel('call'));
  C.local.getTracks().forEach(t => pc.addTrack(t, C.local));
  callAttach(); liveWake(true);
  try {
    await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
    const ref = C.peerRef = await addDoc(collection(db, 'streams', C.sid, 'peers'), { uid: uid(), to: C.peer, offer: pc.localDescription.sdp, createdAt: serverTimestamp() });
    C.unsubs.push(onSnapshot(ref, s => { const p = s.data(); if (p?.answer && !pc.remoteDescription) pc.setRemoteDescription({ type: 'answer', sdp: p.answer }).catch(() => callEnd('failed')); }, () => { }));
    C.timers.push(setTimeout(() => { if (CALL === C && C.state !== 'live') callEnd('failed'); }, 25000));
  } catch (e) { console.error(e); callEnd('failed'); }
}
function callDecline() {
  const C = CALL; if (!C || C.host) return;
  addDoc(collection(db, 'streams', C.sid, 'peers'), { uid: uid(), to: C.peer, offer: 'no', createdAt: serverTimestamp() }).catch(() => { });
  unnotify(C.nid); callEnd('', true);
}
async function callEnd(why, remote = false) {
  const C = CALL; if (!C) return; CALL = null;
  if (!remote) callSend({ t: 'end' });
  ringTone(false); liveWake(false); clearInterval(togTimer);
  C.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); C.unsubs.forEach(u => { try { u(); } catch (e) { } });
  setTimeout(() => { try { C.pc?.close(); } catch (e) { } }, 300);
  C.local?.getTracks().forEach(t => t.stop());
  const msg = { noanswer: 'Не отвечает', declined: 'Звонок отклонён', failed: 'Не получилось соединиться', lost: 'Связь пропала', hangup: 'Звонок завершён', cancelled: 'Звонок отменён', missed: 'Пропущенный звонок' }[why];
  if (msg) toast('📞 ' + msg);
  callDom();
  const dur = C.t0 ? Math.round((Date.now() - C.t0) / 1000) : 0;
  if (C.host) {
    try {
      await updateDoc(doc(db, 'streams', C.sid), { live: false, endedAt: serverTimestamp() });
      const s = await getDocs(collection(db, 'streams', C.sid, 'peers')); if (s.size) { const b = writeBatch(db); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
    } catch (e) { }
    sendMessage(C.peer, dur ? `📞 ${C.video ? 'Видеозвонок' : 'Звонок'} · ${fmtDur(dur)}` : `📞 ${why === 'declined' ? 'Звонок отклонён' : 'Пропущенный звонок'}`).catch(() => { });
  } else if (C.peerRef) deleteDoc(C.peerRef).catch(() => { });
}
window.addEventListener('pagehide', () => { const C = CALL; if (!C) return; callSend({ t: 'end' }); if (C.host) updateDoc(doc(db, 'streams', C.sid), { live: false, endedAt: serverTimestamp() }).catch(() => { }); });
function callAttach() {
  const C = CALL; if (!C) return;
  const rv = document.getElementById('callRemote'); if (rv && C.remote && rv.srcObject !== C.remote) { rv.srcObject = C.remote; rv.play().catch(() => { }); }
  const lv = document.getElementById('callLocal'); if (lv && C.local && lv.srcObject !== C.local) { lv.srcObject = C.local; lv.play().catch(() => { }); }
}
function callDom() {
  const box = callBox(), C = CALL;
  if (!C) { box.innerHTML = ''; box.className = ''; return; }
  const u = U(C.peer), name = esc(u?.name || '…'), st = C.state;
  const btn = (act, ic, label, cls = '') => `<button class="call-b ${cls}" data-act="${act}" aria-label="${label}" title="${label}"><span>${ic}</span><small>${label}</small></button>`;
  box.className = `call ${st} ${C.min ? 'min' : ''} ${C.video ? 'video' : ''}`;
  if (C.min) {
    box.innerHTML = `<button class="call-pill" data-act="callmax" aria-label="Открыть звонок">${avatar(u, 30, false)}<span class="grow"><b>${name}</b><small id="callTime">${st === 'live' ? fmtDur((Date.now() - C.t0) / 1000) : 'Соединяем…'}</small></span></button>
      <button class="call-b end sm" data-act="callhang" aria-label="Положить трубку"><span>${I.phone}</span></button>${C.video ? '' : '<audio id="callRemote" autoplay></audio>'}`;
    if (C.video) box.insertAdjacentHTML('beforeend', '<video id="callRemote" autoplay playsinline hidden></video>');
    callAttach(); return;
  }
  const label = { ring: 'Вызываем…', incoming: C.video ? 'Видеозвонок' : 'Звонок', connecting: 'Соединяем…' }[st] || '';
  box.innerHTML = `<div class="call-in" role="dialog" aria-label="Звонок">
    ${C.video ? `<video id="callRemote" class="call-remote" autoplay playsinline></video>` : '<audio id="callRemote" autoplay></audio>'}
    <div class="call-who">${avatar(u, 104, false)}<b>${name}</b><span>${st === 'live' ? `<span id="callTime">${fmtDur((Date.now() - C.t0) / 1000)}</span>${C.together ? ' · 🎧 слушаем вместе' : ''}` : label}</span></div>
    ${C.video && C.local ? '<video id="callLocal" class="call-local" autoplay playsinline muted></video>' : ''}
    <div class="call-bar">${st === 'incoming'
      ? btn('calldecline', I.phone, 'Отклонить', 'end') + btn('callpick', I.phone, 'Ответить', 'pick')
      : btn('callmic', I.mic, C.mic ? 'Микрофон' : 'Без звука', C.mic ? '' : 'off')
        + (C.video ? btn('callcam', I.video, C.cam ? 'Камера' : 'Камера выкл.', C.cam ? '' : 'off') : '')
        + (st === 'live' ? btn('calltog', I.music, C.together ? 'Вместе' : 'Музыка', C.together ? 'on' : '') : '')
        + btn('callmin', I.down, 'Свернуть') + btn('callhang', I.phone, 'Завершить', 'end')}</div>
  </div>`;
  callAttach();
}
// «Слушать вместе»: ведущий раз в 1,5 секунды отправляет, что играет; у второго включается тот же трек с той же секунды
function togetherToggle() {
  const C = CALL; if (!C || C.state !== 'live') return;
  if (C.together && !C.lead) { C.lead = true; } else { C.together = !C.together; C.lead = C.together; }
  callSend({ t: 'tog', on: C.together }); clearInterval(togTimer);
  if (C.together) {
    togTimer = setInterval(togetherSend, 1500); togetherSend();
    toast(curTrack() ? `🎧 ${(U(C.peer)?.name || 'Собеседник').split(' ')[0]} слышит то же, что и вы` : '🎧 Включите трек в ВС Музыке — он заиграет у обоих');
  }
  callDom();
}
function togetherSend() {
  const C = CALL, t = curTrack(); if (!C?.together || !C.lead) return;
  callSend(!t || t.radio ? { t: 'mus', id: null } : { t: 'mus', id: t.id, pos: player.audio.currentTime || 0, paused: player.audio.paused });
}
async function togetherRecv(C, m) {
  if (!m.id || typeof m.id !== 'string') return;
  if (curTrack()?.id !== m.id) {
    if (C.loading === m.id) return; C.loading = m.id;
    if (!trackCache.get(m.id)) await tracksById([m.id]).catch(() => { });
    const t = trackCache.get(m.id); C.loading = null; if (!t || CALL !== C) return;
    player.queue = [t]; player.label = 'Слушаем вместе'; player.stream = false; player.autoNext = false; await playAt(0);
  }
  const a = player.audio, pos = Number(m.pos) || 0;
  if (a.duration && Math.abs(a.currentTime - pos) > 2) a.currentTime = Math.min(pos, a.duration - 0.5);
  if (m.paused && !a.paused) a.pause(); else if (!m.paused && a.paused) a.play().catch(() => { });
}

/* 7.0: «нравится» у записи — кнопкой или двойным тапом по фото (двойной тап только ставит, не снимает) */
let imgTap = {};
async function togglePostLike(id, onlyAdd = false) {
  const p = findPost(id); if (!p) return;
  const had = (p.likes || []).includes(uid()), nid = `like_${id}_${uid()}`;
  if (had && onlyAdd) return;
  try { navigator.vibrate?.(had ? 0 : 10); } catch (e) { }
  await updateDoc(doc(db, 'posts', id), { likes: had ? arrayRemove(uid()) : arrayUnion(uid()) });
  if (p.authorId !== uid()) { if (had) unnotify(nid); else notify(p.authorId, 'like', id, p.text || (p.poll ? p.poll.q : 'Фото'), nid); }
}
function tapHeart(x, y) {
  const h = document.createElement('span'); h.className = 'tap-heart fixed'; h.innerHTML = I.heart;
  h.style.left = x + 'px'; h.style.top = y + 'px'; h.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
  document.body.appendChild(h); setTimeout(() => h.remove(), 900);
}
/* 7.0: обои чата (хранятся на устройстве: для каждого диалога или сразу для всех) */
const WALLS = [['none', 'Без обоев'], ['dusk', 'Сумерки'], ['ocean', 'Океан'], ['sunset', 'Закат'], ['mint', 'Мята'], ['night', 'Ночь'], ['dots', 'Горошек'], ['waves', 'Волны'], ['hearts', 'Сердечки']];
const wallsGet = () => { try { const w = JSON.parse(lsGet('vs_walls') || '{}'); return w && typeof w === 'object' ? w : {}; } catch (e) { return {}; } };
const wallOf = key => { const w = wallsGet(), v = w[key] || w['*'] || 'none'; return WALLS.some(x => x[0] === v) ? v : 'none'; };
const wallCls = key => { const w = wallOf(key); return w === 'none' ? '' : 'wall wall-' + w; };
function wallPanel(key) {
  const cur = wallOf(key);
  return `<div class="wall-pick"><div class="wall-sw">${WALLS.map(([k, l]) => `<button class="wall-o wall-${k} ${cur === k ? 'on' : ''}" data-act="wallset" data-v="${k}" data-key="${esc(key)}" aria-pressed="${cur === k}"><span>${l}</span></button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="small muted">Обои видны только вам</span>
      <button class="btn ghost small" data-act="wallall" data-key="${esc(key)}">Поставить во все чаты</button></div></div>`;
}
function replyToMsg(id) {
  const m = cache.messages.find(x => x.id === id); if (!m) return;
  S.replyTo = { id: m.id, from: m.from, text: (m.text || (m.image ? '📷 Фото' : m.audio ? '🎤 Голосовое' : '')).slice(0, 100) };
  S.msgSel = null; render(); document.getElementById('msgInput')?.focus();
}
// свайп сообщения вправо — ответить (на телефоне)
let swipeMsg = null;
document.addEventListener('touchstart', e => { const m = e.target.closest?.('.msgs .msg[data-id]'); swipeMsg = m && e.touches.length === 1 ? { el: m, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, lock: null } : null; }, { passive: true });
document.addEventListener('touchmove', e => {
  const s = swipeMsg; if (!s) return;
  const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (s.lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.lock = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
  if (s.lock !== 'x') return;
  s.dx = Math.max(0, Math.min(90, dx)); s.el.style.transform = `translateX(${s.dx}px)`; s.el.classList.toggle('swipe-ok', s.dx > 60);
}, { passive: true });
document.addEventListener('touchend', () => {
  const s = swipeMsg; swipeMsg = null; if (!s || s.lock !== 'x') return;
  s.el.style.transition = 'transform .2s'; s.el.style.transform = ''; s.el.classList.remove('swipe-ok'); setTimeout(() => { s.el.style.transition = ''; }, 220);
  if (s.dx > 60) { try { navigator.vibrate?.(10); } catch (e) { } replyToMsg(s.el.dataset.id); }
});
// поле сообщения: пока пусто — микрофон, когда есть текст — кнопка «отправить»
document.addEventListener('input', e => { if (e.target.id === 'msgInput') e.target.closest('form')?.classList.toggle('has-text', !!e.target.value.trim()); });
/* 7.0: окно «Что нового» */
const WN_VER = '7.0';
const WN_ITEMS = [
  ['🎬', 'ВС Клипы', 'Короткие видео во весь экран: листай свайпом, двойной тап — «нравится», звук одной кнопкой.', 'clips', 'Смотреть'],
  ['📺', 'Новое ВС Видео', 'Главная с большим роликом, полками и «Популярным», а после видео само включается следующее.', 'video', 'Открыть'],
  ['❤️', 'Двойной тап по фото', 'В ленте теперь можно лайкнуть фото двойным касанием — вылетит сердечко.', '', ''],
  ['✍️', 'Разметка текста', 'Пиши **жирный**, *курсив*, ~~зачёркнутый~~, ||спойлер|| и `код` — в записях, комментариях и чатах. В новой записи есть кнопка «Aa».', '', ''],
  ['🎨', 'Обои в чатах', 'Кнопка 🎨 в шапке диалога. А свайп сообщения вправо — быстрый ответ.', 'im', 'В чаты'],
  ['🌊', 'Плавнее и быстрее', 'Страницы сменяются плавно, а вместо крутилки — аккуратные заготовки, пока всё грузится.', '', ''],
];
function whatsNewModal() {
  return `<div class="ov wn-ov" data-act="wnclose"><div class="ov-in modal wn" data-stop="1" role="dialog" aria-label="Что нового">
    <div class="wn-head"><i></i><i></i><i></i><span class="wn-kick">Обновление</span><b class="wn-title">VСмске 7.0</b><span class="wn-sub">Самое большое обновление — смотри, что нового</span>
      <button class="icon-btn wn-x" data-act="wnclose" aria-label="Закрыть">✕</button></div>
    <div class="wn-list">${WN_ITEMS.map(([e, t, d, href, btn]) => `<div class="wn-item"><span class="wn-ic">${e}</span><span class="grow"><b>${t}</b><span>${tagify(d)}</span></span>
      ${href ? `<button class="btn sec small" data-act="wngo" data-href="${href}">${btn}</button>` : ''}</div>`).join('')}</div>
    <button class="btn wn-ok" data-act="wnclose">Круто, понятно</button></div></div>`;
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
  if (S.game === 'sudoku') return viewSudoku(back);
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
      <a class="app-tile c-calc" href="#games/sudoku"><span class="app-ico g-ico">🔢</span><b>Судоку</b><span class="muted small">Три уровня · рекорд ${lsGet('vs_sudoku_easy') ? clock(Number(lsGet('vs_sudoku_easy'))) : '—'}</span></a>
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
const NOTIF_TEXT = { like: 'оценил(а) вашу запись', comment: 'прокомментировал(а) вашу запись', wall: 'написал(а) у вас на стене', friend: 'принял(а) вашу заявку в друзья', repost: 'поделился(ась) вашей записью', mention: 'упомянул(а) вас', gift: 'сделал(а) вам подарок', answer: 'ответил(а) на ваш вопрос', best: 'выбрал(а) ваш ответ лучшим', nick: 'подарил(а) вам коллекционный юзернейм 💎', call: 'звонил(а) вам' };
function viewNotifs() {
  const list = cache.notifs.filter(n => n.from !== S.me.id);
  return `<div class="card"><div class="pad" style="padding-bottom:4px"><h1 class="h">Уведомления <span class="muted">${list.length}</span></h1></div>
    <div class="ulist">${list.length ? list.map(n => {
      const u = U(n.from); if (!u) return '';
      const href = n.type === 'call' ? '#im/' + n.from : n.type === 'gift' || n.type === 'nick' ? '#id/' + uid() : n.type === 'friend' ? '#id/' + n.from : ['answer', 'best'].includes(n.type) ? '#q/' + n.postId : n.postId ? '#post/' + n.postId : '#id/' + n.from;
      return `<a class="uitem notif" href="${esc(href)}" style="color:var(--fg)">${avatar(u, 46, false)}
        <div class="grow" style="min-width:0"><b>${esc(u.name)}</b> ${NOTIF_TEXT[n.type] || ''}
          ${n.text ? `<div class="muted small notif-text">«${esc(plainText(n.text))}»</div>` : ''}<div class="muted small">${ago(n.createdAt)}</div></div>
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
  const recapCard = lsGet('vs_recap_seen') === recapMonth() ? '' : `<div class="card recap-card"><button class="recap-open" data-act="recap"><span class="recap-ico">✨</span>
    <span class="grow"><b>Твои итоги в VСмске готовы</b><span class="small">Лайки, лучшая запись, главный фанат — смотри как в Wrapped</span></span><span class="recap-go">Смотреть</span></button>
    <button class="icon-btn recap-hide" data-act="recaphide" aria-label="Скрыть">✕</button></div>`;
  return `${storiesBar()}${liveNowCard()}${recapCard}${bdays.length ? `<div class="card pad bday-card"><b>🎂 Сегодня день рождения</b>
      ${bdays.map(u => `<div class="row">${avatar(u, 36)}<span class="grow">${nameLink(u)}</span><a class="btn sec small" href="#im/${esc(u.id)}">Поздравить</a></div>`).join('')}</div>` : ''}
  ${MD() ? `<button class="md-prompt" data-act="mdcompose">${avatar(S.me, 40, false)}<span>Что у вас нового?</span>${I.photo}</button>` : composer(S.me.id, 'Что у вас нового?')}
  <div class="card"><div class="tabs">${tab('friends', 'Друзья')}${tab('top', '🔥 Популярное')}${tab('all', 'Все записи')}</div></div>
  ${S.loading ? loadingBox() : posts.length ? posts.map(postCard).join('') :
    `<div class="card empty"><b>${S.feedTab === 'friends' ? 'Здесь появятся записи ваши и ваших друзей' : S.feedTab === 'top' ? 'За неделю пока ничего не залайкали' : 'Пока никто ничего не написал'}</b>
     <span>Напишите первую запись или найдите знакомых.</span><a class="btn sec" href="#people">Найти людей</a></div>`}`;
}

const EMOJI = '😀 😂 🥲 😍 😘 😎 🤔 😴 😭 😡 🥳 😇 🙃 😉 🤗 🤯 👍 👎 👏 🙏 💪 🤝 👋 ✌️ ❤️ 🧡 💛 💚 💙 💜 🔥 ✨ 🎉 🎂 🎁 ⚽ 🎮 🎵 📷 🌞 🌙 ⭐ 🌈 🍕 🍔 ☕ 🐱 🐶'.split(' ');
const emojiPanel = target => S.emoji === target
  ? `<div class="emoji" role="group" aria-label="Смайлики">${EMOJI.map(e => `<button type="button" data-act="emoji" data-t="${target}" data-e="${e}">${e}</button>`).join('')}</div>` : '';
const emojiBtn = (target, cls = 'icon-btn') => `<button type="button" class="${cls}" data-act="emojis" data-t="${target}" aria-label="Смайлики" aria-expanded="${S.emoji === target}">😊</button>`;
// 7.0: кнопки разметки — оборачивают выделенный текст значками (**…**, *…*, ~~…~~, ||…||, `…`)
const FMT_MARKS = [['**', '<b>Ж</b>', 'Жирный'], ['*', '<i>К</i>', 'Курсив'], ['~~', '<s>З</s>', 'Зачёркнутый'], ['||', '▒', 'Спойлер'], ['`', '{ }', 'Код']];
const fmtPanel = target => S.fmt === target ? `<div class="fmt-bar" role="group" aria-label="Разметка текста">${FMT_MARKS.map(([m, l, t]) => `<button type="button" data-act="fmtwrap" data-t="${target}" data-m="${m}" title="${t}" aria-label="${t}">${l}</button>`).join('')}
  <span class="small muted">Выделите слова и нажмите</span></div>` : '';
const fmtBtn = target => `<button type="button" class="icon-btn" data-act="fmts" data-t="${target}" aria-label="Разметка текста" aria-expanded="${S.fmt === target}" title="Разметка: жирный, курсив, спойлер"><b class="fmt-aa">Aa</b></button>`;
function fmtWrap(id, mark) {
  const el = document.getElementById(id); if (!el) return;
  const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a, sel = el.value.slice(a, z);
  if (el.value.length + mark.length * 2 > (el.maxLength > 0 ? el.maxLength : 1e9)) return;
  el.value = el.value.slice(0, a) + mark + sel + mark + el.value.slice(z);
  el.focus(); el.setSelectionRange(a + mark.length, a + mark.length + sel.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
// кнопка разметки не забирает фокус (на телефоне не прячется клавиатура и не теряется выделение)
document.addEventListener('pointerdown', e => { if (e.target.closest?.('[data-act=fmtwrap]')) e.preventDefault(); });
// Ctrl/⌘+B — жирный, Ctrl/⌘+I — курсив в полях записи, комментария и сообщения
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !['KeyB', 'KeyI'].includes(e.code)) return;
  const el = e.target; if (!el?.id || !(el.id === 'postText' || el.id === 'msgInput' || el.id.startsWith('c_'))) return;
  e.preventDefault(); fmtWrap(el.id, e.code === 'KeyB' ? '**' : '*');
});

function composer(wallId, ph, g = null) {
  if (banOf(S.me)) return '';
  const d = S.draft;
  return `<div class="card pad composer"><form data-form="post" data-wall="${esc(wallId)}" ${g ? 'data-group="1"' : ''}>
    <div class="row" style="align-items:flex-start">${g ? groupAvatar(g, 40, false) : avatar(S.me, 40, false)}
      <textarea id="postText" rows="2" placeholder="${esc(ph)}" maxlength="4000">${esc(lsGet('vs_draft') || '')}</textarea></div>
    ${d.files.length ? `<div class="filters" role="radiogroup" aria-label="Фильтр для фото">${Object.entries(PHOTO_FILTERS).map(([k, l]) => `<button type="button" role="radio" aria-checked="${(d.filter || 'none') === k}" class="${(d.filter || 'none') === k ? 'on' : ''}" data-act="pfilter" data-f="${k}"><img src="${d.files[0].url}" alt="" style="filter:${FILTER_CSS[k]}"><span>${l}</span></button>`).join('')}</div>` : ''}
    ${d.files.length ? `<div class="previews n${d.files.length}">${d.files.map((f, i) => `<div class="preview"><img src="${f.url}" alt="Фото ${i + 1}" style="filter:${FILTER_CSS[d.filter || 'none']}"><button type="button" data-act="unattach" data-i="${i}" aria-label="Убрать фото">×</button></div>`).join('')}</div>` : ''}
    ${d.poll ? `<div class="poll-form">
      <div class="field"><label for="pollQ">Вопрос опроса</label><input id="pollQ" maxlength="200" placeholder="Куда пойдём в субботу?"></div>
      ${Array.from({ length: d.pollN }, (_, i) => `<input id="pollO${i}" maxlength="80" placeholder="Вариант ${i + 1}">`).join('')}
      <div class="row">${d.pollN < 6 ? `<button type="button" class="btn ghost small" data-act="polladd">+ Вариант</button>` : ''}<span class="grow"></span>
        <button type="button" class="btn ghost small" data-act="polltoggle">Убрать опрос</button></div></div>` : ''}
    ${emojiPanel('postText')}${fmtPanel('postText')}
    <div class="composer-bar"><button type="button" class="icon-btn" data-act="attach">${I.photo}<span class="small">Фото</span></button>
      ${d.poll ? '' : `<button type="button" class="icon-btn" data-act="polltoggle">${I.poll}<span class="small">Опрос</span></button>`}
      ${emojiBtn('postText')}${fmtBtn('postText')}
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
      : p.text ? `<div class="post-text">${linkify(p.text)}</div>${trackEmbed(p.text)}` : ''}
    ${postImages(p)}
    ${pollHtml(p)}
    ${p.repostOf ? repostHtml(p.repostOf) : ''}
    <div class="post-actions">
      <button class="pill ${liked ? 'liked' : ''}" data-act="like" data-id="${esc(p.id)}" aria-pressed="${liked}" aria-label="Нравится">${liked ? I.heart : I.heartO}${likes.length || ''}</button>
      <button class="pill" data-act="togglec" data-id="${esc(p.id)}" aria-label="Комментарии">${I.comment}${n || ''}</button>
      <button class="pill" data-act="repost" data-id="${esc(p.id)}" aria-label="Поделиться у себя на стене" title="Поделиться у себя на стене">${I.repost}${p.reposts || ''}</button>
      <span class="grow"></span>
      <button class="pill" data-act="copy" data-text="${esc(siteUrl('post/' + p.id))}" aria-label="Скопировать ссылку на запись">${I.link}</button>
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
  return `<div class="msg ${mine ? 'me' : ''} ${img ? 'has-img' : ''} ${sel ? 'sel' : ''} ${jumbo ? 'jumbo' : ''}" data-act="selmsg" data-id="${esc(m.id)}">${who}${quote}${fwd}${img ? `<img class="msg-img" src="${esc(img)}" alt="Фото" data-act="viewimg" data-kind="msg" data-id="${esc(m.id)}">` : ''}${typeof m.audio === 'string' && m.audio.startsWith('data:audio/') ? voiceHtml(m) : typeof m.audio === 'string' && m.audio.startsWith('data:video/') ? vnoteHtml(m) : ''}${m.text ? `<span>${linkify(m.text)}</span>${trackEmbed(m.text)}` : ''}${reactsHtml(m, id)}<time>${m.edited ? 'изменено · ' : ''}${hm(new Date(ms(m.createdAt)))}${ticks}</time>${sel ? `<div class="react-pick">${REACTS.map(e => `<button data-act="react" data-id="${esc(m.id)}" data-e="${e}" aria-label="Реакция ${e}">${e}</button>`).join('')}</div><div class="msg-acts"><button data-act="replymsg" data-id="${esc(m.id)}">${I.reply}Ответить</button><button data-act="fwdmsg" data-id="${esc(m.id)}">↪ Переслать</button>${mine && m.text && !fw ? `<button data-act="editmsg" data-id="${esc(m.id)}">✏️ Изменить</button>` : ''}${mine ? `<button data-act="delmsg" data-id="${esc(m.id)}">${S.confirm === 'msg:' + m.id ? 'Удалить у всех?' : 'Удалить'}</button>` : ''}</div>` : ''}</div>`;
}
const searchBar = () => `<div class="msg-search">${I.search}<input id="mq" type="search" placeholder="Поиск в этом диалоге" autocomplete="off" value="${esc(S.mq || '')}"><button class="icon-btn" data-act="mqtoggle" aria-label="Закрыть поиск">✕</button></div>`;
const roomAvatar = (c, size) => `<span class="av room-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px">${esc(initials(c?.name || 'Б'))}</span>`;

// Поле ввода внизу чата (общее для диалога и беседы)
function chatForm(key) {
  if (banOf(S.me)) return `<div class="chat-form muted small" style="justify-content:center">Ваш аккаунт заблокирован — писать сообщения нельзя</div>`;
  if (S.rec) return `<div class="chat-form rec-bar"><span class="rec-dot"></span><b id="recTime" class="tnum">${fmtDur((Date.now() - S.rec.started) / 1000)}</b><span class="grow muted small">Идёт запись, до 1 минуты</span>
          <button type="button" class="btn ghost" data-act="reccancel">Отмена</button><button type="button" class="btn" data-act="recsend">${I.send}</button></div>`;
  return `<form class="chat-form" data-form="msg" data-to="${esc(key)}"><button type="button" class="icon-btn" data-act="msgphoto" aria-label="Отправить фото" ${S.busy ? 'disabled' : ''}>${I.photo}</button>${emojiBtn('msgInput')}<input id="msgInput" placeholder="Сообщение" maxlength="2000" autocomplete="off"><button type="button" class="icon-btn" data-act="vnote" aria-label="Видеокружок" title="Видеокружок">${I.video}</button><button type="button" class="icon-btn" data-act="mic" aria-label="Записать голосовое">${I.mic}</button><button class="btn" aria-label="Отправить">${I.send}</button></form>`;
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
        <button class="icon-btn" data-act="wallpick" aria-label="Обои чата" aria-expanded="${!!S.wallPick}" title="Обои чата">🎨</button>
        <button class="icon-btn" data-act="mqtoggle" aria-label="Поиск по сообщениям">${I.search}</button>
        <button class="icon-btn" data-act="roominfo" aria-label="Участники" aria-expanded="${!!S.roomInfo}">${I.friends}</button></div>
      ${S.roomInfo ? roomPanel(c) : ''}
      ${S.wallPick ? wallPanel(key) : ''}${S.mqOpen ? searchBar() : ''}<div class="msgs ${wallCls(key)}">${mq ? found() : body(null, 'Напишите первое сообщение в беседу')}</div>
      ${replyBar((U(rp?.from)?.name || '').split(' ')[0])}${emojiPanel('msgInput')}${chatForm(key)}`;
  } else {
    const o = key && U(key), self = key === id;
    if (key && !o) chatHtml = '<div class="loading"><div class="spin"></div></div>';
    if (o) {
      const chat = cache.chats.find(c => c.id === chatId(id, key));
      const peerRead = self ? null : chat?.read?.[key] ? ms(chat.read[key]) : 0;
      chatHtml = `<div class="chat-head"><a class="icon-btn back" href="#im" aria-label="К диалогам">${I.back}</a>${self ? `<span class="av fav" style="width:38px;height:38px">★</span>` : avatar(o, 38)}
        <div class="grow">${self ? '<b>Избранное</b>' : nameLink(o)}<div class="small seen ${!self && isOnline(o) ? 'on' : ''}">${self ? 'Только для вас' : esc(seenText(o) || o.city || '@' + (o.nick || ''))}</div></div>
        ${!self && !o.deleted && !iBlocked(o.id) && !blockedMe(o) ? `<button class="icon-btn" data-act="call" data-id="${esc(o.id)}" data-v="0" aria-label="Позвонить" title="Позвонить">${I.phone}</button><button class="icon-btn" data-act="call" data-id="${esc(o.id)}" data-v="1" aria-label="Видеозвонок" title="Видеозвонок">${I.video}</button>` : ''}
        <button class="icon-btn" data-act="wallpick" aria-label="Обои чата" aria-expanded="${!!S.wallPick}" title="Обои чата">🎨</button>
        <button class="icon-btn" data-act="mqtoggle" aria-label="Поиск по сообщениям">${I.search}</button></div>
        ${S.wallPick ? wallPanel(key) : ''}${S.mqOpen ? searchBar() : ''}<div class="msgs ${wallCls(key)}">${mq ? found() : body(peerRead, self ? 'Сохраняйте сюда заметки, ссылки и фото — их видите только вы' : 'Напишите ' + esc(o.name.split(' ')[0]) + ' первым')}</div>
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
      <div class="last">${c.fresh ? 'Новый диалог' : esc(prefix + plainText(c.lastText))}</div></div>${unread ? '<span class="dot" aria-label="Непрочитано"></span>' : ''}</a>`;
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
  if (!['livestop', 'statclear', 'pldel', 'nickdel', 'delpost', 'unfriend', 'delvideo', 'delalbum', 'delfile', 'delphoto', 'delmsg', 'postmenu', 'block', 'rpost', 'profmenu', 'roomdel', 'roominfo', 'storydel', 'qdel', 'maildel', 'notedel', 'lotdel', 'tdel', 'evdel'].includes(act)) S.confirm = null;
  if (!['selmsg', 'delmsg', 'replymsg', 'playvoice', 'fwdmsg', 'editmsg'].includes(act)) S.msgSel = null;
  if (!['profmenu', 'block', 'modopen', 'ban', 'unban', 'report', 'qr'].includes(act)) S.profMenu = false;
  if (!['postmenu', 'delpost', 'pinpost'].includes(act)) S.postMenu = null;
  if (!['tmenu', 'tdel'].includes(act)) S.tmenu = null;
  if (!['emoji', 'emojis'].includes(act)) S.emoji = null;
  if (!['fmts', 'fmtwrap', 'emoji', 'emojis'].includes(act)) S.fmt = null;
  try {
    switch (act) {
      case 'recap': openRecap(); break;
      case 'recapnav': recapGo(Number(b.dataset.d)); break;
      case 'recapclose': S.recap = null; clearInterval(recapTick); render(); break;
      case 'recapshare': await recapShare(); break;
      case 'palopen': palOpen(); break;
      case 'palgo': palGo(Number(b.dataset.i)); break;
      case 'palx': S.pal = null; render(); break;
      case 'recaphide': lsSet('vs_recap_seen', recapMonth()); render(); break;
      case 'mdcompose': S.compose = true; S.drawer = false; render(); setTimeout(() => document.getElementById('postText')?.focus(), 60); break;
      case 'mddrawer': S.drawer = !S.drawer; render(); break;
      case 'mdclose': S.compose = false; S.drawer = false; render(); break;
      case 'authtab': S.authTab = b.dataset.tab; S.authError = ''; S.fatal = null; render(); break;
      case 'google': {
        S.authError = '';
        if (isStandalone()) { await googleGo(); break; }   // с иконки на главном экране — без всплывающего окна
        const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
        try { await signInWithPopup(auth, p); }
        catch (err) {
          if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') await googleGo();
          else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') { S.authError = errText(err); render(); }
        }
        break;
      }
      case 'reset': {
        const email = document.getElementById('aEmail')?.value.trim();
        if (!email) { S.authError = 'Введите почту, на неё придёт ссылка для сброса пароля.'; render(); return; }
        await sendPasswordResetEmail(auth, email); S.authError = ''; render(); toast('Письмо для сброса пароля отправлено на ' + email); break;
      }
      case 'logout': await signOut(auth); history.replaceState(null, '', BASE); break;
      case 'feedtab': S.feedTab = b.dataset.tab; attachView(); break;
      case 'like': await togglePostLike(id); break;
      case 'spoiler': spoilersOpen.add(b.textContent); b.classList.add('show'); break;
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
      case 'copylink': await copyText(siteUrl('video/' + id), 'Ссылка на видео скопирована'); break;
      case 'videoadd': S.videoAdd = !(S.videoAdd || S.linkForm || S.videoDraft); if (!S.videoAdd) { S.linkForm = false; S.videoDraft = null; } render(); break;
      case 'vdesc': S.vdescOpen = S.vdescOpen === id ? null : id; render(); break;
      case 'vautoplay': lsSet('vs_vauto', vAutoplay() ? '0' : '1'); render(); break;
      case 'vnextgo': clearInterval(vNextTimer); go('video/' + id); break;
      case 'vnextno': clearInterval(vNextTimer); document.querySelector('#player .vnext')?.remove(); break;
      case 'cliptap': {
        const el = b.closest('.clip'), now = Date.now();
        if (now - clipTapT < 320) { clearTimeout(clipTapTimer); clipTapT = 0; clipHeart(el, e.clientX, e.clientY); clipLike(id, true); break; }
        clipTapT = now; clearTimeout(clipTapTimer); clipTapTimer = setTimeout(() => clipToggle(el), 300); break;
      }
      case 'cliplike': clipLike(id); break;
      case 'call': callStart(id, b.dataset.v === '1'); break;
      case 'callpick': callPick(); break;
      case 'calldecline': callDecline(); break;
      case 'callhang': callEnd(CALL?.state === 'ring' ? 'cancelled' : 'hangup'); break;
      case 'callmin': if (CALL) { CALL.min = true; callDom(); } break;
      case 'callmax': if (CALL) { CALL.min = false; callDom(); } break;
      case 'calltog': togetherToggle(); break;
      case 'callmic': if (CALL?.local) { CALL.mic = !CALL.mic; CALL.local.getAudioTracks().forEach(t => { t.enabled = CALL.mic; }); callDom(); } break;
      case 'callcam': if (CALL?.local) { CALL.cam = !CALL.cam; CALL.local.getVideoTracks().forEach(t => { t.enabled = CALL.cam; }); callDom(); } break;
      case 'clipcmt': case 'vcmt': openVcmt(id); break;
      case 'vcclose': closeVcmt(); break;
      case 'vcdel': if (S.vcmt) await deleteDoc(doc(db, 'videos', S.vcmt.id, 'comments', id)); break;
      case 'clipshare': await copyText(siteUrl('clips/' + id), 'Ссылка на клип скопирована'); break;
      case 'clipmute': { S.clipMuted = !S.clipMuted; document.querySelectorAll('#clipsFeed video').forEach(v => { v.muted = S.clipMuted; }); clipMuteUi();
        const v = document.querySelector('#clipsFeed .clip.on video'); if (v && !S.clipMuted) { v.play().catch(() => { }); if (!player.audio.paused) player.audio.pause(); } break; }
      case 'clipstep': clipStep(Number(b.dataset.d)); break;
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
      case 'skin': lsSet('vs_skin', b.dataset.v); applySkin(); render(); break;
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
      case 'replymsg': replyToMsg(id); break;
      case 'wnclose': lsSet('vs_seen_ver', WN_VER); S.whatsNew = false; render(); break;
      case 'wngo': lsSet('vs_seen_ver', WN_VER); S.whatsNew = false; go(b.dataset.href); break;
      case 'whatsnew': S.whatsNew = true; S.drawer = false; render(); break;
      case 'wallpick': S.wallPick = !S.wallPick; render(); break;
      case 'wallset': { const w = wallsGet(); w[b.dataset.key] = b.dataset.v; lsSet('vs_walls', JSON.stringify(w)); render(); break; }
      case 'wallall': { const w = wallsGet(), cur = wallOf(b.dataset.key); for (const k of Object.keys(w)) delete w[k]; w['*'] = cur; lsSet('vs_walls', JSON.stringify(w)); toast('Обои поставлены во все чаты'); S.wallPick = false; render(); break; }
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
      case 'fmts': S.fmt = S.fmt === b.dataset.t ? null : b.dataset.t; render(); break;
      case 'fmtwrap': fmtWrap(b.dataset.t, b.dataset.m); break;
      case 'emoji': {
        const el = document.getElementById(b.dataset.t); if (!el) return;
        const at = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? at, em = b.dataset.e;
        el.value = el.value.slice(0, at) + em + el.value.slice(end);
        el.focus(); el.setSelectionRange(at + em.length, at + em.length); break;
      }
      case 'viewimg': {
        if (b.dataset.kind === 'post') {
          const now = Date.now();
          if (imgTap.id === id && now - imgTap.t < 320) { clearTimeout(imgTap.timer); imgTap = {}; tapHeart(e.clientX, e.clientY); await togglePostLike(id, true); break; }
          clearTimeout(imgTap.timer); imgTap = { id, t: now, timer: setTimeout(() => { imgTap = {}; const pp = findPost(id), i = Number(b.dataset.i) || 0, src = pp ? (pp.images?.[i] || pp.image) : null; if (safeImg(src)) { S.viewImg = src; render(); } }, 300) };
          break;
        }
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
      case 'vseek': { const m = cache.messages.find(x => x.id === id), r = b.getBoundingClientRect(); if (m?.audio) playVoice(m, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); break; }
      case 'vspeed': { const n = { 1: 1.5, 1.5: 2, 2: 1 }[vSpeed()]; lsSet('vs_vspeed', String(n)); players.forEach(p => { p.playbackRate = n; }); render(); break; }
      case 'vnote': vnoteOpen(); break;
      case 'vnotego': vnoteGo(); break;
      case 'vnotex': vnoteClose(false); break;
      case 'vnoteplay': { const v = vnoteEls.get(id); if (!v) break; const on = !v.muted && !v.paused;
        vnoteEls.forEach(x => { if (x !== v) { x.muted = true; x.closest('.vnote')?.classList.remove('on'); } });
        if (on) { v.muted = true; b.classList.remove('on'); } else { v.muted = false; v.currentTime = 0; v.play().catch(() => { }); b.classList.add('on'); } break; }
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
      case 'liveform': S.liveForm = { mode: liveCanScreen() ? 'screen' : 'camera', facing: 'user', rec: false, title: '' }; render(); setTimeout(() => document.getElementById('lvTitle')?.focus(), 60); break;
      case 'liveformx': S.liveForm = null; render(); break;
      case 'livemode': case 'livefacing': case 'liverec': { const f = S.liveForm; if (!f) break; f.title = document.getElementById('lvTitle')?.value ?? f.title;
        if (act === 'livemode') f.mode = b.dataset.v; else if (act === 'livefacing') f.facing = b.dataset.v; else f.rec = !f.rec; render(); break; }
      case 'livejoin': await liveJoin(id); break;
      case 'livetry': if (LIVE) { LIVE.tried?.clear(); liveConnect(LIVE, 0); } break;
      case 'livestop': { const host = LIVE?.host; if (host && !twoStep('livestop')) return; await liveStop(); if (S.view !== 'live' || !S.liveId) render(); break; }
      case 'liveclose': await updateDoc(doc(db, 'streams', id), { live: false, endedAt: serverTimestamp() }).catch(e => toast(errText(e))); break;
      case 'livemic': { const L = LIVE; if (!L?.stream) break; L.micOff = !L.micOff; L.stream.getAudioTracks().forEach(t => { t.enabled = !L.micOff; }); render(); break; }
      case 'liveflip': { const L = LIVE; if (!L?.host || L.mode !== 'camera') break; const next = L.facing === 'user' ? 'environment' : 'user';
        try { const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } } }), nt = ns.getVideoTracks()[0], old = L.stream.getVideoTracks()[0];
          L.stream.addTrack(nt); L.stream.removeTrack(old); old.stop(); L.facing = next;
          L.kids.forEach(k => k.pc.getSenders().forEach(sn => { if (sn.track?.kind === 'video') sn.replaceTrack(nt).catch(() => { }); }));
          const v = document.getElementById('liveVid'); if (v) v.srcObject = L.stream; }
        catch (e) { toast('Не получилось переключить камеру'); } break; }
      case 'livefs': { const st = document.getElementById('liveStage'), v = document.getElementById('liveVid'); (st?.requestFullscreen || st?.webkitRequestFullscreen)?.call(st); if (!document.fullscreenEnabled && v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); break; }
      case 'livesound': { const v = document.getElementById('liveVid'); if (v) { v.muted = false; v.play().catch(() => { }); } b.hidden = true; break; }
      case 'livemute': if (LIVE?.host) { LIVE.muted.add(b.dataset.u); toast('Участник заглушён до конца эфира'); } break;
      case 'liverecx': if (S.liveRec) URL.revokeObjectURL(S.liveRec.url); S.liveRec = null; render(); break;
      case 'livesave': { const r = S.liveRec; if (!r) break; const a = document.createElement('a'); a.href = r.url; a.download = ('Эфир ' + r.title).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 100) + (/mp4/.test(r.blob.type) ? '.mp4' : '.webm'); document.body.append(a); a.click(); a.remove(); break; }
      case 'livepub': await livePublish(); break;
      case 'tmtab': case 'tmgo': case 'tmlap': case 'tmreset': case 'tmset': case 'tmcustom': case 'tmskip': tmAction(act, b); break;
      case 'calck': case 'calcc': case 'calcbs': case 'calceq': case 'calcneg': case 'calcsqrt': calcAction(act, b.dataset.v); break;
      case 'calch': { const h = calcHist()[Number(b.dataset.i)]; if (h) { S.calc = { e: h.r.replace(',', '.').replace(/[^0-9.\-e]/g, ''), last: h.e + ' =', done: true }; render(); } break; }
      case 'calchc': lsSet('vs_calc', '[]'); render(); break;
      case 'dicemode': case 'dicen': case 'diceroll': case 'diceshuf': diceAction(act, b); break;
      case 'sdknew': case 'sdksel': case 'sdknum': case 'sdkhint': sdkAction(act, b); break;
      case 'keys': S.keys = true; render(); break;
      case 'keysx': S.keys = false; render(); break;
      // ---- ВС Музыка
      case 'tfcover': pick('tfcover', 'image/*', false); break;
      case 'tfnocover': if (S.trackForm) { S.trackForm.cover = ''; render(); } break;
      case 'tedit': { S.tmenu = null; const t = id === 'cur' ? curTrack() : trackCache.get(id) || (cache.tracks || []).find(x => x.id === id); if (t && t.ownerId === uid()) openTrackEdit(t); break; }
      case 'pickmusic': pick('music', 'audio/*', true); break;
      case 'mplay2': musicPlay(b.dataset.list, Number(b.dataset.i)); break;
      case 'mlistplay': {
        const key = b.dataset.list, list = musicList(key);
        if (!b.dataset.shuffle && curTrack() && list.some(t => t.id === curTrack().id) && (key !== 'stream' || player.stream)) { player.audio.paused ? player.audio.play() : player.audio.pause(); break; }
        musicPlay(key, 0, !!b.dataset.shuffle); break;
      }
      case 'mstream':
        if (player.stream && curTrack()) { player.audio.paused ? player.audio.play() : player.audio.pause(); break; }
        if (!cache.mus?.stream?.length) await loadStream(true);
        musicPlay('stream', 0); break;
      case 'mstreamorder': lsSet('vs_stream_order', streamOrder() === 'desc' ? 'old' : 'new'); await loadStream(true); render(); break;
      case 'mstreammore': await loadStream(false); render(); break;
      case 'tdl': { S.tmenu = null; const t = findTrack(id); if (!t || t.radio) break;
        toast('⬇ Готовим файл…');
        try { const url = await getFileUrl(t.fileId, t.type || 'audio/mpeg'), a = document.createElement('a');
          a.href = url; a.download = ((t.artist ? t.artist + ' - ' : '') + t.title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) + (/(ogg|opus)/.test(t.type || '') ? '.ogg' : /wav/.test(t.type || '') ? '.wav' : /(m4a|mp4|aac)/.test(t.type || '') ? '.m4a' : '.mp3');
          document.body.append(a); a.click(); a.remove(); } catch (e) { console.error(e); toast('Не получилось скачать'); }
        break; }
      case 'tlink': { S.tmenu = null; const t = findTrack(id); if (!t) break;
        try { await navigator.clipboard.writeText(siteUrl('music/t_' + t.id)); toast('🔗 Ссылка на трек скопирована'); } catch (e) { toast('Не получилось скопировать'); }
        render(); break; }
      case 'tplayid': { const t = trackCache.get(id); if (t) playList([t], 0, 'Трек из записи'); break; }
      case 'toff': { S.tmenu = null; const t = findTrack(id); if (!t) break;
        try { if (isOff(t)) { await offDel(t); toast('Убрано из офлайна'); } else { toast('📥 Сохраняем…'); await offSave(t); toast('📥 Сохранено — играет без интернета'); } }
        catch (e) { console.error(e); toast('Не получилось: возможно, мало места на устройстве'); }
        render(); break; }
      case 'offall': await offSaveAll(musicList(b.dataset.list)); break;
      case 'tshare': { S.tmenu = null; const t = findTrack(id); if (!t) break;
        lsSet('vs_draft', `🎵 ${t.title}${t.artist ? ' — ' + t.artist : ''}\n${siteUrl('music/t_' + t.id)}`);
        S.fullPlayer = false; S.fpSheet = null; go('id/' + uid());
        setTimeout(() => { if (!document.getElementById('postText') && MD()) { S.compose = true; render(); } const el = document.getElementById('postText'); if (el) { el.value = lsGet('vs_draft') || ''; el.scrollIntoView({ block: 'center' }); el.focus(); } }, 300);
        toast('Допишите пару слов и опубликуйте'); break; }
      case 'plcopy': { const p = cache.mus?.pl; if (!p || S.busy) break; S.busy = true;
        try { const nid = await savePlaylist(null, { title: p.title.slice(0, 60), tracks: (p.tracks || []).slice(0, 500), color: p.color || '' }); toast('Плейлист сохранён себе'); go('music/pl_' + nid); }
        catch (e) { toast(errText(e)); } finally { S.busy = false; } break; }
      case 'plmove': { S.tmenu = null; const p = cache.mus?.pl; if (!p || p.ownerId !== uid()) break;
        const tr = (p.tracks || []).slice(), i = tr.indexOf(id), j = i + Number(b.dataset.d); if (i < 0 || j < 0 || j >= tr.length) break;
        [tr[i], tr[j]] = [tr[j], tr[i]]; p.tracks = tr; p.list = tr.map(x => trackCache.get(x)).filter(Boolean); render();
        await savePlaylist(p.id, { tracks: tr }).catch(e => toast(errText(e))); const pp = (cache.mus.pls || []).find(x => x.id === p.id); if (pp) pp.tracks = tr; break; }
      case 'autoplaytoggle': lsSet('vs_autoplay', autoplayOn() ? '0' : '1'); render(); break;
      case 'normtoggle': lsSet('vs_norm', normOn() ? '0' : '1'); normApply(); render(); break;
      case 'xfadeset': lsSet('vs_xfade', b.dataset.v); S.fpSheet = null; toast(Number(b.dataset.v) ? `🌊 Плавные переходы: ${b.dataset.v} с` : 'Плавные переходы выключены'); render(); break;
      case 'statclear': if (!twoStep('stats')) return; lsSet('vs_plays', '{}'); lsSet('vs_listen_total', '0'); statSec = 0; toast('Статистика стёрта'); render(); break;
      case 'fqrm': { const i = Number(b.dataset.i); if (i === player.i || !player.queue[i]) break;
        player.queue.splice(i, 1); if (i < player.i) player.i--; render(); break; }
      case 'fqclear': player.queue.splice(player.i + 1); toast('Очередь очищена'); render(); break;
      case 'fqshuffle': { const rest = player.queue.splice(player.i + 1);
        for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
        player.queue.push(...rest); toast('Очередь перемешана'); render(); break; }
      case 'tmenu': { const k = b.dataset.list + ':' + id; S.tmenu = S.tmenu === k ? null : k; render(); break; }
      case 'tnext': {
        const t = musicList(b.dataset.list)[Number(b.dataset.i)]; S.tmenu = null; if (!t) break;
        if (!curTrack()) { playList([t], 0, 'Очередь'); break; }
        player.queue = player.queue.filter((x, j) => x.id !== t.id || j === player.i);
        player.queue.splice(player.queue.findIndex(x => x.id === curTrack().id) + 1, 0, t); player.i = player.queue.findIndex(x => x.id === curTrack().id);
        toast('Сыграет следующим: ' + t.title); render(); break;
      }
      case 'tpl': S.tmenu = null; if (!cache.mus?.pls?.length && !cache.mus?.plsErr) { S.plForm = { track: id, color: PL_COLORS[0] }; } else S.plPick = id; render(); break;
      case 'pltoggle': await plToggleTrack(b.dataset.pl, id); break;
      case 'plnew': S.plForm = { track: id || null, color: PL_COLORS[Math.floor(Math.random() * PL_COLORS.length)] }; S.plPick = null; render(); setTimeout(() => document.getElementById('plTitle')?.focus(), 50); break;
      case 'pledit': { const p = cache.mus?.pl; S.plForm = { id, color: p?.color || PL_COLORS[0] }; render(); break; }
      case 'plcolor': if (S.plForm) { S.plForm.color = b.dataset.v; render(); } break;
      case 'plclose': S.plPick = null; S.plForm = null; render(); break;
      case 'pldel': if (!twoStep('pl:' + id)) return; await deleteDoc(doc(db, 'playlists', id)); cache.mus.pls = (cache.mus.pls || []).filter(p => p.id !== id); toast('Плейлист удалён'); go('music'); break;
      case 'plrm': S.tmenu = null; await plToggleTrack(cache.mus.pl.id, id); break;
      case 'plshare': try { await navigator.clipboard.writeText(siteUrl('music/pl_' + id)); toast('Ссылка на плейлист скопирована'); } catch (e) { toast('Не получилось скопировать'); } break;
      case 'mplay': if (player.audio.src) player.audio.paused ? player.audio.play() : player.audio.pause(); break;
      case 'mnext': nextTrack(); break;
      case 'mprev': prevTrack(); break;
      case 'fpopen': S.fullPlayer = true; S.lyrEdit = false; lyricIdx = -1; render(); break;
      case 'fpclose': S.fullPlayer = false; S.lyrEdit = false; S.lyrPick = false; S.lyrFind = null; S.fpSheet = null; render(); break;
      case 'fpsheet': S.fpSheet = b.dataset.v || null; S.lyrPick = false; render(); break;
      case 'fpmode': { const v = b.dataset.v; S.fpMode = S.fpMode === v && !S.fpLyrics ? null : v; S.fpLyrics = false; S.lyrEdit = false; S.lyrPick = false; render();
        if (v === 'queue') document.querySelector('.fq-item.on')?.scrollIntoView({ block: 'center' }); break; }
      case 'fpview': { const v = b.dataset.v; S.lyrEdit = false; S.lyrPick = false;
        if (v === 'lyrics') { S.fpLyrics = true; S.fpMode = null; lyricIdx = -1; render(); setTimeout(syncLyrics, 50); break; }
        S.fpLyrics = false; S.fpMode = v === 'queue' ? 'queue' : null; render();
        if (v === 'queue') document.querySelector('.fq-item.on')?.scrollIntoView({ block: 'center' }); break; }
      case 'fqplay': playAt(Number(b.dataset.i)); break;
      case 'fprate': player.rate = Number(b.dataset.v); lsSet('vs_rate', String(player.rate)); applyRate(); render(); break;
      case 'fpfx': { const slow = b.dataset.v === 'slowed'; const on = player.rate === (slow ? 0.85 : 1.25) && !player.pitch;
        player.rate = on ? 1 : slow ? 0.85 : 1.25; player.pitch = on; lsSet('vs_rate', String(player.rate)); lsSet('vs_pitch', player.pitch ? '1' : '0'); applyRate();
        toast(on ? 'Обычная скорость' : slow ? '🐢 Slowed: медленнее и ниже' : '⚡ Speed up: быстрее и выше'); render(); break; }
      case 'eqon': player.eq.on = !player.eq.on; eqChanged(); break;
      case 'eqpreset': { const k = b.dataset.v; player.eq.preset = k; player.eq.bands = EQ_PRESETS[k][1].slice(); player.eq.on = true; eqChanged(); break; }
      case 'eqreset': player.eq.preset = 'flat'; player.eq.bands = EQ_F.map(() => 0); player.eq.bass = 0; eqChanged(); break;
      case 'fppitch': player.pitch = !player.pitch; lsSet('vs_pitch', player.pitch ? '1' : '0'); applyRate(); render(); break;
      case 'fpsleep': { const v = b.dataset.v;
        player.sleepMul = 1; applyVol();
        player.sleep = v === 'off' ? null : v === 'end' ? { end: true } : { at: Date.now() + Number(v) * 60000 };
        S.fpSheet = null; toast(v === 'off' ? 'Таймер сна выключен' : v === 'end' ? '🌙 Музыка выключится, когда доиграет трек' : `🌙 Музыка выключится через ${v} мин`); render(); break; }
      case 'fprepeat': player.repeat = { off: 'all', all: 'one', one: 'off' }[player.repeat]; lsSet('vs_repeat', player.repeat); toast(REPEAT_LABEL[player.repeat]); render(); break;
      case 'fpshuffle': player.shuffle = !player.shuffle; lsSet('vs_shuffle', player.shuffle ? '1' : '0'); toast(player.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено'); render(); break;
      case 'fplyrics': S.fpLyrics = !S.fpLyrics; S.fpMode = null; S.lyrEdit = false; lyricIdx = -1; render(); setTimeout(syncLyrics, 50); break;
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
        await updateDoc(doc(db, 'users', uid()), { tracks: has ? arrayRemove(id) : arrayUnion(id) }); toast(has ? 'Убрано из «Моих треков»' : 'Добавлено в «Мои треки»');
        if (cache.mus) { const t = trackCache.get(id); cache.mus.liked = has ? (cache.mus.liked || []).filter(x => x.id !== id) : t ? [t, ...(cache.mus.liked || []).filter(x => x.id !== id)] : cache.mus.liked; }
        break;
      }
      case 'tdel': {
        if (!twoStep('track:' + id)) return;
        const t = trackCache.get(id) || (cache.tracks || []).find(x => x.id === id);
        await deleteDoc(doc(db, 'tracks', id));
        if (t?.ownerId === uid()) await deleteFile(t.fileId).catch(console.error);
        trackCache.delete(id); S.tmenu = null;
        if (cache.mus) for (const k of ['stream', 'liked', 'uploads', 'other']) cache.mus[k] = (cache.mus[k] || []).filter(x => x.id !== id);
        if (cache.mus?.pl?.list) cache.mus.pl.list = cache.mus.pl.list.filter(x => x.id !== id);
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
        const cap = (document.getElementById('stText')?.value || '').trim().slice(0, 200);
        S.busy = true; render();
        try {
          const image = S.storyDraft.items.length ? await storyBurn(S.storyDraft) : S.storyDraft.image;
          await addDoc(collection(db, 'stories'), { ownerId: uid(), image, text: cap, views: {}, createdAt: serverTimestamp() });
          S.storyDraft = null; toast('История опубликована'); loadStories();
        } finally { S.busy = false; render(); }
        break;
      }
      case 'storyopen': { const { order } = storyOwners(), oi = order.indexOf(id); if (oi < 0) return; S.story = { oi, si: 0 }; storyShow(); break; }
      case 'storystep': storyStep(Number(b.dataset.d)); break;
      case 'staddt': { const el = document.getElementById('stOver'), t = el?.value.trim(); if (t) { el.value = ''; stAdd('t', t.slice(0, 60)); } break; }
      case 'stadde': stAdd('e', b.dataset.e); break;
      case 'stcolor': { const it = S.storyDraft?.items[S.storyDraft.sel]; if (it) { it.c = b.dataset.c; render(); } break; }
      case 'stbg': { const it = S.storyDraft?.items[S.storyDraft.sel]; if (it) { it.bg = !it.bg; render(); } break; }
      case 'stsize': { const it = S.storyDraft?.items[S.storyDraft.sel]; if (it) { it.s = Math.max(4, Math.min(40, it.s + Number(b.dataset.d) * (it.k === 'e' ? 3 : 1.5))); render(); } break; }
      case 'stdel': { const d = S.storyDraft; if (d && d.sel >= 0) { d.items.splice(d.sel, 1); d.sel = -1; render(); } break; }
      case 'streact': { clearTimeout(storyTimer); await storyReply(id, `Реакция на вашу историю: ${b.dataset.e}`); storyStep(1); break; }
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
  const last = { lastText: (text || (extra.audio ? (extra.audio.startsWith('data:video/') ? '🎥 Видеокружок' : '🎤 Голосовое') : extra.fwd ? '↪ Пересланное сообщение' : '📷 Фото')).slice(0, 200), lastFrom: me, lastAt: serverTimestamp(), read: { [me]: serverTimestamp() } };
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

// Плеер голосовых живёт вне DOM, поэтому перерисовка страницы его не прерывает.
// 8.0: волна (считается из самой записи), скорость 1× / 1,5× / 2× для всех голосовых, продолжение с того места, где остановились (vs_vpos)
const players = new Map(), voicePeaks = new Map(), VOICE_BARS = 36;
const vSpeed = () => [1, 1.5, 2].includes(Number(lsGet('vs_vspeed'))) ? Number(lsGet('vs_vspeed')) : 1;
const vPosAll = () => { try { return JSON.parse(lsGet('vs_vpos') || '{}') || {}; } catch (e) { return {}; } };
function vPosSave(id, t) { const all = vPosAll(); if (t > 1) all[id] = Math.round(t * 10) / 10; else delete all[id]; const k = Object.keys(all); if (k.length > 60) delete all[k[0]]; lsSet('vs_vpos', JSON.stringify(all)); }
let peakAC = null;
function voiceWave(m) {
  if (voicePeaks.has(m.id)) return;
  voicePeaks.set(m.id, null);
  setTimeout(async () => {
    try {
      const buf = await (await fetch(m.audio)).arrayBuffer();
      peakAC ||= new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 8000);
      const ab = await peakAC.decodeAudioData(buf), d = ab.getChannelData(0), step = Math.max(1, Math.floor(d.length / VOICE_BARS)), out = [];
      for (let b = 0; b < VOICE_BARS; b++) { let sum = 0, n = 0; for (let i = b * step, e = Math.min(d.length, i + step); i < e; i += 4) { sum += d[i] * d[i]; n++; } out.push(Math.sqrt(sum / (n || 1))); }   // громкость (RMS) кусочка
      const top = Math.max(...out) || 1; voicePeaks.set(m.id, out.map(x => Math.max(0.12, x / top)));
    } catch (e) { voicePeaks.set(m.id, Array.from({ length: VOICE_BARS }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7 + m.id.length)))); }
    document.querySelectorAll(`[data-vw="${CSS.escape(m.id)}"]`).forEach(el => { el.outerHTML = voiceWaveHtml(m); });
  }, 30);
}
const voiceWaveHtml = m => {
  const pk = voicePeaks.get(m.id) || Array(VOICE_BARS).fill(0.18), pl = players.get(m.id);
  const pct = pl && pl.duration && isFinite(pl.duration) ? pl.currentTime / pl.duration * 100 : (vPosAll()[m.id] || 0) / (m.dur || 1) * 100;
  const bars = pk.map(h => `<i style="height:${Math.round(h * 100)}%"></i>`).join('');
  return `<div class="voice-wave" data-vw="${esc(m.id)}" data-act="vseek" data-id="${esc(m.id)}"><span class="vw-base">${bars}</span><span class="vw-fill" data-vbar="${esc(m.id)}" style="clip-path:inset(0 ${100 - Math.min(100, pct)}% 0 0)">${bars}</span></div>`;
};
function voiceHtml(m) {
  const pl = players.get(m.id), playing = pl && !pl.paused; voiceWave(m);
  return `<div class="voice"><button class="voice-btn" data-act="playvoice" data-id="${esc(m.id)}" aria-label="${playing ? 'Пауза' : 'Слушать'}">${playing ? I.pause : I.play}</button>
    ${voiceWaveHtml(m)}<span class="voice-side"><span class="small tnum" data-vtime="${esc(m.id)}">${fmtDur(pl && pl.currentTime ? pl.currentTime : m.dur)}</span>
    <button class="voice-sp" data-act="vspeed" aria-label="Скорость">${String(vSpeed()).replace('.', ',')}×</button></span></div>`;
}
function playVoice(m, at = null) {
  let pl = players.get(m.id);
  if (!pl) {
    pl = new Audio(m.audio); players.set(m.id, pl);
    const sync = () => {
      const bar = document.querySelector(`[data-vbar="${CSS.escape(m.id)}"]`), t = document.querySelector(`[data-vtime="${CSS.escape(m.id)}"]`);
      const d = isFinite(pl.duration) && pl.duration ? pl.duration : m.dur;
      if (bar) bar.style.clipPath = `inset(0 ${100 - Math.min(100, pl.currentTime / d * 100)}% 0 0)`;
      if (t) t.textContent = fmtDur(pl.currentTime || m.dur);
    };
    pl.ontimeupdate = () => { sync(); if (Math.floor(pl.currentTime) % 2 === 0) vPosSave(m.id, pl.currentTime); };
    pl.onplay = pl.onpause = () => { if (pl.paused) vPosSave(m.id, pl.currentTime); render(); };
    pl.onended = () => { vPosSave(m.id, 0); pl.currentTime = 0; render(); };
    pl.onerror = () => toast('Не получилось воспроизвести запись в этом браузере');
    const saved = vPosAll()[m.id]; if (saved && at === null) pl.currentTime = saved;
  }
  pl.playbackRate = vSpeed();
  players.forEach((p, id) => { if (id !== m.id && !p.paused) p.pause(); });
  if (at !== null) { const d = isFinite(pl.duration) && pl.duration ? pl.duration : m.dur; pl.currentTime = Math.max(0, Math.min(d - 0.2, at * d)); if (pl.paused) pl.play().catch(console.error); return; }
  if (pl.paused) pl.play().catch(e => console.error(e)); else pl.pause();
}

/* 8.0: видеокружки — до 20 секунд с фронтальной камеры, хранятся в самом сообщении (data:video, как голосовые) */
const VNOTE_MAX = 20, VNOTE_BYTES = 510000;
let VN = null;   // {stream, rec, chunks, started, to, timer, send}
const vnoteEls = new Map();   // элементы <video> кружков переживают перерисовку (вынимаем и возвращаем, как видео эфира)
async function vnoteOpen() {
  if (VN) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Этот браузер не умеет записывать видео'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 }, frameRate: { ideal: 24 } }, audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast('Нет доступа к камере или микрофону — разрешите их в браузере'); return; }
  VN = { stream, to: S.chatWith, rec: null, chunks: [], started: 0, timer: 0, send: false };
  const box = document.getElementById('vnoteBox') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'vnoteBox' }));
  box.className = 'vnote-ov';
  box.innerHTML = `<div class="vnote-rec"><video id="vnPrev" autoplay playsinline muted></video><svg class="vn-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48"/></svg></div>
    <b id="vnTime" class="tnum">0:00</b><span class="small">Видеокружок до ${VNOTE_MAX} секунд</span>
    <div class="row" style="gap:12px"><button class="btn ghost light" data-act="vnotex">Отмена</button><button class="btn" id="vnGo" data-act="vnotego">● Записать</button></div>`;
  const v = document.getElementById('vnPrev'); v.srcObject = stream; v.play().catch(() => { });
}
function vnoteGo() {
  if (!VN) return;
  if (VN.rec) { vnoteClose(true); return; }
  const type = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  VN.rec = new MediaRecorder(VN.stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 150000, audioBitsPerSecond: 32000 });
  VN.rec.ondataavailable = e => { if (e.data.size) VN?.chunks.push(e.data); };
  const me = VN; VN.rec.onstop = () => vnoteDone(me);
  VN.rec.start(500); VN.started = Date.now();
  document.getElementById('vnoteBox')?.classList.add('rec');
  const go = document.getElementById('vnGo'); if (go) go.textContent = '■ Отправить';
  VN.timer = setInterval(() => {
    const s = (Date.now() - me.started) / 1000, el = document.getElementById('vnTime'); if (el) el.textContent = fmtDur(s);
    document.querySelector('.vn-ring circle')?.style.setProperty('stroke-dashoffset', String(302 * (1 - Math.min(1, s / VNOTE_MAX))));
    if (s >= VNOTE_MAX) vnoteClose(true);
  }, 200);
}
function vnoteClose(send) {
  const me = VN; if (!me) return; me.send = send; clearInterval(me.timer);
  if (me.rec && me.rec.state !== 'inactive') me.rec.stop(); else vnoteDone(me);
}
async function vnoteDone(me) {
  me.stream.getTracks().forEach(t => t.stop()); if (VN === me) VN = null;
  const box = document.getElementById('vnoteBox'); if (box) { box.innerHTML = ''; box.className = ''; }
  if (!me.send || !me.rec) return;
  const dur = Math.min(VNOTE_MAX, (Date.now() - me.started) / 1000);
  if (dur < 1) { toast('Слишком коротко'); return; }
  const blob = new Blob(me.chunks, { type: me.rec.mimeType || 'video/webm' });
  if (blob.size > VNOTE_BYTES) { toast('Кружок получился слишком большим — попробуйте короче'); return; }
  const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  try { await sendMessage(me.to, '', '', { audio: url.replace(/^data:[^;,]*/, 'data:' + (blob.type.split(';')[0] || 'video/webm')), dur: Math.round(dur * 10) / 10 }); }
  catch (e) { console.error(e); toast(errText(e)); }
}
const vnoteHtml = m => `<span class="vnote" data-vnote="${esc(m.id)}" data-act="vnoteplay" data-id="${esc(m.id)}"><span class="vnote-dur small tnum">${fmtDur(m.dur)}</span></span>`;
function vnoteMount() {   // после render(): вставляем живые <video> на место заготовок
  document.querySelectorAll('[data-vnote]').forEach(ph => {
    const id = ph.dataset.vnote, m = cache.messages.find(x => x.id === id); if (!m) return;
    let v = vnoteEls.get(id);
    if (!v) { v = document.createElement('video'); v.src = m.audio; v.playsInline = true; v.muted = true; v.loop = true; v.preload = 'metadata'; v.className = 'vnote-v'; vnoteEls.set(id, v); v.play().catch(() => { }); }
    if (v.parentNode !== ph) ph.prepend(v);
  });
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
  if (S.story && e.target.matches?.('input')) { if (e.key === 'Escape') { clearTimeout(storyTimer); S.story = null; render(); } return; }
  if (S.story) { if (e.key === 'Escape') { clearTimeout(storyTimer); S.story = null; render(); } else if (e.key === 'ArrowRight') storyStep(1); else if (e.key === 'ArrowLeft') storyStep(-1); return; }
  if (e.key === 'Escape' && S.trackForm) { S.trackForm = null; render(); return; }
  if (e.key === 'Escape' && S.vcmt) { closeVcmt(); return; }
  if (e.key === 'Escape' && S.whatsNew) { lsSet('vs_seen_ver', WN_VER); S.whatsNew = false; render(); return; }
  if (S.fullPlayer && curTrack() && !e.target.matches?.('input,textarea,select,[contenteditable]') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const a = player.audio, t = curTrack();
    if (e.key === ' ') { e.preventDefault(); a.paused ? a.play() : a.pause(); return; }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !t.radio) { e.preventDefault(); if (e.shiftKey) { e.key === 'ArrowRight' ? nextTrack() : prevTrack(); return; } a.currentTime = Math.max(0, Math.min((a.duration || 0) - 0.5, a.currentTime + (e.key === 'ArrowRight' ? 5 : -5))); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setVolume(player.vol + (e.key === 'ArrowUp' ? 0.1 : -0.1)); toast('🔊 Громкость ' + Math.round(player.vol * 100) + '%'); return; }
    if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { a.muted = !a.muted; toast(a.muted ? '🔇 Без звука' : '🔊 Звук включён'); return; }
  }
  if (e.key === 'Escape' && S.fullPlayer && S.fpSheet) { S.fpSheet = null; render(); return; }
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
    else if (pickTarget === 'music') { if (files.length > 1) await uploadTracksBatch(files.slice(0, 30)); else await uploadTrack(f); }
    else if (pickTarget === 'story') { S.storyDraft = { image: await compress(f, 1080, 420000), items: [], sel: -1 }; render(); }
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
      case 'livestart': { const f = S.liveForm; if (!f) break; await liveStart({ title: v('lvTitle'), mode: f.mode, facing: f.facing, rec: f.rec }); break; }
      case 'livechat': { if (liveSay(v('liveIn'))) clear('liveIn'); document.getElementById('liveIn')?.focus(); break; }
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
          lsSet('vs_draft', ''); ['postText', 'pollQ', 'pollO0', 'pollO1', 'pollO2', 'pollO3', 'pollO4', 'pollO5'].forEach(clear); S.compose = false; toast('Опубликовано');
        } catch (err) { toast(err.message === 'too-big' ? 'Фото слишком большое даже после сжатия' : errText(err)); }
        finally { S.busy = false; render(); }
        break;
      }
      case 'storyreply': {
        const text = v('stReply'); if (!text) return;
        clear('stReply'); clearTimeout(storyTimer);
        await storyReply(f.dataset.id, `↩ Ответ на вашу историю: ${text}`.slice(0, 2000)); storyStep(1);
        break;
      }
      case 'vcomment': {
        const text = v('vcIn'), vid = S.vcmt?.id; if (!text || !vid) return;
        clear('vcIn');
        await addDoc(collection(db, 'videos', vid, 'comments'), { authorId: uid(), text: text.slice(0, 1000), createdAt: serverTimestamp() });
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
      case 'playlist': {
        const f2 = S.plForm, title = v('plTitle').slice(0, 60); if (!f2 || !title || S.busy) return;
        S.busy = true; render();
        try {
          if (f2.id) {
            await savePlaylist(f2.id, { title, color: f2.color });
            const p = (cache.mus?.pls || []).find(x => x.id === f2.id); if (p) Object.assign(p, { title, color: f2.color });
            if (cache.mus?.pl?.id === f2.id) Object.assign(cache.mus.pl, { title, color: f2.color });
            S.plForm = null; toast('Сохранено');
          } else {
            const tracks = f2.track ? [f2.track] : [], nid = await savePlaylist(null, { title, color: f2.color, tracks });
            (cache.mus ||= { stream: [], liked: [], uploads: [], pls: [], other: [] }).pls.unshift({ id: nid, ownerId: uid(), title, color: f2.color, tracks, updatedAt: Date.now() });
            S.plForm = null; toast(f2.track ? `Плейлист «${title}» создан, трек добавлен` : `Плейлист «${title}» создан`);
            if (!f2.track) go('music/pl_' + nid);
          }
        } finally { S.busy = false; render(); }
        break;
      }
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
