// Проверка firestore.rules в эмуляторе. Сайту не нужна — это для разработчика.
// Запуск (нужны Node.js и Java):
//   cd tests && npm i && npx firebase emulators:exec --only firestore --project demo-vsmske "node --test"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, Timestamp, deleteField
} from 'firebase/firestore';

let env;
const A = 'aaaa', B = 'bbbb', C = 'cccc';
const db = id => env.authenticatedContext(id).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const profile = (nick, extra = {}) => ({
  name: 'Имя ' + nick, nick, city: '', status: '', about: '', photo: '', color: '#2F44D0',
  friends: [], search: [nick], createdAt: Timestamp.now(), ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vsmske', firestore: { rules: readFileSync(new URL('../' + (process.env.RULES_FILE || 'firestore.rules'), import.meta.url), 'utf8') } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    for (const [id, nick, extra] of [[A, 'alice', { friends: [C] }], [B, 'bob', {}], [C, 'carol', { friends: [A] }]]) {
      await setDoc(doc(f, 'users', id), profile(nick, extra));
      await setDoc(doc(f, 'usernames', nick), { uid: id });
    }
    await setDoc(doc(f, 'posts', 'p1'), { authorId: A, wallId: A, text: 'привет', image: '', likes: [B], commentCount: 1, createdAt: Timestamp.now() });
    await setDoc(doc(f, 'posts', 'p1', 'comments', 'c1'), { authorId: B, text: 'ок', createdAt: Timestamp.now() });
    await setDoc(doc(f, 'videos', 'v1'), { ownerId: A, title: 'v', description: '', source: 'link', provider: 'youtube', vid: 'xxxxxxxxxxx', likes: [], createdAt: Timestamp.now() });
    await setDoc(doc(f, 'albums', 'al1'), { ownerId: A, title: 'Лето', count: 0, cover: '', coverId: '', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
});

/* ---------- Регистрация и короткие имена ---------- */
test('регистрация: профиль и ник в одной пачке', async () => {
  const f = db('dddd'), b = writeBatch(f);
  b.set(doc(f, 'usernames', 'dima'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('dima'), createdAt: serverTimestamp() });
  await assertSucceeds(b.commit());
});
test('нельзя занять чужой ник или ник без профиля', async () => {
  const f = db('dddd');
  await assertFails(setDoc(doc(f, 'usernames', 'free.nick'), { uid: 'dddd' }));
  const b = writeBatch(f);
  b.set(doc(f, 'usernames', 'alice'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('alice'), createdAt: serverTimestamp() });
  await assertFails(b.commit());
});
test('нельзя создать профиль сразу с друзьями', async () => {
  const f = db('dddd'), b = writeBatch(f);
  b.set(doc(f, 'usernames', 'dima'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('dima'), friends: [A], createdAt: serverTimestamp() });
  await assertFails(b.commit());
});
test('смена ника: новый занять, старый освободить', async () => {
  const f = db(B), b = writeBatch(f);
  b.set(doc(f, 'usernames', 'bobby'), { uid: B });
  b.delete(doc(f, 'usernames', 'bob'));
  b.update(doc(f, 'users', B), { nick: 'bobby', name: 'Боб' });
  await assertSucceeds(b.commit());
});
test('нельзя удалить свой текущий ник', async () => {
  await assertFails(deleteDoc(doc(db(B), 'usernames', 'bob')));
});

/* ---------- Профиль ---------- */
test('свой профиль: статус, приватность, «в сети»', async () => {
  const f = db(B);
  await assertSucceeds(updateDoc(doc(f, 'users', B), { status: 'тут', 'privacy.messages': 'friends', 'privacy.wall': 'me', lastSeen: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'users', B), { 'privacy.wall': 'all' }));
  await assertFails(updateDoc(doc(f, 'users', B), { name: '' }));
});
test('чужой профиль менять нельзя', async () => {
  await assertFails(updateDoc(doc(db(B), 'users', A), { status: 'взлом' }));
  await assertFails(getDoc(doc(anon(), 'users', A)));
});
test('нельзя добавить себя в чужие друзья без заявки', async () => {
  await assertFails(updateDoc(doc(db(B), 'users', A), { friends: arrayUnion(B) }));
  await assertFails(updateDoc(doc(db(B), 'users', B), { friends: arrayUnion(A) }));
});
test('нельзя вычеркнуть из чужих друзей другого человека', async () => {
  await assertFails(updateDoc(doc(db(B), 'users', A), { friends: arrayRemove(C) }));
});

/* ---------- Дружба ---------- */
test('заявка → принять → удалить из друзей', async () => {
  const fb = db(B);
  await assertSucceeds(setDoc(doc(fb, 'friendRequests', B + '_' + A), { from: B, to: A, createdAt: serverTimestamp() }));
  const fa = db(A), b = writeBatch(fa);
  b.update(doc(fa, 'users', A), { friends: arrayUnion(B) });
  b.update(doc(fa, 'users', B), { friends: arrayUnion(A) });
  b.delete(doc(fa, 'friendRequests', B + '_' + A));
  await assertSucceeds(b.commit());
  const r = writeBatch(fb);
  r.update(doc(fb, 'users', B), { friends: arrayRemove(A) });
  r.update(doc(fb, 'users', A), { friends: arrayRemove(B) });
  await assertSucceeds(r.commit());
});
test('заявка: только от себя и с правильным id', async () => {
  const f = db(B);
  await assertFails(setDoc(doc(f, 'friendRequests', A + '_' + C), { from: A, to: C, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(f, 'friendRequests', 'xxx'), { from: B, to: A, createdAt: serverTimestamp() }));
});

/* ---------- Записи ---------- */
const post = (author, wall, extra = {}) => ({ authorId: author, wallId: wall, text: 'текст', image: '', likes: [], commentCount: 0, createdAt: serverTimestamp(), ...extra });
test('запись на своей стене и у друга', async () => {
  await assertSucceeds(setDoc(doc(collection(db(A), 'posts')), post(A, A)));
  await assertSucceeds(setDoc(doc(collection(db(C), 'posts')), post(C, A)));
});
test('не друг не может писать на стене; друг — если «Только я»', async () => {
  await assertFails(setDoc(doc(collection(db(B), 'posts')), post(B, A)));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { 'privacy.wall': 'me' }));
  await assertFails(setDoc(doc(collection(db(C), 'posts')), post(C, A)));
});
test('запись от чужого имени и с накрученными лайками нельзя', async () => {
  await assertFails(setDoc(doc(collection(db(B), 'posts')), post(A, A)));
  await assertFails(setDoc(doc(collection(db(B), 'posts')), post(B, B, { likes: [A, C] })));
});
test('лайк: только свой', async () => {
  await assertSucceeds(updateDoc(doc(db(C), 'posts', 'p1'), { likes: arrayUnion(C) }));
  await assertSucceeds(updateDoc(doc(db(B), 'posts', 'p1'), { likes: arrayRemove(B) }));
  await assertFails(updateDoc(doc(db(C), 'posts', 'p1'), { likes: [A, C] }));
});
test('комментарий + счётчик, удаление автором записи', async () => {
  const f = db(C), b = writeBatch(f);
  b.set(doc(collection(f, 'posts', 'p1', 'comments')), { authorId: C, text: 'класс', createdAt: serverTimestamp() });
  b.update(doc(f, 'posts', 'p1'), { commentCount: increment(1) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(f, 'posts', 'p1'), { commentCount: 100 }));
  const fa = db(A), d = writeBatch(fa);
  d.delete(doc(fa, 'posts', 'p1', 'comments', 'c1'));
  d.update(doc(fa, 'posts', 'p1'), { commentCount: increment(-1) });
  await assertSucceeds(d.commit());
});
test('редактирование: только автор и только текст', async () => {
  await assertSucceeds(updateDoc(doc(db(A), 'posts', 'p1'), { text: 'новый', editedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(B), 'posts', 'p1'), { text: 'взлом', editedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(A), 'posts', 'p1'), { text: 'x', likes: [], editedAt: serverTimestamp() }));
});

