# VСмске (VС)

Социальная сеть в духе ВКонтакте. Интерфейс полностью на русском языке.

## Как устроено
- Чистый HTML/CSS/JS без сборки и без npm: `index.html`, `style.css`, `app.js` (ES-модуль).
- PWA: `manifest.webmanifest`, `sw.js` (сеть в приоритете, кэш только без интернета; Firebase не кэширует), иконки `icon-*.png`, `apple-touch-icon.png`.
- Firebase JS SDK 10.12.2 подключается из `https://www.gstatic.com/firebasejs/...`.
- Firebase-проект `vsmske`: Authentication (почта+пароль и Google) и Firestore.
- Хостинг: GitHub Pages, адрес `https://nlponae269.github.io/vsmske/`.
  Домен `nlponae269.github.io` добавлен в Firebase → Authentication → Authorized domains.
- Тариф Firebase Spark (бесплатный, карта не привязана). **Firebase Storage не используется** (он требует тариф Blaze).
  Все фото и файлы хранятся в Firestore:
  - фото сжимаются в браузере в dataURL JPEG (документ Firestore должен быть меньше 1 МБ);
  - файлы Диска и видео режутся на куски по 700 000 символов base64 в `files/{id}/chunks/{0000..}`.
- Маршрутизация через hash: `#feed`, `#id/<uid>`, `#im/<uid>`, `#friends`, `#people`, `#edit`,
  `#video`, `#video/<id>`, `#videos/<uid>`, `#albums/<uid>`, `#album/<id>`, `#disk`, `#vid`, `#settings`, `#more`,
  `#post/<id>` (одна запись), `#notif` (уведомления), `#clubs` (сообщества), `#club/<id>` (сообщество), `#admin` (админ-панель, только для админов),
  `#guests` (гости страницы), `#tag/<тег>` (записи с хэштегом), `#im/g_<id>` (беседа),
  `#apps` (все сервисы), `#answers[/<раздел>|/mine]`, `#q/<id>`, `#mail[/in|/sent|/new|/<id>]`, `#notes`, `#weather`, `#games[/2048|/ttt]`. `#im/<свой uid>` — «Избранное» (чат с самим собой, id `uid_uid`).
- Рендер: функция `render()` целиком перерисовывает `#app` через innerHTML, а значения полей ввода сохраняются между перерисовками.
  Исключение — страница видео: там обновляются только части страницы, чтобы плеер не перезапускался (см. `playerKey`).

## Коллекции Firestore
`users`, `usernames` (уникальные короткие имена), `friendRequests` (id = `от_кому`), `posts` + `posts/{id}/comments`,
`chats` (id = `uid1_uid2` по алфавиту) + `chats/{id}/messages`, `videos`, `files` + `files/{id}/chunks`,
`albums`, `photos` (миниатюры), `photoFull` (полные фото), `notifs` (уведомления: `to`, `from`, `type`, `postId`, `text`),
`groups` (сообщества: `name`, `about`, `photo`, `cover`, `ownerId`, `admins[]`, `membersCount`),
`reports` (жалобы, id = `тип_цель_автор`; читает и удаляет только админ),
`stories` (истории на 24 часа: `ownerId`, `image`, `text`, `views{uid: время}`; просроченные свои удаляет клиент владельца),
`users/{uid}/guests/{кто}` (гости страницы: `at`; видит только хозяин; пишется не чаще раза в 30 минут на страницу),
`questions` + `questions/{id}/answers` (ВС Ответы: `title`, `text`, `category`, `answersCount`, `bestId`; ответы с `likes`),
`mail` (ВС Почта: `from`, `to`, `subject`, `text`, `read`, `delFrom`, `delTo`; документ стирается, когда удалили оба; адрес — `ник@vsmske`),
`notes` (ВС Заметки: личные, `ownerId`, `title`, `text`, `color`, `pinned`).
ВС Погода берёт данные из бесплатного Open-Meteo (без ключа), ВС Игры (2048, крестики-нолики) работают без базы, рекорд — в localStorage.

Поля, добавленные в 1.3: `users.lastSeen` (статус «в сети», пишется не чаще раза в 4 минуты),
`posts.editedAt` (запись изменена автором), `chats/{id}/messages.image` (фото в сообщении, dataURL до `MAX_MSG_IMG`).

