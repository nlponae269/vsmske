// Записи: лента, стена профиля, одна запись. Поле новой записи, лайки, комментарии, опросы, правка и удаление.
import { db, uid, data, errText, doc, collection, query, where, orderBy, limit, startAfter, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp, arrayUnion, arrayRemove, increment, setDoc } from './fb.js';
import { S, cache, U, view, act, form, onInput, render, sub, ensureUsers, avatar, nameLink, empty, skeleton, pageHead, openModal, closeModal, modal, isFriend, siteUrl, go } from './core.js';
import { html, raw, I, ago, plural, richText, extractTags, extractMentions, compress, safeImg, toast, copyText, lsGet, lsSet } from './lib.js';

/* ---------- Уведомления (по возможности, ошибки не мешают) ---------- */
export function notify(to, type, postId = '', text = '', id = null) {
  if (!to || to === uid()) return;
  const n = { to, from: uid(), type, postId: String(postId).slice(0, 40), text: String(text || '').slice(0, 120), createdAt: serverTimestamp() };
  setDoc(id ? doc(db, 'notifs', id) : doc(collection(db, 'notifs')), n).catch(() => { });
}
const unnotify = id => deleteDoc(doc(db, 'notifs', id)).catch(() => { });
export async function notifyMentions(text, postId, skip = []) {
  for (const nick of extractMentions(text)) {
    try { const s = await getDoc(doc(db, 'usernames', nick)); const to = s.exists() ? s.data().uid : null; if (to && !skip.includes(to)) notify(to, 'mention', postId, text); } catch (e) { }
  }
}

/* ---------- Хранилище записей на странице ---------- */
export const P = { list: [], ready: false, more: false, last: null, comments: new Map(), open: new Set(), edit: null };
const find = id => P.list.find(p => p.id === id) || P.single;
function resetPosts() { P.list = []; P.ready = false; P.more = false; P.last = null; P.comments.clear(); P.open.clear(); P.edit = null; P.single = null; }
// живая подписка на набор записей (лента/стена), «Показать ещё» — следующая страница
export function watchPosts(makeQuery, pageSize = 20) {
  resetPosts();
  const pages = [];
  const listen = q => sub(onSnapshot(q, s => {
    const page = s.docs.map(data);
    pages[pagesIdx(q)] = page;
    P.list = pages.flat().filter((p, i, a) => a.findIndex(x => x.id === p.id) === i).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (pagesIdx(q) === pages.length - 1) { P.last = s.docs[s.docs.length - 1] || P.last; P.more = s.size >= pageSize; }
    ensureUsers(P.list.flatMap(p => [p.authorId, p.wallId]));
    P.ready = true; render();
  }, e => { console.error(e); P.ready = true; P.err = errText(e); render(); }));
  const qs = [];
  const pagesIdx = q => qs.indexOf(q);
  const q0 = makeQuery(null); qs.push(q0); listen(q0);
  P.loadMore = () => { if (!P.last) return; const q = makeQuery(P.last); qs.push(q); listen(q); P.more = false; render(); };
}

