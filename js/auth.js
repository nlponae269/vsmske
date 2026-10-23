// Вход, регистрация, первый вход через Google и «живые» данные, которые нужны везде (профиль, чаты, сигналы, заявки).
import {
  auth, db, uid, data, errText, GOOGLE_CLIENT, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  doc, collection, query, where, orderBy, limit, getDoc, onSnapshot, writeBatch, serverTimestamp,
} from './fb.js';
import { S, cache, view, act, form, render, route, go, ensureUsers, touchSeen, BASE } from './core.js';
import { html, raw, I, toast, buildSearch, safePhoto, lsGet, lsSet } from './lib.js';

export const NICK_RE = /^[a-z0-9._]{4,30}$/;
const listeners = {};
export const onData = (name, fn) => (listeners[name] ||= []).push(fn);
const emit = name => (listeners[name] || []).forEach(f => { try { f(); } catch (e) { console.error(e); } });
let unsubs = [], routed = false;

onAuthStateChanged(auth, user => {
  unsubs.forEach(u => u()); unsubs = []; routed = false;
  cache.chats = []; cache.notifs = []; cache.incoming = []; cache.outgoing = [];
  if (!user) { S.me = null; S.phase = 'auth'; render(); return; }
  S.phase = 'boot'; render();
  unsubs.push(onSnapshot(doc(db, 'users', user.uid), s => {
    if (!s.exists()) { S.me = null; S.phase = 'onboarding'; render(); return; }
    S.me = data(s); cache.users.set(user.uid, S.me);
    if (!routed) { routed = true; S.phase = 'app'; startLive(user.uid); route(); touchSeen(); emit('me'); return; }
    emit('me'); render();
  }, e => { console.error(e); toast(errText(e)); }));
});

function startLive(id) {
  unsubs.push(onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', id), orderBy('lastAt', 'desc'), limit(100)), s => {
    cache.chats = s.docs.map(data);
    ensureUsers(cache.chats.flatMap(c => c.group ? [c.lastFrom] : c.members));
    emit('chats'); render();
  }, console.error));
  unsubs.push(onSnapshot(query(collection(db, 'notifs'), where('to', '==', id), limit(150)), s => {
    cache.notifs = s.docs.map(data).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    ensureUsers(cache.notifs.map(n => n.from)); emit('notifs'); render();
  }, console.error));
  unsubs.push(onSnapshot(query(collection(db, 'friendRequests'), where('to', '==', id)), s => { cache.incoming = s.docs.map(data); ensureUsers(cache.incoming.map(r => r.from)); render(); }, console.error));
  unsubs.push(onSnapshot(query(collection(db, 'friendRequests'), where('from', '==', id)), s => { cache.outgoing = s.docs.map(data); render(); }, console.error));
}

/* ---------- Экран входа ---------- */
const A = { tab: lsGet('vs_auth_tab') || 'login', err: '', busy: false };
view('@auth', {
  render: () => html`<div class="auth">
    <section class="auth-hero">
      <span class="logo-mark big">вс</span>
      <h1>Все свои —<br>в одном месте</h1>
      <p>Лента друзей, переписка и звонки, музыка, видео и клипы. Бесплатно и без рекламы.</p>
      <ul class="auth-feat"><li>${raw(I.chat)} Чаты и звонки</li><li>${raw(I.music)} Музыка с плеером</li><li>${raw(I.clips)} Видео и клипы</li></ul>
    </section>
    <section class="card auth-card">
      <div class="seg wide" role="tablist">
        <button class="${A.tab === 'login' ? 'on' : ''}" data-a="auth-tab" data-v="login" role="tab">Вход</button>
        <button class="${A.tab === 'reg' ? 'on' : ''}" data-a="auth-tab" data-v="reg" role="tab">Регистрация</button>
      </div>
      <button class="btn ghost full" data-a="google" ${A.busy ? 'disabled' : ''}>${raw(I.google)} Войти через Google</button>
      <div class="or"><span>или по почте</span></div>
      <form class="stack" data-f="${A.tab}" data-k="auth-${A.tab}">
        ${A.tab === 'reg' ? html`<label class="fld"><span>Имя и фамилия</span><input name="name" required maxlength="60" autocomplete="name"></label>
          <label class="fld"><span>Короткое имя (ник)</span><input name="nick" required minlength="4" maxlength="30" pattern="[a-zA-Z0-9._]{4,30}" autocapitalize="off" placeholder="например, ivan.petrov"></label>` : ''}
        <label class="fld"><span>Почта</span><input name="email" type="email" required autocomplete="email"></label>
        <label class="fld"><span>Пароль</span><input name="pass" type="password" required minlength="6" autocomplete="${A.tab === 'reg' ? 'new-password' : 'current-password'}"></label>
        ${A.err ? html`<p class="err">${A.err}</p>` : ''}
        <button class="btn full" ${A.busy ? 'disabled' : ''}>${A.busy ? 'Подождите…' : A.tab === 'reg' ? 'Создать страницу' : 'Войти'}</button>
        ${A.tab === 'login' ? html`<button type="button" class="link" data-a="reset">Забыли пароль?</button>` : ''}
      </form>
    </section></div>`,
});
act('auth-tab', d => { A.tab = d.v; A.err = ''; lsSet('vs_auth_tab', d.v); render(); });
const busy = (on, err = '') => { A.busy = on; A.err = err; render(); };
form('login', async v => {
  busy(true);
  try { await signInWithEmailAndPassword(auth, v.email.trim(), v.pass); busy(false); } catch (e) { busy(false, errText(e)); }
});
form('reg', async v => {
  const nick = v.nick.trim().toLowerCase(), name = v.name.trim().slice(0, 60);
  if (!NICK_RE.test(nick)) return busy(false, 'Ник: от 4 до 30 латинских букв, цифр, точек или «_»');
  busy(true);
  try {
    if ((await getDoc(doc(db, 'usernames', nick))).exists()) return busy(false, 'Этот ник уже занят');
    const cred = await createUserWithEmailAndPassword(auth, v.email.trim(), v.pass);
    await createProfile(cred.user.uid, name, nick, '');
    busy(false);
  } catch (e) { busy(false, errText(e)); }
});
act('reset', async () => {
  const email = document.querySelector('form[data-f="login"] input[name="email"]')?.value.trim();
  if (!email) { A.err = 'Впишите почту — пришлём ссылку для нового пароля'; render(); return; }
  try { await sendPasswordResetEmail(auth, email); toast('Письмо отправлено — проверьте почту'); } catch (e) { A.err = errText(e); render(); }
});
async function createProfile(id, name, nick, photo) {
  const b = writeBatch(db);
  b.set(doc(db, 'usernames', nick), { uid: id });
  b.set(doc(db, 'users', id), { name, nick, city: '', status: '', about: '', photo: safePhoto(photo), color: '', friends: [], search: buildSearch(name, nick, ''), createdAt: serverTimestamp() });
  await b.commit();
}