/* ---------- Сообщения ---------- */
async function send(from, to, text, image) {
  const f = db(from), cid = [from, to].sort().join('_'), b = writeBatch(f);
  const m = { from, text, createdAt: serverTimestamp() }; if (image) m.image = image;
  const ref = doc(collection(f, 'chats', cid, 'messages'));
  b.set(ref, m);
  b.set(doc(f, 'chats', cid), { members: [from, to].sort(), lastText: text || '📷 Фото', lastFrom: from, lastAt: serverTimestamp(), read: { [from]: serverTimestamp() } }, { merge: true });
  await b.commit();
  return ref;
}
test('переписка, фото, прочтение, удаление своего', async () => {
  const ref = await assertSucceeds(send(B, A, 'привет'));
  await assertSucceeds(send(A, B, 'и тебе'));
  await assertSucceeds(send(A, B, '', 'data:image/jpeg;base64,AAAA'));
  const cid = [A, B].sort().join('_');
  await assertSucceeds(updateDoc(doc(db(B), 'chats', cid), { [`read.${B}`]: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid), { [`read.${A}`]: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db(A), 'chats', cid, 'messages', ref.id)));
  await assertSucceeds(deleteDoc(doc(db(B), 'chats', cid, 'messages', ref.id)));
});
test('чужую переписку не прочитать и не подделать', async () => {
  await send(B, A, 'привет');
  const cid = [A, B].sort().join('_');
  await assertFails(getDoc(doc(db(C), 'chats', cid)));
  await assertFails(setDoc(doc(collection(db(C), 'chats', cid, 'messages')), { from: C, text: 'x', createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid), { lastFrom: A, lastText: 'подделка' }));
});
test('«только друзья»: чужой не может начать диалог, друг может', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { 'privacy.messages': 'friends' }));
  await assertFails(send(B, A, 'привет'));
  await assertSucceeds(send(C, A, 'привет'));
});

/* ---------- Видео, файлы, альбомы ---------- */
test('видео: лайк только свой, править — только хозяин', async () => {
  await assertSucceeds(updateDoc(doc(db(B), 'videos', 'v1'), { likes: arrayUnion(B) }));
  await assertFails(updateDoc(doc(db(B), 'videos', 'v1'), { title: 'взлом' }));
  await assertFails(updateDoc(doc(db(A), 'videos', 'v1'), { ownerId: B }));
});
test('файл: загрузка кусками и видео-публикация', async () => {
  const f = db(A), ref = doc(collection(f, 'files'));
  await assertSucceeds(setDoc(ref, { ownerId: A, kind: 'video', name: 'a.mp4', size: 1000, type: 'video/mp4', chunks: 2, status: 'uploading', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(f, 'files', ref.id, 'chunks', '0000'), { i: 0, data: 'AAAA' }));
  await assertFails(setDoc(doc(f, 'files', ref.id, 'chunks', '0005'), { i: 5, data: 'AAAA' }));
  await assertFails(setDoc(doc(db(B), 'files', ref.id, 'chunks', '0001'), { i: 1, data: 'AAAA' }));
  await assertSucceeds(updateDoc(ref, { status: 'ready' }));
  await assertSucceeds(setDoc(doc(collection(f, 'videos')), { ownerId: A, title: 'Ролик', description: '', source: 'file', fileId: ref.id, type: 'video/mp4', thumb: '', duration: 3, size: 1000, likes: [], createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'videos')), { ownerId: B, title: 'Чужой', description: '', source: 'file', fileId: ref.id, type: 'video/mp4', thumb: '', duration: 3, size: 1000, likes: [], createdAt: serverTimestamp() }));
});
test('файл Диска видит только хозяин', async () => {
  const ref = doc(collection(db(A), 'files'));
  await setDoc(ref, { ownerId: A, kind: 'disk', name: 'a.pdf', size: 10, type: 'application/pdf', chunks: 1, status: 'uploading', createdAt: serverTimestamp() });
  await assertFails(getDoc(doc(db(B), 'files', ref.id)));
});
test('фото в альбом: только в свой', async () => {
  const f = db(A), ref = doc(collection(f, 'photos')), b = writeBatch(f);
  b.set(ref, { ownerId: A, albumId: 'al1', thumb: 'data:image/jpeg;base64,AA', createdAt: serverTimestamp() });
  b.set(doc(f, 'photoFull', ref.id), { ownerId: A, image: 'data:image/jpeg;base64,AA' });
  b.update(doc(f, 'albums', 'al1'), { count: increment(1), updatedAt: serverTimestamp(), cover: 'data:image/jpeg;base64,AA', coverId: ref.id });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(collection(db(B), 'photos')), { ownerId: B, albumId: 'al1', thumb: 'x', createdAt: serverTimestamp() }));
});

/* ---------- Удаление (как делает сайт) ---------- */
test('удаление последнего своего сообщения правит подпись диалога', async () => {
  const ref = await send(B, A, 'опечатка');
  const f = db(B), cid = [A, B].sort().join('_'), b = writeBatch(f);
  b.delete(doc(f, 'chats', cid, 'messages', ref.id));
  b.update(doc(f, 'chats', cid), { lastText: 'Сообщение удалено' });
  await assertSucceeds(b.commit());
});
test('начатый диалог можно продолжать после «только друзья»', async () => {
  await send(B, A, 'привет');
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { 'privacy.messages': 'friends' }));
  await assertSucceeds(send(B, A, 'ещё'));
});
test('хозяин стены удаляет запись вместе с чужими комментариями', async () => {
  const f = db(A), b = writeBatch(f);
  b.delete(doc(f, 'posts', 'p1', 'comments', 'c1')); b.delete(doc(f, 'posts', 'p1'));
  await assertSucceeds(b.commit());
});
test('удаление файла с кусками и фото из альбома', async () => {
  const f = db(A), ref = doc(collection(f, 'files'));
  await setDoc(ref, { ownerId: A, kind: 'disk', name: 'a', size: 4, type: '', chunks: 1, status: 'uploading', createdAt: serverTimestamp() });
  await setDoc(doc(f, 'files', ref.id, 'chunks', '0000'), { i: 0, data: 'AAAA' });
  const b = writeBatch(f);
  b.delete(doc(f, 'files', ref.id, 'chunks', '0000')); b.delete(ref);
  await assertSucceeds(b.commit());

  const ph = doc(collection(f, 'photos')), up = writeBatch(f);
  up.set(ph, { ownerId: A, albumId: 'al1', thumb: 'data:image/jpeg;base64,AA', createdAt: serverTimestamp() });
  up.set(doc(f, 'photoFull', ph.id), { ownerId: A, image: 'data:image/jpeg;base64,AA' });
  up.update(doc(f, 'albums', 'al1'), { count: increment(1), updatedAt: serverTimestamp(), cover: 'data:image/jpeg;base64,AA', coverId: ph.id });
  await up.commit();
  const del = writeBatch(f);
  del.delete(ph); del.delete(doc(f, 'photoFull', ph.id));
  del.update(doc(f, 'albums', 'al1'), { count: increment(-1), updatedAt: serverTimestamp(), cover: '', coverId: '' });
  await assertSucceeds(del.commit());
  await assertSucceeds(deleteDoc(doc(f, 'albums', 'al1')));
});

