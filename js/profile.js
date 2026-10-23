// Профиль, правка страницы, настройки, меню «Ещё» и быстрый поиск людей.
import { db, uid, data, errText, doc, collection, query, where, orderBy, limit, startAfter, getDoc, getDocs, updateDoc, writeBatch, onSnapshot, arrayUnion, arrayRemove } from './fb.js';
import { S, cache, U, view, act, form, onInput, modal, openModal, closeModal, render, go, sub, ensureUsers, avatar, nameLink, empty, skeleton, pageHead, isOnline, seenText, isFriend, iBlocked, isAdmin, profileHref, siteUrl, setTheme, VERSION } from './core.js';
import { html, raw, I, ago, plural, MONTHS, ms, compress, safePhoto, buildSearch, norm, toast, copyText, lsGet } from './lib.js';
import { watchPosts, postList, composer, P, pickFiles } from './posts.js';
import { NICK_RE } from './auth.js';
import { friendState, friendButtons } from './friends.js';

const COVERS = { blue: ['#4F6BFF', '#9B7BFF'], sunset: ['#FF7A59', '#FFB347'], sea: ['#13B5C8', '#3D7BFF'], night: ['#1E2140', '#4B3F8F'], rose: ['#FF5C8A', '#FF9BB3'], gold: ['#E8A317', '#F6D365'] };
const PR = { uid: null, user: null };

function openProfile(id) {
  PR.uid = id; PR.user = U(id);
  sub(onSnapshotUser(id));
  watchPosts(last => query(collection(db, 'posts'), where('wallId', '==', id), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(20)));
}
function onSnapshotUser(id) {
  return onSnapshot(doc(db, 'users', id), s => { PR.user = s.exists() ? data(s) : { id, deleted: true, name: 'Страница удалена', friends: [] }; cache.users.set(id, PR.user); ensureUsers((PR.user.friends || []).slice(0, 12)); render(); }, () => { PR.user = { id, deleted: true, name: 'Страница недоступна', friends: [] }; render(); });
}
// адрес /@ник
view('nick', {
  wide: true,
  title: () => PR.user?.name || 'Профиль',
  async enter(nick) {
    PR.user = null; PR.uid = null;
    try {
      const s = await getDoc(doc(db, 'usernames', String(nick).toLowerCase()));
      if (!s.exists()) { PR.user = { id: '', deleted: true, name: 'Нет такой страницы', friends: [] }; render(); return; }
      if (S.route.name === 'nick') openProfile(s.data().uid);
    } catch (e) { PR.user = { id: '', deleted: true, name: 'Не загрузилось', friends: [] }; render(); }
  },
  render: () => profilePage(),
});
view('id', { wide: true, title: () => PR.user?.name || 'Профиль', enter: id => openProfile(id || uid()), render: () => profilePage() });

