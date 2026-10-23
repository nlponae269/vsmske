// Чаты: список диалогов и переписка — текст, фото, голосовые, ответы, реакции, правка, удаление, «прочитано».
import { db, uid, data, errText, doc, collection, query, orderBy, limitToLast, getDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp } from './fb.js';
import { S, cache, U, view, act, form, onInput, render, sub, ensureUsers, avatar, nameLink, empty, onAfterRender, isOnline, seenText, isFriend, isUnread, iBlocked } from './core.js';
import { html, raw, I, ms, hm, dayLabel, ago, fmtDur, richText, compress, safeImg, toast, readDataUrl, norm } from './lib.js';
import { pickFiles } from './posts.js';

export const chatId = (a, b) => [a, b].sort().join('_');
const isRoom = k => typeof k === 'string' && k.startsWith('g_');
const cidOf = key => isRoom(key) ? key : chatId(uid(), key);
const keyOf = c => c.group ? c.id : (c.members.find(m => m !== uid()) || uid());
const REACTS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const C = { key: null, msgs: [], ready: false, reply: null, edit: null, sel: null, q: '', stick: true, rec: null };

view('im', {
  wide: true,
  title: k => k ? (isRoom(k) ? (cache.chats.find(c => c.id === k)?.name || 'Беседа') : U(k)?.name || 'Чат') : 'Чаты',
  enter(key) {
    C.key = key || null; C.msgs = []; C.ready = false; C.reply = null; C.edit = null; C.sel = null; C.stick = true;
    if (!key) return;
    if (!isRoom(key)) ensureUsers([key]);
    sub(onSnapshot(query(collection(db, 'chats', cidOf(key), 'messages'), orderBy('createdAt', 'asc'), limitToLast(200)), s => {
      C.msgs = s.docs.map(data); C.ready = true;
      if (isRoom(key)) ensureUsers(C.msgs.map(m => m.from));
      markRead(); render();
    }, e => { console.error(e); C.ready = true; C.err = errText(e); render(); }));
  },
  leave() { recStop(false); voices.forEach(a => a.pause()); },
  render() {
    const q = norm(C.q).trim();
    const list = cache.chats.filter(c => !q || norm(c.group ? c.name : U(keyOf(c))?.name).includes(q));
    return html`<div class="im ${C.key ? 'open' : ''}">
      <aside class="card dlist"><div class="dhead"><h1>Чаты</h1></div>
        <div class="sbar dsearch"><span>${raw(I.search)}</span><input data-i="dq" placeholder="Поиск по диалогам" value="${C.q}" autocomplete="off"></div>
        <div class="ditems">${list.length ? list.map(dialogItem) : empty(q ? 'Ничего не нашли' : 'Диалогов пока нет', q ? '' : 'Напишите другу — кнопка «Написать» у него на странице')}</div></aside>
      <section class="card chat">${C.key ? chatPane() : html`<div class="chat-empty">${raw(I.chat)}<b>Выберите диалог</b><span class="muted">или начните новый со страницы друга</span></div>`}</section>
    </div>`;
  },
});
onInput('dq', v => { C.q = v; render(); });
function dialogItem(c) {
  const k = keyOf(c), u = c.group ? null : U(k), me1 = k === uid();
  const name = c.group ? c.name : me1 ? 'Избранное' : u?.name || '…';
  const who = c.lastFrom === uid() ? 'Вы: ' : c.group && U(c.lastFrom) ? U(c.lastFrom).name.split(' ')[0] + ': ' : '';
  const unread = isUnread(c);
  return html`<a class="ditem ${C.key === k ? 'on' : ''} ${unread ? 'unread' : ''}" href="im/${k}" data-k="d-${c.id}">
    ${c.group ? html`<span class="av room" style="--s:48px">${raw(I.friends)}</span>` : me1 ? html`<span class="av fav" style="--s:48px">★</span>` : avatar(u, 48, false)}
    <span class="grow"><span class="row between"><b class="dname">${name}</b><small class="muted">${c.lastAt ? (Date.now() - ms(c.lastAt) < 864e5 ? hm(new Date(ms(c.lastAt))) : dayLabel(c.lastAt)) : ''}</small></span>
      <span class="row between"><span class="dlast">${who}${c.lastText || ''}</span>${unread ? html`<i class="dot"></i>` : ''}</span></span></a>`;
}
function markRead() {
  const c = cache.chats.find(x => x.id === cidOf(C.key));
  if (c && isUnread(c) && !document.hidden) updateDoc(doc(db, 'chats', c.id), { ['read.' + uid()]: serverTimestamp() }).catch(() => { });
}
document.addEventListener('visibilitychange', () => { if (S.route.name === 'im' && C.key) markRead(); });

