# VСмске (VС)

Социальная сеть в духе ВКонтакте. Интерфейс полностью на русском языке.

## Как устроено
- Чистый HTML/CSS/JS без сборки и без npm: `index.html`, `style.css`, `app.js` (ES-модуль).
- Firebase JS SDK 10.12.2 подключается из `https://www.gstatic.com/firebasejs/...`.
- Firebase-проект `vsmske`: Authentication (почта+пароль и Google) и Firestore.
- Хостинг: GitHub Pages, адрес `https://nlponae269.github.io/vsmske/`.
  Домен `nlponae269.github.io` добавлен в Firebase → Authentication → Authorized domains.
- Тариф Firebase Spark (бесплатный, карта не привязана). **Firebase Storage не используется** (он требует тариф Blaze).
  Все фото и файлы хранятся в Firestore:
  - фото сжимаются в браузере в dataURL JPEG (документ Firestore должен быть меньше 1 МБ);
  - файлы Диска и видео режутся на куски по 700 000 символов base64 в `files/{id}/chunks/{0000..}`.
- Маршрутизация через hash: `#feed`, `#id/<uid>`, `#im/<uid>`, `#friends`, `#people`, `#edit`,
  `#video`, `#video/<id>`, `#videos/<uid>`, `#albums/<uid>`, `#album/<id>`, `#disk`, `#vid`, `#settings`, `#more`.
- Рендер: функция `render()` целиком перерисовывает `#app` через innerHTML, а значения полей ввода сохраняются между перерисовками.
  Исключение — страница видео: там обновляются только части страницы, чтобы плеер не перезапускался (см. `playerKey`).

## Коллекции Firestore
`users`, `usernames` (уникальные короткие имена), `friendRequests` (id = `от_кому`), `posts` + `posts/{id}/comments`,
`chats` (id = `uid1_uid2` по алфавиту) + `chats/{id}/messages`, `videos`, `files` + `files/{id}/chunks`,
`albums`, `photos` (миниатюры), `photoFull` (полные фото).

Поля, добавленные в 1.3: `users.lastSeen` (статус «в сети», пишется не чаще раза в 4 минуты),
`posts.editedAt` (запись изменена автором), `chats/{id}/messages.image` (фото в сообщении, dataURL до `MAX_MSG_IMG`).

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