/* ---------- Одна запись ---------- */
export function postCard(p) {
  const a = U(p.authorId), wall = p.wallId && p.wallId !== p.authorId && !p.groupId ? U(p.wallId) : null;
  const liked = (p.likes || []).includes(uid()), mine = p.authorId === uid(), canDel = mine || p.wallId === uid();
  const imgs = p.images?.length ? p.images : p.image ? [p.image] : [];
  const n = p.commentCount || 0, open = P.open.has(p.id);
  return html`<article class="card post" data-k="post-${p.id}">
    <header class="post-h">${avatar(a, 44)}<div class="grow"><div class="post-who">${nameLink(a)}${wall ? html` <span class="muted">→</span> ${nameLink(wall)}` : ''}</div>
      <a class="muted small" href="post/${p.id}">${ago(p.createdAt)}${p.editedAt ? ' · изменено' : ''}</a></div>
      ${canDel ? html`<button class="ib" data-a="menu" data-id="pm-${p.id}" aria-label="Ещё">${raw(I.more)}</button>
        ${S.menu === 'pm-' + p.id ? html`<div class="pop">${mine ? html`<button data-a="post-edit" data-id="${p.id}">${raw(I.edit)} Изменить</button>` : ''}
          <button data-a="post-del" data-id="${p.id}" class="danger">${raw(I.trash)} Удалить</button></div>` : ''}` : ''}</header>
    ${P.edit === p.id ? html`<form class="stack" data-f="post-edit" data-id="${p.id}"><textarea name="text" rows="3" maxlength="4000" data-v="${p.text || ''}">${p.text || ''}</textarea>
      <div class="row end"><button type="button" class="btn ghost sm" data-a="post-edit-x">Отмена</button><button class="btn sm">Сохранить</button></div></form>`
      : p.text ? html`<div class="post-t">${richText(p.text)}</div>` : ''}
    ${p.repostOf ? repostBox(p.repostOf) : ''}
    ${imgs.length ? html`<div class="pics n${Math.min(imgs.length, 4)}">${imgs.slice(0, 4).map((src, i) => html`<button class="pic" data-a="photo" data-id="${p.id}" data-i="${i}"><img src="${safeImg(src)}" alt="Фото" loading="lazy"></button>`)}</div>` : ''}
    ${p.poll ? pollBox(p) : ''}
    <footer class="post-f">
      <button class="pill ${liked ? 'liked' : ''}" data-a="like" data-id="${p.id}" aria-pressed="${liked}">${raw(liked ? I.heartF : I.heart)}<span>${(p.likes || []).length || ''}</span></button>
      <button class="pill" data-a="comments" data-id="${p.id}">${raw(I.comment)}<span>${n || ''}</span></button>
      <button class="pill" data-a="repost" data-id="${p.id}" title="Поделиться у себя">${raw(I.share)}<span>${p.reposts || ''}</span></button>
      <span class="grow"></span>
      <button class="pill" data-a="post-link" data-id="${p.id}" aria-label="Скопировать ссылку">${raw(I.link)}</button>
    </footer>
    ${open ? commentsBox(p) : ''}
  </article>`;
}
const reposted = new Map();
function repostBox(id) {
  if (!reposted.has(id)) { reposted.set(id, null); getDoc(doc(db, 'posts', id)).then(s => { reposted.set(id, s.exists() ? data(s) : false); if (s.exists()) ensureUsers([s.data().authorId]); render(); }).catch(() => reposted.set(id, false)); }
  const o = reposted.get(id);
  if (o === null) return html`<div class="repost muted">Загружаем…</div>`;
  if (!o) return html`<div class="repost muted">Запись удалена</div>`;
  const img = o.images?.[0] || o.image;
  return html`<a class="repost" href="post/${o.id}"><div class="row">${avatar(U(o.authorId), 26, false)}<b>${U(o.authorId)?.name || '…'}</b></div>${o.text ? html`<div class="clamp3">${o.text}</div>` : ''}${img ? html`<img src="${safeImg(img)}" alt="" loading="lazy">` : ''}</a>`;
}
function pollBox(p) {
  const poll = p.poll, votes = poll.votes || {}, all = Object.values(votes), mine = votes[uid()], voted = mine !== undefined;
  return html`<div class="poll"><b>${poll.q}</b>${(poll.options || []).map((o, i) => {
    const pct = all.length ? Math.round(all.filter(v => v === i).length * 100 / all.length) : 0;
    return html`<button class="poll-o ${mine === i ? 'on' : ''}" data-a="vote" data-id="${p.id}" data-i="${i}">${voted ? html`<i style="width:${pct}%"></i>` : ''}<span>${o}</span>${voted ? html`<b>${pct}%</b>` : ''}</button>`;
  })}<span class="muted small">${all.length} ${plural(all.length, 'голос', 'голоса', 'голосов')}${voted ? ' · нажмите свой вариант ещё раз, чтобы отменить' : ''}</span></div>`;
}
function commentsBox(p) {
  const list = P.comments.get(p.id);
  return html`<div class="cmts">${!list ? html`<p class="muted small">Загружаем…</p>` : list.map(c => {
    const a = U(c.authorId), liked = (c.likes || []).includes(uid()), del = c.authorId === uid() || p.authorId === uid() || p.wallId === uid();
    return html`<div class="cmt" data-k="c-${c.id}">${avatar(a, 32)}<div class="bubble">${nameLink(a)} <span>${richText(c.text)}</span>
      <div class="cmt-f muted small">${ago(c.createdAt)} · <button class="link ${liked ? 'on' : ''}" data-a="clike" data-p="${p.id}" data-id="${c.id}">${liked ? '♥' : '♡'} ${(c.likes || []).length || ''}</button>${del ? html` · <button class="link" data-a="cdel" data-p="${p.id}" data-id="${c.id}">удалить</button>` : ''}</div></div></div>`;
  })}
  <form class="cform" data-f="comment" data-id="${p.id}">${avatar(S.me, 32, false)}<input name="text" id="c-${p.id}" placeholder="Комментарий…" maxlength="1000" autocomplete="off" required><button class="ib" aria-label="Отправить">${raw(I.send)}</button></form></div>`;
}
export function postList(emptyText = 'Здесь пока нет записей') {
  if (!P.ready) return skeleton(3);
  if (P.err && !P.list.length) return empty('Не загрузилось', P.err);
  return html`${P.list.length ? P.list.map(postCard) : empty(emptyText)}${P.more ? html`<button class="btn ghost full" data-a="more-posts">Показать ещё</button>` : ''}`;
}
act('more-posts', () => P.loadMore?.());