/* ---------- 1.4: опросы, ответы, уведомления, закрепление, обложка, Избранное ---------- */
test('опрос: создать, проголосовать за себя, нельзя за другого и вне списка', async () => {
  const f = db(A), ref = doc(collection(f, 'posts'));
  await assertSucceeds(setDoc(ref, post(A, A, { text: '', poll: { q: 'Куда?', options: ['кино', 'парк'], votes: {} } })));
  await assertFails(setDoc(doc(collection(f, 'posts')), post(A, A, { poll: { q: 'Куда?', options: ['кино', 'парк'], votes: { [B]: 0 } } })));
  await assertSucceeds(updateDoc(doc(db(B), 'posts', ref.id), { [`poll.votes.${B}`]: 1 }));
  await assertSucceeds(updateDoc(doc(db(B), 'posts', ref.id), { [`poll.votes.${B}`]: 0 }));
  await assertFails(updateDoc(doc(db(B), 'posts', ref.id), { [`poll.votes.${C}`]: 0 }));
  await assertFails(updateDoc(doc(db(B), 'posts', ref.id), { [`poll.votes.${B}`]: 5 }));
  await assertFails(updateDoc(doc(db(B), 'posts', ref.id), { 'poll.options': ['взлом', 'x'] }));
});
test('ответ на сообщение и чат с самим собой', async () => {
  await assertSucceeds(send(B, A, 'привет'));
  const f = db(A), cid = [A, B].sort().join('_'), b = writeBatch(f);
  b.set(doc(collection(f, 'chats', cid, 'messages')), { from: A, text: 'да', replyTo: { id: 'm1', from: B, text: 'привет' }, createdAt: serverTimestamp() });
  b.set(doc(f, 'chats', cid), { members: [A, B].sort(), lastText: 'да', lastFrom: A, lastAt: serverTimestamp(), read: { [A]: serverTimestamp() } }, { merge: true });
  await assertSucceeds(b.commit());
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { 'privacy.messages': 'friends' }));
  await assertSucceeds(send(A, A, 'заметка себе'));
});
test('уведомления: читает только получатель, от чужого имени нельзя', async () => {
  const ref = doc(collection(db(B), 'notifs'));
  await assertSucceeds(setDoc(ref, { to: A, from: B, type: 'like', postId: 'p1', text: 'привет', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db(B), 'notifs', 'like_p1_' + B), { to: A, from: B, type: 'like', postId: 'p1', text: '', createdAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(db(B), 'notifs', 'like_p1_' + B)));
  await assertFails(setDoc(doc(collection(db(B), 'notifs')), { to: A, from: C, type: 'like', postId: '', text: '', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'notifs')), { to: A, from: B, type: 'spam', postId: '', text: '', createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(A), 'notifs', ref.id)));
  await assertFails(getDoc(doc(db(C), 'notifs', ref.id)));
  await assertSucceeds(deleteDoc(doc(db(A), 'notifs', ref.id)));
});
test('закреплённая запись, обложка, отметка просмотра уведомлений', async () => {
  const f = db(A);
  await assertSucceeds(updateDoc(doc(f, 'users', A), { pinned: 'p1', cover: 'sunset', notifSeenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'users', A), { cover: 'url(evil)' }));
});

/* ---------- 1.5: админ, сообщества, голосовые ---------- */
test('админом себя не сделать; админ удаляет чужое', async () => {
  await assertFails(updateDoc(doc(db(B), 'users', B), { admin: true }));
  await assertFails(deleteDoc(doc(db(B), 'posts', 'p1')));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', B), { admin: 'true' }));
  await assertSucceeds(updateDoc(doc(db(B), 'users', B), { status: 'я админ' }));
  await assertFails(updateDoc(doc(db(B), 'users', B), { admin: false }));
  await assertSucceeds(deleteDoc(doc(db(B), 'posts', 'p1', 'comments', 'c1')));
  await assertSucceeds(deleteDoc(doc(db(B), 'posts', 'p1')));
  await assertSucceeds(deleteDoc(doc(db(B), 'videos', 'v1')));
});
test('регистрация с admin: true запрещена', async () => {
  const f = db('dddd'), b = writeBatch(f);
  b.set(doc(f, 'usernames', 'dima'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('dima'), admin: true, createdAt: serverTimestamp() });
  await assertFails(b.commit());
});
async function makeGroup(owner) {
  const f = db(owner), ref = doc(collection(f, 'groups')), b = writeBatch(f);
  b.set(ref, { name: 'Клуб', about: '', photo: '', cover: 'blue', ownerId: owner, admins: [owner], membersCount: 1, createdAt: serverTimestamp() });
  b.update(doc(f, 'users', owner), { groups: arrayUnion(ref.id) });
  await b.commit();
  return ref.id;
}
test('сообщество: создать, подписаться, отписаться, писать может только админ', async () => {
  const gid = await assertSucceeds(makeGroup(A));
  const fb = db(B), sub = writeBatch(fb);
  sub.update(doc(fb, 'users', B), { groups: arrayUnion(gid) });
  sub.update(doc(fb, 'groups', gid), { membersCount: increment(1) });
  await assertSucceeds(sub.commit());
  await assertFails(updateDoc(doc(fb, 'groups', gid), { membersCount: increment(1) }));
  await assertFails(updateDoc(doc(fb, 'groups', gid), { name: 'Взлом' }));
  await assertSucceeds(updateDoc(doc(db(A), 'groups', gid), { name: 'Клуб 2', about: 'о нас' }));
  await assertSucceeds(setDoc(doc(collection(db(A), 'posts')), post(A, gid, { groupId: gid })));
  await assertFails(setDoc(doc(collection(fb, 'posts')), post(B, gid, { groupId: gid })));
  await assertFails(setDoc(doc(collection(fb, 'posts')), post(B, gid)));
  const un = writeBatch(fb);
  un.update(doc(fb, 'users', B), { groups: arrayRemove(gid) });
  un.update(doc(fb, 'groups', gid), { membersCount: increment(-1) });
  await assertSucceeds(un.commit());
  await assertFails(deleteDoc(doc(fb, 'groups', gid)));
  await assertSucceeds(updateDoc(doc(db(A), 'groups', gid), { admins: [A, B] }));
  await assertSucceeds(setDoc(doc(collection(fb, 'posts')), post(B, gid, { groupId: gid })));
  await assertSucceeds(deleteDoc(doc(db(A), 'groups', gid)));
});
test('нельзя создать сообщество от чужого имени или с накруткой', async () => {
  const f = db(B), ref = doc(collection(f, 'groups')), b = writeBatch(f);
  b.set(ref, { name: 'Клуб', about: '', photo: '', cover: 'blue', ownerId: B, admins: [B], membersCount: 999, createdAt: serverTimestamp() });
  b.update(doc(f, 'users', B), { groups: arrayUnion(ref.id) });
  await assertFails(b.commit());
});
test('голосовое сообщение', async () => {
  const f = db(B), cid = [A, B].sort().join('_'), b = writeBatch(f);
  b.set(doc(collection(f, 'chats', cid, 'messages')), { from: B, text: '', audio: 'data:audio/webm;base64,AAAA', dur: 3.5, createdAt: serverTimestamp() });
  b.set(doc(f, 'chats', cid), { members: [A, B].sort(), lastText: '🎤 Голосовое', lastFrom: B, lastAt: serverTimestamp(), read: { [B]: serverTimestamp() } }, { merge: true });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(collection(f, 'chats', cid, 'messages')), { from: B, text: '', audio: 'javascript:alert(1)', dur: 3, createdAt: serverTimestamp() }));
});

