// Видео и Клипы: свои ролики (файл до 20 МБ) и ссылки на YouTube / Rutube / VK, просмотры, лайки, комментарии, вертикальная лента клипов.
import { db, uid, data, errText, doc, collection, query, where, orderBy, limit, startAfter, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment } from './fb.js';
import { S, U, hidden, locked, view, act, form, modal, openModal, closeModal, render, sub, ensureUsers, avatar, nameLink, empty, skeleton, pageHead, siteUrl, go, onAfterRender } from './core.js';
import { html, raw, I, ago, fmtDur, fmtNum, plural, richText, safeImg, toast, copyText, loadImg } from './lib.js';
import { uploadFile, fileUrl, deleteFile } from './files.js';
import { pickFiles } from './posts.js';

const V = { list: null, tab: 'all', cur: null, src: null, cmts: null, viewed: new Set() };
const provName = p => ({ youtube: 'YouTube', rutube: 'Rutube', vk: 'VK Видео', direct: 'Ссылка' }[p] || 'Видео');
function embed(v) {
  if (v.provider === 'youtube' && /^[\w-]{11}$/.test(v.vid)) return 'https://www.youtube.com/embed/' + v.vid;
  if (v.provider === 'rutube' && /^[a-f0-9]{32}$/.test(v.vid)) return 'https://rutube.ru/play/embed/' + v.vid;
  if (v.provider === 'vk' && /^-?\d+_\d+$/.test(v.vid)) { const [o, i] = v.vid.split('_'); return `https://vk.com/video_ext.php?oid=${o}&id=${i}&hd=2`; }
  return '';
}
function parseLink(u) {
  let m;
  if ((m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/))) return { provider: 'youtube', vid: m[1] };
  if ((m = u.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([a-f0-9]{32})/))) return { provider: 'rutube', vid: m[1] };
  if ((m = u.match(/(?:vk\.com|vkvideo\.ru)\/(?:.*[?&]z=)?video(-?\d+_\d+)/))) return { provider: 'vk', vid: m[1] };
  if (/^https:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i.test(u)) return { provider: 'direct', vid: u };
  return null;
}
const thumbBox = v => hidden(v.ownerId) ? html`<span class="vthumb off">${locked('Видео недоступно')}</span>` : html`<span class="vthumb" style="--h:${[...v.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${safeImg(v.thumb) ? html`<img src="${v.thumb}" alt="" loading="lazy">` : v.provider === 'youtube' && /^[\w-]{11}$/.test(v.vid) ? html`<img src="https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg" alt="" loading="lazy">` : html`<i>${raw(I.play)}</i>`}
  ${v.duration ? html`<b class="vdur">${fmtDur(v.duration)}</b>` : v.source === 'link' ? html`<b class="vdur">${provName(v.provider)}</b>` : ''}</span>`;
const vcard = v => { const o = U(v.ownerId); return html`<a class="vcard" href="video/${v.id}" data-k="v-${v.id}">${thumbBox(v)}<span class="vmeta">${avatar(o, 34, false)}<span class="grow"><b class="clamp2">${hidden(v.ownerId) ? 'Видео недоступно' : v.title}</b><small class="muted">${o?.name || ''} · ${v.views ? fmtNum(v.views) + ' просм. · ' : ''}${ago(v.createdAt)}</small></span></span></a>`; };