function profilePage() {
  const u = PR.user;
  if (!u) return skeleton(2);
  if (u.deleted) return empty(u.name, 'Проверьте ссылку');
  const own = u.id === uid(), cov = COVERS[u.cover] || COVERS.blue, friends = (u.friends || []).map(U).filter(Boolean);
  const bday = u.bday ? (() => { const [y, m, d] = u.bday.split('-').map(Number); return `${d} ${MONTHS[m - 1]}${y > 1900 ? ' ' + y : ''}`; })() : '';
  const since = u.createdAt ? new Date(ms(u.createdAt)) : null;
  const likes = P.list.filter(p => p.authorId === u.id).reduce((s, p) => s + (p.likes || []).length, 0);
  const canWall = own || (isFriend(u.id) && (u.privacy?.wall || 'friends') !== 'me' && !iBlocked(u.id));
  return html`<section class="card prof" data-k="prof-${u.id}">
      <div class="cover" style="--c1:${cov[0]};--c2:${cov[1]}"></div>
      <div class="prof-main">
        ${avatar(u, 112, false)}
        <div class="prof-id"><h1>${u.name}${isAdmin(u) ? raw('<span class="vbadge big" title="Администратор">✓</span>') : ''} ${u.emoji ? html`<span class="emo">${u.emoji}</span>` : ''}</h1>
          <p class="muted">@${u.nick}${u.id !== uid() ? html` · <span class="${isOnline(u) ? 'ok' : ''}">${seenText(u) || 'давно не заходил(а)'}</span>` : ''}</p>
          ${u.status ? html`<p class="status">${u.status}</p>` : ''}</div>
        <div class="prof-acts">${own ? html`<a class="btn ghost" href="edit">${raw(I.edit)} Редактировать</a>` : friendButtons(u)}
          <button class="ib" data-a="prof-link" data-nick="${u.nick}" aria-label="Скопировать ссылку">${raw(I.link)}</button></div>
      </div>
      <div class="facts">${u.city ? html`<span>📍 ${u.city}</span>` : ''}${bday ? html`<span>🎂 ${bday}</span>` : ''}${since ? html`<span>🗓 На VСмске с ${since.getDate()} ${MONTHS[since.getMonth()]} ${since.getFullYear()}</span>` : ''}</div>
      ${u.about ? html`<p class="about">${u.about}</p>` : ''}
      <div class="stats"><a href="friends/${u.id}"><b>${(u.friends || []).length}</b><span>${plural((u.friends || []).length, 'друг', 'друга', 'друзей')}</span></a>
        <div><b>${P.list.length}${P.more ? '+' : ''}</b><span>записей</span></div><div><b>${likes}</b><span>${plural(likes, 'лайк', 'лайка', 'лайков')}</span></div></div>
    </section>
    <div class="cols">
      <div class="col-main">${canWall && !iBlocked(u.id) ? composer(u.id, own ? 'Что нового?' : `Написать ${u.name.split(' ')[0]}…`) : ''}${postList(own ? 'Напишите первую запись' : 'На стене пока пусто')}</div>
      <aside class="col-side"><section class="card pad"><div class="row between"><b>Друзья</b><a class="muted small" href="friends/${u.id}">все ${(u.friends || []).length}</a></div>
        ${friends.length ? html`<div class="fgrid">${friends.slice(0, 9).map(f => html`<a href="${profileHref(f)}" class="fcell">${avatar(f, 52, false)}<span>${f.name.split(' ')[0]}</span></a>`)}</div>` : html`<p class="muted small">Пока никого</p>`}</section></aside>
    </div>`;
}
act('prof-link', d => copyText(siteUrl('@' + d.nick), 'Ссылка на страницу скопирована'));

