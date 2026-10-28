# VСмске (VС)

**9.7 / Android 3.15 — на адресе VСмске теперь веб-версия «Мига», от VСмске осталась только Музыка** (по просьбе владельца; данные в базе не тронуты).
- `index.html` в начале выбирает режим (`window.SITE_MODE`): `mig` — по умолчанию (папка `mig/`: `mig/app.js` — ES-модуль на Firebase SDK 10.12.2, `mig/mig.css`, шрифты Onest/Unbounded, значки, `mig/manifest.webmanifest`; стили VСмске выключаются),
  `music` — адреса `/vsmske/music…` и `/vsmske/radio`: старый `app.js` с `window.VS_MUSIC_ONLY` (в `route()` всё остальное ведёт на `music`; разделы спрятаны CSS-классом `html.vs-music`, плашка `#vsMusicBar`), `vs` — весь VСмске по `?open` (для владельца).
- Веб-«Миг» (`mig/app.js`): вход (почта, Google: окно или переход с `#id_token`, как в VСмске), анкета (тот же документ `users` + `usernames`, что у приложения), лента «Для вас» (`videos` по `createdAt`, только клипы как `isClip()` в приложении) и «Друзья»,
  клип по ссылке `/clip/<id>`, профиль `/@ник` (`/id/<uid>`, `/me`) с сеткой клипов, лайки (`likes` arrayUnion/Remove), сохранение (`users.saved` с `clip_`), просмотры (+1 через 2 с), «Поделиться». Комментарии — «временно не работают». Снимать — только в приложении.
  Статистика автора `/stats` (`viewStats()`); из приложения «Миг» она открывается во встроенном браузере без входа — цифры приходят в ссылке `#d=<base64url JSON>` (`statsFromHash()`, `viewStatsApp()`); цвета темы приложения — там же (`statsTheme()`: bg, card, ink, mut, line, a), выделение и масштаб выключены (`html.st-app`), период 7 / 28 дн. / всё (`statsMount()`, localStorage `mig_stats_per`).
  Программа «Миг» для Windows (в nlponae269/vsclips, `desktop/`): вход через Google идёт в обычном браузере с `state = desk.…` — сайт показывает «Вход выполнен» (`deskBack`) и отдаёт ответ программе ссылкой `mig://auth#…`; ссылка «Для Windows» — `WIN`. Веб-«Миг» 1.3.
  Клипы из хранилища Яндекса играют по ссылке `vid`, старые — собираются из `files/{id}/chunks`. Адреса — как у VСмске (`404.html` → `?/путь`).
- Приложение: `MUSIC_ONLY = true` (`ui/ClosedScreen.kt`) — стартует с Музыки, без нижней панели и звонков, плашка `MusicOnlyStrip`; `CLOSED = false` (экран «Закрыто» оставлен в коде). «Миг» (бывшие «ВС Клипы») — отдельный закрытый проект `nlponae269/vsclips`.

Социальная сеть в духе ВКонтакте. Интерфейс полностью на русском языке.

## Как устроено
- **9.0 → 9.1:** в 9.0 сайт по ошибке переписали с нуля (урезанный, модули `js/`, `css/app.css`) — владелец хотел только новый дизайн. В 9.1 вернули код 8.0 целиком
  (всё ниже по-прежнему верно), а дизайн 9.0 стал оформлением **«Тёплый»** (`warm.css`, по умолчанию). Папок `js/` и `css/` больше нет. Не переписывай сайт с нуля без прямой просьбы.
- **«Тёплый» (9.1, `warm.css`, `<link id="skinWarm">`):** `vs_skin = warm` (и по умолчанию, если ничего не выбрано). Раскладка — та же, что у Material You: `MD()` истинно для `material` и `warm`,
  поэтому вместе с `warm.css` включён и `material.css`; `warm.css` переписывает роли `--md-*` тёплыми цветами (кремовый фон, коралловый `--w-acc`/`--w-acc-d`, Manrope, рамки и мягкие тени),
  на ширине >1100px колонка `.md-rail` становится широкой боковой панелью с подписями и кнопкой «Новая запись». `data-accent` меняет `--w-acc`. Рябь (`RIPPLE`) только в Material You.
- **Забаненные (9.1):** для всех, кроме самого человека и админов, — «Deleted Account». Кэш людей — `UserMap` (`cache.users.set` пропускает через `maskUser()`), `avatar()` и `nameLink()`
  тоже маскируют: аватарка-призрак `.av-ghost` (`GHOST`), без ника и сведений, профиль — `.prof-banned`. Их фото в записях (`postImages`) и сообщениях, голосовые, кружки, треки (`trackRow`, `trackCover`, `playAt`),
  видео (`videoThumb`, `viewWatch`), клипы (`clipPlay`), подарки, истории, альбомы, фото в Маркете заменяются заглушкой `lockBox()` и не скачиваются (`hidden(uid)`, `ownerOff(uid)` — сначала грузит профиль).
  Текст записей и комментариев остаётся. Стили — в конце `style.css` (во всех дизайнах). Списки людей из базы прогоняй через `maskUser`.
- **9.4 — треки загружают только админы** (просьба владельца): кнопки «Загрузить» в Музыке видны при `isAdm(me)`, `uploadTrack()`/`uploadTracksBatch()` проверяют `isAdm(S.me)`;
  в правилах `tracks` create требует `isAdmin()` (вместо `notBanned()` — админа забанить нельзя, а символов в обрез). Править свои старые треки и удалять их по-прежнему можно всем авторам.
- **9.5 — удаление целиком** (сервер сам не чистит: на Spark нет Cloud Functions): `deleteVideoFull()` — комментарии видео → видео → файл с кусками (хозяин или админ);
  трек админ удаляет вместе с файлом; `cleanupStaleUploads()` через 15 с после входа стирает свои недокачанные файлы (`status: 'uploading'`) старше суток;
  в админ-панели «🧹 Очистить мусор» (`admclean`) — файлы `kind` video/music, на которые не ссылается ни одно видео и ни один трек (младше суток не трогает).
  Правила: удалять файл и его куски может хозяин **или админ**; минификатор сокращает `request.time` → `rt()` и снимает `signed()` перед `f(x).поле==me()`.
- Чистый HTML/CSS/JS без сборки и без npm: `index.html`, `app.js` (ES-модуль) и файлы стилей:
  `style.css` — классический вид первых версий и стили всех разделов (основа для всех дизайнов),
  `warm.css` — дизайн 9.1 **«Тёплый»** (по умолчанию, `<link id="skinWarm">`, работает поверх `material.css`),
  `material.css` — дизайн 6.0 **Material You** (`<link id="skinMd">`; раскладка общая с «Тёплым»),
  `paper.css` — дизайн 8.0 **«Газета»** (`<link id="skinPaper">`: бумага с зерном, PT Serif/PT Sans, тонкие линейки, без теней; раскладка — классическая),
  `player.css` — Плеер 2.0 (нужен во всех дизайнах). **Liquid Glass (`glass.css`) удалён в 8.0** по решению владельца («выглядит как нейрослоп»): у кого был `vs_skin = glass`, тот попадает в Material You.
  Выбор в «Настройки → Оформление → Дизайн» (`SKINS`, localStorage `vs_skin` = `warm` | `material` | `paper` | `lite`, `data-skin` на `<html>`, `applySkin()`;
  старое `vs_lite = on` считается как `lite`). Скрипт в `<head>` включает нужный файл до отрисовки, чтобы не мигало.
  Новые стили для разделов клади в `style.css`; про Material You — в `material.css`, про «Газету» — в `paper.css` (её цвет по умолчанию — красные чернила, если не выбран свой `data-accent`).