Поля, добавленные в 1.4: `posts.poll` (`{q, options[2..6], votes: {uid: номер}}`), `messages.replyTo` (`{id, from, text}`),
`users.pinned` (закреплённая запись), `users.cover` (ключ из `COVERS`), `users.notifSeenAt` (когда смотрел уведомления).
Уведомления пишутся «по возможности» отдельной записью (`notify()`), лайк — с id `like_<post>_<uid>`, снимается при снятии лайка.
Поля 1.5:
- `users.admin` (`true` boolean или строка `"true"` — администратор сайта, см. `isAdm()` и `isAdmin()` в правилах). **Ставится только вручную в консоли Firestore**, правила не дают изменить его с сайта.
  Админ может удалять любые записи, комментарии, видео и сообщества; у него особый дизайн профиля и значок ✓ у имени.
- `users.groups` (подписки на сообщества, до 500). Подписка = в одной пачке `users.groups` и `groups.membersCount` ±1.
  Записи сообщества лежат в `posts` с `wallId = groupId` и полем `groupId`; писать могут только `groups.admins`.
- `messages.audio` (голосовое, dataURL `data:audio/...` до ~500 КБ, до 60 с) и `messages.dur` (секунды).
Поля 1.7:
- `users.ban` (`{until: timestamp|null, reason, by, at}`, null — навсегда). Ставит и снимает только админ с сайта (не другому админу).
  Правило `notBanned()` запрещает забаненному создавать записи, комментарии, сообщения, сообщества, заявки, видео, файлы, альбомы, жалобы, лайкать и голосовать.
- `users.blocked` (чёрный список, до 500): `blockedBy()` в правилах не даёт заблокированному писать сообщения, комментировать записи, писать на стене и слать заявки.
- `messages.reacts` (`{uid: эмодзи}` из `REACTS`), `posts.repostOf` (id оригинала) и `posts.reposts` (счётчик, только +1).
Поля 1.8:
- Беседы лежат в `chats` с id `g_<случайный>`: `group: true`, `name`, `ownerId`, `members[]` (до 50). Личные диалоги — как раньше (`uid1_uid2`).
  В адресе и коде диалог задаётся «ключом»: uid собеседника или id беседы (`chatKeyId()`, `isRoom()`).
- `messages.fwd` (`{from, name, text}`) — пересланное сообщение; фото и голосовое копируются в само сообщение.
- `comments.likes`, `posts.images` (2–4 фото, каждое сжато до ~880 КБ / n), `posts.tags` (до 10 хэштегов, `extractTags()`), `users.bday` (`ГГГГ-ММ-ДД`).
Хранится не больше `NOTIF_KEEP` уведомлений на человека: лишние удаляет клиент получателя (запрос без orderBy, чтобы не нужен был индекс).

Составные индексы (созданы в консоли):
- `posts`: authorId ASC + createdAt DESC;
- `posts`: wallId ASC + createdAt DESC;
- `chats`: members ARRAY_CONTAINS + lastAt DESC.

Остальные запросы специально написаны так, чтобы не требовать новых индексов (сортировка на клиенте).

## Правила безопасности
Действующие правила вставлены вручную в консоли Firebase (Firestore → Rules), их копия лежит в `firestore.rules`.
Если меняешь структуру данных, обнови этот файл и напомни владельцу вставить его в консоль и нажать Publish.

Правила строгие: для каждой коллекции перечислены допустимые поля (`keys().hasOnly`) и их размеры,
лайки можно менять только на себя, друзья — только по заявке, ник — только вместе с профилем в одной пачке.
Поэтому **любое новое поле или новая запись в `app.js` требует правки `firestore.rules`**, иначе будет `permission-denied`.

Проверка правил в эмуляторе (для Claude, владельцу не нужна; нужны Node.js и Java):
`cd tests && npm i && npx firebase emulators:exec --only firestore --project demo-vsmske "node --test"`.
При изменении правил или записей в `app.js` добавляй тест в `tests/rules.test.mjs` и запускай его.

## Как владелец обновляет сайт
Владелец работает **с планшета**, без терминала: загружает файлы на GitHub через браузер (Add file → Upload files).
- При каждом изменении `app.js` или `style.css` поднимай версию в `index.html`
  (`app.js?v=X.Y`, `style.css?v=X.Y`) и константу `VERSION` в `app.js`, иначе браузер покажет старую копию.
- Объясняй шаги простыми словами, без команд терминала.

## Ограничения
- Видео-файл до 20 МБ, файл Диска до 10 МБ (константа `LIMITS`).
- Бесплатная квота Firestore: 50 000 чтений и 20 000 записей в день, 1 ГБ данных. Не добавляй ничего, что требует платного тарифа.
- Настройки приватности проверяются и в интерфейсе, и в правилах: на чужой стене пишут только друзья
  (и не пишут, если `privacy.wall == 'me'`); при `privacy.messages == 'friends'` новый диалог может начать только друг,
  уже начатый диалог продолжается.