/* ---------- 1.7: чёрный список, бан, жалобы, реакции, репосты ---------- */
const banFor = (by, ms) => ({ until: ms === null ? null : Timestamp.fromMillis(Date.now() + ms), reason: 'спам', by, at: serverTimestamp() });
test('бан: ставит только админ, забаненный не пишет; истёкший бан не мешает', async () => {
  await assertFails(updateDoc(doc(db(B), 'users', C), { ban: banFor(B, null) }));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { admin: true }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', B), { ban: banFor(A, null) }));
  await assertFails(updateDoc(doc(db(B), 'users', B), { ban: null }));
  await assertFails(setDoc(doc(collection(db(B), 'posts')), post(B, B)));
  await assertFails(send(B, A, 'привет'));
  await assertFails(updateDoc(doc(db(B), 'posts', 'p1'), { likes: arrayUnion(B) }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', B), { ban: banFor(A, -1000) }));
  await assertSucceeds(setDoc(doc(collection(db(B), 'posts')), post(B, B)));
  await assertSucceeds(updateDoc(doc(db(A), 'users', B), { ban: deleteField() }));
  await assertFails(updateDoc(doc(db(C), 'users', A), { ban: banFor(C, null) }));
});
test('нельзя забанить админа', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'users', A), { admin: true });
    await updateDoc(doc(ctx.firestore(), 'users', C), { admin: 'true' });
  });
  await assertFails(updateDoc(doc(db(A), 'users', C), { ban: banFor(A, null) }));
});
test('чёрный список: не пишет, не комментирует, не шлёт заявку', async () => {
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { blocked: arrayUnion(B) }));
  await assertFails(send(B, A, 'привет'));
  await assertFails(setDoc(doc(collection(db(B), 'posts', 'p1', 'comments')), { authorId: B, text: 'x', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db(B), 'friendRequests', B + '_' + A), { from: B, to: A, createdAt: serverTimestamp() }));
  await assertSucceeds(send(C, A, 'привет'));
  await assertSucceeds(send(A, B, 'я могу писать'));
});
test('жалобы: создать одну, читает только админ', async () => {
  const rid = 'post_p1_' + B;
  const rep = { from: B, type: 'post', targetId: 'p1', targetUser: A, postId: 'p1', reason: 'spam', text: 'привет', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db(B), 'reports', rid), rep));
  await assertFails(setDoc(doc(db(B), 'reports', rid), rep));
  await assertFails(setDoc(doc(db(B), 'reports', 'post_p1_' + C), rep));
  await assertFails(getDoc(doc(db(B), 'reports', rid)));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', C), { admin: true }));
  await assertSucceeds(getDoc(doc(db(C), 'reports', rid)));
  await assertSucceeds(deleteDoc(doc(db(C), 'reports', rid)));
});
test('реакции: только своя и из списка', async () => {
  const ref = await send(B, A, 'привет');
  const cid = [A, B].sort().join('_');
  await assertSucceeds(updateDoc(doc(db(A), 'chats', cid, 'messages', ref.id), { 'reacts.aaaa': '❤️' }));
  await assertSucceeds(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { [`reacts.${B}`]: '😂' }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { [`reacts.${A}`]: '👍' }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { [`reacts.${B}`]: '💩' }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { text: 'подмена' }));
  await assertSucceeds(updateDoc(doc(db(A), 'chats', cid, 'messages', ref.id), { [`reacts.${A}`]: deleteField() }));
  await assertFails(updateDoc(doc(db(C), 'chats', cid, 'messages', ref.id), { [`reacts.${C}`]: '❤️' }));
});
test('репост: запись со ссылкой + счётчик +1', async () => {
  const f = db(C), b = writeBatch(f);
  b.set(doc(collection(f, 'posts')), post(C, C, { text: '', repostOf: 'p1' }));
  b.update(doc(f, 'posts', 'p1'), { reposts: increment(1) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(f, 'posts', 'p1'), { reposts: 50 }));
  await assertFails(setDoc(doc(collection(f, 'posts')), post(C, C, { text: '', repostOf: 'nope' })));
});