/* ---------- Список ---------- */
view('video', {
  wide: true,
  title: id => id ? (V.cur?.title || 'Видео') : 'Видео',
  enter(id) {
    if (id) return openWatch(id);
    V.cur = null; V.tab = S.route.args[0] === 'my' ? 'my' : V.tab;
    sub(onSnapshot(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(60)), s => { V.list = s.docs.map(data); ensureUsers(V.list.map(v => v.ownerId)); render(); }, e => { console.error(e); V.list = []; render(); }));
  },
  render: id => id ? watchPage() : listPage(),
});
function listPage() {
  const list = V.list === null ? null : V.tab === 'my' ? V.list.filter(v => v.ownerId === uid()) : V.list;
  return html`${pageHead('Видео', 'Ролики друзей и всех на VСмске', html`<div class="row"><a class="btn ghost" href="clips">${raw(I.clips)} Клипы</a><button class="btn" data-a="v-add">${raw(I.plus)} Добавить</button></div>`)}
    <div class="seg"><button class="${V.tab === 'all' ? 'on' : ''}" data-a="v-tab" data-v="all">Все</button><button class="${V.tab === 'my' ? 'on' : ''}" data-a="v-tab" data-v="my">Мои</button></div>
    ${list === null ? skeleton(2) : list.length ? html`<div class="vgrid">${list.map(vcard)}</div>` : empty(V.tab === 'my' ? 'Вы ещё не добавили видео' : 'Видео пока нет', 'Загрузите ролик или вставьте ссылку на YouTube, Rutube или VK', html`<button class="btn sm" data-a="v-add">Добавить видео</button>`)}`;
}
act('v-tab', d => { V.tab = d.v; render(); });

/* ---------- Добавить ---------- */
const AD = { mode: 'file', file: null, busy: false, p: 0 };
act('v-add', () => { AD.mode = 'file'; AD.file = null; AD.busy = false; openModal({ type: 'vadd' }); });
modal('vadd', () => html`<form class="pad stack" data-f="v-add"><h2>Новое видео</h2>
  <div class="seg wide"><button type="button" class="${AD.mode === 'file' ? 'on' : ''}" data-a="v-mode" data-v="file">Файл</button><button type="button" class="${AD.mode === 'link' ? 'on' : ''}" data-a="v-mode" data-v="link">Ссылка</button></div>
  ${AD.mode === 'file' ? html`<button type="button" class="btn ghost full" data-a="v-pick">${raw(I.upload)} ${AD.file ? AD.file.name : 'Выбрать видео (до 20 МБ)'}</button>`
    : html`<label class="fld"><span>Ссылка на YouTube, Rutube, VK Видео или .mp4</span><input name="url" type="url" required placeholder="https://youtu.be/…"></label>`}
  <label class="fld"><span>Название</span><input name="title" required maxlength="120"></label>
  <label class="fld"><span>Описание</span><textarea name="description" rows="2" maxlength="2000" placeholder="Необязательно"></textarea></label>
  ${AD.busy ? html`<div class="upbar"><span class="bar"><i style="width:${Math.round(AD.p * 100)}%"></i></span><small class="muted">Загружаем… ${Math.round(AD.p * 100)}%</small></div>` : ''}
  <div class="row end"><button type="button" class="btn ghost" data-a="modal-x">Отмена</button><button class="btn" ${AD.busy ? 'disabled' : ''}>Опубликовать</button></div></form>`);
act('v-mode', d => { AD.mode = d.v; render(); });
act('v-pick', async () => { const [f] = await pickFiles('video/*', false); if (!f) return; if (f.size > 20 * 1048576) return toast('Видео больше 20 МБ — добавьте его ссылкой'); AD.file = f; render(); const t = document.querySelector('form[data-f="v-add"] input[name=title]'); if (t && !t.value) t.value = f.name.replace(/\.[^.]+$/, '').slice(0, 120); });
form('v-add', async v => {
  const title = v.title.trim().slice(0, 120), description = (v.description || '').trim().slice(0, 2000);
  const base = { ownerId: uid(), title, description, likes: [], createdAt: serverTimestamp() };
  if (AD.mode === 'link') {
    const L = parseLink(v.url.trim()); if (!L) return toast('Не узнали ссылку — нужна ссылка на YouTube, Rutube, VK Видео или файл .mp4');
    const ref = await addDoc(collection(db, 'videos'), { ...base, source: 'link', provider: L.provider, vid: L.vid, thumb: '' });
    closeModal(); go('video/' + ref.id); return;
  }
  if (!AD.file) return toast('Выберите файл');
  AD.busy = true; AD.p = 0; render();
  try {
    const { thumb, duration } = await frameOf(AD.file);
    const fileId = await uploadFile(AD.file, 'video', p => { AD.p = p; render(); });
    const ref = await addDoc(collection(db, 'videos'), { ...base, source: 'file', fileId, type: AD.file.type || 'video/mp4', thumb, duration: Math.round(duration || 0), size: AD.file.size });
    AD.busy = false; closeModal(); go('video/' + ref.id);
  } catch (e) { console.error(e); AD.busy = false; render(); toast(errText(e)); }
});
// кадр для обложки и длительность
function frameOf(file) {
  return new Promise(res => {
    const u = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
    const done = (thumb = '') => { res({ thumb, duration: v.duration || 0 }); URL.revokeObjectURL(u); };
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => {
      try { const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); let d = c.toDataURL('image/jpeg', 0.75); if (d.length > 290000) d = c.toDataURL('image/jpeg', 0.5); done(d.length <= 300000 ? d : ''); } catch (e) { done(); }
    };
    v.onerror = () => done(); setTimeout(() => done(), 8000);
  });
}