/* ---------- Переписка ---------- */
function chatPane() {
  const key = C.key, room = isRoom(key), chat = cache.chats.find(c => c.id === cidOf(key)), u = room ? null : U(key), self = key === uid();
  if (!room && !u) return html`<div class="chat-empty"><b>Загружаем…</b></div>`;
  if (room && !chat) return html`<div class="chat-empty"><b>Беседа не найдена</b><a class="btn sm" href="im">К диалогам</a></div>`;
  const peerRead = !room && chat?.read?.[key] ? ms(chat.read[key]) : 0;
  const head = html`<header class="chat-h"><a class="ib back" href="im" aria-label="К диалогам">${raw(I.back)}</a>
    ${room ? html`<span class="av room" style="--s:42px">${raw(I.friends)}</span>` : self ? html`<span class="av fav" style="--s:42px">★</span>` : avatar(u, 42)}
    <div class="grow"><b class="clamp1">${room ? chat.name : self ? 'Избранное' : nameLink(u)}</b><small class="muted ${!room && isOnline(u) ? 'ok' : ''}">${room ? `${chat.members.length} участников` : self ? 'Заметки для себя' : seenText(u) || '@' + (u.nick || '')}</small></div>
    ${!room && !self && !u.deleted ? html`<button class="ib" data-a="call" data-id="${key}" data-v="0" aria-label="Позвонить" title="Позвонить">${raw(I.phone)}</button><button class="ib" data-a="call" data-id="${key}" data-v="1" aria-label="Видеозвонок" title="Видеозвонок">${raw(I.cam)}</button>` : ''}</header>`;
  let lastDay = '';
  const body = !C.ready ? html`<p class="muted center small">Загружаем…</p>` : !C.msgs.length ? html`<div class="chat-hello">${self ? 'Сохраняйте сюда заметки, ссылки и фото — их видите только вы' : `Напишите ${room ? 'в беседу' : u.name.split(' ')[0]} первым 👋`}</div>`
    : C.msgs.map(m => { const d = dayLabel(m.createdAt), sep = d !== lastDay ? (lastDay = d, html`<div class="dsep" data-k="sep-${d}"><span>${d}</span></div>`) : ''; return html`${sep}${msgHtml(m, room, peerRead)}`; });
  const blockedMe = !room && (u.blocked || []).includes(uid()), friendsOnly = !room && !self && (u.privacy?.messages === 'friends') && !isFriend(key) && !chat;
  const foot = u?.deleted ? '' : iBlocked(key) ? html`<div class="chat-note">Вы заблокировали этого человека · <button class="link" data-a="unblock" data-id="${key}">разблокировать</button></div>`
    : blockedMe ? html`<div class="chat-note">Человек ограничил вам доступ к сообщениям</div>`
    : friendsOnly ? html`<div class="chat-note">${u.name.split(' ')[0]} принимает сообщения только от друзей</div>` : composerBar();
  return html`${head}<div class="msgs" id="msgs" data-k="msgs-${key}">${body}</div>${foot}`;
}
function msgHtml(m, room, peerRead) {
  const mine = m.from === uid(), sel = C.sel === m.id, a = U(m.from);
  const ticks = mine && !room ? html`<span class="tick ${peerRead >= ms(m.createdAt) ? 'read' : ''}">${raw(peerRead >= ms(m.createdAt) ? I.checks : I.check)}</span>` : '';
  const reacts = Object.entries(m.reacts || {}).reduce((o, [, e]) => (o[e] = (o[e] || 0) + 1, o), {});
  const media = typeof m.audio === 'string' ? (m.audio.startsWith('data:video/') ? html`<video class="vnote" src="${m.audio}" playsinline loop muted autoplay data-a="vnote" data-keep="v-${m.id}"></video>` : m.audio.startsWith('data:audio/') ? voiceHtml(m) : '') : '';
  return html`<div class="msg ${mine ? 'me' : ''} ${sel ? 'sel' : ''} ${m.audio?.startsWith('data:video/') ? 'note' : ''}" data-k="m-${m.id}" data-a="msg-sel" data-id="${m.id}">
    ${room && !mine ? html`<a class="mfrom" href="id/${m.from}">${a?.name || '…'}</a>` : ''}
    ${m.fwd ? html`<div class="mquote">↪ ${m.fwd.name || 'Пересланное'}: ${m.fwd.text || ''}</div>` : ''}
    ${m.replyTo ? html`<div class="mquote"><b>${m.replyTo.from === uid() ? 'Вы' : U(m.replyTo.from)?.name.split(' ')[0] || ''}</b> ${m.replyTo.text}</div>` : ''}
    ${safeImg(m.image) ? html`<img class="mimg" src="${m.image}" alt="Фото" data-a="mphoto" data-id="${m.id}">` : ''}${media}
    ${m.text ? html`<span class="mtext">${richText(m.text)}</span>` : ''}
    <span class="mmeta">${m.edited ? 'изм. ' : ''}${hm(new Date(ms(m.createdAt)))}${ticks}</span>
    ${Object.keys(reacts).length ? html`<span class="mreacts">${Object.entries(reacts).map(([e, n]) => html`<button class="${m.reacts?.[uid()] === e ? 'on' : ''}" data-a="react" data-id="${m.id}" data-e="${e}">${e}${n > 1 ? n : ''}</button>`)}</span>` : ''}
    ${sel ? html`<div class="mpop" data-stop><div class="mreact-pick">${REACTS.map(e => html`<button data-a="react" data-id="${m.id}" data-e="${e}">${e}</button>`)}</div>
      <button data-a="msg-reply" data-id="${m.id}">${raw(I.reply)} Ответить</button>
      ${m.text ? html`<button data-a="msg-copy" data-id="${m.id}">Копировать</button>` : ''}
      ${mine && m.text ? html`<button data-a="msg-edit" data-id="${m.id}">${raw(I.edit)} Изменить</button>` : ''}
      ${mine ? html`<button class="danger" data-a="msg-del" data-id="${m.id}">${raw(I.trash)} Удалить</button>` : ''}</div>` : ''}
  </div>`;
}
function composerBar() {
  if (C.rec) return html`<div class="cbar rec"><span class="rec-dot"></span><b id="recT">${fmtDur((Date.now() - C.rec.t0) / 1000)}</b><span class="grow muted">Запись голосового</span>
    <button class="btn ghost sm" data-a="rec-x">Отмена</button><button class="btn sm" data-a="rec-send">${raw(I.send)} Отправить</button></div>`;
  const ctx = C.edit ? html`<div class="cctx">${raw(I.edit)}<span class="grow"><b>Редактирование</b></span><button class="ib sm" data-a="ctx-x" aria-label="Отменить">${raw(I.x)}</button></div>`
    : C.reply ? html`<div class="cctx">${raw(I.reply)}<span class="grow"><b>${C.reply.from === uid() ? 'Вы' : U(C.reply.from)?.name || ''}</b><small class="clamp1 muted">${C.reply.text}</small></span><button class="ib sm" data-a="ctx-x" aria-label="Не отвечать">${raw(I.x)}</button></div>` : '';
  return html`${ctx}<form class="cbar" data-f="msg" data-k="cbar-${C.key}"><button type="button" class="ib" data-a="msg-photo" aria-label="Фото">${raw(I.photo)}</button>
    <input name="text" id="msgInput" placeholder="Сообщение" maxlength="2000" autocomplete="off" data-i="msg-typing">
    <button type="button" class="ib mic" data-a="rec-start" aria-label="Голосовое">${raw(I.mic)}</button><button class="btn send" aria-label="Отправить">${raw(I.send)}</button></form>`;
}
onInput('msg-typing', (v, el) => el.form?.classList.toggle('typed', !!v.trim()));