/* ---------- 1.8: беседы, пересылка, лайки комментариев, фото, теги, ДР, гости, истории ---------- */
async function makeRoom(owner, members) {
  const f = db(owner), ref = doc(f, 'chats', 'g_room1');
  await setDoc(ref, { members, group: true, name: 'Друзья', ownerId: owner, lastText: 'Беседа создана', lastFrom: owner, lastAt: serverTimestamp(), read: { [owner]: serverTimestamp() } });
  return ref;
}
async function sendRoom(from, text, extra = {}) {
  const f = db(from), b = writeBatch(f);
  b.set(doc(collection(f, 'chats', 'g_room1', 'messages')), { from, text, createdAt: serverTimestamp(), ...extra });
  b.set(doc(f, 'chats', 'g_room1'), { lastText: text, lastFrom: from, lastAt: serverTimestamp(), read: { [from]: serverTimestamp() } }, { merge: true });
  await b.commit();
}
test('беседа: создать, писать, читать; чужой не может', async () => {
  await assertSucceeds(makeRoom(A, [A, B]));
  await assertSucceeds(sendRoom(B, 'привет всем'));
  await assertSucceeds(getDoc(doc(db(B), 'chats', 'g_room1')));
  await assertFails(getDoc(doc(db(C), 'chats', 'g_room1')));
  await assertFails(sendRoom(C, 'я тоже'));
  await assertFails(updateDoc(doc(db(B), 'chats', 'g_room1'), { members: [A, B, C] }));
  await assertSucceeds(updateDoc(doc(db(A), 'chats', 'g_room1'), { members: [A, B, C], name: 'Все' }));
  await assertSucceeds(sendRoom(C, 'я тоже'));
  await assertSucceeds(updateDoc(doc(db(C), 'chats', 'g_room1'), { members: arrayRemove(C) }));
  await assertFails(sendRoom(C, 'вернулся?'));
  await assertFails(updateDoc(doc(db(B), 'chats', 'g_room1'), { members: [B] }));
  await assertFails(deleteDoc(doc(db(B), 'chats', 'g_room1')));
  await assertSucceeds(deleteDoc(doc(db(A), 'chats', 'g_room1')));
});
test('беседу не создать без себя или больше 50', async () => {
  await assertFails(makeRoom(A, [B, C]));
  await assertFails(makeRoom(A, Array.from({ length: 51 }, (_, i) => i ? 'u' + i : A)));
});
test('пересылка сообщения', async () => {
  const f = db(B), cid = [A, B].sort().join('_'), b = writeBatch(f);
  b.set(doc(collection(f, 'chats', cid, 'messages')), { from: B, text: '', fwd: { from: C, name: 'Вера', text: 'смешная шутка' }, createdAt: serverTimestamp() });
  b.set(doc(f, 'chats', cid), { members: [A, B].sort(), lastText: '↪ Пересланное', lastFrom: B, lastAt: serverTimestamp(), read: { [B]: serverTimestamp() } }, { merge: true });
  await assertSucceeds(b.commit());
});
test('лайк комментария: только свой', async () => {
  await assertSucceeds(updateDoc(doc(db(C), 'posts', 'p1', 'comments', 'c1'), { likes: arrayUnion(C) }));
  await assertFails(updateDoc(doc(db(C), 'posts', 'p1', 'comments', 'c1'), { likes: [A, C] }));
  await assertFails(updateDoc(doc(db(C), 'posts', 'p1', 'comments', 'c1'), { text: 'подмена' }));
});
test('несколько фото и теги', async () => {
  await assertSucceeds(setDoc(doc(collection(db(A), 'posts')), post(A, A, { text: '', images: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'], tags: ['лето'] })));
  await assertFails(setDoc(doc(collection(db(A), 'posts')), post(A, A, { images: ['a', 'b', 'c', 'd', 'e'] })));
  await assertFails(setDoc(doc(collection(db(A), 'posts')), post(A, A, { tags: Array.from({ length: 11 }, (_, i) => 't' + i) })));
  await assertSucceeds(updateDoc(doc(db(A), 'posts', 'p1'), { text: 'новый #тег', tags: ['тег'], editedAt: serverTimestamp() }));
});
test('день рождения', async () => {
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { bday: '2001-03-05' }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { bday: '' }));
  await assertFails(updateDoc(doc(db(A), 'users', A), { bday: '<script>' }));
});
test('гости: отмечаюсь только собой, видит только хозяин', async () => {
  await assertSucceeds(setDoc(doc(db(B), 'users', A, 'guests', B), { at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db(B), 'users', A, 'guests', B), { at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(B), 'users', A, 'guests', C), { at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(A), 'users', A, 'guests', A), { at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(A), 'users', A, 'guests', B)));
  await assertFails(getDoc(doc(db(C), 'users', A, 'guests', B)));
});
test('истории: создать, отметить просмотр, удалить', async () => {
  const ref = doc(collection(db(A), 'stories'));
  await assertSucceeds(setDoc(ref, { ownerId: A, image: 'data:image/jpeg;base64,AAA', text: 'утро', views: {}, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(A), 'stories')), { ownerId: A, image: 'javascript:1', text: '', views: {}, createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db(B), 'stories', ref.id), { [`views.${B}`]: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(B), 'stories', ref.id), { [`views.${C}`]: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(A), 'stories', ref.id), { [`views.${A}`]: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db(B), 'stories', ref.id)));
  await assertSucceeds(deleteDoc(doc(db(A), 'stories', ref.id)));
});

/* ---------- 1.9: Ответы, Почта, Заметки ---------- */
test('ВС Ответы: вопрос, ответ, лучший ответ', async () => {
  const q = doc(collection(db(A), 'questions'));
  await assertSucceeds(setDoc(q, { authorId: A, title: 'Как сварить борщ?', text: '', category: 'food', answersCount: 0, bestId: '', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(A), 'questions')), { authorId: A, title: 'Как?', text: '', category: 'food', answersCount: 0, bestId: '', createdAt: serverTimestamp() }));
  const f = db(B), ans = doc(collection(f, 'questions', q.id, 'answers')), bt = writeBatch(f);
  bt.set(ans, { authorId: B, text: 'Свёкла, капуста, мясо', likes: [], createdAt: serverTimestamp() });
  bt.update(doc(f, 'questions', q.id), { answersCount: increment(1) });
  await assertSucceeds(bt.commit());
  await assertSucceeds(updateDoc(doc(db(C), 'questions', q.id, 'answers', ans.id), { likes: arrayUnion(C) }));
  await assertFails(updateDoc(doc(db(B), 'questions', q.id), { bestId: ans.id }));
  await assertSucceeds(updateDoc(doc(db(A), 'questions', q.id), { bestId: ans.id }));
  await assertFails(updateDoc(doc(db(B), 'questions', q.id), { answersCount: 10 }));
  await assertSucceeds(deleteDoc(doc(db(A), 'questions', q.id, 'answers', ans.id)));
});
test('ВС Почта: письмо, прочтение, удаление у обоих', async () => {
  const m = doc(collection(db(A), 'mail'));
  const letter = { from: A, to: B, subject: 'Привет', text: 'Как дела?', read: false, delFrom: false, delTo: false, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(m, letter));
  await assertFails(setDoc(doc(collection(db(A), 'mail')), { ...letter, from: C }));
  await assertFails(setDoc(doc(collection(db(A), 'mail')), { ...letter, to: 'nobody' }));
  await assertSucceeds(getDoc(doc(db(B), 'mail', m.id)));
  await assertFails(getDoc(doc(db(C), 'mail', m.id)));
  await assertSucceeds(updateDoc(doc(db(B), 'mail', m.id), { read: true }));
  await assertFails(updateDoc(doc(db(A), 'mail', m.id), { read: true }));
  await assertFails(updateDoc(doc(db(B), 'mail', m.id), { text: 'подмена' }));
  await assertFails(deleteDoc(doc(db(A), 'mail', m.id)));
  await assertSucceeds(updateDoc(doc(db(B), 'mail', m.id), { delTo: true }));
  await assertSucceeds(deleteDoc(doc(db(A), 'mail', m.id)));
});
test('ВС Почта: заблокированный не пишет', async () => {
  await updateDoc(doc(db(B), 'users', B), { blocked: arrayUnion(A) });
  await assertFails(setDoc(doc(collection(db(A), 'mail')), { from: A, to: B, subject: '', text: 'x', read: false, delFrom: false, delTo: false, createdAt: serverTimestamp() }));
});
test('ВС Заметки: только свои', async () => {
  const n = doc(collection(db(A), 'notes'));
  const note = { ownerId: A, title: 'Список', text: 'молоко', color: 'yellow', pinned: false, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(n, note));
  await assertSucceeds(updateDoc(n, { text: 'молоко, хлеб', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(db(B), 'notes', n.id)));
  await assertFails(setDoc(doc(db(B), 'notes', n.id), { ...note, ownerId: B }));
  await assertFails(deleteDoc(doc(db(B), 'notes', n.id)));
  await assertSucceeds(deleteDoc(n));
});

/* ---------- 2.0: музыка, подарки, маркет ---------- */
test('ВС Музыка: трек только со своим музыкальным файлом, файл слушают все', async () => {
  const f = db(A), file = doc(collection(f, 'files'));
  await setDoc(file, { ownerId: A, kind: 'music', name: 'song.mp3', size: 1000, type: 'audio/mpeg', chunks: 1, status: 'uploading', createdAt: serverTimestamp() });
  await setDoc(doc(f, 'files', file.id, 'chunks', '0000'), { i: 0, data: 'AAAA' });
  const t = doc(collection(f, 'tracks'));
  await assertSucceeds(setDoc(t, { ownerId: A, title: 'Песня', artist: 'Группа', fileId: file.id, type: 'audio/mpeg', duration: 180.5, size: 1000, createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(B), 'files', file.id, 'chunks', '0000')));
  await assertFails(setDoc(doc(collection(db(B), 'tracks')), { ownerId: B, title: 'Чужая', artist: '', fileId: file.id, type: 'audio/mpeg', duration: 1, size: 1, createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db(B), 'users', B), { tracks: arrayUnion(t.id) }));
  await assertFails(deleteDoc(doc(db(B), 'tracks', t.id)));
  await assertSucceeds(deleteDoc(t));
});
test('Подарки: дарить другому, не себе; удалить может получатель', async () => {
  const g = doc(collection(db(B), 'gifts'));
  await assertSucceeds(setDoc(g, { from: B, to: A, gift: 'rose', text: 'С днём рождения!', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'gifts')), { from: B, to: B, gift: 'rose', text: '', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'gifts')), { from: C, to: A, gift: 'rose', text: '', createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(C), 'gifts', g.id)));
  await assertFails(deleteDoc(doc(db(C), 'gifts', g.id)));
  await assertSucceeds(deleteDoc(doc(db(A), 'gifts', g.id)));
});
test('ВС Маркет: объявление, продано, чужое не менять', async () => {
  const l = doc(collection(db(A), 'market'));
  const lot = { ownerId: A, title: 'Велосипед', price: 15000, category: 'hobby', city: 'Казань', text: 'Почти новый', image: '', sold: false, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(l, lot));
  await assertFails(setDoc(doc(collection(db(A), 'market')), { ...lot, price: -5 }));
  await assertFails(setDoc(doc(collection(db(A), 'market')), { ...lot, sold: true }));
  await assertSucceeds(updateDoc(l, { sold: true, price: 12000 }));
  await assertFails(updateDoc(doc(db(B), 'market', l.id), { price: 1 }));
  await assertFails(updateDoc(l, { ownerId: B }));
  await assertSucceeds(deleteDoc(l));
});
test('уведомления об упоминании и подарке', async () => {
  await assertSucceeds(setDoc(doc(collection(db(B), 'notifs')), { to: A, from: B, type: 'mention', postId: 'p1', text: '@alice смотри', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(collection(db(B), 'notifs')), { to: A, from: B, type: 'gift', postId: '', text: '🌹', createdAt: serverTimestamp() }));
});

/* ---------- 2.1: защита ---------- */
test('безопасность: картинки только загруженные, не ссылки на чужие серверы', async () => {
  await assertFails(updateDoc(doc(db(A), 'users', A), { photo: 'https://evil.example/track.gif' }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { photo: 'https://lh3.googleusercontent.com/a/abc=s96-c' }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { photo: 'data:image/jpeg;base64,AAAA' }));
  await assertFails(setDoc(doc(collection(db(A), 'posts')), post(A, A, { image: 'https://evil.example/x.jpg' })));
  await assertFails(setDoc(doc(collection(db(A), 'posts')), post(A, A, { text: '', images: ['data:image/jpeg;base64,A', 'https://evil.example/x.jpg'] })));
  await assertFails(send(B, A, '', 'https://evil.example/x.jpg'));
  await assertFails(setDoc(doc(collection(db(A), 'market')), { ownerId: A, title: 'Лот', price: 1, category: 'other', city: '', text: '', image: 'https://evil.example/x.jpg', sold: false, createdAt: serverTimestamp() }));
});
test('безопасность: цвет аватара, лишние поля профиля', async () => {
  await assertFails(updateDoc(doc(db(A), 'users', A), { color: 'red;background:url(x)' }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { color: '#1F8A5B' }));
  await assertFails(updateDoc(doc(db(A), 'users', A), { junk: 'x'.repeat(1000) }));
});
test('безопасность: уведомления от заблокированного, видео-ссылки, кривые id диалогов', async () => {
  await updateDoc(doc(db(A), 'users', A), { blocked: arrayUnion(B) });
  await assertFails(setDoc(doc(collection(db(B), 'notifs')), { to: A, from: B, type: 'like', postId: '', text: '', createdAt: serverTimestamp() }));
  const vid = { ownerId: A, title: 'v', description: '', source: 'link', likes: [], createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(collection(db(A), 'videos')), { ...vid, provider: 'youtube', vid: 'dQw4w9WgXcQ' }));
  await assertFails(setDoc(doc(collection(db(A), 'videos')), { ...vid, provider: 'direct', vid: 'javascript:alert(1)' }));
  await assertFails(setDoc(doc(collection(db(A), 'videos')), { ...vid, provider: 'evil', vid: 'x' }));
  await assertFails(setDoc(doc(collection(db(A), 'chats', A + '_' + B + '_x', 'messages')), { from: A, text: 'x', createdAt: serverTimestamp() }));
});
test('2.1: правка своего сообщения и закладки', async () => {
  const ref = await send(B, A, 'опечатка');
  const cid = [A, B].sort().join('_');
  await assertSucceeds(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { text: 'исправлено', edited: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(A), 'chats', cid, 'messages', ref.id), { text: 'чужое', edited: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(B), 'chats', cid, 'messages', ref.id), { text: 'x', from: A, edited: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { saved: arrayUnion('p1') }));
});

