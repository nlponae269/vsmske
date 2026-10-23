// Подключение Firebase (проект vsmske, тариф Spark). Всё про базу берётся отсюда.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, query, where, orderBy, limit, limitToLast, startAfter,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyADzttkHdFJ1m9hEEaX7Ab84QkBNfHjm_Q',
  authDomain: 'vsmske.firebaseapp.com',
  projectId: 'vsmske',
  storageBucket: 'vsmske.firebasestorage.app',
  messagingSenderId: '195735209722',
  appId: '1:195735209722:web:e9a36c806abeb048edeb43',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
// для проверки на своём компьютере: localStorage.vs_emu = '1' — работаем с локальными эмуляторами, а не с настоящей базой
try { if (localStorage.getItem('vs_emu') === '1') { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); } } catch (e) { }

export const GOOGLE_CLIENT = '195735209722-8tjsd33moqquhreivj07f48l5cga0r3d.apps.googleusercontent.com';
export {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  doc, collection, query, where, orderBy, limit, limitToLast, startAfter,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, increment, getCountFromServer,
};
// документ → обычный объект с id (время сервера, которое ещё не пришло, берём «примерно сейчас»)
export const data = s => ({ id: s.id, ...s.data({ serverTimestamps: 'estimate' }) });
export const uid = () => auth.currentUser?.uid || '';
// понятный текст ошибки
export function errText(e) {
  const c = e?.code || '';
  if (c.includes('permission-denied')) return 'Нет доступа — возможно, это запрещено настройками приватности';
  if (c.includes('unavailable') || c.includes('network')) return 'Нет связи с сервером. Проверьте интернет';
  if (c.includes('email-already-in-use')) return 'Эта почта уже зарегистрирована';
  if (c.includes('invalid-email')) return 'Почта написана с ошибкой';
  if (c.includes('weak-password')) return 'Пароль слишком простой — нужно хотя бы 6 символов';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Неверная почта или пароль';
  if (c.includes('too-many-requests')) return 'Слишком много попыток, подождите немного';
  if (c.includes('popup-closed')) return 'Окно входа закрыто';
  if (c.includes('resource-exhausted')) return 'На сегодня закончился бесплатный лимит базы. Завтра заработает снова';
  return 'Что-то пошло не так. Попробуйте ещё раз';
}