/* прокрутка: держимся внизу, если человек и так был внизу */
document.addEventListener('scroll', e => { if (e.target.id === 'msgs') { const b = e.target; C.stick = b.scrollHeight - b.scrollTop - b.clientHeight < 80; } }, true);
let lastCount = 0, lastKey = null;
onAfterRender(() => {
  const b = document.getElementById('msgs'); if (!b) return;
  if (C.key !== lastKey) { lastKey = C.key; C.stick = true; }
  if (C.stick && (C.msgs.length !== lastCount || b.dataset.s !== '1')) { b.scrollTop = b.scrollHeight; b.dataset.s = '1'; b.querySelectorAll('img').forEach(i => { if (!i.complete) i.addEventListener('load', () => { if (C.stick) b.scrollTop = b.scrollHeight; }, { once: true }); }); }
  lastCount = C.msgs.length;
});

/* ---------- Отправка ---------- */
export async function sendMessage(to, text, extra = {}) {
  const me = uid(), cid = cidOf(to), b = writeBatch(db);
  const msg = { from: me, text: String(text || '').slice(0, 2000), createdAt: serverTimestamp(), ...extra };
  b.set(doc(collection(db, 'chats', cid, 'messages')), msg);
  const lastText = (msg.text || (extra.audio ? (extra.audio.startsWith('data:video/') ? '🎥 Видеосообщение' : '🎤 Голосовое') : extra.image ? '📷 Фото' : '')).slice(0, 200);
  const last = { lastText, lastFrom: me, lastAt: serverTimestamp(), read: { [me]: serverTimestamp() } };
  b.set(doc(db, 'chats', cid), isRoom(to) ? last : { members: [me, to].sort(), ...last }, { merge: true });
  await b.commit();
}
form('msg', async (v, f) => {
  const text = (v.text || '').trim(); if (!text) return;
  const input = f.querySelector('input'); input.value = ''; f.classList.remove('typed'); C.stick = true;
  try {
    if (C.edit) { const id = C.edit; C.edit = null; render(); await updateDoc(doc(db, 'chats', cidOf(C.key), 'messages', id), { text, edited: serverTimestamp() }); return; }
    const extra = {};
    if (C.reply) { extra.replyTo = { id: C.reply.id, from: C.reply.from, text: C.reply.text.slice(0, 120) }; C.reply = null; render(); }
    await sendMessage(C.key, text, extra);
  } catch (e) { input.value = text; toast(errText(e)); }
});
act('msg-photo', async () => {
  const [f] = await pickFiles('image/*', false); if (!f) return;
  try { const image = await compress(f, 1280, 380000); C.stick = true; await sendMessage(C.key, '', { image }); } catch (e) { toast(e.message === 'too-big' ? 'Фото слишком большое' : errText(e)); }
});
act('msg-sel', (d, el, e) => { if (e.target.closest('a,button,video,.voice')) return; C.sel = C.sel === d.id ? null : d.id; render(); });
document.addEventListener('click', e => { if (C.sel && !e.target.closest('.msg.sel')) { C.sel = null; render(); } }, true);
const findMsg = id => C.msgs.find(m => m.id === id);
act('msg-reply', d => { const m = findMsg(d.id); if (!m) return; C.reply = { id: m.id, from: m.from, text: m.text || (m.image ? '📷 Фото' : m.audio ? '🎤 Голосовое' : '') }; C.edit = null; C.sel = null; render(); document.getElementById('msgInput')?.focus(); });
act('msg-edit', d => { const m = findMsg(d.id); if (!m) return; C.edit = m.id; C.reply = null; C.sel = null; render(); const i = document.getElementById('msgInput'); if (i) { i.value = m.text; i.focus(); i.form.classList.add('typed'); } });
act('ctx-x', () => { C.reply = null; if (C.edit) { C.edit = null; const i = document.getElementById('msgInput'); if (i) i.value = ''; } render(); });
act('msg-copy', d => { const m = findMsg(d.id); if (m) navigator.clipboard?.writeText(m.text).then(() => toast('Скопировано')); C.sel = null; render(); });
act('msg-del', async d => {
  const cid = cidOf(C.key), b = writeBatch(db), last = C.msgs[C.msgs.length - 1];
  b.delete(doc(db, 'chats', cid, 'messages', d.id));
  if (last?.id === d.id && cache.chats.find(c => c.id === cid)?.lastFrom === uid()) b.update(doc(db, 'chats', cid), { lastText: 'Сообщение удалено' });
  C.sel = null; await b.commit();
});
act('react', async d => {
  const m = findMsg(d.id); if (!m) return;
  const reacts = { ...(m.reacts || {}) }; if (reacts[uid()] === d.e) delete reacts[uid()]; else reacts[uid()] = d.e;
  C.sel = null; render();
  await updateDoc(doc(db, 'chats', cidOf(C.key), 'messages', m.id), { reacts });
});
act('mphoto', d => { const m = findMsg(d.id); if (m?.image) { S.modal = { type: 'photo', imgs: [m.image], i: 0, wide: true }; render(); } });
act('vnote', (d, el) => { el.muted = !el.muted; if (el.paused || !el.muted) { el.currentTime = 0; el.play().catch(() => { }); } el.classList.toggle('on', !el.muted); });