/* ---------- Просмотр ---------- */
function openWatch(id) {
  V.cur = null; V.src = null; V.cmts = null;
  sub(onSnapshot(doc(db, 'videos', id), s => {
    V.cur = s.exists() ? data(s) : false; render();
    if (!V.cur) return;
    ensureUsers([V.cur.ownerId]);
    if (!V.viewed.has(id)) setTimeout(() => { if (!hidden(V.cur?.ownerId)) countView(id); }, 3000);
  }, () => { V.cur = false; render(); }));
  sub(onSnapshot(query(collection(db, 'videos', id, 'comments'), orderBy('createdAt', 'asc'), limit(200)), s => { V.cmts = s.docs.map(data); ensureUsers(V.cmts.map(c => c.authorId)); render(); }, () => { V.cmts = []; render(); }));
  getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(20))).then(s => { V.list = s.docs.map(data); ensureUsers(V.list.map(v => v.ownerId)); render(); }).catch(() => { });
}
function countView(id) {
  if (V.viewed.has(id) || (S.route.name !== 'video' && S.route.name !== 'clips')) return;
  V.viewed.add(id); updateDoc(doc(db, 'videos', id), { views: increment(1) }).catch(() => { });
}
function watchPage() {
  const v = V.cur;
  if (v === null) return skeleton(1);
  if (!v) return empty('Видео не найдено', 'Возможно, его удалили', html`<a class="btn sm" href="video">Все видео</a>`);
  const o = U(v.ownerId), liked = (v.likes || []).includes(uid()), own = v.ownerId === uid();
  if (v.source === 'file' && !V.src && U(v.ownerId) && !hidden(v.ownerId)) { V.src = 'loading'; fileUrl(v.fileId, v.type || 'video/mp4').then(u => { V.src = u; render(); }).catch(() => { V.src = 'error'; render(); }); }
  const off = !U(v.ownerId) || hidden(v.ownerId);
  const player = off ? html`<div class="vload">${U(v.ownerId) ? locked('Видео недоступно') : html`<span class="spin"></span>`}</div>` : v.source === 'link' ? (v.provider === 'direct' ? html`<video src="${v.vid}" controls playsinline data-keep="vp-${v.id}"></video>` : embed(v) ? html`<iframe src="${embed(v)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${v.title}" data-keep="vp-${v.id}"></iframe>` : html`<p class="muted pad">Ссылка не поддерживается</p>`)
    : V.src && V.src !== 'loading' && V.src !== 'error' ? html`<video src="${V.src}" controls autoplay playsinline data-keep="vp-${v.id}" poster="${safeImg(v.thumb)}"></video>`
    : html`<div class="vload">${V.src === 'error' ? 'Не получилось загрузить видео' : html`<span class="spin"></span> Загружаем видео…`}</div>`;
  const more = (V.list || []).filter(x => x.id !== v.id).slice(0, 10);
  return html`<div class="watch"><div class="w-main">
      <div class="player" data-k="player-${v.id}">${player}</div>
      <section class="card pad w-info"><h1>${hidden(v.ownerId) ? 'Видео недоступно' : v.title}</h1>
        <div class="row wrap">${avatar(o, 42)}<div class="grow"><div>${nameLink(o)}</div><small class="muted">${fmtNum(v.views || 0)} ${plural(v.views || 0, 'просмотр', 'просмотра', 'просмотров')} · ${ago(v.createdAt)}</small></div>
          <button class="pill ${liked ? 'liked' : ''}" data-a="v-like" data-id="${v.id}">${raw(liked ? I.heartF : I.heart)}<span>${(v.likes || []).length || ''}</span></button>
          <a class="pill" href="clips/${v.id}">${raw(I.clips)}<span>Как клип</span></a>
          <button class="pill" data-a="v-link" data-id="${v.id}">${raw(I.link)}</button>
          ${own ? html`<button class="pill" data-a="v-del" data-id="${v.id}">${raw(I.trash)}</button>` : ''}</div>
        ${v.description && !hidden(v.ownerId) ? html`<div class="w-desc">${richText(v.description)}</div>` : ''}</section>
      <section class="card pad">${commentsBlock(v.id, V.cmts, v.ownerId)}</section></div>
    <aside class="w-side">${more.length ? html`<b>Ещё видео</b>` : ''}${more.map(x => html`<a class="vrow" href="video/${x.id}" data-k="vr-${x.id}">${thumbBox(x)}<span class="grow"><b class="clamp2">${hidden(x.ownerId) ? 'Видео недоступно' : x.title}</b><small class="muted">${U(x.ownerId)?.name || ''}</small></span></a>`)}</aside></div>`;
}
export function commentsBlock(vid, list, ownerId) {
  return html`<h2 class="ch">Комментарии ${list?.length ? html`<span class="muted">${list.length}</span>` : ''}</h2>
    <div class="cmts plain">${list === null ? html`<p class="muted small">Загружаем…</p>` : !list.length ? html`<p class="muted small">Пока тихо — напишите первым</p>` : list.map(c => { const a = U(c.authorId), del = c.authorId === uid() || ownerId === uid();
      return html`<div class="cmt" data-k="vc-${c.id}">${avatar(a, 32)}<div class="bubble">${nameLink(a)} <span>${richText(c.text)}</span><div class="cmt-f muted small">${ago(c.createdAt)}${del ? html` · <button class="link" data-a="vc-del" data-v="${vid}" data-id="${c.id}">удалить</button>` : ''}</div></div></div>`; })}
    <form class="cform" data-f="vc" data-id="${vid}">${avatar(S.me, 32, false)}<input name="text" placeholder="Комментарий…" maxlength="1000" autocomplete="off" required><button class="ib" aria-label="Отправить">${raw(I.send)}</button></form></div>`;
}
form('vc', async (v, f) => { const text = (v.text || '').trim(); if (!text) return; f.reset(); await addDoc(collection(db, 'videos', f.dataset.id, 'comments'), { authorId: uid(), text: text.slice(0, 1000), createdAt: serverTimestamp() }); });
act('vc-del', async d => { await deleteDoc(doc(db, 'videos', d.v, 'comments', d.id)); });
const vById = id => (V.cur && V.cur.id === id ? V.cur : null) || CL.list.find(x => x.id === id) || V.list?.find(x => x.id === id);
async function like(id, onlyAdd = false) {
  const v = vById(id); if (!v) return;
  const has = (v.likes || []).includes(uid()); if (has && onlyAdd) return;
  v.likes = has ? v.likes.filter(x => x !== uid()) : [...(v.likes || []), uid()]; render();
  await updateDoc(doc(db, 'videos', id), { likes: has ? arrayRemove(uid()) : arrayUnion(uid()) }).catch(e => toast(errText(e)));
}
act('v-like', d => like(d.id));
act('v-link', d => copyText(siteUrl('video/' + d.id), 'Ссылка на видео скопирована'));
act('v-del', async d => {
  const v = vById(d.id); if (!v || !confirm('Удалить видео?')) return;
  await deleteDoc(doc(db, 'videos', v.id)); if (v.fileId) deleteFile(v.fileId).catch(() => { }); toast('Видео удалено'); go('video');
});

