// Общие помощники: безопасные шаблоны, «умная» перерисовка (morph), время, иконки, сжатие картинок.

/* ---------- Шаблоны ----------
   html`…${x}…` экранирует всё подставленное. Готовую разметку передают через raw() или другой html`…`. */
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s ?? ''));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = v => v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v);
export const html = (strs, ...vals) => new Raw(strs.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));

/* ---------- morph: меняем в DOM только то, что изменилось ----------
   Элементы сопоставляются по data-k (или id), иначе по месту и тегу. Набранный текст в полях не трогаем,
   элементы с data-keep (видео, холсты) не перестраиваем вовсе. */
const keyOf = n => n.nodeType === 1 ? (n.getAttribute('data-k') || n.id || null) : null;
function patchAttrs(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}
function update(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.hasAttribute('data-keep') && a.getAttribute('data-keep') === b.getAttribute('data-keep')) return;
  patchAttrs(a, b);
  const tag = a.nodeName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (b.hasAttribute('data-v')) { const v = b.getAttribute('data-v'); if (a.value !== v) a.value = v; }
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    if (tag === 'SELECT') patchKids(a, b);
    return;
  }
  patchKids(a, b);
}
function patchKids(p, np) {
  const olds = [...p.childNodes], keyed = new Map(), used = new Set();
  for (const n of olds) { const k = keyOf(n); if (k) keyed.set(k, n); }
  let i = 0;
  for (const nn of [...np.childNodes]) {
    const k = keyOf(nn); let m = null;
    if (k) { m = keyed.get(k) || null; if (m && m.nodeName !== nn.nodeName) m = null; }
    else { const c = p.childNodes[i]; if (c && !used.has(c) && !keyOf(c) && c.nodeType === nn.nodeType && c.nodeName === nn.nodeName) m = c; }
    if (m) { if (p.childNodes[i] !== m) p.insertBefore(m, p.childNodes[i] || null); update(m, nn); used.add(m); if (k) keyed.delete(k); }
    else p.insertBefore(nn, p.childNodes[i] || null), used.add(nn);
    i++;
  }
  for (const n of olds) if (!used.has(n) && n.parentNode === p) p.removeChild(n);
}
export function morph(root, markup) {
  const t = document.createElement('template'); t.innerHTML = String(markup);
  patchKids(root, t.content);
}

/* ---------- Время и числа ---------- */
export const ms = t => t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : t instanceof Date ? t.getTime() : Date.now();
export const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
export function ago(t) {
  const x = ms(t), s = (Date.now() - x) / 1000, d = new Date(x), now = new Date();
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (d.toDateString() === now.toDateString()) return 'сегодня в ' + hm(d);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'вчера в ' + hm(d);
  return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '') + ' в ' + hm(d);
}
export function dayLabel(t) {
  const d = new Date(ms(t)), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
}
export const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' млн' : n >= 1e4 ? Math.round(n / 1e3) + ' тыс.' : String(n || 0);
export const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.0', '') + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
export const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
export const rid = () => Math.random().toString(36).slice(2, 10);
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

/* ---------- Текст пользователя: ссылки, #теги и @упоминания (всё экранировано) ---------- */
export function richText(t) {
  return raw(String(t ?? '').split(/(https?:\/\/[^\s<]+[^\s<.,:;!?)\]"'»])/g).map((p, i) => {
    if (i % 2) return `<a href="${esc(p)}" target="_blank" rel="noopener nofollow ugc">${esc(p)}</a>`;
    return esc(p).replace(/(^|[\s(])#([\p{L}\d_]{2,30})/gu, (m, a, tag) => `${a}<a class="tag" href="search/${encodeURIComponent('#' + tag.toLowerCase())}">#${tag}</a>`)
      .replace(/(^|[\s(])@([a-zA-Z0-9._]{3,30})/g, (m, a, n) => `${a}<a class="tag" href="@${n.toLowerCase()}">@${n}</a>`);
  }).join(''));
}
export const extractTags = t => [...new Set([...String(t || '').matchAll(/#([\p{L}\d_]{2,30})/gu)].map(m => m[1].toLowerCase()))].slice(0, 10);
export const extractMentions = t => [...new Set([...String(t || '').matchAll(/(?:^|[\s(,.!?])@([a-z0-9._]{3,30})/gi)].map(m => m[1].toLowerCase()))].slice(0, 5);
// поисковые слова профиля (формат, который уже лежит в базе: все начала слов имени, города и ника, до 15 букв)
export function buildSearch(name, nick, city) {
  const words = `${name || ''} ${city || ''}`.toLowerCase().replace(/ё/g, 'е').split(/[\s\-,.]+/).filter(Boolean);
  if (nick) words.push(nick.toLowerCase());
  const set = new Set();
  words.forEach(w => { for (let i = 1; i <= Math.min(w.length, 15); i++) set.add(w.slice(0, i)); });
  return [...set].slice(0, 150);
}

/* ---------- Картинки: сжатие в JPEG dataURL под лимит ---------- */
export const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = src; });
export async function compress(file, maxSide, maxChars, square = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    let w = img.naturalWidth, h = img.naturalHeight, sx = 0, sy = 0, sw = w, sh = h;
    if (square) { const s = Math.min(w, h); sx = (w - s) / 2; sy = (h - s) / 2; sw = sh = s; w = h = s; }
    for (let side = maxSide; side >= 160; side = Math.round(side * 0.8)) {
      const k = Math.min(1, side / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.75, 0.62, 0.5]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= maxChars) return d; }
    }
    throw new Error('too-big');
  } finally { URL.revokeObjectURL(url); }
}
export const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(s) ? s : '';
export const safePhoto = s => typeof s === 'string' && (/^data:image\/(jpeg|png|webp|gif);base64,/.test(s) || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(s)) ? s : '';
export const readDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });

/* ---------- Иконки (свои, линией 1.8) ---------- */
const ic = (d, fill = false) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${fill ? ' fill="currentColor" stroke="none"' : ''}>${d}</svg>`;
export const I = {
  home: ic('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
  feed: ic('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  chat: ic('<path d="M4.5 18.5 5.8 15A7.5 7.5 0 1 1 9 18.3z"/><path d="M8.5 11h7M8.5 14h4.5"/>'),
  friends: ic('<circle cx="9" cy="8.5" r="3.3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M16.5 14c2.2.1 3.6 1.6 4 4.3"/>'),
  bell: ic('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  music: ic('<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>'),
  video: ic('<rect x="3" y="5.5" width="13.5" height="13" rx="3"/><path d="m16.5 10.5 4.5-3v9l-4.5-3"/>'),
  clips: ic('<rect x="6" y="3" width="12" height="18" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>'),
  user: ic('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-4 3.8-6 7.5-6s6.6 2 7.5 6"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
  search: ic('<circle cx="10.8" cy="10.8" r="6.3"/><path d="m20 20-4.6-4.6"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: ic('<path d="M15 5 8 12l7 7"/>'),
  more: ic('<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>', true),
  heart: ic('<path d="M12 20s-7.5-4.6-9-9.3C2 7.5 4 4.8 7 4.8c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3 0 5 2.7 4 5.9-1.5 4.7-9 9.3-9 9.3z"/>'),
  heartF: ic('<path d="M12 20s-7.5-4.6-9-9.3C2 7.5 4 4.8 7 4.8c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3 0 5 2.7 4 5.9-1.5 4.7-9 9.3-9 9.3z"/>', true),
  comment: ic('<path d="M5 17.5 4 21l4-1.8A8 8 0 1 0 5 17.5z"/>'),
  share: ic('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>'),
  photo: ic('<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.5"/>'),
  poll: ic('<path d="M5 20V12M10.5 20V5M16 20v-6M3.5 20h17"/>'),
  send: ic('<path d="M4 12 20 4l-5 16-3.5-6.5z"/><path d="m11.5 13.5 4-4"/>'),
  mic: ic('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>'),
  phone: ic('<path d="M5 3.5h3.2l1.6 4.2-2.2 1.5a11 11 0 0 0 7.2 7.2l1.5-2.2 4.2 1.6V19a1.8 1.8 0 0 1-1.9 1.8A16.6 16.6 0 0 1 3.2 5.4 1.8 1.8 0 0 1 5 3.5z"/>'),
  cam: ic('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3"/>'),
  camOff: ic('<path d="m3 3 18 18M16 10.5l5-3v9l-3.5-2.1M14 18H6a3 3 0 0 1-3-3V9a3 3 0 0 1 2-2.8"/><path d="M9 6h4a3 3 0 0 1 3 3v2"/>'),
  micOff: ic('<path d="m3 3 18 18M9 9v2.5a3 3 0 0 0 5 2.2M15 9.5V6.5a3 3 0 0 0-6-.3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 10.6 5M18.5 11.5a6.4 6.4 0 0 1-.6 2.7M12 18v3"/>'),
  play: ic('<path d="M8 5.5v13l10.5-6.5z"/>', true),
  pause: ic('<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>', true),
  next: ic('<path d="M6 5.5v13l9-6.5zM17 5.5v13"/>'),
  prev: ic('<path d="M18 5.5v13l-9-6.5zM7 5.5v13"/>'),
  shuffle: ic('<path d="M3.5 7h3.5c4 0 6 10 10 10h3.5M3.5 17H7c1.6 0 2.8-1.6 3.8-3.5M14.4 9.5C15.3 8 16.4 7 17.5 7H21"/><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5"/>'),
  repeat: ic('<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="m16 3 3 3-3 3M8 21l-3-3 3-3"/>'),
  upload: ic('<path d="M12 16V4M7 8.5 12 4l5 4.5"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>'),
  link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  trash: ic('<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7"/>'),
  edit: ic('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  reply: ic('<path d="M9.5 8.5 4.5 13l5 4.5"/><path d="M5 13h9a5 5 0 0 1 5 5v1"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  checks: ic('<path d="m2.5 12.5 4.5 4.5 9-9.5M12.5 15.5l1.5 1.5 8-8.5"/>'),
  eye: ic('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  down: ic('<path d="m6 9.5 6 6 6-6"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: ic('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
  logout: ic('<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8 6 12l4 4M6 12h10"/>'),
  volume: ic('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  mute: ic('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  list: ic('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="17.5" r="1.2"/>'),
  lyrics: ic('<path d="M4 6h12M4 10h12M4 14h7"/><path d="M17 20v-7l4-1"/><circle cx="15.5" cy="20" r="1.5"/>'),
  globe: ic('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>'),
  lock: ic('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  google: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" stroke="none" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" stroke="none" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" stroke="none" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" stroke="none" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"/></svg>',
};

/* ---------- Мелочи интерфейса ---------- */
let toastT = 0;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.className = 'toast on';
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'toast'; }, 2600);
}
export const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } };
export const lsJson = (k, def) => { try { const v = JSON.parse(lsGet(k)); return v ?? def; } catch (e) { return def; } };
export async function copyText(t, done = 'Скопировано') {
  try { await navigator.clipboard.writeText(t); toast(done); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast(done); } catch (x) { toast('Не получилось скопировать'); } a.remove(); }
}