/* ---------- 3.0: события, эмодзи-статус, «сейчас слушает» ---------- */
test('ВС События: создать, «пойду», править может только автор', async () => {
  const e = doc(collection(db(A), 'events'));
  const ev = { ownerId: A, title: 'Шашлыки', text: 'Берите мясо', place: 'Парк', at: Timestamp.fromMillis(Date.now() + 864e5), cover: '', going: [A], createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(e, ev));
  await assertFails(setDoc(doc(collection(db(A), 'events')), { ...ev, going: [A, B] }));
  await assertSucceeds(updateDoc(doc(db(B), 'events', e.id), { going: arrayUnion(B) }));
  await assertFails(updateDoc(doc(db(B), 'events', e.id), { going: [B] }));
  await assertFails(updateDoc(doc(db(B), 'events', e.id), { title: 'Взлом' }));
  await assertSucceeds(updateDoc(e, { place: 'Набережная' }));
  await assertFails(deleteDoc(doc(db(B), 'events', e.id)));
  await assertSucceeds(deleteDoc(e));
});
test('эмодзи-статус и «сейчас слушает»', async () => {
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { emoji: '🔥', listening: { title: 'Песня', artist: 'Группа', at: serverTimestamp() } }));
  await assertSucceeds(updateDoc(doc(db(A), 'users', A), { listening: null }));
  await assertFails(updateDoc(doc(db(A), 'users', A), { emoji: 'x'.repeat(40) }));
  await assertFails(updateDoc(doc(db(A), 'users', A), { listening: { title: 'x', evil: 1 } }));
});

/* ---------- 3.1: текст песни и обложка трека ---------- */
test('текст песни и обложку меняет только автор трека', async () => {
  const f = db(A), file = doc(collection(f, 'files'));
  await setDoc(file, { ownerId: A, kind: 'music', name: 's.mp3', size: 10, type: 'audio/mpeg', chunks: 1, status: 'uploading', createdAt: serverTimestamp() });
  const t = doc(collection(f, 'tracks'));
  await setDoc(t, { ownerId: A, title: 'Элло', artist: 'Группа', fileId: file.id, type: 'audio/mpeg', duration: 186, size: 10, createdAt: serverTimestamp() });
  await assertSucceeds(updateDoc(t, { lyrics: '[00:12.50] Первая строка\n[00:15.00] Вторая', cover: 'data:image/jpeg;base64,AAAA' }));
  await assertFails(updateDoc(doc(db(B), 'tracks', t.id), { lyrics: 'чужой текст' }));
  await assertFails(updateDoc(t, { cover: 'https://evil.example/c.jpg' }));
  await assertFails(updateDoc(t, { lyrics: 'x'.repeat(20001) }));
});

