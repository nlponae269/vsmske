// Музыка: Поток (все треки по очереди), Мои треки, загрузка с тегами MP3, плеер (мини-панель и полноэкранный), экран блокировки.
import { db, uid, data, errText, doc, collection, query, where, orderBy, limit, startAfter, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove } from './fb.js';
import { S, U, hidden, locked, view, act, form, onInput, modal, openModal, closeModal, render, sub, ensureUsers, empty, skeleton, pageHead, shellExtra, siteUrl, onAfterRender } from './core.js';
import { html, raw, I, fmtDur, fmtSize, norm, toast, copyText, compress, safeImg, lsGet, lsSet } from './lib.js';
import { uploadFile, fileUrl, deleteFile } from './files.js';
import { pickFiles } from './posts.js';

const M = { tab: 'stream', stream: [], last: null, done: false, busy: false, mine: null, q: '', up: null };
export const tracks = new Map();
const keep = l => { l.forEach(t => tracks.set(t.id, t)); ensureUsers(l.map(t => t.ownerId)); return l; };
const PALS = [['#FF5A2E', '#FFB86B'], ['#6D5DFC', '#C084FC'], ['#0EA5A4', '#7DD3FC'], ['#E11D48', '#FB7185'], ['#16A34A', '#A3E635'], ['#1E293B', '#64748B']];
const pal = t => PALS[[...String(t.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALS.length];
export const cover = (t, cls = '') => hidden(t.ownerId) ? html`<span class="tcov off ${cls}">${raw(I.lock)}</span>` : safeImg(t.cover) ? html`<span class="tcov ${cls}"><img src="${t.cover}" alt="" loading="lazy"></span>`
  : html`<span class="tcov ${cls}" style="--c1:${pal(t)[0]};--c2:${pal(t)[1]}">${raw(I.music)}</span>`;

async function loadStream() {
  if (M.busy || M.done) return; M.busy = true;
  try {
    const s = await getDocs(query(collection(db, 'tracks'), orderBy('createdAt', 'desc'), ...(M.last ? [startAfter(M.last)] : []), limit(50)));
    M.last = s.docs[s.docs.length - 1] || M.last; if (s.size < 50) M.done = true;
    M.stream.push(...keep(s.docs.map(data)));
  } catch (e) { console.error(e); M.done = true; }
  M.busy = false; render();
}
async function loadMine() {
  const ids = [...(S.me.tracks || [])].reverse();
  const own = await getDocs(query(collection(db, 'tracks'), where('ownerId', '==', uid()), limit(300))).then(s => keep(s.docs.map(data))).catch(() => []);
  const saved = (await Promise.all(ids.filter(id => !tracks.has(id)).slice(0, 300).map(id => getDoc(doc(db, 'tracks', id)).then(s => s.exists() ? data(s) : null).catch(() => null)))).filter(Boolean);
  keep(saved);
  const list = [...ids.map(id => tracks.get(id)).filter(Boolean), ...own.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))];
  M.mine = list.filter((t, i) => list.findIndex(x => x.id === t.id) === i); render();
}
view('music', {
  wide: true, title: 'Музыка',
  enter(arg) {
    if (arg?.startsWith('t_')) { M.tab = 'one'; M.one = null; getDoc(doc(db, 'tracks', arg.slice(2))).then(s => { M.one = s.exists() ? keep([data(s)])[0] : false; render(); }); return; }
    M.tab = arg === 'my' ? 'my' : 'stream';
    if (!M.stream.length) loadStream();
    if (M.tab === 'my') loadMine();
  },
  render() {
    const q = norm(M.q).trim();
    const list = M.tab === 'one' ? (M.one ? [M.one] : []) : M.tab === 'my' ? M.mine : M.stream;
    const shown = q && list ? list.filter(t => norm(t.title + ' ' + t.artist).includes(q)) : list;
    const now = cur();
    return html`${pageHead('Музыка', M.tab === 'my' ? 'Ваши загрузки и сохранённые треки' : 'Вся музыка VСмске подряд — от новых к старым', html`<button class="btn" data-a="mus-upload">${raw(I.upload)} Загрузить</button>`)}
      <div class="mus-hero card" style="--c1:${now ? pal(now)[0] : '#FF5A2E'};--c2:${now ? pal(now)[1] : '#6D5DFC'}">
        <div class="grow"><span class="kick">${now ? 'Сейчас играет' : 'Поток'}</span><b>${now ? now.title : 'Включить всё подряд'}</b><span>${now ? now.artist || 'Неизвестный исполнитель' : `${M.stream.length}${M.done ? '' : '+'} треков от всех, кто загружает`}</span></div>
        <button class="play-big" data-a="${now ? 'pl-toggle' : 'mus-play-all'}" aria-label="Играть">${raw(now && !A.paused ? I.pause : I.play)}</button></div>
      ${M.up ? html`<div class="card upbar"><b>Загружаем «${M.up.name}»</b><span class="bar"><i style="width:${Math.round(M.up.p * 100)}%"></i></span><small class="muted">${M.up.left > 1 ? `ещё ${M.up.left - 1} в очереди` : ''}</small></div>` : ''}
      <div class="row wrap"><div class="seg"><a class="${M.tab === 'stream' ? 'on' : ''}" href="music">Поток</a><a class="${M.tab === 'my' ? 'on' : ''}" href="music/my">Мои треки</a></div>
        <div class="sbar card grow"><span>${raw(I.search)}</span><input data-i="mq" placeholder="Название или исполнитель" value="${M.q}" autocomplete="off"></div></div>
      <section class="card tlist">${shown === null ? skeleton(3) : shown.length ? shown.map((t, i) => trackRow(t, shown, i)) : empty(q ? 'Ничего не нашли' : M.tab === 'my' ? 'Здесь появятся ваши треки' : 'Музыки пока нет', q ? '' : 'Нажмите «Загрузить» и выберите MP3')}</section>
      ${M.tab === 'stream' && !M.done && !q ? html`<button class="btn ghost full" data-a="mus-more" ${M.busy ? 'disabled' : ''}>${M.busy ? 'Загружаем…' : 'Ещё треки'}</button>` : ''}`;
  },
});
onInput('mq', v => { M.q = v; render(); });
act('mus-more', () => loadStream());
const listOf = () => M.tab === 'my' ? M.mine || [] : M.tab === 'one' ? (M.one ? [M.one] : []) : M.stream;
function trackRow(t, list, i) {
  if (hidden(t.ownerId)) return html`<div class="trow off" data-k="t-${t.id}">${cover(t)}<div class="grow tmeta"><b>Трек недоступен</b><small class="muted">Deleted Account</small></div></div>`;
  const on = cur()?.id === t.id, saved = (S.me.tracks || []).includes(t.id), mine = t.ownerId === uid();
  return html`<div class="trow ${on ? 'on' : ''}" data-k="t-${t.id}">
    <button class="tplay" data-a="t-play" data-id="${t.id}" data-i="${i}" aria-label="Играть">${cover(t)}<span class="tov">${raw(on && !A.paused ? I.pause : I.play)}</span></button>
    <div class="grow tmeta"><b class="clamp1">${t.title}</b><small class="muted clamp1">${t.artist || 'Неизвестный исполнитель'}</small></div>
    <small class="muted tdur">${fmtDur(t.duration)}</small>
    ${mine ? '' : html`<button class="ib ${saved ? 'on' : ''}" data-a="t-save" data-id="${t.id}" aria-label="В мои треки">${raw(saved ? I.heartF : I.heart)}</button>`}
    <button class="ib" data-a="menu" data-id="tm-${t.id}" aria-label="Ещё">${raw(I.more)}</button>
    ${S.menu === 'tm-' + t.id ? html`<div class="pop"><button data-a="t-next" data-id="${t.id}">${raw(I.list)} Играть следующим</button><button data-a="t-link" data-id="${t.id}">${raw(I.link)} Ссылка на трек</button>
      ${mine ? html`<button data-a="t-edit" data-id="${t.id}">${raw(I.edit)} Изменить</button><button class="danger" data-a="t-del" data-id="${t.id}">${raw(I.trash)} Удалить</button>` : ''}</div>` : ''}
  </div>`;
}
act('t-play', d => { const list = listOf().filter(t => !hidden(t.ownerId)), i = list.findIndex(t => t.id === d.id); if (cur()?.id === d.id) return toggle(); playList(list, Math.max(0, i), M.tab); });
act('mus-play-all', () => { const l = M.stream.filter(t => !hidden(t.ownerId)); if (l.length) playList(l, 0, 'stream'); });
act('t-save', async d => { const has = (S.me.tracks || []).includes(d.id); await updateDoc(doc(db, 'users', uid()), { tracks: has ? arrayRemove(d.id) : arrayUnion(d.id) }); toast(has ? 'Убрано из «Моих треков»' : 'Добавлено в «Мои треки»'); });
act('t-link', d => { S.menu = null; copyText(siteUrl('music/t_' + d.id), 'Ссылка на трек скопирована'); });
act('t-next', d => { const t = tracks.get(d.id); if (!t) return; S.menu = null; if (!P.queue.length) return playList([t], 0); P.queue.splice(P.i + 1, 0, t); toast('Заиграет следующим'); render(); });
act('t-del', async d => {
  const t = tracks.get(d.id); if (!t || !confirm(`Удалить «${t.title}»?`)) return;
  S.menu = null; await deleteDoc(doc(db, 'tracks', t.id)); deleteFile(t.fileId).catch(() => { });
  M.stream = M.stream.filter(x => x.id !== t.id); if (M.mine) M.mine = M.mine.filter(x => x.id !== t.id); toast('Трек удалён'); render();
});
act('t-edit', d => { const t = tracks.get(d.id); if (!t) return; S.menu = null; openModal({ type: 'track', t }); });
modal('track', m => html`<form class="pad stack" data-f="t-edit" data-id="${m.t.id}"><h2>Трек</h2>
  <label class="fld"><span>Название</span><input name="title" required maxlength="120" value="${m.t.title}"></label>
  <label class="fld"><span>Исполнитель</span><input name="artist" maxlength="120" value="${m.t.artist || ''}"></label>
  <label class="fld"><span>Текст песни</span><textarea name="lyrics" rows="6" maxlength="20000">${m.t.lyrics || ''}</textarea></label>
  <div class="row end"><button type="button" class="btn ghost" data-a="modal-x">Отмена</button><button class="btn">Сохранить</button></div></form>`);
