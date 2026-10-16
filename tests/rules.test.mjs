// Проверка firestore.rules в эмуляторе. Сайту не нужна — это для разработчика.
// Запуск (нужны Node.js и Java):
//   cd tests && npm i && npx firebase emulators:exec --only firestore --project demo-vsmske "node --test"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, collection, setDoc, getDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, Timestamp
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
  env = await initializeTestEnvironment({ projectId: 'demo-vsmske', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
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