- Material You (`material.css`): роли M3 (`--md-p`, `--md-pc`, `--md-sc`, `--md-s-low`… с префиксом `--md-`, чтобы не путать с переменными разделов)
  считаются из цвета оформления: `data-accent` → тон `--md-h` и насыщенность `--md-c`, тона через `oklch()` (в старых браузерах — постоянная палитра M3).
  Роли переписываются в переменные классического слоя (`--bg`, `--surface`, `--accent`…) с селектором `:root:not(#vs)` — он сильнее `:root[data-accent]`.
  Шрифт Google Sans, рябь по нажатию — `span.rip`, его ставит обработчик `RIPPLE` в app.js только при `data-skin="material"`.
- Новый сайт (6.1) — в дизайне Material You своя раскладка: `shell()` при `MD()` отдаёт `mdShell()` — навигационная колонка `.md-rail`
  (кнопка «Создать» `.md-fab`, Лента/Музыка/Чаты/Друзья/Сигналы/Сервисы, «Меню»), верхняя панель `.md-top` с названием страницы (`mdTitle()`/`MD_TITLES`),
  поиском и аватаркой; на телефоне (≤840px) — нижняя панель `.md-nav` и плавающая кнопка `.md-fab-float`. Все разделы — боковое меню `mdDrawer()`
  (`S.drawer`), новая запись — шторка с `composer()` (`S.compose`, в ленте вместо поля записи строка `.md-prompt`). `route()` закрывает меню и шторку.
  Заголовки-карточки страниц (`h1.brandh`) в этом дизайне спрятаны — название в верхней панели. Тумблеры в настройках — те же `.seg` (CSS по `data-act`).
  «Газета» и Классический собираются старым `shell()` — менять разметку страниц можно, но проверяй все три дизайна.
- 6.2: «Итоги» в стиле Spotify Wrapped — `openRecap()` (`S.recap = {i, d}`) читает свои записи (`authorId ==`, индекс есть), подарки и треки,
  слайды `recapSlides()`/`recapOverlay()` (пустые пропускаются, автопереход 6,5 с `recapTimer()`, стрелки/Esc), числа «набегают» через CSS `@property --n`;
  «Поделиться на стене» — обычная запись `posts` с тегом #итоги. Карточка в ленте раз в месяц (localStorage `vs_recap_seen` = ГГГГ-ММ).
  Быстрый поиск — Ctrl/⌘+K или кнопка `.md-pal`: `palOpen()`/`palItems()` (разделы `PAL_SECTIONS` + люди из `cache.users`, без запросов к базе).
  Цвет «Из аватарки» (`vs_accent = avatar`): `tintFromAvatar()` считает тон OKLCH (`oklchHue()`) по фото или по `users.color` и ставит `--md-h/--md-c`
  инлайн на `<html>` — влияет на Material You. Стили «Итогов» и поиска — в `style.css` (работают во всех дизайнах).
- 6.3: ВС Музыка заново (полноэкранный плеер не менялся). `#music` — главная `musicHome()`: баннер «Поток» (все треки платформы подряд,
  без рекомендаций — `loadStream()` страницами по 50 через `startAfter`, порядок «сначала новые/старые» — localStorage `vs_stream_order`;
  когда Поток доигрывает загруженное, `extendStream()` дописывает следующую страницу в очередь, `player.stream`), поиск `#musQ` (по загруженному,
  Поток догружается), плитки плейлистов, «Друзья слушают» (`users.listening` друзей), «Недавно играло» (localStorage `vs_recent`, 20 треков без обложек),
  «Новое в Потоке». Страницы: `#music/stream`, `#music/liked` (Мои треки = `users.tracks`, новые сверху), `#music/uploads` (Мои загрузки),
  `#music/pl_<id>` (плейлист), `#music/<uid>` (загрузки человека); старые `#music/my|all` → главная/Поток. Строка трека — `trackRow()`
  (♡ в «Мои треки», «⋯» → `S.tmenu`: играть следующим, в плейлист, убрать из плейлиста, правка/удаление), все списки — `musicList(key)`/`musicPlay()`,
  треки кэшируются в `trackCache`. Новая коллекция `playlists` (`ownerId`, `title` 1–60, `tracks[]` до 500 id, `color` `#RRGGBB` или '', `updatedAt`):
  читают все вошедшие (ссылка «Скопировать»), меняет и удаляет только хозяин; окна `playlistModal()` (`S.plPick` — выбрать плейлист, `S.plForm` — создать/переименовать).
- 6.4: эквалайзер и усиление басов в полноэкранном плеере (кнопка «Эквалайзер» и пункт в «Ещё», шторка `S.fpSheet = 'eq'`). 10 полос `EQ_F` (±12 дБ),
  «Усиление басов» 0–12 дБ (lowshelf 90 Гц), пресеты `EQ_PRESETS`, кривая АЧХ `eqCurve()`; localStorage `vs_eq` = `{on, preset, bass, bands[10]}`.
  Цепочка Web Audio `eqGraph()`: полосы → басы → запас громкости → лимитер. `<audio>` подключается (`eqHook()`) только когда эквалайзер включён и не плоский;
  отцепить его нельзя, поэтому `eqPrepare()` перед треком/радио при необходимости берёт свежий элемент `freshAudio()` (обработчики — через `audioOn()`).
  Радио эквалайзер не трогает: чужие потоки без CORS через Web Audio молчат. Шторка обновляется на месте (`eqDom()`), без `render()`.
- 6.5: музыка — громкость считает `applyVol()` (ползунок × `sleepMul` × `fadeMul` × `normMul`); «Плавные переходы» (localStorage `vs_xfade` 0–12 с: затухание
  в конце, нарастание после автоперехода `player.autoNext`, следующий трек качается заранее); «Ровная громкость» (`vs_norm`, `normApply()` по `rms` из `analyzeTrack()`);
  статистика на устройстве (`vs_plays` = {id: {n, s, title, artist, fileId…}}, `vs_listen_total`; засчитывается после 30 с или половины трека — `statTick()`),
  страница `#music/stats` (`musicStats()`), на главной «Чаще всего слушаю» (ключ списка `top`); сортировка списков `sortTracks()`/`#mSort` (`vs_msort`);
  исполнитель `#music/a_<имя>` (запрос `tracks where artist ==`, без индекса), трек по ссылке `#music/t_<id>`; в меню трека и в «Ещё» — скачать (`tdl`), ссылка (`tlink`);
  очередь: убрать трек (`fqrm`), перемешать, очистить; кнопки перемотки ±10 с на экране блокировки (`msPos()`).
  Новые сервисы без базы: `#timer` ВС Таймер (`TM`, секундомер/таймер/помодоро, тикает без render), `#calc` ВС Калькулятор (`calcEval()` — свой разбор, без eval; история `vs_calc`),
  `#dice` ВС Жребий, игра `#games/sudoku` (`sdkNew()` — единственное решение, рекорды `vs_sudoku_<уровень>`). Окно горячих клавиш — «?» (`S.keys`, `keysOverlay()`),
  черновик новой записи — localStorage `vs_draft`.
