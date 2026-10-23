// Точка входа: подключаем разделы. Каждый раздел сам регистрирует свои страницы и действия в ядре.
import './core.js';
import './auth.js';
import './posts.js';
import './friends.js';
import './profile.js';
import './chats.js';
import './calls.js';
import './music.js';
import './video.js';
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
