// Друзья и заявки, поиск людей, сигналы (уведомления).
import { db, uid, data, errText, doc, collection, query, where, orderBy, limit, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from './fb.js';
import { S, cache, U, view, act, onInput, render, sub, ensureUsers, avatar, nameLink, empty, skeleton, pageHead, isOnline, seenText, isFriend, profileHref, unseenNotifs } from './core.js';
import { html, raw, I, ago, plural, norm, toast } from './lib.js';
import { notify } from './posts.js';

/* ---------- Отношения и кнопки ---------- */
export function friendState(id) {
  if (id === uid()) return 'me';
  if (isFriend(id)) return 'friend';
  if (cache.incoming.some(r => r.from === id)) return 'incoming';
  if (cache.outgoing.some(r => r.to === id)) return 'outgoing';
  return 'none';
}
export function friendButtons(u) {
  const st = friendState(u.id);
  const main = st === 'friend' ? html`<a class="btn" href="im/${u.id}">${raw(I.chat)} Написать</a>`
    : st === 'incoming' ? html`<button class="btn" data-a="fr-accept" data-id="${u.id}">Принять заявку</button>`
    : st === 'outgoing' ? html`<button class="btn ghost" data-a="fr-cancel" data-id="${u.id}">Заявка отправлена</button>`
    : html`<button class="btn" data-a="fr-add" data-id="${u.id}">${raw(I.plus)} Добавить в друзья</button>`;
  const msg = st !== 'friend' ? html`<a class="btn ghost" href="im/${u.id}">${raw(I.chat)}</a>` : '';
  return html`${main}${msg}<button class="ib" data-a="menu" data-id="um-${u.id}" aria-label="Ещё">${raw(I.more)}</button>
    ${S.menu === 'um-' + u.id ? html`<div class="pop">${st === 'friend' ? html`<button data-a="fr-remove" data-id="${u.id}">Убрать из друзей</button>` : ''}
      ${(S.me.blocked || []).includes(u.id) ? html`<button data-a="unblock" data-id="${u.id}">Разблокировать</button>` : html`<button class="danger" data-a="block" data-id="${u.id}">Заблокировать</button>`}</div>` : ''}`;
}
act('fr-add', async d => {
  if (cache.incoming.some(r => r.from === d.id)) return accept(d.id);
  await setDoc(doc(db, 'friendRequests', uid() + '_' + d.id), { from: uid(), to: d.id, createdAt: serverTimestamp() });
  toast('Заявка отправлена');
});
act('fr-cancel', async d => { await deleteDoc(doc(db, 'friendRequests', uid() + '_' + d.id)); toast('Заявка отменена'); });
act('fr-accept', d => accept(d.id));
act('fr-decline', async d => { await deleteDoc(doc(db, 'friendRequests', d.id + '_' + uid())); });
act('fr-remove', async d => {
  if (!confirm('Убрать из друзей?')) return;
  const b = writeBatch(db);
  b.update(doc(db, 'users', uid()), { friends: arrayRemove(d.id) }); b.update(doc(db, 'users', d.id), { friends: arrayRemove(uid()) });
  await b.commit(); S.menu = null; cache.users.delete(d.id); toast('Удалено из друзей');
});
async function accept(from) {
  const b = writeBatch(db);
  b.update(doc(db, 'users', uid()), { friends: arrayUnion(from) });
  b.update(doc(db, 'users', from), { friends: arrayUnion(uid()) });
  b.delete(doc(db, 'friendRequests', from + '_' + uid()));
  if (cache.outgoing.some(r => r.to === from)) b.delete(doc(db, 'friendRequests', uid() + '_' + from));
  await b.commit(); cache.users.delete(from); ensureUsers([from]);
  toast('Теперь вы друзья'); notify(from, 'friend');
}

/* ---------- Страница друзей: /friends, /friends/requests, /friends/find, /friends/<uid> ---------- */
const F = { tab: 'all', q: '', other: null, people: null, found: null, t: 0 };
const urow = (u, right = '') => html`<div class="urow" data-k="u-${u.id}">${avatar(u, 48)}<div class="grow"><div>${nameLink(u)}</div><small class="muted ${isOnline(u) ? 'ok' : ''}">${seenText(u) || (u.city || '@' + u.nick)}</small></div>${right}</div>`;
view('friends', {
  title: 'Друзья',
  enter(a) {
    F.q = ''; F.other = null; F.found = null;
    if (a === 'requests' || a === 'find' || !a) F.tab = a || 'all';
    else { F.tab = 'other'; F.other = a; ensureUsers([a]); }
    if (F.tab === 'find') loadPeople();
  },
  render() {
    if (F.tab === 'other') {
      const u = U(F.other), list = (u?.friends || []);
      ensureUsers(list.slice(0, 200));
      return html`${pageHead(u ? 'Друзья: ' + u.name : 'Друзья')}<section class="card list">${list.length ? list.map(U).filter(Boolean).map(f => urow(f)) : empty('Друзей пока нет')}</section>`;
    }
    const mine = (S.me.friends || []).map(U).filter(Boolean), q = norm(F.q).trim();
    ensureUsers(S.me.friends || []);
    const shown = (q ? mine.filter(u => norm(u.name).includes(q) || norm(u.nick).includes(q)) : mine).sort((a, b) => isOnline(b) - isOnline(a));
    const tabs = html`<div class="seg">${[['all', 'Друзья'], ['requests', 'Заявки' + (cache.incoming.length ? ' ' + cache.incoming.length : '')], ['find', 'Найти']].map(([k, l]) => html`<a class="${F.tab === k ? 'on' : ''}" href="friends${k === 'all' ? '' : '/' + k}">${l}</a>`)}</div>`;
    if (F.tab === 'requests') {
      const inc = cache.incoming.map(r => U(r.from)).filter(Boolean), out = cache.outgoing.map(r => U(r.to)).filter(Boolean);
      ensureUsers(cache.outgoing.map(r => r.to));
      return html`${pageHead('Друзья', '', tabs)}
        <section class="card list"><h2 class="lh">Хотят дружить</h2>${inc.length ? inc.map(u => urow(u, html`<button class="btn sm" data-a="fr-accept" data-id="${u.id}">Принять</button><button class="btn ghost sm" data-a="fr-decline" data-id="${u.id}">Скрыть</button>`)) : html`<p class="muted small pad">Новых заявок нет</p>`}</section>
        ${out.length ? html`<section class="card list"><h2 class="lh">Вы отправили</h2>${out.map(u => urow(u, html`<button class="btn ghost sm" data-a="fr-cancel" data-id="${u.id}">Отменить</button>`))}</section>` : ''}`;
    }
    if (F.tab === 'find') {
      const list = F.found ?? F.people;
      return html`${pageHead('Друзья', '', tabs)}<div class="sbar card"><span>${raw(I.search)}</span><input data-i="fr-find" placeholder="Имя, фамилия или ник" autocomplete="off" value="${F.q}"></div>
        <section class="card list">${list === null ? skeleton(2) : list.length ? list.filter(u => u.id !== uid()).map(u => urow(u, friendState(u.id) === 'none' ? html`<button class="btn sm" data-a="fr-add" data-id="${u.id}">Добавить</button>` : friendState(u.id) === 'incoming' ? html`<button class="btn sm" data-a="fr-accept" data-id="${u.id}">Принять</button>` : html`<span class="muted small">${friendState(u.id) === 'friend' ? 'в друзьях' : 'заявка отправлена'}</span>`)) : empty('Никого не нашли')}</section>`;
    }
    return html`${pageHead('Друзья', mine.length ? `${mine.length} ${plural(mine.length, 'друг', 'друга', 'друзей')}` : '', tabs)}
      ${mine.length > 6 ? html`<div class="sbar card"><span>${raw(I.search)}</span><input data-i="fr-q" placeholder="Поиск среди друзей" autocomplete="off" value="${F.q}"></div>` : ''}
      <section class="card list">${shown.length ? shown.map(u => urow(u, html`<a class="ib" href="im/${u.id}" aria-label="Написать">${raw(I.chat)}</a>`)) : empty(q ? 'Никого не нашли' : 'Пока нет друзей', q ? '' : 'Найдите знакомых через поиск', q ? '' : html`<a class="btn sm" href="friends/find">Найти людей</a>`)}</section>`;
  },
});
onInput('fr-q', v => { F.q = v; render(); });
async function loadPeople() {
  F.people = null;
  try { const s = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(40))); F.people = s.docs.map(data); F.people.forEach(u => cache.users.set(u.id, u)); }
  catch (e) { F.people = []; }
  render();
}
onInput('fr-find', v => {
  F.q = v; clearTimeout(F.t);
  const w = norm(v).trim().replace(/^@/, '').split(/\s+/).filter(Boolean);
  if (!w.length) { F.found = null; render(); return; }
  F.t = setTimeout(async () => {
    try {
      const s = await getDocs(query(collection(db, 'users'), where('search', 'array-contains', w[0].slice(0, 15)), limit(40)));
      F.found = s.docs.map(data).filter(u => w.slice(1).every(x => (u.search || []).includes(x.slice(0, 15))));
      F.found.forEach(u => cache.users.set(u.id, u));
    } catch (e) { F.found = []; }
    render();
  }, 300);
});