- 6.6 «Музыка 2.0» (правила не менялись): офлайн — файлы треков в IndexedDB `vs-offline` (stores `blobs`/`meta`, ключ — fileId; `OFF`, `offSave()`/`offDel()`,
  `getFileUrl()` сначала смотрит туда), страница `#music/offline`, «Скачать офлайн» у списков (`offSaveAll`); «Микс дня» `#music/mix` (`buildMix()`: Мои треки, любимое
  из статистики, треки любимых исполнителей и друзей; перемешано `seededRng(дата + uid)`); «Популярное у друзей» `#music/friends` (`loadFriendsChart()` по `users.tracks` друзей);
  карточки-ссылки на главной `.mus-quick`; в поиске — исполнители и плейлисты (`musicSearchExtra()`); трек в записи/сообщении — ссылка `…#music/t_<id>` в тексте
  превращается в карточку `trackEmbed()` («Поделиться на стене» = черновик `vs_draft` со ссылкой); `linkify()` открывает ссылки на свой сайт в той же вкладке;
  пакетная загрузка `uploadTracksBatch()` (до 30 файлов, без окна правки); порядок треков в своём плейлисте (`plmove`), «Сохранить себе» чужой плейлист (`plcopy`);
  «Автопродолжение» (`vs_autoplay`, по умолчанию вкл.): когда очередь кончилась, `nextTrack()` дописывает Микс дня.
- 6.7: «Музыка» — второй пункт меню во всех дизайнах (Material: `prim` в `mdShell()`, в нижней панели 6 пунктов; старый `shell()`: вместо «Видео» на телефоне).
  Плеер 3.0 (`fullPlayer()`): сверху переключатель «Трек · Текст · Очередь» (`fpview`), на паузе обложка отъезжает (класс `paused` на `.fp`), у названия «＋» в плейлист и ♥,
  внизу панель `.fp-acts` (Звук, Винил/Вид текста, Скорость, Сон, Скачать офлайн, Ссылка). Мини-плеер `.mbar3`: обложка и название слева, ♥ и кнопки справа.
  Главная Музыки 3.0 (`musicHome()`): приветствие, плитки `.mh-quick` (с кнопкой «играть»), баннер «Поток» `.mh-stream`, полки с прокруткой вбок `.mh-shelf`/`.mh-row`
  (Микс дня, Твои плейлисты, Друзья слушают, Новое в Потоке, Популярное у друзей, Исполнители, Недавно играло), «Чаще всего слушаю». Стили — в конце `style.css` и `player.css`.
- 6.8 «ВС Эфир» (`#live`, `#live/<id>`): прямые эфиры из браузера, **без сторонних платформ и серверов** — только WebRTC. Стример (`liveStart()`: камера `getUserMedia` или экран
  `getDisplayMedia` — экран только на компьютере) отдаёт видео до `LIVE_ROOT`=3 зрителям напрямую, а каждый зритель — ещё `LIVE_RELAY`=2 (цепочка до `LIVE_DEPTH`=4, ≈ десятки зрителей, видео
  не проходит через сервер). В базе только «знакомство»: `streams/{id}` (`ownerId`, `title`, `mode`, `live`, `beat` — «пульс» раз в минуту, `endedAt`), `streams/{id}/peers/{случайный}`
  (заявка: зритель пишет `offer`, тот, к кому он пришёл, — `answer` или `rej`; зритель стирает её сразу после соединения), `streams/{id}/nodes/{uid}` (`depth`, `free`, `up`, `at` — кто может
  передавать дальше). SDP без trickle (`iceDone()`). Зритель берёт узел с наименьшей глубиной и свободными местами (`liveConnect()`/`liveTry()`), не цепляясь к своим потомкам (по `up`);
  если родитель пропал — `liveUpLost()`: отпускает своих «детей» (они переподключаются сами) и ищет нового. Чат и счётчик зрителей идут по тем же каналам `RTCDataChannel` (сообщение вверх к
  стримеру → он рассылает вниз; `{t:'m'|'b'|'h'|'p'|'c'}`), в базу не пишутся; медленный режим 1,2 с, стример может заглушить (`livemute`). Запись — `MediaRecorder` у стримера, по окончании окно
  `liveRecModal()`: скачать или выложить в ВС Видео (до `LIMITS.video`). `LIVE` — глобальное состояние, эфир продолжается при переходах по сайту; `<video id="liveVid">` в `render()` вынимается и
  возвращается, чтобы не мигал; `liveBar()` — плашка «Вы в эфире» поверх страницы; в ленте — `liveNowCard()`. Эфир считается живым, если `beat` свежее 150 с (`liveFresh()`); хозяин сам закрывает
  «зависшие» (`liveCleanStale()`). Ретранслятор (TURN) для тех, у кого прямое соединение не пробивается, — публичный Open Relay (`ICE`), при желании заменить своим бесплатным ключом.
  Правила: блок `streams` в `firestore.rules`; общие проверки вынесены в функции `nowC()` (createdAt = сейчас) и `lst()` (список не длиннее n), порог минификатора теперь 19 600.
- Вход через Google (6.1): в обычной вкладке — всплывающее окно (`signInWithPopup`); с иконки на главном экране (`isStandalone()`) и если окно
  заблокировано — `googleGo()`: переход на accounts.google.com (OAuth, `response_type=id_token`, клиент `GOOGLE_CLIENT` — Web client проекта)
  и возврат на свой же адрес с `#id_token`, `googleFinish()` входит через `signInWithCredential`. Старый `signInWithRedirect` через
  vsmske.firebaseapp.com не используется: из-за разделённого хранилища в браузерах он «выкидывал» из аккаунта.
  Адрес `https://nlponae269.github.io/vsmske/` добавлен владельцем в Google Cloud → APIs & Services → Credentials → Web client → Authorized redirect URIs.
- PWA: `manifest.webmanifest`, `sw.js` (сеть в приоритете, кэш только без интернета; Firebase не кэширует), иконки `icon-*.png`, `apple-touch-icon.png`.
- Firebase JS SDK 10.12.2 подключается из `https://www.gstatic.com/firebasejs/...`.
- Firebase-проект `vsmske`: Authentication (почта+пароль и Google) и Firestore.
- Хостинг: GitHub Pages, адрес `https://nlponae269.github.io/vsmske/`.
  Домен `nlponae269.github.io` добавлен в Firebase → Authentication → Authorized domains.
