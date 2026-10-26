/* ==========================================================================
   «Миг» — веб-версия: лента клипов, лайки, сохранение, профили, вход.
   Та же база Firebase, что у приложения (документы пишутся в том же виде).
   Снимать и загружать клипы — в приложении для Android.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential, OAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, query, where, orderBy, limit, startAfter, getDoc, getDocs, updateDoc, writeBatch,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment, documentId,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const fb = initializeApp({
  apiKey: "AIzaSyADzttkHdFJ1m9hEEaX7Ab84QkBNfHjm_Q", authDomain: "vsmske.firebaseapp.com", projectId: "vsmske",
  storageBucket: "vsmske.firebasestorage.app", messagingSenderId: "195735209722", appId: "1:195735209722:web:e9a36c806abeb048edeb43",
});
const auth = getAuth(fb); auth.languageCode = 'ru';
const db = getFirestore(fb);

const VERSION = '1.2';
const APK = 'https://storage.yandexcloud.net/vsclips-video/app/Mig.apk';
const STORAGE = 'https://storage.yandexcloud.net/vsclips-video/';
const CLIP_SAVE = 'clip_';
const NICK_RE = /^[a-z0-9._]{4,30}$/;
const COLORS = ['#2F44D0', '#D0462F', '#1F8A5B', '#B4398F', '#C98A12', '#2B8BB5', '#6A47C9', '#4E5B76'];
const BASE = new URL('..', import.meta.url).pathname;           // папка сайта (на GitHub Pages «/vsmske/»)
const I = {"home": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.525-.4 1.2-.4t1.2.4l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-3q-.425 0-.712-.288T14 20v-5q0-.425-.288-.712T13 14h-2q-.425 0-.712.288T10 15v5q0 .425-.288.713T9 21H6q-.825 0-1.412-.587T4 19\"/></svg>", "friends": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M1 17.2q0-.85.438-1.562T2.6 14.55q1.55-.775 3.15-1.162T9 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T17 17.2v.8q0 .825-.587 1.413T15 20H3q-.825 0-1.412-.587T1 18zM18.45 20q.275-.45.413-.962T19 18v-1q0-1.1-.612-2.113T16.65 13.15q1.275.15 2.4.513t2.1.887q.9.5 1.375 1.112T23 17v1q0 .825-.587 1.413T21 20zM6.175 10.825Q5 9.65 5 8t1.175-2.825T9 4t2.825 1.175T13 8t-1.175 2.825T9 12t-2.825-1.175m11.65 0Q16.65 12 15 12q-.275 0-.7-.062t-.7-.138q.675-.8 1.038-1.775T15 8t-.362-2.025T13.6 4.2q.35-.125.7-.163T15 4q1.65 0 2.825 1.175T19 8t-1.175 2.825\"/></svg>", "plus": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M11 13H6q-.425 0-.712-.288T5 12t.288-.712T6 11h5V6q0-.425.288-.712T12 5t.713.288T13 6v5h5q.425 0 .713.288T19 12t-.288.713T18 13h-5v5q0 .425-.288.713T12 19t-.712-.288T11 18z\"/></svg>", "person": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M9.175 10.825Q8 9.65 8 8t1.175-2.825T12 4t2.825 1.175T16 8t-1.175 2.825T12 12t-2.825-1.175M4 18v-.8q0-.85.438-1.562T5.6 14.55q1.55-.775 3.15-1.162T12 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T20 17.2v.8q0 .825-.587 1.413T18 20H6q-.825 0-1.412-.587T4 18\"/></svg>", "heart": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M240 102c0 70-103.79 126.66-108.21 129a8 8 0 0 1-7.58 0C119.79 228.66 16 172 16 102a62.07 62.07 0 0 1 62-62c20.65 0 38.73 8.88 50 23.89C139.27 48.88 157.35 40 178 40a62.07 62.07 0 0 1 62 62\"/></svg>", "chat": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M128 24a104 104 0 0 0-91.82 152.88l-11.35 34.05a16 16 0 0 0 20.24 20.24l34.05-11.35A104 104 0 1 0 128 24M84 140a12 12 0 1 1 12-12a12 12 0 0 1-12 12m44 0a12 12 0 1 1 12-12a12 12 0 0 1-12 12m44 0a12 12 0 1 1 12-12a12 12 0 0 1-12 12\"/></svg>", "bookmark": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M184 32H72a16 16 0 0 0-16 16v176a8 8 0 0 0 12.24 6.78L128 193.43l59.77 37.35A8 8 0 0 0 200 224V48a16 16 0 0 0-16-16\"/></svg>", "share": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"m237.66 117.66l-80 80A8 8 0 0 1 144 192v-39.77c-57.1 3.24-96.25 40.27-107.24 52a12 12 0 0 1-20.68-9.58c3.71-32.26 21.38-63.29 49.76-87.37c23.57-20 52.22-32.69 78.16-34.91V32a8 8 0 0 1 13.66-5.66l80 80a8 8 0 0 1 0 11.32\"/></svg>", "music": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M212.92 17.71a7.89 7.89 0 0 0-6.86-1.46l-128 32A8 8 0 0 0 72 56v110.1A36 36 0 1 0 88 196v-93.75l112-28v59.85a36 36 0 1 0 16 29.9V24a8 8 0 0 0-3.08-6.29\"/></svg>", "play": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M240 128a15.74 15.74 0 0 1-7.6 13.51L88.32 229.65a16 16 0 0 1-16.2.3A15.86 15.86 0 0 1 64 216.13V39.87a15.86 15.86 0 0 1 8.12-13.82a16 16 0 0 1 16.2.3l144.08 88.14A15.74 15.74 0 0 1 240 128\"/></svg>", "download": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M228 144v64a12 12 0 0 1-12 12H40a12 12 0 0 1-12-12v-64a12 12 0 0 1 24 0v52h152v-52a12 12 0 0 1 24 0m-108.49 8.49a12 12 0 0 0 17 0l40-40a12 12 0 0 0-17-17L140 115V32a12 12 0 0 0-24 0v83L96.49 95.51a12 12 0 0 0-17 17Z\"/></svg>", "leaf": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M223.45 40.07a8 8 0 0 0-7.52-7.52C139.8 28.08 78.82 51 52.82 94a87.1 87.1 0 0 0-12.76 49a101.7 101.7 0 0 0 6.64 32.2a4 4 0 0 0 6.61 1.43l85-86.3a8 8 0 0 1 11.32 11.32l-92.89 94.29l-14.19 14.19a8.2 8.2 0 0 0-.6 11.1a8 8 0 0 0 11.71.43l16.79-16.79c14.14 6.84 28.41 10.57 42.56 11.07q1.67.06 3.33.06A86.93 86.93 0 0 0 162 203.18c43-26 65.93-86.97 61.45-163.11\"/></svg>", "sparkle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"currentColor\" d=\"M208 144a15.78 15.78 0 0 1-10.42 14.94L146 178l-19 51.62a15.92 15.92 0 0 1-29.88 0L78 178l-51.62-19a15.92 15.92 0 0 1 0-29.88L78 110l19-51.62a15.92 15.92 0 0 1 29.88 0L146 110l51.62 19A15.78 15.78 0 0 1 208 144m-56-96h16v16a8 8 0 0 0 16 0V48h16a8 8 0 0 0 0-16h-16V16a8 8 0 0 0-16 0v16h-16a8 8 0 0 0 0 16m88 32h-8v-8a8 8 0 0 0-16 0v8h-8a8 8 0 0 0 0 16h8v8a8 8 0 0 0 16 0v-8h8a8 8 0 0 0 0-16\"/></svg>"};
const ic = (k, cls = '') => `<span class="ic ${cls}">${I[k] || ''}</span>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);
const ms = t => t?.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0);
const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' млн' : n >= 1e4 ? Math.round(n / 1e3) + ' тыс' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + ' тыс' : String(n || 0);
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const root = document.getElementById('mig');

/* ---------- адреса: /vsmske/, /vsmske/friends, /vsmske/clip/<id>, /vsmske/@ник, /vsmske/id/<uid>, /vsmske/me ---------- */
const curRoute = () => { let p = location.pathname; p = p.startsWith(BASE) ? p.slice(BASE.length) : p.replace(/^\/+/, ''); return p.replace(/\/+$/, '').replace(/^index\.html$/, ''); };
const siteUrl = r => location.origin + BASE + r;
function go(r, replace = false) { history[replace ? 'replaceState' : 'pushState'](null, '', BASE + r); route(); }
addEventListener('popstate', () => route());
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-go]'); if (!a) return;
  e.preventDefault(); go(a.dataset.go);
});