form('t-edit', async (v, f) => {
  const t = tracks.get(f.dataset.id); if (!t) return;
  const upd = { title: v.title.trim().slice(0, 120), artist: v.artist.trim().slice(0, 120), lyrics: (v.lyrics || '').slice(0, 20000) };
  await updateDoc(doc(db, 'tracks', t.id), upd); Object.assign(t, upd); closeModal(); toast('Сохранено');
});

/* ---------- Загрузка: несколько файлов подряд, название/исполнитель/обложка — из тегов MP3 или имени файла ---------- */
act('mus-upload', async () => {
  const files = (await pickFiles('audio/*,.mp3,.m4a,.ogg,.wav,.flac', true)).slice(0, 30);
  const ok = files.filter(f => f.size <= 12 * 1048576); if (ok.length < files.length) toast('Файлы больше 12 МБ пропущены');
  for (const [k, f] of ok.entries()) {
    M.up = { name: f.name, p: 0, left: ok.length - k }; render();
    try {
      const [tags, duration] = await Promise.all([readTags(f), audioDuration(f)]);
      const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(), m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      const title = (tags.title || (m ? m[2] : base)).slice(0, 120) || 'Без названия', artist = (tags.artist || (m ? m[1] : '')).slice(0, 120);
      const fileId = await uploadFile(f, 'music', p => { M.up.p = p; render(); });
      const ref = await addDoc(collection(db, 'tracks'), { ownerId: uid(), title, artist, fileId, type: f.type || 'audio/mpeg', duration: Math.round(duration || 0), size: f.size, createdAt: serverTimestamp() });
      if (tags.cover) { try { const c = await compress(tags.cover, 600, 250000, true); await updateDoc(ref, { cover: c }); } catch (e) { } }
    } catch (e) { console.error(e); toast(`«${f.name}» не загрузился: ${errText(e)}`); }
  }
  M.up = null; M.stream = []; M.last = null; M.done = false; loadStream(); if (M.tab === 'my') loadMine();
  if (ok.length) toast(ok.length > 1 ? `Загружено треков: ${ok.length}` : 'Трек загружен');
});
const audioDuration = f => new Promise(res => { const a = new Audio(), u = URL.createObjectURL(f); a.preload = 'metadata'; a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; });
// теги ID3v2 (TIT2 — название, TPE1 — исполнитель, APIC — обложка); старые русские теги в cp1251
async function readTags(file) {
  try {
    const b = new Uint8Array(await file.slice(0, 1048576).arrayBuffer());
    if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
    const ver = b[3], size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9], out = {};
    const txt = (enc, bytes) => { try {
      if (enc === 1) return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim();
      if (enc === 2) return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim();
      if (enc === 3) return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
      return new TextDecoder('windows-1251').decode(bytes).replace(/\0/g, '').trim();
    } catch (e) { return ''; } };
    for (let p = 10; p + 10 < Math.min(b.length, size + 10);) {
      const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? (b[p + 4] << 21) | (b[p + 5] << 14) | (b[p + 6] << 7) | b[p + 7] : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
      const body = b.subarray(p + 10, p + 10 + fs);
      if (id === 'TIT2') out.title = txt(body[0], body.subarray(1));
      if (id === 'TPE1') out.artist = txt(body[0], body.subarray(1));
      if (id === 'APIC' && !out.cover) {
        let q = 1; while (q < body.length && body[q]) q++; const mime = new TextDecoder().decode(body.subarray(1, q)) || 'image/jpeg'; q += 2;
        if (body[0] === 1 || body[0] === 2) { while (q + 1 < body.length && (body[q] || body[q + 1])) q += 2; q += 2; } else { while (q < body.length && body[q]) q++; q++; }
        out.cover = new Blob([body.subarray(q)], { type: mime });
      }
      p += 10 + fs;
    }
    return out;
  } catch (e) { return {}; }
}