/* ---------- Google: окно входа; если окно нельзя (иконка на экране, блокировщик) — переход на Google и обратно ---------- */
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function googleGo() {
  const nonce = Math.random().toString(36).slice(2); lsSet('vs_gnonce', nonce);
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT, redirect_uri: location.origin + BASE, response_type: 'id_token', scope: 'openid email profile', nonce, prompt: 'select_account' });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}
act('google', async () => {
  if (standalone()) return googleGo();
  busy(true);
  try { await signInWithPopup(auth, new GoogleAuthProvider()); busy(false); }
  catch (e) { if (/popup-blocked|operation-not-supported/.test(e?.code || '')) return googleGo(); busy(false, errText(e)); }
});
// возврат с Google: #id_token=…
(async () => {
  const h = new URLSearchParams(location.hash.slice(1)), tok = h.get('id_token');
  if (!tok) return;
  history.replaceState(null, '', location.pathname);
  try { await signInWithCredential(auth, GoogleAuthProvider.credential(tok)); } catch (e) { A.err = errText(e); render(); }
})();

/* ---------- Первый вход через Google: выбрать ник ---------- */
const O = { err: '', busy: false };
view('@onboarding', {
  render: () => { const u = auth.currentUser; return html`<div class="auth one"><section class="card auth-card">
    <h2>Почти готово</h2><p class="muted">Как вас подписать и какой будет адрес страницы?</p>
    <form class="stack" data-f="onboard">
      <label class="fld"><span>Имя и фамилия</span><input name="name" required maxlength="60" value="${u?.displayName || ''}"></label>
      <label class="fld"><span>Короткое имя (ник)</span><input name="nick" required minlength="4" maxlength="30" pattern="[a-zA-Z0-9._]{4,30}" autocapitalize="off"></label>
      ${O.err ? html`<p class="err">${O.err}</p>` : ''}
      <button class="btn full" ${O.busy ? 'disabled' : ''}>Создать страницу</button>
      <button type="button" class="link" data-a="logout">Выйти</button>
    </form></section></div>`; },
});
form('onboard', async v => {
  const nick = v.nick.trim().toLowerCase(), name = v.name.trim().slice(0, 60);
  if (!NICK_RE.test(nick)) { O.err = 'Ник: от 4 до 30 латинских букв, цифр, точек или «_»'; render(); return; }
  O.busy = true; O.err = ''; render();
  try {
    if ((await getDoc(doc(db, 'usernames', nick))).exists()) { O.err = 'Этот ник уже занят'; return; }
    await createProfile(uid(), name, nick, auth.currentUser?.photoURL || '');
  } catch (e) { O.err = errText(e); } finally { O.busy = false; render(); }
});
act('logout', async () => { await signOut(auth); history.replaceState(null, '', BASE); });