/* ---------- состояние ---------- */
const S = { phase: 'loading', me: null, uid: null, view: 'feed', muted: true, authTab: 0, authErr: '', busy: false };
const users = new Map();      // uid → профиль (или промис)
let meUnsub = null;

function banned(u) { const b = u?.ban; if (!b) return false; return b.until == null || ms(b.until) > Date.now(); }
function masked(u) { return u && banned(u) && u.id !== S.uid ? { id: u.id, name: 'Deleted Account', nick: '', photo: '', banned: true } : u; }
async function user(id) {
  if (!id) return null;
  if (users.has(id)) return users.get(id);
  const p = getDoc(doc(db, 'users', id)).then(s => { const u = s.exists() ? { id, ...s.data() } : { id, name: 'Удалённая страница', missing: true }; users.set(id, masked(u)); return masked(u); })
    .catch(() => { users.delete(id); return null; });
  users.set(id, p); return p;
}
const safePhoto = s => /^data:image\/(jpeg|png|webp|gif);base64,/.test(s || '') || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(s || '') ? s : '';
function avatar(u, cls = '') {
  const ph = safePhoto(u?.photo);
  if (ph) return `<img class="av ${cls}" src="${esc(ph)}" alt="">`;
  const ch = (u?.name || '?').trim().charAt(0).toUpperCase();
  return `<span class="av ${cls}" style="background:${esc(/^#[0-9a-f]{6}$/i.test(u?.color || '') ? u.color : '')}">${esc(ch)}</span>`;
}
function toast(t) {
  document.querySelector('.toast')?.remove();
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
function errText(e) {
  const m = String(e?.code || e?.message || e);
  if (/invalid-credential|wrong-password|invalid-login/.test(m)) return 'Неверная почта или пароль';
  if (/user-not-found/.test(m)) return 'Такого аккаунта нет';
  if (/email-already-in-use/.test(m)) return 'Эта почта уже зарегистрирована';
  if (/invalid-email/.test(m)) return 'Проверьте адрес почты';
  if (/weak-password/.test(m)) return 'Пароль — минимум 6 символов';
  if (/popup-closed|cancelled-popup/.test(m)) return 'Вход отменён';
  if (/permission-denied/.test(m)) return 'Нет доступа';
  if (/network|unavailable/.test(m)) return 'Нет связи с сервером. Проверьте интернет';
  return 'Не получилось: ' + m;
}
function sheet(emoji, title, text, buttons = []) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><div class="e">${emoji}</div><h3>${esc(title)}</h3><p>${text}</p>${buttons.map((b, i) => `<a class="btn ${b.cls || ''}" data-i="${i}" ${b.href ? `href="${esc(b.href)}" target="_blank" rel="noopener"` : 'href="#"'}>${esc(b.label)}</a>`).join('')}
    <button class="btn gray" data-close>Закрыть</button></div>`;
  bg.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (e.target === bg || e.target.closest('[data-close]')) bg.remove();
    else if (b) { const x = buttons[+b.dataset.i]; if (!x.href) { e.preventDefault(); x.on?.(); } bg.remove(); }
  });
  document.body.appendChild(bg);
}
const appSheet = (why) => sheet('🌿', 'Это — в приложении', `${esc(why)}<br>Скачайте «Миг» для Android — бесплатно.`, [{ label: 'Скачать APK', href: APK, cls: 'lime' }]);
const commentsSheet = () => sheet('🛠', 'Комментарии временно не работают', 'Технические неполадки — уже чиним. Скоро всё вернётся, а пока ставьте ❤️ и делитесь клипами.');

/* ---------- клипы ---------- */
const isStored = v => v.source === 'link' && v.provider === 'direct' && String(v.vid || '').startsWith(STORAGE);
const isClip = v => (v.source === 'file' || isStored(v)) && v.duration >= 0.5 && v.duration <= 90;
const vidOf = s => ({ id: s.id, ...s.data() });
function soundRef(v) {
  if (isStored(v)) { const f = String(v.vid).split('#s=')[1] || ''; return /^[tv]:/.test(f) ? f : 'v:' + v.id; }
  if (v.source === 'file' && /^[tv]:/.test(v.vid || '')) return v.vid;
  return 'v:' + v.id;
}
const tracks = new Map();
async function soundLabel(v, owner) {
  const ref = soundRef(v);
  if (ref.startsWith('t:')) {
    const id = ref.slice(2);
    if (!tracks.has(id)) tracks.set(id, getDoc(doc(db, 'tracks', id)).then(s => s.exists() ? s.data() : null).catch(() => null));
    const t = await tracks.get(id);
    return t ? `${t.title || 'Звук'}${t.artist ? ' — ' + t.artist : ''} · из библиотеки` : 'Звук из библиотеки';
  }
  if (ref === 'v:' + v.id) return `Оригинальный звук — ${owner?.nick ? '@' + owner.nick : owner?.name || ''}`;
  return 'Оригинальный звук';
}
const blobs = new Map();
async function fileUrl(fid) {      // старые клипы лежат в Firestore кусками base64
  if (blobs.has(fid)) return blobs.get(fid);
  const p = getDocs(query(collection(db, 'files', fid, 'chunks'), orderBy('i', 'asc'))).then(s => {
    const parts = s.docs.map(d => { const b = atob(d.data().data); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; });
    return URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
  });
  blobs.set(fid, p); p.catch(() => blobs.delete(fid)); return p;
}
const mediaUrl = v => isStored(v) ? Promise.resolve(String(v.vid).split('#')[0]) : fileUrl(v.fileId);

// «Для вас»: свежие ролики страницами, только клипы
const forYou = { list: [], last: null, end: false, busy: false };
async function moreForYou() {
  if (forYou.busy || forYou.end) return; forYou.busy = true;
  try {
    for (let k = 0; k < 4; k++) {
      let q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(30));
      if (forYou.last) q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), startAfter(forYou.last), limit(30));
      const s = await getDocs(q);
      if (s.docs.length < 30) forYou.end = true;
      if (s.docs.length) forYou.last = s.docs[s.docs.length - 1];
      const have = new Set(forYou.list.map(v => v.id));
      const add = s.docs.map(vidOf).filter(v => isClip(v) && !have.has(v.id));
      forYou.list.push(...add);
      if (add.length || forYou.end) break;
    }
  } finally { forYou.busy = false; }
}
async function friendsClips() {
  const ids = S.me?.friends || []; const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    const s = await getDocs(query(collection(db, 'videos'), where('ownerId', 'in', ids.slice(i, i + 10)), limit(100)));
    out.push(...s.docs.map(vidOf).filter(isClip));
  }
  return out.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}
async function clipsOf(uid) {
  const s = await getDocs(query(collection(db, 'videos'), where('ownerId', '==', uid), limit(200)));
  return s.docs.map(vidOf).filter(isClip).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

/* ---------- лента: прокрутка по одному клипу, играет только видимый ---------- */
let feedCtl = null;
function mountFeed(host, list, { start = 0, more = null, topbar = '' } = {}) {
  feedCtl?.destroy();
  host.innerHTML = `<div class="feed"></div>${topbar}<button class="sound-btn" hidden>🔇 Включить звук</button>`;
  const feed = $('.feed', host), soundBtn = $('.sound-btn', host);
  const items = [];
  let active = -1;
  const viewed = new Set();
  const setSoundBtn = () => { soundBtn.hidden = !S.muted; };
  soundBtn.onclick = () => { S.muted = false; items.forEach(it => it.video && (it.video.muted = false)); setSoundBtn(); items[active]?.video?.play().catch(() => {}); };
  function build(v, i) {
    const el = document.createElement('div'); el.className = 'item'; el.dataset.i = i;
    el.innerHTML = `<video playsinline loop preload="none" ${v.thumb ? `poster="${esc(v.thumb)}"` : ''}></video><div class="shade"></div>
      <div class="paused-ic">${ic('play')}</div>
      <div class="stack">
        <div class="meta"><a class="who"></a>${v.title && v.title !== '🎬' ? `<div class="ttl">${esc(v.title)}</div>` : ''}
          <div class="views">${fmtNum(v.views || 0)} ${plural(v.views || 0, 'просмотр', 'просмотра', 'просмотров')}</div>
          <div class="sound"><span class="n">${ic('music')}</span><span class="sl">Звук</span></div></div>
        <div class="acts">
          <a class="owner"></a>
          <button class="act like"><span class="b">${ic('heart')}</span><span class="c"></span></button>
          <button class="act cmt"><span class="b">${ic('chat')}</span><span>Скоро</span></button>
          <button class="act save"><span class="b">${ic('bookmark')}</span><span class="c2"></span></button>
          <button class="act share"><span class="b">${ic('share')}</span><span>Поделиться</span></button>
          <div class="disc"></div>
        </div>
        <div class="progress"><i></i></div>
      </div>`;
    const it = { v, el, video: $('video', el), src: false };
    it.video.muted = S.muted;
    const paint = () => {
      const liked = (v.likes || []).includes(S.uid), saved = (S.me?.saved || []).includes(CLIP_SAVE + v.id);
      $('.like', el).classList.toggle('liked', liked); $('.like .c', el).textContent = fmtNum((v.likes || []).length);
      $('.save', el).classList.toggle('saved', saved); $('.save .c2', el).textContent = saved ? 'Сохранено' : 'Сохранить';
    };
    it.paint = paint; paint();
    user(v.ownerId).then(u => {
      const link = u?.nick ? '@' + u.nick : 'id/' + v.ownerId;
      $('.who', el).textContent = u?.nick ? '@' + u.nick : u?.name || '…'; $('.who', el).dataset.go = link; $('.who', el).href = BASE + link;
      $('.owner', el).innerHTML = avatar(u); $('.owner', el).dataset.go = link; $('.owner', el).href = BASE + link;
      $('.disc', el).innerHTML = avatar(u);
      soundLabel(v, u).then(t => $('.sl', el).textContent = t);
      if (u?.banned) { el.querySelector('video').remove(); $('.paused-ic', el).outerHTML = '<div class="empty"><div class="e">🫥</div><p>Клип недоступен</p></div>'; }
    });
    $('.like', el).onclick = e => { e.stopPropagation(); like(it, false); };
    $('.cmt', el).onclick = e => { e.stopPropagation(); commentsSheet(); };
    $('.save', el).onclick = e => { e.stopPropagation(); save(it); };
    $('.share', el).onclick = e => { e.stopPropagation(); share(v); };
    // тап — пауза, двойной тап — «нравится» с сердечком
    let lastTap = 0, tapTimer = null;
    el.addEventListener('click', e => {
      if (e.target.closest('.acts, .meta a, .sound')) return;
      const now = Date.now();
      if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; like(it, true); heart(el, e); return; }
      lastTap = now;
      tapTimer = setTimeout(() => { const vd = it.video; if (!vd) return; if (vd.paused) { vd.play().catch(() => {}); el.classList.remove('paused'); } else { vd.pause(); el.classList.add('paused'); } }, 260);
    });
    it.video.addEventListener('timeupdate', () => { const d = it.video.duration; $('.progress i', el).style.width = d ? (it.video.currentTime / d * 100) + '%' : '0'; });
    it.video.addEventListener('play', () => el.classList.add('playing'));
    it.video.addEventListener('pause', () => el.classList.remove('playing'));
    feed.appendChild(el); items.push(it);
    return it;
  }
  async function activate(i) {
    if (i === active) return; active = i;
    items.forEach((it, j) => {
      if (!it.video) return;
      if (j === i) {
        it.el.classList.remove('paused');
        const run = () => { it.video.muted = S.muted; it.video.play().catch(() => { if (!S.muted) { S.muted = true; it.video.muted = true; setSoundBtn(); it.video.play().catch(() => {}); } }); };
        if (!it.src) { it.src = true; mediaUrl(it.v).then(u => { it.video.src = u; if (active === j) run(); }).catch(() => toast('Клип не загрузился')); }
        else run();
      } else {
        it.video.pause();
        if (Math.abs(j - i) > 2 && it.src && isStored(it.v)) { it.video.removeAttribute('src'); it.video.load(); it.src = false; }   // дальние выгружаем
        else if (Math.abs(j - i) === 1 && !it.src) { it.src = true; mediaUrl(it.v).then(u => { it.video.src = u; it.video.preload = 'auto'; }).catch(() => { it.src = false; }); }
      }
    });
    const v = items[i]?.v;
    if (v && !viewed.has(v.id)) setTimeout(() => { if (active === i && !viewed.has(v.id)) { viewed.add(v.id); updateDoc(doc(db, 'videos', v.id), { views: increment(1) }).catch(() => {}); } }, 2000);
    if (more && i >= items.length - 4) { const n = list.length; await more(); for (let k = n; k < list.length; k++) { observer.observe(build(list[k], k).el); } }
  }
  const observer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio > 0.6) activate(+e.target.dataset.i); }), { root: feed, threshold: [0.6] });
  list.forEach((v, i) => observer.observe(build(v, i).el));
  setSoundBtn();
  requestAnimationFrame(() => { feed.scrollTop = start * feed.clientHeight; });
  const onKey = e => {
    if (e.target.closest('input')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' });
    if (e.key === 'ArrowUp' || e.key === 'k') feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' });
    if (e.key === 'm') soundBtn.onclick();
    if (e.key === ' ') { e.preventDefault(); items[active]?.el.click(); }
  };
  addEventListener('keydown', onKey);
  feedCtl = {
    destroy() { removeEventListener('keydown', onKey); observer.disconnect(); items.forEach(it => { it.video?.pause(); it.video?.removeAttribute('src'); }); feedCtl = null; },
    repaint() { items.forEach(it => it.paint()); },
  };
}
function heart(el, e) {
  const r = el.getBoundingClientRect(), h = document.createElement('div');
  h.className = 'heart'; h.innerHTML = I.heart; h.style.left = (e.clientX - r.left - 55) + 'px'; h.style.top = (e.clientY - r.top - 55) + 'px';
  h.style.setProperty('--r', (Math.round(Math.random() * 30) - 15) + 'deg'); el.appendChild(h); setTimeout(() => h.remove(), 950);
}
async function like(it, force) {
  const v = it.v, me = S.uid, has = (v.likes || []).includes(me);
  if (force && has) return;
  v.likes = has ? v.likes.filter(x => x !== me) : [...(v.likes || []), me]; it.paint();
  const b = $('.like', it.el); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  try { await updateDoc(doc(db, 'videos', v.id), { likes: has ? arrayRemove(me) : arrayUnion(me) }); }
  catch (e) { v.likes = has ? [...v.likes, me] : v.likes.filter(x => x !== me); it.paint(); toast(errText(e)); }
}
async function save(it) {
  const key = CLIP_SAVE + it.v.id, was = (S.me?.saved || []).includes(key);
  if (!was && (S.me?.saved || []).length >= 500) { toast('Сохранено уже 500 — уберите старое'); return; }
  try { await updateDoc(doc(db, 'users', S.uid), { saved: was ? arrayRemove(key) : arrayUnion(key) }); toast(was ? 'Убрано из сохранённого' : 'Сохранено — смотрите в профиле'); }
  catch (e) { toast(errText(e)); }
}
async function share(v) {
  const url = siteUrl('clip/' + v.id);
  if (navigator.share) { try { await navigator.share({ title: 'Клип в Миге', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch (e) { prompt('Ссылка на клип:', url); }
}

/* ---------- экраны ---------- */
function shell(inner, full = false) {
  const on = v => S.view === v ? 'on' : '';
  const meLink = S.me?.nick ? '@' + S.me.nick : 'me';
  root.innerHTML = `
    <aside class="side">
      <a class="logo brand" data-go="" href="${BASE}"><img src="${BASE}mig/icon-192.png" alt="">Миг</a>
      <a data-go="" href="${BASE}" class="${on('feed')}">${ic('home')}Главная</a>
      <a data-go="friends" href="${BASE}friends" class="${on('friends')}">${ic('friends')}Друзья</a>
      <button data-act="plus">${ic('plus')}Снять клип</button>
      <a data-go="${meLink}" href="${BASE}${meLink}" class="${on('me')}">${ic('person')}Профиль</a>
      <div class="promo"><b>Миг для Android</b><span>Снимайте клипы под звуки, вайбогенератор тем и обои от нейросети.</span><br><a href="${APK}">Скачать APK</a></div>
    </aside>
    <div class="main"><div class="view ${full ? 'full' : ''}" id="view">${inner}</div></div>
    <nav class="nav">
      <a data-go="" href="${BASE}" class="${on('feed')}">${ic('home')}Главная</a>
      <a data-go="friends" href="${BASE}friends" class="${on('friends')}">${ic('friends')}Друзья</a>
      <button data-act="plus"><span class="plus">${ic('plus')}</span></button>
      <a data-go="${meLink}" href="${BASE}${meLink}" class="${on('me')}">${ic('person')}Профиль</a>
    </nav>`;
  root.querySelectorAll('[data-act=plus]').forEach(b => b.onclick = () => appSheet('Снимать и выкладывать клипы — в приложении: камера, звуки из библиотеки и сжатие видео.'));
  return $('#view');
}
const loading = () => '<div class="empty"><div class="spinner"></div></div>';
const topTabs = friends => `<div class="topbar"><a class="tab ${friends ? 'on' : ''}" data-go="friends" href="${BASE}friends">Друзья</a><span class="dot"></span><a class="tab ${friends ? '' : 'on'}" data-go="" href="${BASE}">Для вас</a></div>`;

async function viewFeed() {
  const host = shell(loading());
  if (!forYou.list.length) { try { await moreForYou(); } catch (e) { host.innerHTML = `<div class="empty"><div class="e">📡</div><h2>Не загрузилось</h2><p>${esc(errText(e))}</p></div>`; return; } }
  if (S.view !== 'feed') return;
  if (!forYou.list.length) { host.innerHTML = topTabs(false) + `<div class="empty"><div class="e">🎬</div><h2>Клипов пока нет</h2><p>Снимите первый — в приложении «Миг»</p><a class="btn lime" href="${APK}" style="margin-top:14px">Скачать APK</a></div>`; return; }
  mountFeed(host, forYou.list, { more: moreForYou, topbar: topTabs(false) });
}
async function viewFriends() {
  const host = shell(loading());
  const list = await friendsClips().catch(() => []);
  if (S.view !== 'friends') return;
  if (!list.length) { host.innerHTML = topTabs(true) + `<div class="empty"><div class="e">👯</div><h2>${(S.me?.friends || []).length ? 'Друзья пока ничего не сняли' : 'Здесь будут клипы друзей'}</h2><p>Добавляйте друзей в приложении — их клипы появятся тут</p></div>`; return; }
  mountFeed(host, list, { topbar: topTabs(true) });
}
function viewWatch(list, start, backTo) {
  const host = shell('');
  mountFeed(host, list, { start, topbar: `<button class="back" aria-label="Назад">‹</button>` });
  $('.back', host).onclick = () => history.length > 1 ? history.back() : go(backTo || '');
}
async function viewClip(id) {
  const host = shell(loading());
  const s = await getDoc(doc(db, 'videos', id)).catch(() => null);
  if (!forYou.list.length) await moreForYou().catch(() => {});
  const first = s?.exists() ? vidOf(s) : null;
  if (!first) toast('Клип не найден — возможно, его удалили');
  const list = [...(first ? [first] : []), ...forYou.list.filter(v => v.id !== id)];
  if (S.view !== 'clip') return;
  if (!list.length) { host.innerHTML = `<div class="empty"><div class="e">🫥</div><h2>Клипов нет</h2></div>`; return; }
  viewWatch(list, 0, '');
}
async function viewProfile(idOrNick) {
  const host = shell(loading());
  let id = idOrNick;
  if (idOrNick.startsWith('@')) {
    const s = await getDoc(doc(db, 'usernames', idOrNick.slice(1).toLowerCase())).catch(() => null);
    id = s?.exists() ? s.data().uid : null;
  }
  if (!id) { host.innerHTML = `<div class="empty"><div class="e">🫥</div><h2>Нет такой страницы</h2></div>`; return; }
  const own = id === S.uid;
  if (own) S.view = 'me';
  shell(loading());
  const [u, clips] = await Promise.all([own ? S.me : user(id), clipsOf(id).catch(() => [])]);
  const view = $('#view');
  if (!u || u.missing) { view.innerHTML = `<div class="empty"><div class="e">🫥</div><h2>Страница удалена</h2></div>`; return; }
  if (u.banned) { view.innerHTML = `<div class="empty"><div class="e">🚫</div><h2>Deleted Account</h2></div>`; return; }
  const likes = clips.reduce((a, v) => a + (v.likes || []).length, 0);
  const bio = [u.status, u.about].filter(Boolean).join('\n');
  view.innerHTML = `<div class="prof"><div class="head">
      <div class="row"><div style="flex:1;min-width:0"><h1>${esc(u.name)}${u.emoji ? ' ' + esc(u.emoji) : ''}</h1>${u.nick ? `<div class="nick">@${esc(u.nick)}</div>` : ''}</div>
        <div class="ring">${avatar(u)}</div></div>
      <div class="stats card"><div><b>${fmtNum((u.friends || []).length)}</b><span>Друзья</span></div><div><b>${fmtNum(clips.length)}</b><span>${plural(clips.length, 'Клип', 'Клипа', 'Клипов')}</span></div><div><b>${fmtNum(likes)}</b><span>Лайки</span></div></div>
      ${bio ? `<div class="bio">${esc(bio)}</div>` : ''}
      <div class="btns">${own ? `<button class="btn gray" data-p="edit">Изменить профиль</button><button class="btn gray" data-p="share">Поделиться</button><button class="btn gray" data-p="stats">📊</button>`
        : `<button class="btn" data-p="friend">Добавить в друзья</button><button class="btn gray" data-p="share">Поделиться</button>`}</div>
      ${own ? `<div class="btns"><button class="btn gray" data-p="out">Выйти</button></div>` : ''}
    </div>
    ${clips.length ? `<div class="grid">${clips.map((v, i) => `<a class="cell" href="#" data-w="${i}">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : ''}<span>${ic('play')}${fmtNum(v.views || 0)}</span></a>`).join('')}</div>`
      : `<div class="empty" style="position:static;padding:48px 24px"><div class="e">🎬</div><h2>${own ? 'Снимите первый клип' : 'Клипов пока нет'}</h2>${own ? `<p>Снимать — в приложении «Миг»</p>` : ''}</div>`}
  </div>`;
  view.querySelectorAll('[data-w]').forEach(a => a.onclick = e => { e.preventDefault(); history.pushState(null, '', location.pathname); viewWatch(clips, +a.dataset.w, u.nick ? '@' + u.nick : 'id/' + id); });
  view.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const p = b.dataset.p;
    if (p === 'share') copyProfile(u);
    if (p === 'stats') go('stats');
    if (p === 'edit') appSheet('Менять фото, имя и тему — в приложении.');
    if (p === 'friend') appSheet('Заявки в друзья и сообщения — в приложении.');
    if (p === 'out') { forYou.list = []; forYou.last = null; forYou.end = false; signOut(auth); }
  });
}
async function copyProfile(u) {
  const url = siteUrl(u.nick ? '@' + u.nick : 'id/' + u.id);
  if (navigator.share) { try { await navigator.share({ title: (u.name || '') + ' в Миге', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Ссылка на профиль скопирована'); } catch (e) { prompt('Ссылка:', url); }
}

/* ---------- вход и анкета ---------- */
const GOOGLE_CLIENT = '195735209722-8tjsd33moqquhreivj07f48l5cga0r3d.apps.googleusercontent.com';
async function sha256hex(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function googleGo() {      // переход на Google и обратно (если всплывающее окно не открылось)
  const raw = crypto.randomUUID(), state = crypto.randomUUID();
  try { localStorage.setItem('vs_gauth', JSON.stringify({ raw, state })); } catch (e) { }
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT, redirect_uri: location.origin + BASE, response_type: 'id_token', scope: 'openid email profile',
    prompt: 'select_account', nonce: await sha256hex(raw), state,
  });
}
{
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has('id_token')) {
    history.replaceState(null, '', BASE);
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('vs_gauth') || '{}'); localStorage.removeItem('vs_gauth'); } catch (e) { }
    if (saved.state === p.get('state')) signInWithCredential(auth, new OAuthProvider('google.com').credential({ idToken: p.get('id_token'), rawNonce: saved.raw }))
      .catch(() => signInWithCredential(auth, GoogleAuthProvider.credential(p.get('id_token')))).catch(e => { S.authErr = errText(e); render(); });
  }
}
function viewAuth() {
  root.innerHTML = `<div class="auth" style="width:100%"><div class="box">
    <img class="logo" src="${BASE}mig/icon-192.png" alt="">
    <h1>Миг — короткие видео</h1>
    <p class="sub">Смотрите клипы друзей и всех вокруг. Тот же аккаунт, что в приложении.</p>
    <div class="seg"><button class="${S.authTab === 0 ? 'on' : ''}" data-t="0">Вход</button><button class="${S.authTab === 1 ? 'on' : ''}" data-t="1">Регистрация</button></div>
    <input class="field" id="em" type="email" placeholder="Почта" autocomplete="email">
    <input class="field" id="pw" type="password" placeholder="Пароль${S.authTab ? ' (от 6 символов)' : ''}" autocomplete="${S.authTab ? 'new-password' : 'current-password'}">
    ${S.authErr ? `<div class="err">${esc(S.authErr)}</div>` : ''}
    <button class="btn" id="go" ${S.busy ? 'disabled' : ''}>${S.authTab ? 'Создать аккаунт' : 'Войти'}</button>
    ${S.authTab ? '' : '<button class="btn gray" id="reset" style="height:40px;font-size:14px">Забыли пароль?</button>'}
    <div class="or">или</div>
    <button class="btn gray" id="google"><b style="color:#4285F4">G</b> Войти через Google</button>
    <div class="apk">Снимать клипы — в приложении · <a href="${APK}">Скачать APK</a></div>
  </div></div>`;
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.authTab = +b.dataset.t; S.authErr = ''; viewAuth(); });
  const run = async f => { S.authErr = ''; S.busy = true; $('#go').disabled = true; try { await f(); } catch (e) { S.authErr = errText(e); } S.busy = false; if (S.phase === 'auth') viewAuth(); };
  $('#go').onclick = () => { const em = $('#em').value.trim(), pw = $('#pw').value; run(() => S.authTab ? createUserWithEmailAndPassword(auth, em, pw) : signInWithEmailAndPassword(auth, em, pw)); };
  $('#pw').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
  $('#reset') && ($('#reset').onclick = () => { const em = $('#em').value.trim(); if (!em) { S.authErr = 'Напишите почту — пришлём ссылку для нового пароля'; viewAuth(); return; } run(async () => { await sendPasswordResetEmail(auth, em); toast('Письмо для смены пароля отправлено'); }); });
  $('#google').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { if (/popup-blocked|operation-not-supported|web-storage/.test(e.code || '')) googleGo(); else if (!/popup-closed|cancelled/.test(e.code || '')) { S.authErr = errText(e); viewAuth(); } }
  };
}
function buildSearch(name, nick, city) {      // как на сайте и в приложении: префиксы слов для поиска
  const words = `${name || ''} ${city || ''}`.toLowerCase().replace(/ё/g, 'е').split(/[\s\-,.]+/).filter(Boolean);
  if (nick) words.push(nick.toLowerCase());
  const set = new Set(); words.forEach(w => { for (let i = 1; i <= Math.min(w.length, 15); i++) set.add(w.slice(0, i)); });
  return [...set].slice(0, 150);
}
function viewOnboard() {
  root.innerHTML = `<div class="auth" style="width:100%"><div class="box">
    <img class="logo" src="${BASE}mig/icon-192.png" alt="">
    <h1>Расскажите о себе</h1><p class="sub">Так друзья найдут вас в Миге.</p>
    <input class="field" id="nm" placeholder="Имя и фамилия" maxlength="60">
    <input class="field" id="nk" placeholder="Короткое имя (латиница, от 4 символов)" maxlength="30" autocapitalize="off">
    <input class="field" id="ct" placeholder="Город (необязательно)" maxlength="40">
    <div class="err" id="er"></div>
    <button class="btn" id="go">Готово</button>
    <button class="btn gray" id="out" style="height:40px;font-size:14px">Выйти</button>
  </div></div>`;
  $('#nk').oninput = e => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); };
  $('#out').onclick = () => signOut(auth);
  $('#go').onclick = async () => {
    const name = $('#nm').value.trim().slice(0, 60), nick = $('#nk').value.trim(), city = $('#ct').value.trim().slice(0, 40), er = $('#er');
    if (!name) { er.textContent = 'Напишите имя'; return; }
    if (!NICK_RE.test(nick)) { er.textContent = 'Короткое имя: от 4 до 30 символов — латиница, цифры, точка и _'; return; }
    $('#go').disabled = true; er.textContent = '';
    try {
      const t = await getDoc(doc(db, 'usernames', nick));
      if (t.exists() && t.data().uid !== S.uid) throw new Error('Короткое имя уже занято, выберите другое');
      const b = writeBatch(db);
      b.set(doc(db, 'usernames', nick), { uid: S.uid });
      b.set(doc(db, 'users', S.uid), { name, nick, city, status: '', about: '', photo: '', color: COLORS[Math.floor(Math.random() * COLORS.length)],
        friends: [], search: buildSearch(name, nick, city), createdAt: serverTimestamp() });
      await b.commit();
    } catch (e) { er.textContent = e.message?.startsWith('Короткое') ? e.message : errText(e); $('#go').disabled = false; }
  };
}


/* ---------- статистика автора: /stats ----------
   Из приложения (встроенный браузер, без входа) данные приходят в ссылке: #d=<base64url JSON {n, c:[[подпись, просмотры, лайки, мс]…]}>,
   рядом — цвета темы приложения (bg, card, ink, mut, line, a — шесть hex-цифр), чтобы страница выглядела как экран приложения.
   Без данных — свои клипы из базы (нужен вход). */
function statsFromHash() {
  const m = location.hash.match(/[#&]d=([^&]+)/); if (!m) return null;
  try {
    const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
    return { name: String(j.n || ''), clips: (j.c || []).slice(0, 500).map(a => ({ title: String(a[0] || ''), views: +a[1] || 0, likes: +a[2] || 0, at: +a[3] || 0, thumb: '' })) };
  } catch (e) { return { name: '', clips: [], bad: true }; }
}
function statsTheme() {      // цвета приложения → переменные страницы
  const p = new URLSearchParams(location.hash.slice(1)), hex = k => /^[0-9a-f]{6}$/i.test(p.get(k) || '') ? '#' + p.get(k) : null;
  const map = { bg: '--bg', card: '--surf', ink: '--ink', mut: '--muted', line: '--line', a: '--green' };
  return Object.entries(map).map(([k, v]) => hex(k) ? `${v}:${hex(k)};` : '').join('') + (hex('a') ? `--leaf:${hex('a')};--lime:${hex('a')};` : '') + (hex('line') ? `--surf2:${hex('line')};` : '');
}
const statsTitle = t => t && t !== '​' && t.trim() ? t : 'Без подписи';
const short = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + 'м' : v >= 1e3 ? (v / 1e3).toFixed(1).replace('.0', '') + 'к' : String(v);
function statsBars(vals, labels, cls = '') {
  const max = Math.max(1, ...vals);
  return `<div class="st-bars ${cls}">${vals.map((v, i) => `<div class="st-bar"><div class="st-track"><i style="height:${Math.max(v ? 4 : 0, v / max * 100)}%"></i></div><b>${short(v)}</b><span>${esc(labels[i])}</span></div>`).join('')}</div>`;
}
const ST_PERIODS = [['7', '7 дн.'], ['28', '28 дн.'], ['all', 'Всё время']];
function statsHtml(d, period) {
  if (!d.clips.length) return `<div class="st-card st-empty"><div class="e">📊</div><b>${d.bad ? 'Не получилось открыть' : 'Пока нечего считать'}</b><span>${d.bad ? 'Закройте и откройте статистику ещё раз' : 'Снимите первый клип — здесь появятся просмотры и лайки'}</span></div>`;
  const from = period === 'all' ? 0 : Date.now() - +period * 864e5;
  const clips = d.clips.filter(v => v.at >= from);
  const chips = `<div class="st-chips">${ST_PERIODS.map(([k, l]) => `<button data-per="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const when = period === 'all' ? 'за всё время' : `за ${period} дн.`;
  if (!clips.length) return chips + `<div class="st-card st-empty"><div class="e">🗓</div><b>За ${period} дн. клипов не было</b><span>Выберите период побольше</span></div>`;
  const views = clips.reduce((a, v) => a + v.views, 0), likes = clips.reduce((a, v) => a + v.likes, 0);
  const rate = views ? (likes * 100 / views).toFixed(1).replace('.', ',') : '0';
  const best = clips.reduce((a, v) => v.views > a.views ? v : a, clips[0]);
  const recent = [...clips].sort((a, b) => a.at - b.at).slice(-12);
  const wd = [0, 0, 0, 0, 0, 0, 0]; clips.forEach(v => { if (v.at) wd[(new Date(v.at).getDay() + 6) % 7]++; });
  const top = [...clips].sort((a, b) => b.views - a.views).slice(0, 5), topMax = Math.max(1, top[0]?.views || 0);
  const date = t => { const x = new Date(t); return t ? x.getDate() + '.' + (x.getMonth() + 1) : '—'; };
  const thumb = v => `<div class="st-thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : ic('play')}</div>`;
  return chips + `<div class="st-card"><div class="st-h">Обзор<small>${when}</small></div>
      <div class="st-grid">
        <div><span>Просмотры</span><b>${short(views)}</b></div>
        <div><span>Лайки</span><b>${short(likes)}</b></div>
        <div><span>${plural(clips.length, 'Клип', 'Клипа', 'Клипов')}</span><b>${clips.length}</b></div>
      </div>
      <div class="st-sub"><span>Лайков от просмотров</span><b>${rate}%</b></div>
      <div class="st-sub"><span>В среднем на клип</span><b>${fmtNum(Math.round(views / clips.length))} 👁</b></div>
    </div>
    <div class="st-card"><div class="st-h">Лучший клип</div>
      <div class="st-best">${thumb(best)}<div><div class="st-t">${esc(statsTitle(best.title))}</div><div class="st-m">${date(best.at)}</div><div class="st-nums"><span>👁 ${fmtNum(best.views)}</span><span>❤️ ${fmtNum(best.likes)}</span></div></div></div>
    </div>
    <div class="st-card"><div class="st-h">Просмотры по клипам<small>последние ${recent.length}</small></div>${statsBars(recent.map(v => v.views), recent.map(v => date(v.at)))}</div>
    <div class="st-card"><div class="st-h">Когда вы публикуете</div>${statsBars(wd, ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], 'soft')}</div>
    <div class="st-card"><div class="st-h">Топ клипов</div>
      ${top.map((v, i) => `<div class="st-top"><b class="st-n">${i + 1}</b>${thumb(v)}<div class="st-tw"><div class="st-t1">${esc(statsTitle(v.title))}</div><div class="st-line"><i style="width:${v.views / topMax * 100}%"></i></div><small>👁 ${fmtNum(v.views)} · ❤️ ${fmtNum(v.likes)}</small></div></div>`).join('')}
    </div>
    <p class="st-note">Цифры по клипам, опубликованным ${when}.</p>`;
}
function statsMount(el, d) {      // переключатель периода перерисовывает только содержимое
  let per = '28';
  try { per = localStorage.getItem('mig_stats_per') || per; } catch (e) { }
  if (!ST_PERIODS.some(p => p[0] === per)) per = '28';
  const draw = () => { el.innerHTML = statsHtml(d, per); };
  el.onclick = e => { const b = e.target.closest('[data-per]'); if (!b) return; per = b.dataset.per; try { localStorage.setItem('mig_stats_per', per); } catch (x) { } draw(); };
  draw();
}
function viewStatsApp(d) {      // открыто из приложения: выглядит как экран приложения — без шапки, панели, выделения и масштаба
  document.title = 'Статистика';
  document.documentElement.classList.add('st-app');
  root.innerHTML = `<div class="stats-page app" style="${statsTheme()}"><div id="stBody"></div></div>`;
  document.body.style.background = getComputedStyle(root.firstElementChild).getPropertyValue('--bg');
  statsMount($('#stBody'), d);
}
async function viewStats() {
  const host = shell(loading());
  const clips = await clipsOf(S.uid).catch(() => null);
  if (S.view !== 'stats') return;
  if (!clips) { host.innerHTML = `<div class="empty"><div class="e">📡</div><h2>Не загрузилось</h2></div>`; return; }
  host.innerHTML = `<div class="stats-page"><h1>Статистика</h1><div id="stBody"></div></div>`;
  statsMount($('#stBody', host), { clips: clips.map(v => ({ title: v.title, views: v.views || 0, likes: (v.likes || []).length, at: ms(v.createdAt), thumb: v.thumb || '' })) });
}

/* ---------- маршруты ---------- */
function route() {
  if (curRoute() === 'stats' && statsFromHash()) { feedCtl?.destroy(); S.view = 'stats'; return viewStatsApp(statsFromHash()); }
  if (S.phase !== 'app') return render();
  feedCtl?.destroy();
  const [a, b] = curRoute().split('/');
  if (a === '' || a === 'feed') { S.view = 'feed'; viewFeed(); }
  else if (a === 'friends') { S.view = 'friends'; viewFriends(); }
  else if (a === 'clip' && b) { S.view = 'clip'; viewClip(b); }
  else if (a === 'me') { S.view = 'me'; if (S.me?.nick) go('@' + S.me.nick, true); else viewProfile(S.uid); }
  else if (a.startsWith('@')) { S.view = 'profile'; viewProfile(decodeURIComponent(a)); }
  else if (a === 'id' && b) { S.view = 'profile'; viewProfile(b); }
  else if (a === 'stats') { S.view = 'stats'; viewStats(); }
  else { S.view = 'feed'; go('', true); }
}
function render() {
  if (curRoute() === 'stats' && statsFromHash()) return route();
  if (S.phase === 'loading') root.innerHTML = `<div class="empty" style="position:fixed"><img src="${BASE}mig/icon-192.png" style="width:96px;height:96px;border-radius:26px" alt=""></div>`;
  else if (S.phase === 'auth') viewAuth();
  else if (S.phase === 'profile') viewOnboard();
  else route();
}

onAuthStateChanged(auth, u => {
  meUnsub?.(); meUnsub = null; feedCtl?.destroy();
  if (!u) { S.uid = null; S.me = null; S.phase = 'auth'; render(); return; }
  S.uid = u.uid; S.phase = 'loading'; render();
  let first = true;
  meUnsub = onSnapshot(doc(db, 'users', u.uid), s => {
    if (!s.exists()) { if (!s.metadata.fromCache) { S.me = null; S.phase = 'profile'; render(); } return; }
    S.me = { id: u.uid, ...s.data() }; users.set(u.uid, S.me);
    const was = S.phase; S.phase = 'app';
    if (first || was !== 'app') { first = false; route(); } else feedCtl?.repaint();
  }, e => { S.phase = 'auth'; S.authErr = errText(e); render(); });
});
render();