test('3.2: обычный ник от 4 символов, админ может от 1', async () => {
  const f = db('dddd');
  let b = writeBatch(f);
  b.set(doc(f, 'usernames', 'dim'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('dim'), createdAt: serverTimestamp() });
  await assertFails(b.commit());
  b = writeBatch(f);
  b.set(doc(f, 'usernames', 'dima'), { uid: 'dddd' });
  b.set(doc(f, 'users', 'dddd'), { ...profile('dima'), createdAt: serverTimestamp() });
  await assertSucceeds(b.commit());
  // обычный не может сменить ник на короткий
  const fb = db(B); b = writeBatch(fb);
  b.set(doc(fb, 'usernames', 'bo'), { uid: B }); b.delete(doc(fb, 'usernames', 'bob')); b.update(doc(fb, 'users', B), { nick: 'bo' });
  await assertFails(b.commit());
  // админ может взять ник из одной буквы
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { admin: true }));
  const fa = db(A); b = writeBatch(fa);
  b.set(doc(fa, 'usernames', 'a'), { uid: A }); b.delete(doc(fa, 'usernames', 'alice')); b.update(doc(fa, 'users', A), { nick: 'a' });
  await assertSucceeds(b.commit());
});
test('3.2: коллекционные юзернеймы — выпуск, подарок, основной, удаление', async () => {
  // выпускать может только админ
  await assertFails(setDoc(doc(db(B), 'usernames', 'vld'), { uid: B, col: true }));
  await assertFails(setDoc(doc(db(B), 'usernames', 'boss.bob'), { uid: B, col: true }));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { admin: 'true' }));
  const fa = db(A);
  await assertFails(setDoc(doc(fa, 'usernames', 'vld'), { uid: 'nobody', col: true }));   // только существующему человеку
  await assertFails(setDoc(doc(fa, 'usernames', 'carol'), { uid: B, col: true }));         // занятое не перезаписать
  await assertSucceeds(setDoc(doc(fa, 'usernames', 'vld'), { uid: B, col: true }));
  await assertSucceeds(setDoc(doc(fa, 'usernames', 'x'), { uid: A, col: true }));
  // B дарит vld Кэрол, чужое подарить нельзя
  await assertFails(updateDoc(doc(db(C), 'usernames', 'vld'), { uid: C }));
  await assertFails(updateDoc(doc(db(B), 'usernames', 'vld'), { uid: B, col: false }));
  await assertSucceeds(updateDoc(doc(db(B), 'usernames', 'vld'), { uid: C }));
  // обычный (не коллекционный) ник подарить нельзя
  await assertFails(updateDoc(doc(db(B), 'usernames', 'bob'), { uid: C }));
  // C ставит vld основным, старый ник освобождает
  const fc = db(C); let b = writeBatch(fc);
  b.delete(doc(fc, 'usernames', 'carol')); b.update(doc(fc, 'users', C), { nick: 'vld' });
  await assertSucceeds(b.commit());
  // основной коллекционный ник не подарить, не удалить, админ не забирает
  await assertFails(updateDoc(doc(fc, 'usernames', 'vld'), { uid: B }));
  await assertFails(deleteDoc(doc(fc, 'usernames', 'vld')));
  await assertFails(deleteDoc(doc(fa, 'usernames', 'vld')));
  await assertFails(updateDoc(doc(fa, 'usernames', 'vld'), { uid: A }));
  // не основной коллекционный админ может забрать или переназначить
  await assertSucceeds(setDoc(doc(fa, 'usernames', 'top'), { uid: B, col: true }));
  await assertSucceeds(updateDoc(doc(fa, 'usernames', 'top'), { uid: C }));
  await assertSucceeds(deleteDoc(doc(fa, 'usernames', 'top')));
  // уведомление о подарке ника
  await assertSucceeds(setDoc(doc(db(B), 'notifs', 'n_nick'), { to: C, from: B, type: 'nick', postId: '', text: '@vld', createdAt: serverTimestamp() }));
});
test('3.2: без входа ничего не пишется', async () => {
  const f = anon();
  await assertFails(setDoc(doc(f, 'usernames', 'zzzz'), { uid: 'x' }));
  await assertFails(updateDoc(doc(f, 'users', A), { name: 'x' }));
  await assertFails(deleteDoc(doc(f, 'posts', 'p1')));
  await assertFails(setDoc(doc(f, 'notifs', 'n1'), { to: A, from: 'x', type: 'like', postId: '', text: '', createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'posts', 'p1'), { likes: [] }));
});

