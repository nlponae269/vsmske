// Файлы в Firestore (Storage на бесплатном тарифе нет): файл режется на куски base64 по 700 000 символов в files/{id}/chunks/{0000…}.
import { db, uid, doc, collection, query, orderBy, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp } from './fb.js';
import { readDataUrl } from './lib.js';

const CHUNK = 700000;
const urls = new Map();
// загрузить файл; onProgress(0..1)
export async function uploadFile(file, kind, onProgress = () => { }) {
  const b64 = (await readDataUrl(file)).split(',')[1] || '';
  const n = Math.max(1, Math.ceil(b64.length / CHUNK));
  const ref = doc(collection(db, 'files'));
  await setDoc(ref, { ownerId: uid(), kind, name: file.name.slice(0, 200), size: file.size, type: file.type || '', chunks: n, status: 'uploading', createdAt: serverTimestamp() });
  for (let i = 0; i < n; i++) {
    await setDoc(doc(db, 'files', ref.id, 'chunks', String(i).padStart(4, '0')), { i, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    onProgress((i + 1) / n);
  }
  await updateDoc(ref, { status: 'ready' });
  return ref.id;
}
// получить файл как blob-адрес (кэшируется на время работы страницы)
export async function fileUrl(id, type = 'application/octet-stream') {
  if (urls.has(id)) return urls.get(id);
  const p = (async () => {
    const s = await getDocs(query(collection(db, 'files', id, 'chunks'), orderBy('i')));
    const bin = atob(s.docs.map(d => d.data().data).join(''));
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type }));
  })();
  urls.set(id, p); p.catch(() => urls.delete(id));
  return p;
}
export async function deleteFile(id) {
  const s = await getDocs(collection(db, 'files', id, 'chunks'));
  const b = writeBatch(db); s.docs.forEach(d => b.delete(d.ref)); b.delete(doc(db, 'files', id)); await b.commit();
}