/* ---------- Плеер ---------- */
const A = new Audio(); A.preload = 'auto';
export const P = { queue: [], i: -1, loading: false, repeat: lsGet('vs_repeat') || 'off', shuffle: lsGet('vs_shuffle') === '1', full: false, lyr: false };
const cur = () => P.queue[P.i] || null;
A.volume = Math.min(1, Math.max(0, Number(lsGet('vs_vol') ?? 1)));
export function playList(list, i, src = '') { P.queue = list.slice(); P.src = src; playAt(i); }
async function playAt(i) {
  if (i < 0 || i >= P.queue.length) { A.pause(); render(); return; }
  P.i = i; P.loading = true; render();
  const t = cur();
  if (hidden(t.ownerId)) { P.loading = false; toast('Трек недоступен'); A.pause(); render(); return; }
  try {
    const url = await fileUrl(t.fileId, t.type || 'audio/mpeg'); if (cur() !== t) return;
    A.src = url; await A.play();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: 'VСмске', artwork: safeImg(t.cover) ? [{ src: t.cover, sizes: '600x600', type: 'image/jpeg' }] : [] });
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('play', () => A.play());
      navigator.mediaSession.setActionHandler('pause', () => A.pause());
    }
  } catch (e) { console.error(e); if (e?.name !== 'AbortError') toast('Не получилось включить трек'); }
  finally { P.loading = false; render(); }
}
function next(auto = false) {
  if (!P.queue.length) return;
  if (auto && P.repeat === 'one') { A.currentTime = 0; A.play(); return; }
  let i = P.shuffle && P.queue.length > 1 ? (() => { let r; do r = Math.floor(Math.random() * P.queue.length); while (r === P.i); return r; })() : P.i + 1;
  if (i >= P.queue.length) { if (P.repeat === 'all' || !auto) i = 0; else if (P.src === 'stream' && !M.done) { const n = M.stream.length; loadStream().then(() => { const add = M.stream.slice(n).filter(t => !hidden(t.ownerId)); if (add.length) { P.queue.push(...add); playAt(i); } else { A.pause(); render(); } }); return; } else { A.pause(); render(); return; } }
  playAt(i);
}
function prev() { if (A.currentTime > 4) { A.currentTime = 0; return; } playAt(Math.max(0, P.i - 1)); }
function toggle() { if (!cur()) return; A.paused ? A.play() : A.pause(); }
A.addEventListener('ended', () => next(true));
A.addEventListener('play', render); A.addEventListener('pause', render);
A.addEventListener('timeupdate', () => {
  const p = A.duration ? A.currentTime / A.duration : 0;
  document.querySelectorAll('[data-prog]').forEach(el => { el.style.setProperty('--p', (p * 100) + '%'); });
  const s = document.getElementById('fpSeek'); if (s && document.activeElement !== s) s.value = Math.round(p * 1000);
  document.querySelectorAll('[data-time]').forEach(el => { el.textContent = fmtDur(A.currentTime); });
});
act('pl-toggle', toggle);
act('pl-next', () => next());
act('pl-prev', () => prev());
act('pl-close', () => { A.pause(); P.queue = []; P.i = -1; P.full = false; render(); });
act('pl-full', () => { P.full = true; render(); });
act('pl-min', () => { P.full = false; render(); });
act('pl-repeat', () => { P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat]; lsSet('vs_repeat', P.repeat); render(); });
act('pl-shuffle', () => { P.shuffle = !P.shuffle; lsSet('vs_shuffle', P.shuffle ? '1' : '0'); render(); });
act('pl-lyr', () => { P.lyr = !P.lyr; render(); });
onInput('seek', v => { if (A.duration) A.currentTime = Number(v) / 1000 * A.duration; });
onInput('vol', v => { A.volume = Number(v) / 100; lsSet('vs_vol', A.volume); });
document.addEventListener('keydown', e => {
  if (!P.full || e.target.closest('input,textarea')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); } else if (e.key === 'Escape') { P.full = false; render(); }
  else if (e.key === 'ArrowRight') A.currentTime = Math.min(A.duration || 0, A.currentTime + 5); else if (e.key === 'ArrowLeft') A.currentTime = Math.max(0, A.currentTime - 5);
});
shellExtra(() => {
  const t = cur(); if (!t) return '';
  const p = A.duration ? A.currentTime / A.duration * 100 : 0;
  const bar = html`<div class="mbar" data-k="mbar"><span class="mprog" data-prog style="--p:${p}%"></span>
    <button class="mb-main" data-a="pl-full" aria-label="Открыть плеер">${cover(t, 'sm')}<span class="grow"><b class="clamp1">${t.title}</b><small class="muted clamp1">${t.artist || 'Неизвестный исполнитель'}</small></span></button>
    <button class="ib" data-a="pl-prev" aria-label="Назад">${raw(I.prev)}</button>
    <button class="ib play" data-a="pl-toggle" aria-label="${A.paused ? 'Играть' : 'Пауза'}">${raw(P.loading ? '<span class="spin"></span>' : A.paused ? I.play : I.pause)}</button>
    <button class="ib" data-a="pl-next" aria-label="Дальше">${raw(I.next)}</button>
    <button class="ib hide-sm" data-a="pl-close" aria-label="Закрыть плеер">${raw(I.x)}</button></div>`;
  if (!P.full) return bar;
  const [c1, c2] = pal(t);
  return html`${bar}<div class="fp" data-k="fp" style="--c1:${c1};--c2:${c2}" role="dialog" aria-label="Плеер">
    <div class="fp-bg">${safeImg(t.cover) ? html`<img src="${t.cover}" alt="">` : ''}</div>
    <header class="fp-top"><button class="ib" data-a="pl-min" aria-label="Свернуть">${raw(I.down)}</button><span class="grow center small">${P.queue.length > 1 ? `${P.i + 1} из ${P.queue.length}` : 'Сейчас играет'}</span>
      <button class="ib ${P.lyr ? 'on' : ''}" data-a="pl-lyr" aria-label="Текст песни">${raw(I.lyrics)}</button></header>
    <div class="fp-mid">${P.lyr ? html`<div class="fp-lyr">${t.lyrics ? t.lyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim() : 'Текста пока нет. Автор трека может добавить его в «Изменить».'}</div>` : cover(t, 'xl')}</div>
    <div class="fp-info"><b>${t.title}</b><span>${t.artist || 'Неизвестный исполнитель'}</span></div>
    <div class="fp-seek"><input id="fpSeek" type="range" min="0" max="1000" value="${Math.round(p * 10)}" data-i="seek" aria-label="Перемотка"><div class="row between small"><span data-time>${fmtDur(A.currentTime)}</span><span>${fmtDur(A.duration || t.duration)}</span></div></div>
    <div class="fp-ctl"><button class="ib ${P.shuffle ? 'on' : ''}" data-a="pl-shuffle" aria-label="Перемешать">${raw(I.shuffle)}</button>
      <button class="ib big" data-a="pl-prev" aria-label="Назад">${raw(I.prev)}</button>
      <button class="play-big" data-a="pl-toggle" aria-label="${A.paused ? 'Играть' : 'Пауза'}">${raw(A.paused ? I.play : I.pause)}</button>
      <button class="ib big" data-a="pl-next" aria-label="Дальше">${raw(I.next)}</button>
      <button class="ib ${P.repeat !== 'off' ? 'on' : ''}" data-a="pl-repeat" aria-label="Повтор">${raw(I.repeat)}${P.repeat === 'one' ? html`<small class="r1">1</small>` : ''}</button></div>
    <div class="fp-vol">${raw(I.volume)}<input type="range" min="0" max="100" value="${Math.round(A.volume * 100)}" data-i="vol" aria-label="Громкость"></div>
  </div>`;
});