/* ---------- Новая запись ---------- */
const D = { files: [], poll: false, opts: 2, busy: false };
export function composer(wallId, ph = 'Что нового?') {
  return html`<form class="card composer" data-f="post" data-wall="${wallId}" data-k="composer">
    <div class="row at">${avatar(S.me, 40, false)}<textarea name="text" id="postText" rows="2" maxlength="4000" placeholder="${ph}" data-i="draft">${lsGet('vs_draft') || ''}</textarea></div>
    ${D.files.length ? html`<div class="previews">${D.files.map((f, i) => html`<div class="prev"><img src="${f.url}" alt=""><button type="button" class="ib sm" data-a="unattach" data-i="${i}" aria-label="Убрать">${raw(I.x)}</button></div>`)}</div>` : ''}
    ${D.poll ? html`<div class="stack poll-form"><input name="pq" placeholder="Вопрос" maxlength="200">${Array.from({ length: D.opts }, (_, i) => html`<input name="po${i}" placeholder="Вариант ${i + 1}" maxlength="80">`)}
      <div class="row">${D.opts < 6 ? html`<button type="button" class="btn ghost sm" data-a="poll-add">+ вариант</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost sm" data-a="poll-x">Убрать опрос</button></div></div>` : ''}
    <div class="row composer-f"><button type="button" class="ib" data-a="attach" aria-label="Фото">${raw(I.photo)}</button>
      ${D.poll ? '' : html`<button type="button" class="ib" data-a="poll-on" aria-label="Опрос">${raw(I.poll)}</button>`}
      <span class="grow"></span><button class="btn" ${D.busy ? 'disabled' : ''}>${D.busy ? 'Публикуем…' : 'Опубликовать'}</button></div>
  </form>`;
}
export function pickFiles(accept, multiple) {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res([...i.files]); i.click(); });
}
act('attach', async () => {
  const fs = (await pickFiles('image/*', true)).slice(0, 4 - D.files.length);
  D.files.push(...fs.map(f => ({ file: f, url: URL.createObjectURL(f) }))); render();
});
act('unattach', d => { const [f] = D.files.splice(+d.i, 1); if (f) URL.revokeObjectURL(f.url); render(); });
act('poll-on', () => { D.poll = true; render(); });
act('poll-x', () => { D.poll = false; D.opts = 2; render(); });
act('poll-add', () => { D.opts = Math.min(6, D.opts + 1); render(); });
onInput('draft', v => lsSet('vs_draft', v.slice(0, 4000)));
form('post', async (v, f) => {
  const text = (v.text || '').trim(), wall = f.dataset.wall;
  let poll = null;
  if (D.poll) {
    const options = Array.from({ length: D.opts }, (_, i) => (v['po' + i] || '').trim()).filter(Boolean);
    if (options.length < 2) return toast('В опросе нужно хотя бы два варианта');
    poll = { q: (v.pq || '').trim() || 'Опрос', options, votes: {} };
  }
  if (!text && !D.files.length && !poll) return toast('Напишите что-нибудь или добавьте фото');
  D.busy = true; render();
  try {
    const n = D.files.length, imgs = [];
    for (const x of D.files) imgs.push(await compress(x.file, n > 1 ? 1080 : 1280, n > 1 ? Math.floor(880000 / n) : 700000));
    const post = { authorId: uid(), wallId: wall, text, image: n === 1 ? imgs[0] : '', likes: [], commentCount: 0, createdAt: serverTimestamp() };
    if (n > 1) post.images = imgs;
    const tags = extractTags(text); if (tags.length) post.tags = tags;
    if (poll) post.poll = poll;
    const ref = await addDoc(collection(db, 'posts'), post);
    if (wall !== uid()) notify(wall, 'wall', ref.id, text || 'Фото');
    notifyMentions(text, ref.id, [uid(), wall]);
    D.files.forEach(x => URL.revokeObjectURL(x.url)); D.files = []; D.poll = false; D.opts = 2;
    lsSet('vs_draft', ''); f.reset(); const ta = f.querySelector('textarea'); if (ta) ta.value = '';
    toast('Опубликовано');
  } catch (e) { toast(e.message === 'too-big' ? 'Фото слишком большое' : errText(e)); }
  finally { D.busy = false; render(); }
});

/* ---------- Действия с записями ---------- */
act('like', async d => {
  const p = find(d.id); if (!p) return;
  const had = (p.likes || []).includes(uid()), nid = `like_${p.id}_${uid()}`;
  await updateDoc(doc(db, 'posts', p.id), { likes: had ? arrayRemove(uid()) : arrayUnion(uid()) });
  if (p.authorId !== uid()) { if (had) unnotify(nid); else notify(p.authorId, 'like', p.id, p.text || 'Фото', nid); }
});
act('vote', async d => {
  const p = find(d.id); if (!p?.poll) return;
  const votes = { ...(p.poll.votes || {}) }, i = +d.i;
  if (votes[uid()] === i) delete votes[uid()]; else votes[uid()] = i;
  await updateDoc(doc(db, 'posts', p.id), { poll: { ...p.poll, votes } });
});
act('comments', d => {
  if (P.open.has(d.id)) { P.open.delete(d.id); render(); return; }
  openComments(d.id);
  setTimeout(() => document.getElementById('c-' + d.id)?.focus(), 50);
});
function openComments(id) {
  if (P.open.has(id)) return;
  P.open.add(id); render();
  const d = { id };
  sub(onSnapshot(query(collection(db, 'posts', d.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)), s => {
    P.comments.set(d.id, s.docs.map(data)); ensureUsers(s.docs.map(x => x.data().authorId)); render();
  }, e => { console.error(e); P.comments.set(d.id, []); render(); }));
}
form('comment', async (v, f) => {
  const pid = f.dataset.id, text = (v.text || '').trim(); if (!text) return;
  f.reset();
  const b = writeBatch(db);
  b.set(doc(collection(db, 'posts', pid, 'comments')), { authorId: uid(), text: text.slice(0, 1000), createdAt: serverTimestamp() });
  b.update(doc(db, 'posts', pid), { commentCount: increment(1) });
  await b.commit();
  const p = find(pid); if (p) notify(p.authorId, 'comment', pid, text);
  notifyMentions(text, pid, [uid(), p?.authorId]);
});
act('clike', async d => {
  const c = P.comments.get(d.p)?.find(x => x.id === d.id); if (!c) return;
  await updateDoc(doc(db, 'posts', d.p, 'comments', d.id), { likes: (c.likes || []).includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
});
act('cdel', async d => {
  const b = writeBatch(db);
  b.delete(doc(db, 'posts', d.p, 'comments', d.id)); b.update(doc(db, 'posts', d.p), { commentCount: increment(-1) });
  await b.commit();
});
act('post-del', async d => {
  if (!confirm('Удалить запись?')) return;
  S.menu = null; await deleteDoc(doc(db, 'posts', d.id)); toast('Запись удалена');
  if (S.route.name === 'post') go('feed');
});
act('post-edit', d => { P.edit = d.id; S.menu = null; render(); });
act('post-edit-x', () => { P.edit = null; render(); });
form('post-edit', async (v, f) => {
  const text = (v.text || '').trim(), p = find(f.dataset.id); if (!p) return;
  const upd = { text, editedAt: serverTimestamp() }, tags = extractTags(text); if (tags.length || p.tags) upd.tags = tags;
  await updateDoc(doc(db, 'posts', p.id), upd); P.edit = null; render();
});
act('post-link', d => copyText(siteUrl('post/' + d.id), 'Ссылка на запись скопирована'));
act('repost', async d => {
  const p = find(d.id); if (!p) return;
  const orig = p.repostOf || p.id;
  if (!confirm('Поделиться записью у себя на стене?')) return;
  const b = writeBatch(db);
  b.set(doc(collection(db, 'posts')), { authorId: uid(), wallId: uid(), text: '', image: '', repostOf: orig, likes: [], commentCount: 0, createdAt: serverTimestamp() });
  b.update(doc(db, 'posts', orig), { reposts: increment(1) });
  await b.commit(); toast('Запись теперь у вас на стене');
  const o = orig === p.id ? p : reposted.get(orig); if (o) notify(o.authorId, 'repost', orig, o.text || 'Запись');
});
act('photo', d => { const p = find(d.id); const imgs = p?.images?.length ? p.images : p?.image ? [p.image] : []; openModal({ type: 'photo', imgs, i: +d.i || 0, wide: true }); });
modal('photo', m => html`<div class="viewer"><img src="${safeImg(m.imgs[m.i])}" alt="Фото">
  ${m.imgs.length > 1 ? html`<button class="ib nav l" data-a="photo-step" data-d="-1" aria-label="Назад">${raw(I.back)}</button><button class="ib nav r" data-a="photo-step" data-d="1" aria-label="Дальше">${raw(I.back)}</button>` : ''}
  <button class="ib close" data-a="modal-x" aria-label="Закрыть">${raw(I.x)}</button></div>`);
act('photo-step', d => { const m = S.modal; if (!m) return; m.i = (m.i + +d.d + m.imgs.length) % m.imgs.length; render(); });

/* ---------- Страницы: лента и одна запись ---------- */
const FEED = { tab: lsGet('vs_feed') || 'friends' };
view('feed', {
  title: 'Лента',
  enter() { loadFeed(); },
  render: () => html`${pageHead('Лента', '', html`<div class="seg"><button class="${FEED.tab === 'friends' ? 'on' : ''}" data-a="feed-tab" data-v="friends">Друзья</button><button class="${FEED.tab === 'all' ? 'on' : ''}" data-a="feed-tab" data-v="all">Все</button></div>`)}
    ${composer(uid())}
    ${FEED.tab === 'friends' && !(S.me.friends || []).length ? html`<div class="card hint-card"><b>Добавьте друзей — и здесь появятся их записи</b><span>Пока показываем ваши.</span><a class="btn sm" href="friends/find">Найти друзей</a></div>` : ''}
    ${postList(FEED.tab === 'friends' ? 'Друзья ещё ничего не писали' : 'Записей пока нет')}`,
});
function loadFeed() {
  if (FEED.tab === 'all') return watchPosts(last => query(collection(db, 'posts'), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(20)));
  // друзья + я: до 30 человек в одном запросе (in), остальное — по свежести
  const ids = [uid(), ...(S.me.friends || [])].slice(0, 30);
  watchPosts(last => query(collection(db, 'posts'), where('authorId', 'in', ids), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(20)));
}
act('feed-tab', d => { FEED.tab = d.v; lsSet('vs_feed', d.v); loadFeed(); render(); });
view('post', {
  title: 'Запись',
  enter(id) {
    resetPosts();
    sub(onSnapshot(doc(db, 'posts', id), s => { P.single = s.exists() ? data(s) : false; P.list = P.single ? [P.single] : []; P.ready = true; if (P.single) { ensureUsers([P.single.authorId, P.single.wallId]); openComments(id); } render(); }, () => { P.single = false; P.ready = true; render(); }));
  },
  render: () => html`${pageHead('Запись')}${!P.ready ? skeleton(1) : P.single ? postCard(P.single) : empty('Запись не найдена', 'Возможно, её удалили')}`,
});