/* ---------- Голосовые: запись до минуты, воспроизведение вне страницы (не прерывается перерисовкой) ---------- */
const voices = new Map();
function voiceHtml(m) {
  const a = voices.get(m.id), on = a && !a.paused, p = a && a.duration ? a.currentTime / a.duration * 100 : 0;
  return html`<span class="voice"><button class="vbtn" data-a="voice" data-id="${m.id}" aria-label="${on ? 'Пауза' : 'Слушать'}">${raw(on ? I.pause : I.play)}</button>
    <span class="vbar"><i id="vb-${m.id}" style="width:${p}%"></i></span><small class="muted" id="vt-${m.id}">${fmtDur(a?.currentTime || m.dur)}</small></span>`;
}
act('voice', d => {
  const m = findMsg(d.id); if (!m) return;
  let a = voices.get(m.id);
  if (!a) {
    a = new Audio(m.audio); voices.set(m.id, a);
    a.ontimeupdate = () => { const b = document.getElementById('vb-' + m.id), t = document.getElementById('vt-' + m.id); if (b && a.duration) b.style.width = a.currentTime / a.duration * 100 + '%'; if (t) t.textContent = fmtDur(a.currentTime); };
    a.onplay = a.onpause = () => render(); a.onended = () => { a.currentTime = 0; render(); };
  }
  voices.forEach(x => { if (x !== a) x.pause(); });
  if (a.paused) a.play().catch(() => toast('Не получилось воспроизвести')); else a.pause();
});
let recorder = null, recChunks = [], recT = 0;
act('rec-start', async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Этот браузер не умеет записывать звук');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { return toast('Нет доступа к микрофону — разрешите его в браузере'); }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }); recChunks = [];
  const to = C.key, t0 = Date.now();
  recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(recT);
    const send = recorder.sendIt, dur = Math.min(60, (Date.now() - t0) / 1000); C.rec = null; render();
    if (!send) return; if (dur < 0.8) return toast('Слишком коротко');
    const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size > 500000) return toast('Запись получилась слишком большой');
    const url = await readDataUrl(blob);
    try { await sendMessage(to, '', { audio: url.replace(/^data:[^;,]*/, 'data:' + (blob.type.split(';')[0] || 'audio/webm')), dur: Math.round(dur * 10) / 10 }); } catch (e) { toast(errText(e)); }
  };
  recorder.start(); C.rec = { t0 }; render();
  recT = setInterval(() => { const s = (Date.now() - t0) / 1000, el = document.getElementById('recT'); if (el) el.textContent = fmtDur(s); if (s >= 60) recStop(true); }, 250);
});
function recStop(send) { if (recorder && recorder.state !== 'inactive') { recorder.sendIt = send; recorder.stop(); } }
act('rec-x', () => recStop(false));
act('rec-send', () => recStop(true));