/* ---------- Сигналы ---------- */
const NT = { like: 'оценил(а) вашу запись', comment: 'прокомментировал(а) вашу запись', wall: 'написал(а) у вас на стене', friend: 'принял(а) заявку в друзья', repost: 'поделился(ась) вашей записью', mention: 'упомянул(а) вас', gift: 'сделал(а) подарок', call: 'звонил(а) вам', answer: 'ответил(а) на вопрос', best: 'выбрал(а) ваш ответ лучшим', nick: 'подарил(а) юзернейм' };
view('notif', {
  title: 'Сигналы',
  enter() { if (unseenNotifs()) updateDoc(doc(db, 'users', uid()), { notifSeenAt: serverTimestamp() }).catch(() => { }); },
  render() {
    const list = cache.notifs.filter(n => n.from !== uid());
    const inc = cache.incoming.map(r => U(r.from)).filter(Boolean);
    return html`${pageHead('Сигналы')}
      ${inc.length ? html`<a class="card hint-card" href="friends/requests"><b>${inc.length} ${plural(inc.length, 'заявка', 'заявки', 'заявок')} в друзья</b><span>${inc.slice(0, 3).map(u => u.name).join(', ')}</span></a>` : ''}
      <section class="card list">${list.length ? list.map(n => {
        const u = U(n.from); if (!u) return '';
        const href = n.type === 'friend' ? 'id/' + n.from : n.type === 'call' ? 'im/' + n.from : n.postId && ['like', 'comment', 'wall', 'repost', 'mention'].includes(n.type) ? 'post/' + n.postId : 'id/' + n.from;
        return html`<a class="urow notif" href="${href}" data-k="n-${n.id}">${avatar(u, 44, false)}<div class="grow"><div><b>${u.name}</b> ${NT[n.type] || ''}</div>${n.text && n.type !== 'call' ? html`<small class="clamp1 muted">«${n.text}»</small>` : ''}<small class="muted">${ago(n.createdAt)}</small></div><span class="nt nt-${n.type}">${raw(n.type === 'like' ? I.heartF : n.type === 'comment' ? I.comment : n.type === 'friend' ? I.friends : n.type === 'call' ? I.phone : I.bell)}</span></a>`;
      }) : empty('Пока тихо', 'Здесь появятся лайки, комментарии и заявки')}</section>`;
  },
});