/* ---------- Клипы: вертикальная лента на весь экран ---------- */
const CL = { started: new Set(), list: [], last: null, done: false, busy: false, i: 0, muted: true, start: null, cmts: null, cmtFor: null, cmtUnsub: null };
async function loadClips() {
  if (CL.busy || CL.done) return; CL.busy = true;
  try {
    const s = await getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), ...(CL.last ? [startAfter(CL.last)] : []), limit(16)));
    CL.last = s.docs[s.docs.length - 1] || CL.last; if (s.size < 16) CL.done = true;
    let add = s.docs.map(data).filter(v => !CL.list.some(x => x.id === v.id));
    if (CL.start && !CL.list.length) { let f = add.find(v => v.id === CL.start); if (!f) { const d = await getDoc(doc(db, 'videos', CL.start)).catch(() => null); if (d?.exists()) f = data(d); } if (f) add = [f, ...add.filter(v => v.id !== f.id)]; }
    CL.list.push(...add); ensureUsers(add.map(v => v.ownerId));
  } catch (e) { console.error(e); CL.done = true; }
  CL.busy = false; render();
}
view('clips', {
  full: true, title: 'Клипы',
  enter(id) { CL.started.clear(); CL.list = []; CL.last = null; CL.done = false; CL.i = 0; CL.start = id || null; loadClips(); },
  leave() { clipObs?.disconnect(); document.querySelectorAll('.clip video').forEach(v => v.pause()); CL.cmtUnsub?.(); },
  render: () => html`<div class="clips">
    <div class="clips-top"><a class="ib" href="video" aria-label="Назад">${raw(I.back)}</a><b>Клипы</b><span class="grow"></span><button class="ib" data-a="cl-mute" aria-label="Звук">${raw(CL.muted ? I.mute : I.volume)}</button></div>
    ${!CL.list.length ? html`<div class="clips-empty">${CL.busy || !CL.done ? html`<span class="spin"></span>` : html`<b>Клипов пока нет</b><a class="btn" href="video">Загрузить видео</a>`}</div>`
      : html`<div class="clips-feed" id="clipsFeed">${CL.list.map((v, i) => clipHtml(v, i))}</div>`}</div>`,
});
function clipHtml(v, i) {
  const o = U(v.ownerId), liked = (v.likes || []).includes(uid());
  if (hidden(v.ownerId)) return html`<section class="clip" data-k="cl-${v.id}" data-i="${i}" data-id="${v.id}"><div class="clip-media">${locked('Видео недоступно')}</div>
    <div class="clip-info"><a class="row" href="id/${v.ownerId}">${avatar(o, 38, false)}<b>Deleted Account</b></a></div></section>`;
  return html`<section class="clip" data-k="cl-${v.id}" data-i="${i}" data-id="${v.id}">
    <div class="clip-bg" style="${safeImg(v.thumb) ? `background-image:url('${safeImg(v.thumb)}')` : ''}"></div>
    <div class="clip-media" data-a="cl-tap" data-id="${v.id}" data-keep="clm-${v.id}">${v.source === 'link' && v.provider !== 'direct' ? '' : raw('<video playsinline loop preload="none"></video>')}</div>
    <div class="clip-info"><a class="row" href="id/${v.ownerId}">${avatar(o, 38, false)}<b>${o?.name || ''}</b></a><p>${v.title}</p></div>
    <div class="clip-side">
      <button class="cl-b ${liked ? 'on' : ''}" data-a="v-like" data-id="${v.id}" aria-label="Нравится">${raw(liked ? I.heartF : I.heart)}<small>${(v.likes || []).length || ''}</small></button>
      <button class="cl-b" data-a="cl-cmt" data-id="${v.id}" aria-label="Комментарии">${raw(I.comment)}<small></small></button>
      <a class="cl-b" href="video/${v.id}" aria-label="Открыть">${raw(I.video)}<small>Открыть</small></a>
      <button class="cl-b" data-a="v-link" data-id="${v.id}" aria-label="Ссылка">${raw(I.link)}<small>Ссылка</small></button></div>
  </section>`;
}
let clipObs = null, tapT = 0, tapTimer = 0;
onAfterRender(() => {
  const feed = document.getElementById('clipsFeed'); if (!feed) return;
  if (!clipObs || clipObs.root !== feed) { clipObs?.disconnect(); clipObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio > 0.6) activate(+e.target.dataset.i); }), { root: feed, threshold: [0.6] }); }
  feed.querySelectorAll('.clip:not([data-obs])').forEach(el => { el.dataset.obs = '1'; clipObs.observe(el); });
  // автор текущего клипа догрузился позже, чем клип стал виден, — запускаем сейчас
  const v = CL.list[CL.i]; if (v && !CL.started.has(v.id) && U(v.ownerId) && feed.querySelector(`.clip[data-i="${CL.i}"]`)) activate(CL.i);
});
async function activate(i) {
  const v = CL.list[i]; if (!v || S.route.name !== 'clips') return;
  CL.i = i; history.replaceState(null, '', location.pathname.replace(/clips(\/.*)?$/, 'clips/' + v.id));
  document.querySelectorAll('.clip').forEach(el => { const k = +el.dataset.i, vid = el.querySelector('video'); if (k !== i && vid) vid.pause(); if (k !== i) { const f = el.querySelector('iframe'); if (f) f.remove(); } });
  const el = document.querySelector(`.clip[data-i="${i}"]`), media = el?.querySelector('.clip-media'); if (!media) return;
  if (i >= CL.list.length - 3) loadClips();
  if (!U(v.ownerId) || hidden(v.ownerId)) return;   // пока не знаем автора — не качаем; забаненного не показываем
  CL.started.add(v.id);
  setTimeout(() => { if (CL.i === i) countView(v.id); }, 2000);
  if (v.source === 'link' && v.provider !== 'direct') {
    if (!media.querySelector('iframe') && embed(v)) media.insertAdjacentHTML('beforeend', `<iframe src="${embed(v)}${v.provider === 'youtube' ? `?autoplay=1&mute=${CL.muted ? 1 : 0}&playsinline=1&loop=1&playlist=${v.vid}` : ''}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`);
    return;
  }
  const vid = media.querySelector('video');
  if (!vid.src) { try { vid.src = v.source === 'file' ? await fileUrl(v.fileId, v.type || 'video/mp4') : v.vid; } catch (e) { return toast('Клип не загрузился'); } }
  if (CL.i !== i) return;
  vid.muted = CL.muted; vid.play().catch(() => { vid.muted = true; CL.muted = true; vid.play().catch(() => { }); render(); });
}
act('cl-mute', () => { CL.muted = !CL.muted; document.querySelectorAll('.clip video').forEach(v => { v.muted = CL.muted; }); render(); });
act('cl-tap', (d, el, e) => {
  const now = Date.now();
  if (now - tapT < 320) { clearTimeout(tapTimer); tapT = 0; like(d.id, true); heart(el, e); return; }
  tapT = now; clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { const v = el.querySelector('video'); if (v) { if (v.paused) v.play().catch(() => { }); else v.pause(); el.classList.toggle('paused', v.paused); } }, 300);
});
function heart(el, e) {
  const r = el.getBoundingClientRect(), h = document.createElement('span'); h.className = 'tap-heart'; h.innerHTML = I.heartF;
  h.style.left = (e.clientX - r.left) + 'px'; h.style.top = (e.clientY - r.top) + 'px'; el.appendChild(h); setTimeout(() => h.remove(), 900);
}
act('cl-cmt', d => {
  CL.cmtUnsub?.(); CL.cmts = null; CL.cmtFor = d.id;
  CL.cmtUnsub = onSnapshot(query(collection(db, 'videos', d.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)), s => { CL.cmts = s.docs.map(data); ensureUsers(CL.cmts.map(c => c.authorId)); render(); }, () => { CL.cmts = []; render(); });
  openModal({ type: 'clcmt' });
});
modal('clcmt', () => html`<div class="pad">${commentsBlock(CL.cmtFor, CL.cmts, vById(CL.cmtFor)?.ownerId)}</div>`);
document.addEventListener('keydown', e => {
  if (S.route.name !== 'clips' || S.modal || e.target.closest('input,textarea')) return;
  const feed = document.getElementById('clipsFeed'); if (!feed) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); feed.scrollTo({ top: (CL.i + (e.key === 'ArrowDown' ? 1 : -1)) * feed.clientHeight, behavior: 'smooth' }); }
  else if (e.key === 'm' || e.key === 'ь') document.querySelector('[data-a="cl-mute"]')?.click();
});