- Тариф Firebase Spark (бесплатный, карта не привязана). **Firebase Storage не используется** (он требует тариф Blaze).
  Все фото и файлы хранятся в Firestore:
  - фото сжимаются в браузере в dataURL JPEG (документ Firestore должен быть меньше 1 МБ);
  - файлы Диска и видео режутся на куски по 700 000 символов base64 в `files/{id}/chunks/{0000..}`.
- **Адреса без решётки (6.9):** `/feed`, `/video`, `/music/stats`, `/live/<id>`, `/@ник` (на GitHub Pages — `/vsmske/video` и т. д.). Код: `BASE` (папка сайта из `import.meta.url`), `curRoute()` (что после `BASE`),
  `go(маршрут)` (`history.pushState` + `route()`), `goReplace()`, `siteUrl(маршрут)` (полная ссылка для «скопировать»/QR), событие `popstate`. В шаблонах по-прежнему можно писать `href="#video"` —
  `fixLinks()` (MutationObserver) тут же заменяет на `BASE + 'video'`, а обработчик кликов открывает такие ссылки без перезагрузки. Старые ссылки с решёткой (`/#video`, `…/#music/t_x` в старых записях)
  превращает `legacyHash()` (кроме `#id_token` от Google). GitHub Pages про глубокие адреса не знает: `404.html` перекидывает `/vsmske/video` → `/vsmske/?/video`, а скрипт в начале `index.html`
  возвращает адрес и ставит `<base href>` (чтобы стили и скрипты находились на любой глубине). Адрес возврата Google (`GOOGLE_BACK`) — всегда корень сайта `BASE`. Новые страницы — как раньше:
  добавь ветку в `route()`; `href`/`go()` пиши без «/» в начале. Для локальной проверки нужен сервер, который на неизвестные адреса отдаёт `index.html` (или `404.html`, как GitHub Pages).
- 7.0 (правила не менялись): **ВС Клипы** `/clips[/<id>]` — те же `videos` в ленте на весь экран со scroll-snap (`viewClips()`, `.clips` поверх всего). Страницы по `CLIP_PAGE`=16 через `startAfter` (`loadClips()`, первый — клип из адреса),
  играет только видимый ролик (IntersectionObserver в `clipsMount()`; `clipActivate()` меняет адрес через `history.replaceState`, дальние ролики выгружаются), звук — `S.clipMuted`, двойной тап — `clipLike(id, true)` (только ставит),
  клавиши ↑ ↓ / j k / пробел / m / Esc. Ленту `render()` не пересоздаёт (ключ `clipsKey()`), а окна поверх неё рисует отдельно в `#clipsOv` (`clipsOvHtml`).
  **ВС Видео 2.0**: `viewVideo()` — вкладки Главная / Клипы / Мои видео, большой ролик `.vhero`, полка клипов, «Популярное за месяц», сетка `videoCard()`; загрузка — за кнопкой «Добавить» (`S.videoAdd`, `videoAdder()`).
  На странице ролика `watchInfo()` (описание сворачивается, `S.vdescOpen`) и «Дальше» с тумблером автовоспроизведения (localStorage `vs_vauto`, по умолчанию вкл.): после конца — плашка `.vnext` с отсчётом 5 с (`vNextTimer`).
  Плавные переходы: `navRoute()` оборачивает `route()` в `document.startViewTransition` (кроме клипов и выключенных анимаций); у постоянных частей (`.md-rail`, `.md-top`, док, мини-плеер) свои `view-transition-name`.
  `loadingBox()` рисует скелетоны `.sk-*` вместо крутилки. Разметка текста — `tagify()` поверх старого `tagify0()` (регулярка `FMT_RE`): `**жирный**`, `*курсив*`, `~~зачёркнутый~~`, `||спойлер||` (`.spoiler`, `data-act="spoiler"`),
  `` `код` `` (`.icode`) — в записях, комментариях и сообщениях; в базе лежит исходный текст. Кнопка «Aa» в `composer()` (`fmtBtn()`/`fmtPanel()`, `S.fmt`, `fmtWrap()`),
  Ctrl/⌘+B и Ctrl/⌘+I в полях записи, комментария и сообщения; открытые спойлеры помнит `spoilersOpen`, превью (список чатов, сигналы, уведомления браузера) чистит `plainText()`. Двойной тап по фото записи — `togglePostLike(id, true)` + `tapHeart()` (одиночный тап открывает фото через 300 мс, `imgTap`).
  Чаты: обои `WALLS` (localStorage `vs_walls` = `{ключ диалога: обои, '*': для всех}`, панель `wallPanel()` по кнопке 🎨 — `S.wallPick`, класс `wall wall-<имя>` на `.msgs`), свайп сообщения вправо — ответ (`replyToMsg()`),
  в поле ввода микрофон, пока пусто, и «отправить», когда есть текст (класс `has-text` на `.chat-form`). Окно «Что нового» — `whatsNewModal()` (`WN_VER`, `WN_ITEMS`, localStorage `vs_seen_ver`):
  один раз после обновления и только аккаунтам старше суток; ещё есть пункт в быстром поиске. Стили 7.0 — в конце `style.css`.
- 8.0 (правила изменены — владелец вставляет новый `firestore.min.rules`): **звонки один на один** (`callStart()`/`callPick()`/`callEnd()`, состояние `CALL`, экран `#callBox` вне `#app` — `callDom()`;
  звонок — запись `streams` с `mode: 'call'` и `to`, позвать — уведомление `type: 'call'` (`callCheck()` в слушателе уведомлений, свежее 45 с), трубку берёт тот, кому звонят: заявка `peers` с offer, звонящий отвечает answer;
  «Отклонить» — offer `'no'`; конец — `{t:'end'}` по каналу данных, в переписку пишется «📞 Звонок · 1:23»/«Пропущенный»; звонки отфильтрованы из ВС Эфира). «Слушать вместе» в звонке — `togetherToggle()`: ведущий раз в 1,5 с шлёт `{t:'mus', id, pos, paused}`.
  **Комментарии к видео и клипам** `videos/{id}/comments` (шторка `vcmtSheet()`, `S.vcmt`, счётчик — `getCountFromServer`, `cmtCount`) и **просмотры** `videos.views` (+1 раз за заход, `countView()`; в клипах — после 2 с).
  **Истории 2.0**: редактор `storyEditor()` — надписи и стикеры `S.storyDraft.items` двигаются пальцем и «впекаются» в JPEG (`storyBurn()`); ответ и реакция на чужую историю — сообщение в личку с маленькой копией (`storyReply()`, `storyThumb()`).
  **Голосовые 2.0**: волна (`voicePeaks`, RMS по `decodeAudioData`), скорость `vs_vspeed`, позиция `vs_vpos`, перемотка тапом по волне (`vseek`). **Видеокружки**: `vnoteOpen()`/`vnoteGo()` — до 20 с, `messages.audio` = `data:video/webm…`
  (правило audio теперь `^data:(audio|video)/`), `<video>` кружков переживают `render()` (`vnoteEls`, `vnoteMount()`).
  **Подсказки @ и #** при наборе (`acFind()`, `#acPop`), **черновики** `vs_drafts` и **отложенные записи** `vs_sched` (только текст, публикует `schedTick()` раз в 20 с, пока сайт открыт) — кнопка 🗂 в `composer()` (`draftsPanel()`).
  **Папки, закреп и архив диалогов** (`CHAT_FOLDERS`, `vs_chatpins`, `vs_chatarch`, меню `S.chatMenu`). **Поиск по сайту** `/search/<запрос>` (`viewSearch()`, данные `SRCH` раз в 5 минут, верхнее поле поиска ведёт сюда).
  **Готовые темы** `THEMES` (дизайн + цвет + тема + обои), поделиться — ссылка `/theme/<код>` (`themeCode()`/`themeParse()`, предложение в настройках `S.themeOffer`). **Уровень** профиля `levelOf()` и все достижения `allBadges()` (считаются на лету).
  В правилах ради места: общий `cmtOk()`, функции `post()`, `file()`, `meAfter()`, `privOk()`, `streamOwner()`, `videoOwner()`, `toUser()`, `coverOk()`, `trackOk()`, `lotOk()`, `eventOk()`, `videoOk()` (склейку `allow` через `||` убрали — вдруг консоль её не принимала).