/* ---------- Правка страницы ---------- */
const E = { photo: undefined, busy: false, err: '' };
view('edit', {
  title: 'Редактирование',
  enter() { E.photo = undefined; E.err = ''; },
  render() {
    const u = S.me, ph = E.photo === undefined ? u.photo : E.photo;
    return html`${pageHead('Моя страница', 'Изменения видят все, кто заходит к вам')}
    <form class="card pad stack" data-f="edit" data-k="edit-form">
      <div class="row">${avatar({ ...u, photo: ph }, 84, false)}<div class="stack s"><button type="button" class="btn ghost sm" data-a="edit-photo">${raw(I.photo)} Новое фото</button>${ph ? html`<button type="button" class="link" data-a="edit-photo-x">Убрать фото</button>` : ''}</div></div>
      <label class="fld"><span>Имя и фамилия</span><input name="name" required maxlength="60" data-v="${u.name}" value="${u.name}"></label>
      <label class="fld"><span>Ник (адрес страницы)</span><input name="nick" required maxlength="30" pattern="[a-zA-Z0-9._]{3,30}" autocapitalize="off" data-v="${u.nick}" value="${u.nick}"></label>
      <label class="fld"><span>Статус</span><input name="status" maxlength="120" value="${u.status || ''}" placeholder="Что у вас на уме"></label>
      <div class="two"><label class="fld"><span>Город</span><input name="city" maxlength="40" value="${u.city || ''}"></label>
        <label class="fld"><span>День рождения</span><input name="bday" type="date" value="${u.bday || ''}"></label></div>
      <label class="fld"><span>О себе</span><textarea name="about" rows="3" maxlength="600">${u.about || ''}</textarea></label>
      <div class="fld"><span>Обложка</span><div class="covers">${Object.entries(COVERS).map(([k, c]) => html`<label class="cov" style="--c1:${c[0]};--c2:${c[1]}"><input type="radio" name="cover" value="${k}" ${(u.cover || 'blue') === k ? 'checked' : ''}><i></i></label>`)}</div></div>
      ${E.err ? html`<p class="err">${E.err}</p>` : ''}
      <div class="row end"><a class="btn ghost" href="id/${u.id}">Отмена</a><button class="btn" ${E.busy ? 'disabled' : ''}>${E.busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
    </form>`;
  },
});
act('edit-photo', async () => { const [f] = await pickFiles('image/*', false); if (!f) return; try { E.photo = await compress(f, 400, 120000, true); render(); } catch (e) { toast('Фото не подошло'); } });
act('edit-photo-x', () => { E.photo = ''; render(); });
form('edit', async v => {
  const me = S.me, name = v.name.trim().slice(0, 60), nick = v.nick.trim().toLowerCase(), city = v.city.trim().slice(0, 40);
  if (!name) return;
  if (nick !== me.nick && !NICK_RE.test(nick)) { E.err = 'Ник: от 4 до 30 латинских букв, цифр, точек или «_»'; render(); return; }
  E.busy = true; E.err = ''; render();
  try {
    const upd = { name, city, status: v.status.trim().slice(0, 120), about: v.about.trim().slice(0, 600), bday: v.bday || '', cover: v.cover || 'blue', search: buildSearch(name, nick, city) };
    if (E.photo !== undefined) upd.photo = E.photo;
    const b = writeBatch(db);
    if (nick !== me.nick) {
      if ((await getDoc(doc(db, 'usernames', nick))).exists()) { E.err = 'Этот ник уже занят'; return; }
      upd.nick = nick; b.set(doc(db, 'usernames', nick), { uid: uid() });
    }
    b.update(doc(db, 'users', uid()), upd);
    await b.commit();
    if (upd.nick) { try { const o = writeBatch(db); o.delete(doc(db, 'usernames', me.nick)); await o.commit(); } catch (e) { } }   // старый ник освобождаем (коллекционный останется)
    toast('Сохранено'); go('id/' + uid());
  } catch (e) { E.err = errText(e); } finally { E.busy = false; render(); }
});

/* ---------- Настройки ---------- */
view('settings', {
  title: 'Настройки',
  render() {
    const me = S.me, th = lsGet('vs_theme') || 'system', pr = me.privacy || {};
    const seg = (a, cur, opts) => html`<div class="seg">${opts.map(([v, l]) => html`<button class="${cur === v ? 'on' : ''}" data-a="${a}" data-v="${v}">${l}</button>`)}</div>`;
    return html`${pageHead('Настройки')}
    <section class="card pad set"><h2>Оформление</h2>
      <div class="set-row"><span>Тема</span>${seg('theme', th, [['system', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div></section>
    <section class="card pad set"><h2>Приватность</h2>
      <div class="set-row"><span>Кто может писать мне</span>${seg('priv-msg', pr.messages || 'all', [['all', 'Все'], ['friends', 'Только друзья']])}</div>
      <div class="set-row"><span>Кто пишет на моей стене</span>${seg('priv-wall', pr.wall || 'friends', [['friends', 'Друзья'], ['me', 'Только я']])}</div></section>
    ${(me.blocked || []).length ? html`<section class="card pad set"><h2>Чёрный список</h2>${me.blocked.map(id => { ensureUsers([id]); const b = U(id); return html`<div class="urow">${avatar(b, 36)}<span class="grow">${nameLink(b)}</span><button class="btn ghost sm" data-a="unblock" data-id="${id}">Разблокировать</button></div>`; })}</section>` : ''}
    <section class="card pad set"><h2>Аккаунт</h2>
      <a class="set-link" href="edit">${raw(I.edit)} Редактировать страницу</a>
      <button class="set-link danger" data-a="logout">${raw(I.logout)} Выйти</button></section>
    <p class="muted small center">VСмске ${VERSION}</p>`;
  },
});
act('theme', d => setTheme(d.v));
act('priv-msg', async d => { await updateDoc(doc(db, 'users', uid()), { 'privacy.messages': d.v }); toast('Сохранено'); });
act('priv-wall', async d => { await updateDoc(doc(db, 'users', uid()), { 'privacy.wall': d.v }); toast('Сохранено'); });
act('block', async d => { if (!confirm('Заблокировать? Человек не сможет писать вам и комментировать.')) return; await updateDoc(doc(db, 'users', uid()), { blocked: arrayUnion(d.id) }); S.menu = null; toast('Заблокирован'); });
act('unblock', async d => { await updateDoc(doc(db, 'users', uid()), { blocked: arrayRemove(d.id) }); toast('Разблокирован'); });