/* ---------- 6.3: свои плейлисты ---------- */
test('6.3: плейлист создаёт и меняет только хозяин, читают все вошедшие', async () => {
  const p = doc(collection(db(A), 'playlists'));
  const pl = { ownerId: A, title: 'В дорогу', tracks: ['t1'], color: '#7C3AED', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(p, pl));
  await assertSucceeds(updateDoc(p, { tracks: arrayUnion('t2'), updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(p, { title: 'Ночь', color: '#16A34A', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(B), 'playlists', p.id)));
  await assertFails(getDoc(doc(anon(), 'playlists', p.id)));
  await assertFails(updateDoc(doc(db(B), 'playlists', p.id), { tracks: arrayUnion('x'), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db(B), 'playlists', p.id), { ...pl, ownerId: B }));
  await assertFails(deleteDoc(doc(db(B), 'playlists', p.id)));
  await assertFails(setDoc(doc(collection(db(B), 'playlists')), { ...pl, ownerId: A }));       // чужой ownerId
  await assertFails(setDoc(doc(collection(db(A), 'playlists')), { ...pl, title: '' }));        // без названия
  await assertFails(setDoc(doc(collection(db(A), 'playlists')), { ...pl, color: 'red' }));     // цвет — только #RRGGBB
  await assertFails(setDoc(doc(collection(db(A), 'playlists')), { ...pl, extra: 1 }));         // лишнее поле
  await assertFails(setDoc(doc(collection(db(A), 'playlists')), { ...pl, tracks: Array.from({ length: 501 }, (_, i) => 't' + i) }));
  await assertSucceeds(deleteDoc(p));
});
test('6.3: без входа не читается и не пишется то, где сжатые правила убрали лишний signed()', async () => {
  const f = anon();
  await assertFails(setDoc(doc(collection(f, 'playlists')), { ownerId: A, title: 'x', tracks: [], color: '', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(f, 'albums', 'al1')));
  await assertFails(setDoc(doc(collection(f, 'posts')), { authorId: A, wallId: A, text: 'x', image: '', likes: [], commentCount: 0, createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(f, 'videos', 'v1')));
  await assertFails(deleteDoc(doc(f, 'albums', 'al1')));
  await assertFails(setDoc(doc(collection(f, 'groups')), { name: 'x', about: '', photo: '', cover: 'blue', ownerId: A, admins: [A], membersCount: 1, createdAt: serverTimestamp() }));
});

/* ---------- 6.8: ВС Эфир ---------- */
const stream = (o = {}) => ({ ownerId: A, title: 'Мой эфир', mode: 'camera', live: true, beat: serverTimestamp(), createdAt: serverTimestamp(), endedAt: null, ...o });
test('6.8: эфир создаёт и завершает только хозяин, читают все вошедшие', async () => {
  const s = doc(collection(db(A), 'streams'));
  await assertSucceeds(setDoc(s, stream()));
  await assertFails(setDoc(doc(collection(db(A), 'streams')), stream({ ownerId: B })));          // чужим именем
  await assertFails(setDoc(doc(collection(db(A), 'streams')), stream({ title: 'я' })));          // короткое название
  await assertFails(setDoc(doc(collection(db(A), 'streams')), stream({ mode: 'rtmp' })));        // неизвестный режим
  await assertFails(setDoc(doc(collection(db(A), 'streams')), stream({ live: false })));         // начинается сразу в эфире
  await assertFails(setDoc(doc(collection(db(A), 'streams')), { ...stream(), views: 5 }));       // лишнее поле
  await assertSucceeds(getDoc(doc(db(B), 'streams', s.id)));
  await assertFails(getDoc(doc(anon(), 'streams', s.id)));
  await assertSucceeds(updateDoc(doc(db(A), 'streams', s.id), { beat: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(A), 'streams', s.id), { beat: Timestamp.fromMillis(1) }));   // «пульс» только серверным временем
  await assertFails(updateDoc(doc(db(A), 'streams', s.id), { ownerId: B }));
  await assertFails(updateDoc(doc(db(B), 'streams', s.id), { live: false }));
  await assertSucceeds(updateDoc(doc(db(A), 'streams', s.id), { live: false, endedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db(B), 'streams', s.id)));
  await assertSucceeds(deleteDoc(doc(db(A), 'streams', s.id)));
});
test('6.8: заявки зрителей: offer пишет зритель, answer — только тот, кому адресовано', async () => {
  const s = doc(collection(db(A), 'streams')); await assertSucceeds(setDoc(s, stream()));
  const sdp = 'v=0\r\n' + 'a=x\r\n'.repeat(10);
  const peer = doc(collection(db(B), 'streams', s.id, 'peers'));
  await assertSucceeds(setDoc(peer, { uid: B, to: A, offer: sdp, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'streams', s.id, 'peers')), { uid: C, to: A, offer: sdp, createdAt: serverTimestamp() }));   // чужим именем
  await assertFails(setDoc(doc(collection(db(B), 'streams', s.id, 'peers')), { uid: B, to: A, offer: '', createdAt: serverTimestamp() }));     // пустой (8.0: короткий «no» — отказ от звонка)
  await assertFails(setDoc(doc(collection(db(B), 'streams', s.id, 'peers')), { uid: B, to: A, offer: sdp, createdAt: serverTimestamp(), answer: sdp }));
  await assertSucceeds(getDoc(doc(db(A), 'streams', s.id, 'peers', peer.id)));        // тот, кому адресовано
  await assertSucceeds(getDoc(doc(db(B), 'streams', s.id, 'peers', peer.id)));        // автор
  await assertFails(getDoc(doc(db(C), 'streams', s.id, 'peers', peer.id)));           // посторонний
  await assertFails(getDocs(collection(db(C), 'streams', s.id, 'peers')));            // посторонний не перечислит заявки
  await assertSucceeds(getDocs(collection(db(A), 'streams', s.id, 'peers')));         // хозяин эфира — может (подчистка)
  await assertFails(updateDoc(doc(db(B), 'streams', s.id, 'peers', peer.id), { answer: sdp }));   // зритель не может ответить сам себе
  await assertFails(updateDoc(doc(db(C), 'streams', s.id, 'peers', peer.id), { answer: sdp }));
  await assertFails(updateDoc(doc(db(A), 'streams', s.id, 'peers', peer.id), { answer: 'x'.repeat(16001) }));
  await assertFails(updateDoc(doc(db(A), 'streams', s.id, 'peers', peer.id), { uid: C }));
  await assertSucceeds(updateDoc(doc(db(A), 'streams', s.id, 'peers', peer.id), { answer: sdp }));
  await assertFails(deleteDoc(doc(db(C), 'streams', s.id, 'peers', peer.id)));
  await assertSucceeds(deleteDoc(doc(db(B), 'streams', s.id, 'peers', peer.id)));
  // отказ вместо ответа
  const p2 = doc(collection(db(B), 'streams', s.id, 'peers')); await assertSucceeds(setDoc(p2, { uid: B, to: C, offer: sdp, createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db(C), 'streams', s.id, 'peers', p2.id), { rej: true }));
  await assertFails(updateDoc(doc(db(C), 'streams', s.id, 'peers', p2.id), { rej: false }));
  // хозяин эфира подчищает всё
  await assertSucceeds(deleteDoc(doc(db(A), 'streams', s.id, 'peers', p2.id)));
});
test('6.8: узлы цепочки пишет и стирает только сам участник (или хозяин эфира)', async () => {
  const s = doc(collection(db(A), 'streams')); await assertSucceeds(setDoc(s, stream()));
  const node = (u, o = {}) => ({ uid: u, depth: 1, free: 2, up: A, at: serverTimestamp(), ...o });
  await assertSucceeds(setDoc(doc(db(B), 'streams', s.id, 'nodes', B), node(B)));
  await assertSucceeds(setDoc(doc(db(B), 'streams', s.id, 'nodes', B), node(B, { free: 1 })));
  await assertFails(setDoc(doc(db(B), 'streams', s.id, 'nodes', C), node(C)));                // за другого
  await assertFails(setDoc(doc(db(B), 'streams', s.id, 'nodes', B), node(B, { depth: 99 })));
  await assertFails(setDoc(doc(db(B), 'streams', s.id, 'nodes', B), node(B, { free: 'много' })));
  await assertFails(setDoc(doc(db(B), 'streams', s.id, 'nodes', B), { ...node(B), x: 1 }));
  await assertSucceeds(getDoc(doc(db(C), 'streams', s.id, 'nodes', B)));
  await assertFails(deleteDoc(doc(db(C), 'streams', s.id, 'nodes', B)));
  await assertSucceeds(deleteDoc(doc(db(A), 'streams', s.id, 'nodes', B)));                   // хозяин эфира
  await assertFails(setDoc(doc(anon(), 'streams', s.id, 'nodes', B), node(B)));
});

/* ---------- 8.0: комментарии и просмотры видео, звонки, видеокружки ---------- */
test('видео: комментарии, удаление автором видео, просмотры только +1', async () => {
  const c = doc(collection(db(B), 'videos', 'v1', 'comments'));
  await assertSucceeds(setDoc(c, { authorId: B, text: 'класс', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'videos', 'v1', 'comments')), { authorId: C, text: 'чужим именем', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'videos', 'v1', 'comments')), { authorId: B, text: '', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(B), 'videos', 'v1', 'comments')), { authorId: B, text: 'x', likes: [B], createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(anon(), 'videos', 'v1', 'comments')), { authorId: B, text: 'x', createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db(C), 'videos', 'v1', 'comments', c.id)));
  await assertFails(deleteDoc(doc(db(C), 'videos', 'v1', 'comments', c.id)));                 // чужой
  await assertSucceeds(deleteDoc(doc(db(A), 'videos', 'v1', 'comments', c.id)));              // автор видео
  await assertSucceeds(updateDoc(doc(db(B), 'videos', 'v1'), { views: 1 }));
  await assertSucceeds(updateDoc(doc(db(C), 'videos', 'v1'), { views: increment(1) }));
  await assertFails(updateDoc(doc(db(C), 'videos', 'v1'), { views: 10 }));
  await assertFails(updateDoc(doc(db(C), 'videos', 'v1'), { views: increment(1), title: 'взлом' }));
});
test('заблокированный не комментирует видео', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', A), { blocked: [B] }));
  await assertFails(setDoc(doc(collection(db(B), 'videos', 'v1', 'comments')), { authorId: B, text: 'привет', createdAt: serverTimestamp() }));
});
test('звонок: эфир mode call, заявка, отказ, уведомление', async () => {
  const s = doc(collection(db(A), 'streams'));
  const call = (x = {}) => ({ ownerId: A, title: 'Звонок', mode: 'call', to: B, live: true, beat: serverTimestamp(), createdAt: serverTimestamp(), endedAt: null, ...x });
  await assertSucceeds(setDoc(s, call()));
  await assertFails(setDoc(doc(collection(db(A), 'streams')), call({ to: 'x'.repeat(41) })));
  await assertFails(setDoc(doc(collection(db(A), 'streams')), call({ mode: 'phone' })));
  const p = doc(collection(db(B), 'streams', s.id, 'peers'));
  await assertSucceeds(setDoc(p, { uid: B, to: A, offer: 'no', createdAt: serverTimestamp() }));   // «отклонить»
  await assertSucceeds(getDoc(doc(db(A), 'streams', s.id, 'peers', p.id)));
  await assertSucceeds(setDoc(doc(collection(db(A), 'notifs')), { to: B, from: A, type: 'call', postId: s.id, text: 'Звонок', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(collection(db(A), 'notifs')), { to: B, from: A, type: 'ring', postId: s.id, text: 'Звонок', createdAt: serverTimestamp() }));
});
test('видеокружок в сообщении (data:video), но не другие типы', async () => {
  const cid = [A, C].sort().join('_');
  const m = x => ({ from: A, text: '', audio: x, dur: 12, createdAt: serverTimestamp() });
  await assertSucceeds(setDoc(doc(collection(db(A), 'chats', cid, 'messages')), m('data:video/webm;base64,AAAA')));
  await assertSucceeds(setDoc(doc(collection(db(A), 'chats', cid, 'messages')), m('data:audio/webm;base64,AAAA')));
  await assertFails(setDoc(doc(collection(db(A), 'chats', cid, 'messages')), m('data:text/html;base64,AAAA')));
  await assertFails(setDoc(doc(collection(db(A), 'chats', cid, 'messages')), m('https://evil.example/v.webm')));
});
