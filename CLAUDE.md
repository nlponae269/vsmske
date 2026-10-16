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

Составные индексы (созданы в консоли):
- `posts`: authorId ASC + createdAt DESC;
- `posts`: wallId ASC + createdAt DESC;
- `chats`: members ARRAY_CONTAINS + lastAt DESC.

Остальные запросы специально написаны так, чтобы не требовать новых индексов (сортировка на клиенте).

## Правила безопасности
Действующие правила вставлены вручную в консоли Firebase (Firestore → Rules), их копия лежит в `firestore.rules`.
Если меняешь структуру данных, обнови этот файл и напомни владельцу вставить его в консоль и нажать Publish.

## Как владелец обновляет сайт
Владелец работает **с планшета**, без терминала: загружает файлы на GitHub через браузер (Add file → Upload files).
- При каждом изменении `app.js` или `style.css` поднимай версию в `index.html`
  (`app.js?v=X.Y`, `style.css?v=X.Y`) и константу `VERSION` в `app.js`, иначе браузер покажет старую копию.
- Объясняй шаги простыми словами, без команд терминала.

## Ограничения
- Видео-файл до 20 МБ, файл Диска до 10 МБ (константа `LIMITS`).
- Бесплатная квота Firestore: 50 000 чтений и 20 000 записей в день, 1 ГБ данных. Не добавляй ничего, что требует платного тарифа.
- Настройки приватности (`users.privacy.messages`, `users.privacy.wall`) сейчас проверяются только в интерфейсе, правила их не проверяют.