/* ---------- «Ещё» (на телефоне) ---------- */
view('more', {
  title: 'Ещё',
  render: () => html`${pageHead('Ещё')}
    <a class="card me-big" href="id/${uid()}">${avatar(S.me, 56, false)}<span class="mc-t"><b>${S.me.name}</b><small class="muted">Моя страница</small></span></a>
    <nav class="card menu-list">
      ${[['notif', I.bell, 'Сигналы'], ['video', I.video, 'Видео'], ['clips', I.clips, 'Клипы'], ['friends', I.friends, 'Друзья'], ['settings', I.gear, 'Настройки']]
        .map(([h, i, l]) => html`<a href="${h}">${raw(i)}<span>${l}</span></a>`)}
      <button data-a="logout">${raw(I.logout)}<span>Выйти</span></button></nav>`,
});

/* ---------- Быстрый поиск людей (кнопка «Поиск» или клавиша /) ---------- */
const Q = { q: '', res: null, t: 0 };
act('search-open', () => { Q.q = ''; Q.res = null; openModal({ type: 'search' }); setTimeout(() => document.getElementById('qInput')?.focus(), 30); });
modal('search', () => html`<div class="search-box"><div class="sbar">${raw(I.search)}<input id="qInput" data-i="q" placeholder="Имя, фамилия или ник" autocomplete="off" value="${Q.q}"><button class="ib" data-a="modal-x" aria-label="Закрыть">${raw(I.x)}</button></div>
  <div class="slist">${!Q.q.trim() ? html`<p class="muted small pad">Начните вводить имя — найдём людей на VСмске</p>`
    : Q.res === null ? html`<p class="muted small pad">Ищем…</p>` : Q.res.length ? Q.res.map(u => html`<a class="urow" href="${profileHref(u)}" data-k="s-${u.id}">${avatar(u, 40, false)}<span class="grow"><b>${u.name}</b><small class="muted">@${u.nick}${u.city ? ' · ' + u.city : ''}</small></span></a>`) : html`<p class="muted small pad">Никого не нашли</p>`}</div></div>`);
onInput('q', v => {
  Q.q = v; clearTimeout(Q.t); Q.res = null; render();
  const words = norm(v).trim().replace(/^@/, '').split(/\s+/).filter(Boolean); if (!words.length) return;
  Q.t = setTimeout(async () => {
    try {
      const s = await getDocs(query(collection(db, 'users'), where('search', 'array-contains', words[0].slice(0, 15)), limit(30)));
      if (Q.q !== v) return;
      Q.res = s.docs.map(data).filter(u => words.slice(1).every(w => (u.search || []).includes(w.slice(0, 15))));
      Q.res.forEach(u => cache.users.set(u.id, u)); render();
    } catch (e) { Q.res = []; render(); }
  }, 250);
});
document.addEventListener('click', e => { if (S.modal?.type === 'search' && e.target.closest('.slist a')) setTimeout(() => { if (S.modal?.type === 'search') { S.modal = null; render(); } }, 0); });