- Маршруты (раньше писались с «#»; сейчас те же, но без него): `#feed`, `#id/<uid>`, `#im/<uid>`, `#friends`, `#people`, `#edit`,
  `#video`, `#video/<id>`, `#videos/<uid>`, `#albums/<uid>`, `#album/<id>`, `#disk`, `#vid`, `#settings`, `#more`,
  `#post/<id>` (одна запись), `#notif` (уведомления), `#clubs` (сообщества), `#club/<id>` (сообщество), `#admin` (админ-панель, только для админов),
  `#guests` (гости страницы), `#tag/<тег>` (записи с хэштегом), `#im/g_<id>` (беседа),
  `#apps` (все сервисы), `#answers[/<раздел>|/mine]`, `#q/<id>`, `#mail[/in|/sent|/new|/<id>]`, `#notes`, `#weather`, `#games[/2048|/ttt]`,
  `#music[/my|/all|/<uid>]`, `#market[/<раздел>|/mine]`, `#lot/<id>`, `#@<ник>` (страница по нику — так выглядит адрес профиля: `prettyUrl()` заменяет `#id/<uid>` на `#@ник`; старый `#u/<ник>` перекидывает сюда), `#saved` (закладки),
  `#events`, `#event/<id>`, `#rates`, `#radio`, `#horo`, `#games/snake|mines|memory|sudoku`, `#timer`, `#calc`, `#dice`, `#live[/<эфир>]`, `#clips[/<клип>]`, `#search[/<запрос>]`, `#theme/<код>`, `#music/stats|mix|friends|offline|a_<исполнитель>|t_<трек>`. `#im/<свой uid>` — «Избранное» (чат с самим собой, id `uid_uid`).
- Рендер: функция `render()` целиком перерисовывает `#app` через innerHTML, а значения полей ввода сохраняются между перерисовками.
  Исключения — страница видео: там обновляются только части страницы, чтобы плеер не перезапускался (см. `playerKey`), и Клипы (`clipsKey`, окна — в `#clipsOv`).

## Android-приложение (папка `android/`)
**3.0 — по просьбе владельца («супер красиво», всё с сайта, размер до 500 МБ можно). 3.1 — версия для планшетов: при ширине от 600 dp боковая панель `SideRail` вместо нижней, содержимое до 880 dp по центру, плеер до 640 dp (`Root.kt`, `PlayerScreen.kt`).**
**3.2 (владелец попросил «придумай сам и сделай без багов», правила Firestore не менялись):** ревизия 3.0 (жесты с `rememberUpdatedState`, эффекты по id, порядок закрытия WebRTC, квота);
`data/Markup.kt` — разметка как `tagify()`/`linkify()` сайта (`Piece`, `Markup.parse/plain/mentions`, тесты `MarkupTest`), `ui/RichText.kt` — `RichText()` (спойлеры, #тег → `tag/{tag}`,
@ник → профиль через `usernames`, ссылки на свой сайт — `siteRoute()` внутри приложения), `FormatBar`/`wrapMark` в новой записи, `Api.notifyMentions` (тип `mention`);
голосовые — `music/VoiceRec.kt` (AAC 32 кбит/с до 60 с → `data:audio/mp4`, `Api.sendMessage(audio, dur)`), панель `VoiceRecBar` в чате; закладки (`users.saved`, `Api.toggleBookmark`,
`SavedScreen`), поиск `SearchScreen` (`search`), правка своего трека `TrackEditSheet` (название, исполнитель, обложка, текст; поиск в LRCLIB `Media.searchLyrics`),
статистика прослушиваний на телефоне (`Music.topPlayed()`, prefs `plays`), «Микс дня» `dayMix()` и «Чаще всего слушаю», значки типов в сигналах, окно «Что нового» (`WhatsNew.kt`, prefs `seen_ver`).
**3.3:** тема `ThemePref` (prefs `theme` = system|light|dark, Меню → Настройки; значки строки состояния под тему, на тёмных экранах — `DarkSystemBars()`);
чаты — поиск, закрепление долгим нажатием (prefs `chatpins`), кнопка «Избранное», ответ свайпом вправо по сообщению; кольцо историй на аватарке профиля (просмотр и «Ещё история»).
**3.4:** сообщества — `ClubsScreens.kt` (`ClubsScreen` `clubs`, `ClubScreen` `club/{id}`, `GroupAvatar`, кэш `Groups` и подпись `GroupLabel` у записей), данные `Group` в Models,
`Media.groupsQuery/groupsByIds/setSubscribed/createGroup` (подписка — пачка `users.groups` + `membersCount` ±1, как на сайте), запись от админа — `Composer(wall, group = true)` → `groupId`;
защита от вылетов: битые ID3-теги, повторяющиеся треки в плейлисте (ключи строк с номером).
**3.5:** беседы — `Api.createRoom(name, ids)` (id `g_…`, «Беседа создана», как на сайте), `Api.leaveRoom`, шторка `NewRoomSheet` (кнопка в «Чатах»), выход из беседы в шапке чата (не владельцу).
**3.6:** правка своей записи (`Api.editPost` — text, tags, editedAt); `ServicesScreens.kt` — ВС Заметки (`notes`, `Api.notesQuery/saveNote/deleteNote`, цвета как на сайте), Погода (`weather`, Open-Meteo,
город в prefs `weather_city`), Курсы (`rates`, cbr-xml-daily.ru, конвертер); вход через Google — `Api.signInGoogle` (Credential Manager → idToken web-клиента `GOOGLE_CLIENT` → `signInWithCredential`).
Чтобы вход через Google работал, в Google Cloud → Credentials нужен OAuth-клиент типа Android: пакет `ru.vsmske.app`, SHA-1 `94:74:DA:67:A3:F1:1D:47:10:8B:78:3D:5E:D2:F9:BB:81:B3:35:93` (ключ `vsmske.jks`).
**3.7:** ВС Радио (`radio`, станции сайта; трек с `type = "radio"` и `fileId` = адрес потока — `Music.item()` берёт его напрямую, без статистики, в плеере «Прямой эфир» без ♡/плейлистов);
ВС Маркет (`MarketScreens.kt`: `market`, `lot/{id}`; `Lot`, `Media.MKT_CATS/marketQuery/createLot/setSold/deleteLot`); ВС События (`EventsScreens.kt`: `events`, `event/{id}`; `Event`,
`Media.eventsQuery/createEvent/toggleGoing/deleteEvent`, дата и время — DatePicker/TimePicker M3). **3.8:** ВС Почта (`MailScreens.kt`: `mail`, `mail/{id}`, `MailCompose`; входящие — `Store.mailIn`, значок в Меню и на вкладке; `Api.sendMail/markMailRead/deleteMail` — как на сайте),
ВС Ответы (`AnswersScreens.kt`: `answers`, `q/{id}`; `Api.Q_CATS/questionsQuery/ask/answer/likeAnswer/bestAnswer/deleteAnswer/deleteQuestion`, уведомления `answer`/`best` ведут на вопрос),
гости страницы (`Api.recordGuest` раз в 30 мин на страницу, prefs `guest_<uid>`; экран `GuestsScreen`), сервисы без базы `ToolsScreens.kt` — `games/2048`, `calc`, `timer`, `dice`
(логика в `data/Games.kt`: `Calc.eval/fmt`, `G2048`; тесты `GamesTest`); Меню разложено по разделам (`MenuSection`). Правила не менялись. **3.9 (без интернета):** `data/Net.kt` — `Net.online` (ConnectivityManager); в `Store` фаза `Offline` (ошибка или «нет документа» из кэша — это не новый аккаунт, ждём сервер); `Root` при Loading/Offline/SignedOut без сети показывает `OfflineScreen` (свой NavHost: 2048, Калькулятор, Таймер, Жребий), в приложении — плашка `OfflineStrip` над нижней панелью и экран `offline`. **3.10:** загрузка треков — только админам (кнопка в Музыке при `me.admin`, как на сайте 9.4); игры `GamesScreens.kt` — `games/ttt` (крестики-нолики против телефона, лёгкий/сложный — `Ttt.ai`, счёт в prefs `ttt_*`) и `games/mines` (Сапёр, 3 уровня, первая клетка без мины, флажки долгим нажатием или режимом, «аккорд» по цифре, рекорды `mines_best_<уровень>`); логика `Ttt`/`Mines` в `data/Games.kt`, тесты в `GamesTest`; обе игры есть и на экране без сети. **3.11–3.12:** «ВС Клипы» выросли в отдельное приложение (сборка clips), в VСмске клипов нет: `nav.openClips(id)` (`ClipsGate.kt`) показывает окно «Клипы в этой версии недоступны» с «Скачать APK» (или «Открыть ВС Клипы», если установлены — `<queries>` в манифесте, extra `clip`). **3.13: «ВС Клипы» — отдельный закрытый проект** (приватный репозиторий `nlponae269/vsclips`, ключ подписи тот же); их код отсюда убран, flavors больше нет. APK — `ClipsGate.APK` = `https://storage.yandexcloud.net/vsclips-video/app/VSClips.apk` (кладёт автосборка «ВС Клипов»). Клипы «ВС Клипов» лежат в хранилище Яндекса: в базе это `videos` с `source: 'link'`, `provider: 'direct'`, `vid` = ссылка на бакет (иногда с фрагментом `#s=<звук>`) — `Video.stored`/`Video.fileUrl`, `isClip()` их учитывает, VСмске их показывает и проигрывает. Сохранённые клипы — `users.saved` с приставкой `clip_` (`Media.CLIP_SAVE`; `SavedScreen` их отфильтровывает). Звук старых клипов в Firestore — `videos.vid` = `t:<трек>`/`v:<клип>`. **3.12 — сильное сжатие:** всё пережимается на телефоне перед загрузкой (`music/ClipMedia.kt`, Media3 Transformer): видео — короткая сторона 480, H.264 ~600 кбит/с, AAC 64 кбит/с (минута ≈ 5 МБ; `compressVideo`, ВС Видео до `VIDEO_MAX_SEC` = 240 с, чтобы влезть в 20 МБ правил), треки — AAC 128 кбит/с `.m4a` (`compressAudio` в `Upload.upload`, исходник до 60 МБ; если не вышло — грузится оригинал), фото — WebP вместо JPEG (`Images.fromBitmap`; сайт и правила WebP принимают). Удаление: `Media.deleteVideo` — комментарии, видео, файл (хозяин или админ); `Media.cleanupStaleUploads()` при входе. 2.0 написано с нуля (код 1.x не используется). Без прямой просьбы приложение не трогаем.
Нативное приложение (Kotlin + Jetpack Compose, Material 3), не обёртка над сайтом. Та же база Firebase; документы пишутся **ровно в том виде, что у сайта**
(правила Firestore для приложения не менялись). Если меняешь формат записи на сайте — поправь и `data/Api.kt` / `data/Media.kt`.
- `data/Fire.kt` — подключение настройками веб-приложения (без google-services.json), `-Pemu=true` — эмуляторы 10.0.2.2:8080/9099 (только для проверки).
- `data/Models.kt` — модели из документов (User, Post, Comment, Chat, Message, Track, Notif, FriendRequest, Video, Album, Photo, DiskFile, Story, Stream, Playlist, Gift);
  `User.masked()` — «Deleted Account» для забаненных (как на сайте).
- `data/Store.kt` — сессия (`Phase`: Loading/SignedOut/NeedProfile/Ready), живые слушатели (мой профиль, чаты, сигналы, заявки), кэш людей `users` + `need(ids)`.
- `data/Api.kt` — записи, лайки, комментарии, друзья, сообщения, треки, «сейчас слушает», профиль (с `cover`); `data/Media.kt` (3.0) — видео (файл/ссылка, лайки, просмотры,
  комментарии), альбомы (`photos` + `photoFull` одной пачкой), Диск (`files` kind `disk`), истории, плейлисты, Поток (`streamPage`), подарки (`GIFTS`), репост, эфиры;
  `data/Files.kt` — файлы кусками по 700 000 (`DISK_MAX` 10 МБ, `VIDEO_MAX` 20 МБ); `data/Lyrics.kt` — разбор LRC 3.0 (несколько тайм-кодов, `[offset]`, слова `<мм:сс>`,
  оценка конца строки, паузы-«проигрыши»); `data/Text.kt` — `buildSearch`, `extractTags`, `ago`…; `data/Images.kt` — dataURL JPEG.
- `music/` — `FileSource` (`vsmske://file/<id>` → куски склеиваются в файл в кэше; так же играются видео), `PlaybackService` (Media3, фон и шторка, свой `DefaultAudioSink`
  с `EqProcessor`), `Eq.kt` — эквалайзер как на сайте (10 полос ±12 дБ, басы 0–12 дБ, пресеты, запас громкости и мягкий лимитер; SharedPreferences `vs` → `eq`),
  `Music` (очередь, скорость `rate`/`pitch`, таймер сна с затуханием, «играть следующим», `smooth()` — позиция для плавного текста), `Upload` (теги ID3v2 + cp1251).
- `rtc/` (3.0) — WebRTC (`io.getstream:stream-webrtc-android`), протокол сайта без изменений: `Rtc.kt` (те же ICE, SDP без trickle, `trim()` под предел правил 16 000),
  `Live.kt` — эфир: стример с камеры отдаёт до 3 зрителям, зритель в приложении берёт видео у узла `nodes` и дальше не передаёт (cap 0); чат/счётчик по каналу данных;
  `Call.kt` — звонки 1:1 (входящие — по уведомлению `call` из `Store.notifs`, `Call.watch()` в MainActivity), «Слушать вместе» (`tog`/`mus`), запись итога в переписку.
- `ui/` — Material You 3.0: `Theme.kt` (динамический цвет, шрифт Onest, логотип Unbounded), `Shapes.kt` (фигуры Expressive: «печенька» `CookieShape`, `ExpressiveLoader`),
  `Kit.kt` (аватар, скелетоны, пустые экраны, плитки). Нижняя панель (`Root.kt`): Лента, Видео, Музыка, Чаты, Меню. Экраны: лента с историями (`StoriesScreens`), «Сейчас в эфире»,
  репостом и двойным тапом; профиль с обложкой `COVERS`, подарками и кнопками звонка; `VideoScreens` (главная, просмотр ExoPlayer/встроенный YouTube·Rutube·VK, загрузка),
  `ClipsScreen` (вертикальная лента), `AlbumsScreens` (+ Диск), `RtcScreens` (эфиры, комната, экран звонка `CallOverlay`), `MusicScreens` (главная как на сайте, списки, плейлисты),
  `MenuScreen` (все разделы, настройки), `PlayerScreen` + `PlayerSheets` (эквалайзер, скорость, сон, в плейлист), `LyricsView` — текст песни 3.0: по умолчанию как в Apple Music
  (заливка по словам мягким краем каждый кадр, строки едут «волной» на пружинах, размытие дальних, точки в паузах, свободная прокрутка пальцем), «Обычный» — по центру
  (SharedPreferences `vs` → `lyr_style` = `apple` | `plain`).
- Сборка: GitHub Actions (`.github/workflows/android.yml`) при изменении `android/` в main собирает APK и кладёт в релиз с тегом `android`
  (ссылка `releases/download/android/VSmske.apk` — кнопка «Скачать APK» на сайте). Перед каждым изменением поднимай `versionCode`/`versionName` в `android/app/build.gradle.kts`.
- Ключ подписи `android/app/vsmske.jks` лежит в репозитории намеренно (ставится не из Google Play; обновление требует того же ключа).
- Сборка локально: `cd android && ./gradlew assembleRelease testReleaseUnitTest` (JDK 17+, Android SDK). Владелец просил не гонять эмулятор — проверяет приложение сам.

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
`notes` (ВС Заметки: личные, `ownerId`, `title`, `text`, `color`, `pinned`),
`tracks` (ВС Музыка: `ownerId`, `title`, `artist`, `fileId` → `files` с `kind: 'music'`, `duration`; `users.tracks` — добавленные себе чужие треки),
`events` (ВС События: `title`, `text`, `place`, `at`, `cover`, `going[]`),
`playlists` (ВС Музыка 6.3: свои плейлисты), `streams` + `streams/{id}/peers|nodes` (ВС Эфир 6.8; с `mode: 'call'` — звонки 8.0), `videos/{id}/comments` (8.0), `gifts` (подарки: `from`, `to`, `gift` — ключ из `GIFTS`, `text`), `market` (ВС Маркет: `title`, `price`, `category`, `city`, `text`, `image`, `sold`).
Плеер музыки (`player`) живёт вне `#app` и играет при переходах; панель — `musicBar()`.
Поля 3.1: `tracks.lyrics` (текст песни до 20 000 символов, строки LRC `[мм:сс.сс]` дают синхронизацию — `parseLyrics()`, `syncLyrics()`)
и `tracks.cover` (обложка, dataURL до 300 000). Меняет только автор трека. Полноэкранный плеер — `fullPlayer()` (`S.fullPlayer`, открывается
по нажатию на мини-панель), повтор (`player.repeat`: off/all/one, localStorage `vs_repeat`) и перемешивание (`vs_shuffle`).
Вид текста песни (3.4–3.5): кнопка «Aa» открывает окно выбора `lyrPicker()` из 12 видов `LYRS` (localStorage `vs_lyrstyle`; `ya` — обычный, остальные — `apLyrics()` с классом `ly-<ключ>`,
слова в `.w` с долей строки `data-f` — для «слово за словом», `LYR_ANCHOR` — где держать текущую строку; `ap` — как в Apple Music:
строка заливается по мере пения `lyrApFill()` кадр за кадром `lyrLoop()`, дальние строки размыты `--d`, текст едет `lyrApMove()`, проигрыши — точки).
Поиск текста (3.6): автор трека жмёт «Найти текст» — `findLyrics()` ищет в бесплатной открытой базе LRCLIB (`lrclib.net/api/search`, без ключа, CORS открыт;
сначала по `track_name`+`artist_name`, потом по строке `q`), версия с тайм-кодами той же длины (±3 с) подставляется сама (`lyrTake()`), остальные — списком;
`shiftLrc()` сдвигает все тайм-коды.
Загрузка трека открывает окно `trackFormModal()` (`S.trackForm`): название, исполнитель и обложка берутся из тегов MP3 (`readTags()`: ID3v2.3/2.4 TIT2/TPE1/APIC и ID3v1,
старые русские теги читаются как cp1251), иначе из имени «Исполнитель - Песня»; всё можно поправить. Обложка ставится отдельной правкой трека после создания
(правило create её не принимает). Карандаш ✏️ в списке и в плеере открывает то же окно для правки. Сохраняется как обычный `tracks.lyrics` — правила не менялись.
Плеер 2.0 (5.1): файл трека декодируется отдельно (`analyzeTrack()`: OfflineAudioContext 11 кГц моно → `audioData` с `peaks` для волны, `env` для «дыхания» обложки
и `pcm` для спектра `spectrumAt()` через своё БПФ на 512 точек), звук при этом идёт обычным `<audio>` (радио с чужих серверов так тоже играет; у радио спектр — имитация).
Цвета фона берутся из обложки (`coverPalette()` → `--c1..--c3` на `.fp`). Один цикл `fpLoop()` рисует волну `#fpWave` (поверх неё прозрачный `#fpSeek`),
визуализатор «Винил» `#fpViz` и масштаб обложки. Режимы главной области: обложка / текст (`S.fpLyrics`) / `S.fpMode` = `viz` | `queue`; шторки `S.fpSheet` = `more` | `speed` | `sleep`.
Скорость `player.rate` и «сохранять тон» `player.pitch` (localStorage `vs_rate`, `vs_pitch`; slowed = 0.85 без тона, speed up = 1.25), громкость `vs_vol`,
таймер сна `player.sleep` (`{at}` или `{end:true}`, последние 10 с — плавное затухание). Жесты: свайп по обложке — соседний трек, вниз — свернуть, вверх по мини-плееру — развернуть.
Клавиши в открытом плеере: пробел, ← → (±5 с, с Shift — трек), ↑ ↓ громкость, M — без звука. На широком экране плеер в две колонки.
@упоминания в записях и комментариях дают уведомление `mention` (`notifyMentions()`); цвет оформления — `data-accent` на `<html>` (localStorage `vs_accent`).
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
Поля 3.0: `users.emoji` (эмодзи-статус у имени), `users.listening` (`{title, artist, at}` — «сейчас слушает», пишет плеер; выключается в настройках, localStorage `vs_listen`).
ВС Курсы — cbr-xml-daily.ru (бесплатно, без ключа); ВС Радио — потоки hostingradio.ru в общем плеере (`RADIO`); ВС Гороскоп — шуточный, без базы.
Дизайн 3.0 — отдельный слой в конце `style.css` («РЕДИЗАЙН»); профиль админа (`.admin-card`) из него исключён через `:not(.admin-card)`.
Поля 3.2 — коллекционные юзернеймы: `usernames/{ник}.col: true`. Выпускает только админ (себе или любому, от 1 символа) в админ-панели;
владелец может подарить его (меняется `uid`), сделать основным (`users.nick` без новой записи) или отказаться. Основной ник подарить и удалить нельзя.
Обычный человек занимает ник от 4 символов (`NICK_RE`), админ — от 1 (`NICK_ANY`); старые ники из 3 символов остаются. Коллекция на профиле —
запрос `usernames where uid ==`. Уведомление о подарке — тип `nick`.
Анимации 3.3: `animate()` в конце `render()` ставит класс `a-in` (появление) и `pop` (прыжок сердечка/счётчика) только тому, что появилось впервые
(ключ — класс + data-id/href/текст; при смене страницы ключи сбрасываются), перерисовка посреди анимации продолжает её отрицательной задержкой.
Окна (`ANIM_ONCE`) анимируются при каждом открытии. Выключается в настройках (localStorage `vs_anim`, `data-anim="off"` на `<html>`) и системной настройкой «уменьшить движение».
Дизайн 5.0 «Фиолетовое стекло» (Liquid Glass, `glass.css`, `syncGlass()`/`lensMap()`, шарики `.orbs`) удалён в 8.0 — вместо него дизайн «Газета» (`paper.css`). В Android-приложении стекла тоже нет (2.0, Material You).
Поля 2.1: `messages.edited` (сообщение исправлено), `users.saved` (закладки, id записей, до 500).
Хранится не больше `NOTIF_KEEP` уведомлений на человека: лишние удаляет клиент получателя (запрос без orderBy, чтобы не нужен был индекс).

Составные индексы (созданы в консоли):
- `posts`: authorId ASC + createdAt DESC;
- `posts`: wallId ASC + createdAt DESC;
- `chats`: members ARRAY_CONTAINS + lastAt DESC.

Остальные запросы специально написаны так, чтобы не требовать новых индексов (сортировка на клиенте).

## Правила безопасности
Действующие правила вставлены вручную в консоли Firebase (Firestore → Rules), их копия лежит в `firestore.rules`.
Если меняешь структуру данных, обнови этот файл и напомни владельцу вставить его в консоль и нажать Publish.

**В консоль вставляется `firestore.min.rules`**, а не `firestore.rules`: вставка с телефона обрезает текст после 20 000 символов.
Правь только `firestore.rules`, потом запускай `python3 tools/minify-rules.py` (сокращает имена функций и параметров, склеивает строки, убирает `signed()` там, где следующая проверка и так требует входа) (он пересобирает `firestore.min.rules`
и ругается, если вышло больше 19 600 символов — жёсткий предел вставки 20 000) и прогоняй тесты на обоих файлах (`RULES_FILE=firestore.min.rules`).
Владельцу давай ссылку на raw-файл `firestore.min.rules` или страницу с кнопкой «Скопировать».

Защита (2.1): картинки в базе — только загруженные фото `data:image/(jpeg|png|webp|gif);base64,…` (`imgOk()`),
аватар ещё может быть фото Google (`photoOk()`); цвет — `#RRGGBB` (`colorOk()`); в профиле только известные поля (`keys().hasOnly`).
На сайте аватар показывается через `safePhoto()`, а всё, что пришло от пользователей, — через `esc()`/`linkify()`.

Правила строгие: для каждой коллекции перечислены допустимые поля (`keys().hasOnly`) и их размеры,
лайки можно менять только на себя, друзья — только по заявке, ник — только вместе с профилем в одной пачке.
Поэтому **любое новое поле или новая запись в `app.js` требует правки `firestore.rules`**, иначе будет `permission-denied`.

Проверка правил в эмуляторе (для Claude, владельцу не нужна; нужны Node.js и Java):
`cd tests && npm i && npx firebase emulators:exec --only firestore --project demo-vsmske "node --test"`.
При изменении правил или записей в `app.js` добавляй тест в `tests/rules.test.mjs` и запускай его.

## Как владелец обновляет сайт
Владелец работает **с планшета**, без терминала: загружает файлы на GitHub через браузер (Add file → Upload files).
- При каждом изменении `app.js` или стилей поднимай версию в `index.html`
  (`app.js?v=X.Y`, `style.css?v=X.Y`, `warm.css?v=X.Y`, `material.css?v=X.Y`, `paper.css?v=X.Y`, `player.css?v=X.Y`) и константу `VERSION` в `app.js`, иначе браузер покажет старую копию.
- Объясняй шаги простыми словами, без команд терминала.

## Ограничения
- Видео-файл до 20 МБ, файл Диска до 10 МБ (константа `LIMITS`).
- Бесплатная квота Firestore: 50 000 чтений и 20 000 записей в день, 1 ГБ данных. Не добавляй ничего, что требует платного тарифа.
- Настройки приватности проверяются и в интерфейсе, и в правилах: на чужой стене пишут только друзья
  (и не пишут, если `privacy.wall == 'me'`); при `privacy.messages == 'friends'` новый диалог может начать только друг,
  уже начатый диалог продолжается.
