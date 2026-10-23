// Звонки один на один: голос и видео идут напрямую между устройствами (WebRTC), через базу — только «знакомство».
// Звонок = запись streams { mode: 'call', to }; позвать — уведомление type 'call' (postId = id звонка).
// Тот, кому звонят, отвечает заявкой streams/{id}/peers с offer (его звук и видео), звонящий пишет answer. Отказ — offer 'no'.
import { db, uid, errText, doc, collection, query, where, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp } from './fb.js';
import { S, cache, U, act, render, ensureUsers, avatar } from './core.js';
import { onData } from './auth.js';
import { html, raw, I, ms, fmtDur, toast, esc } from './lib.js';
import { notify } from './posts.js';
import { sendMessage } from './chats.js';

const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] };
const RING_MS = 45000;
let CALL = null;
const seen = new Set();
const box = () => document.getElementById('call') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'call' }));
// отдать SDP целиком, когда соберутся все варианты соединения (или через 2,5 с)
const iceDone = pc => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res();
  const t = setTimeout(res, 2500);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
});
const media = video => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
const send = m => { try { if (CALL?.dc?.readyState === 'open') CALL.dc.send(JSON.stringify(m)); } catch (e) { } };
let wake = null;
const keepAwake = async on => { try { if (on) wake = await navigator.wakeLock?.request('screen'); else { await wake?.release(); wake = null; } } catch (e) { } };

/* ---------- гудки ---------- */
let ringT = 0, ac = null;
function ring(on, incoming) {
  clearInterval(ringT); ringT = 0; if (!on) return;
  const beep = () => { try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime, len = incoming ? 0.8 : 1.1;
    o.frequency.value = incoming ? 880 : 425; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.08);
    o.start(t); o.stop(t + len + 0.1);
  } catch (e) { } };
  beep(); ringT = setInterval(beep, incoming ? 2000 : 4000);
}

/* ---------- позвонить ---------- */
act('call', d => start(d.id, d.v === '1'));
async function start(to, video) {
  if (CALL) return toast('Вы уже в звонке');
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return toast('Этот браузер не умеет звонки — попробуйте Chrome или Safari');
  let local;
  try { local = await media(video); } catch (e) { return toast(e?.name === 'NotAllowedError' ? `Нет доступа к микрофону${video ? ' или камере' : ''} — разрешите в браузере` : `Не получилось включить ${video ? 'камеру' : 'микрофон'}`); }
  let ref;
  try { ref = await addDoc(collection(db, 'streams'), { ownerId: uid(), title: video ? 'Видеозвонок' : 'Звонок', mode: 'call', to, live: true, beat: serverTimestamp(), createdAt: serverTimestamp(), endedAt: null }); }
  catch (e) { local.getTracks().forEach(t => t.stop()); return toast(errText(e)); }
  const C = CALL = { sid: ref.id, host: true, peer: to, video, local, state: 'ring', mic: true, cam: video, min: false, timers: [], unsubs: [] };
  notify(to, 'call', ref.id, video ? 'Видеозвонок' : 'Звонок');
  C.unsubs.push(onSnapshot(query(collection(db, 'streams', ref.id, 'peers'), where('to', '==', uid())), s => s.docChanges().forEach(ch => { if (ch.type === 'added') answer(C, ch.doc); }), console.error));
  C.timers.push(setTimeout(() => { if (CALL === C && C.state === 'ring') end('noanswer'); }, RING_MS));
  ring(true, false); keepAwake(true); draw();
}
async function answer(C, snap) {
  const p = snap.data(); if (!p || CALL !== C || p.uid !== C.peer || C.pc) return;   // трубку берёт только тот, кому звонили
  if (p.offer === 'no') return end('declined');
  C.state = 'connecting'; ring(false); draw();
  const pc = C.pc = new RTCPeerConnection(ICE); wire(C, pc);
  pc.ondatachannel = e => channel(C, e.channel);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: p.offer });
    C.local.getTracks().forEach(t => pc.addTrack(t, C.local));
    await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
    await updateDoc(snap.ref, { answer: pc.localDescription.sdp });
    C.timers.push(setTimeout(() => { if (CALL === C && C.state !== 'live') end('failed'); }, 25000));
  } catch (e) { console.error(e); end('failed'); }
}
function wire(C, pc) {
  pc.ontrack = e => { C.remote ||= new MediaStream(); if (!C.remote.getTracks().includes(e.track)) C.remote.addTrack(e.track); attach(); };
  pc.onconnectionstatechange = () => {
    if (CALL !== C) return;
    const st = pc.connectionState;
    if (st === 'connected' && C.state !== 'live') {
      C.state = 'live'; C.t0 = Date.now(); draw();
      C.timers.push(setInterval(() => { const el = document.getElementById('callT'); if (el) el.textContent = fmtDur((Date.now() - C.t0) / 1000); }, 1000));
    } else if (st === 'failed') end('failed');
    else if (st === 'disconnected') setTimeout(() => { if (CALL === C && pc.connectionState !== 'connected') end('lost'); }, 8000);
  };
}
function channel(C, dc) { C.dc = dc; dc.onmessage = e => { try { if (JSON.parse(e.data).t === 'end' && CALL === C) end('hangup', true); } catch (x) { } }; }

/* ---------- входящий: смотрим свежие уведомления type 'call' ---------- */
onData('notifs', () => {
  for (const n of cache.notifs) {
    if (n.type !== 'call' || n.from === uid() || seen.has(n.id)) continue;
    seen.add(n.id);
    if (Date.now() - ms(n.createdAt) < RING_MS) incoming(n);
  }
});
async function incoming(n) {
  if (CALL) return;   // уже говорим — у звонящего будет «не отвечает»
  let s = null; try { const d = await getDoc(doc(db, 'streams', n.postId)); s = d.exists() ? d.data() : null; } catch (e) { return; }
  if (!s || !s.live || s.mode !== 'call' || s.to !== uid() || s.ownerId !== n.from || CALL) return;
  ensureUsers([n.from]);
  const C = CALL = { sid: n.postId, host: false, peer: n.from, video: s.title === 'Видеозвонок', nid: n.id, state: 'incoming', mic: true, cam: false, min: false, timers: [], unsubs: [] };
  C.unsubs.push(onSnapshot(doc(db, 'streams', C.sid), d => { const x = d.data(); if (CALL === C && (!x || !x.live)) end(C.state === 'live' ? 'hangup' : 'cancelled', true); }, () => { }));
  C.timers.push(setTimeout(() => { if (CALL === C && C.state === 'incoming') end('missed', true); }, RING_MS));
  ring(true, true); try { navigator.vibrate?.([500, 300, 500, 300, 500]); } catch (e) { }
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification(`${U(n.from)?.name || 'Вам'} звонит`, { body: 'VСмске', tag: 'call' }); } catch (e) { }
  draw();
}
act('call-pick', async () => {
  const C = CALL; if (!C || C.host || C.state !== 'incoming') return;
  ring(false); C.state = 'connecting'; draw(); deleteDoc(doc(db, 'notifs', C.nid)).catch(() => { });
  try { C.local = await media(C.video); C.cam = C.video; } catch (e) { toast('Нет доступа к микрофону — разрешите его в браузере'); return decline(); }
  if (CALL !== C) return C.local.getTracks().forEach(t => t.stop());
  const pc = C.pc = new RTCPeerConnection(ICE); wire(C, pc);
  channel(C, pc.createDataChannel('call'));
  C.local.getTracks().forEach(t => pc.addTrack(t, C.local)); attach(); keepAwake(true);
  try {
    await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
    const ref = C.peerRef = await addDoc(collection(db, 'streams', C.sid, 'peers'), { uid: uid(), to: C.peer, offer: pc.localDescription.sdp, createdAt: serverTimestamp() });
    C.unsubs.push(onSnapshot(ref, s => { const p = s.data(); if (p?.answer && !pc.remoteDescription) pc.setRemoteDescription({ type: 'answer', sdp: p.answer }).catch(() => end('failed')); }, () => { }));
    C.timers.push(setTimeout(() => { if (CALL === C && C.state !== 'live') end('failed'); }, 25000));
  } catch (e) { console.error(e); end('failed'); }
});
function decline() {
  const C = CALL; if (!C || C.host) return;
  addDoc(collection(db, 'streams', C.sid, 'peers'), { uid: uid(), to: C.peer, offer: 'no', createdAt: serverTimestamp() }).catch(() => { });
  deleteDoc(doc(db, 'notifs', C.nid)).catch(() => { }); end('', true);
}
act('call-decline', decline);
act('call-end', () => end(CALL?.state === 'ring' ? 'cancelled' : 'hangup'));
act('call-mic', () => { const C = CALL; if (!C?.local) return; C.mic = !C.mic; C.local.getAudioTracks().forEach(t => { t.enabled = C.mic; }); draw(); });
act('call-cam', () => { const C = CALL; if (!C?.local) return; C.cam = !C.cam; C.local.getVideoTracks().forEach(t => { t.enabled = C.cam; }); draw(); });
act('call-min', () => { if (CALL) { CALL.min = !CALL.min; draw(); } });

async function end(why, remote = false) {
  const C = CALL; if (!C) return; CALL = null;
  if (!remote) send({ t: 'end' });
  ring(false); keepAwake(false);
  C.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); C.unsubs.forEach(u => { try { u(); } catch (e) { } });
  setTimeout(() => { try { C.pc?.close(); } catch (e) { } }, 300);
  C.local?.getTracks().forEach(t => t.stop());
  const msg = { noanswer: 'Не отвечает', declined: 'Звонок отклонён', failed: 'Не получилось соединиться', lost: 'Связь пропала', hangup: 'Звонок завершён', cancelled: 'Звонок отменён', missed: 'Пропущенный звонок' }[why];
  if (msg) toast('📞 ' + msg);
  draw();
  const dur = C.t0 ? Math.round((Date.now() - C.t0) / 1000) : 0;
  if (C.host) {
    try {
      await updateDoc(doc(db, 'streams', C.sid), { live: false, endedAt: serverTimestamp() });
      const s = await getDocs(collection(db, 'streams', C.sid, 'peers')); if (s.size) { const b = writeBatch(db); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
    } catch (e) { }
    sendMessage(C.peer, dur ? `📞 ${C.video ? 'Видеозвонок' : 'Звонок'} · ${fmtDur(dur)}` : `📞 ${why === 'declined' ? 'Звонок отклонён' : 'Пропущенный звонок'}`).catch(() => { });
  } else if (C.peerRef) deleteDoc(C.peerRef).catch(() => { });
}
window.addEventListener('pagehide', () => { const C = CALL; if (!C) return; send({ t: 'end' }); if (C.host) updateDoc(doc(db, 'streams', C.sid), { live: false, endedAt: serverTimestamp() }).catch(() => { }); });

/* ---------- экран звонка (вне основной страницы — звонок идёт при переходах по сайту) ---------- */
function attach() {
  const C = CALL; if (!C) return;
  const r = document.getElementById('callRemote'); if (r && C.remote && r.srcObject !== C.remote) { r.srcObject = C.remote; r.play().catch(() => { }); }
  const l = document.getElementById('callLocal'); if (l && C.local && l.srcObject !== C.local) { l.srcObject = C.local; l.play().catch(() => { }); }
}
function draw() {
  const b = box(), C = CALL;
  if (!C) { b.innerHTML = ''; b.className = ''; return; }
  const u = U(C.peer), name = esc(u?.name || '…'), st = C.state;
  const btn = (a, ic, label, cls = '') => `<button class="cb ${cls}" data-a="${a}" aria-label="${label}"><span>${ic}</span><small>${label}</small></button>`;
  const time = st === 'live' ? fmtDur((Date.now() - C.t0) / 1000) : { ring: 'Вызываем…', incoming: C.video ? 'Видеозвонок' : 'Звонок', connecting: 'Соединяем…' }[st];
  b.className = `call ${st} ${C.min ? 'min' : ''} ${C.video ? 'video' : ''}`;
  const remote = C.video ? '<video id="callRemote" class="c-remote" autoplay playsinline></video>' : '<audio id="callRemote" autoplay></audio>';
  if (C.min) {
    b.innerHTML = `<button class="c-pill" data-a="call-min">${avatar(u, 32, false)}<span><b>${name}</b><small id="callT">${time}</small></span></button>${btn('call-end', I.phone, 'Завершить', 'end sm')}${C.video ? remote.replace('<video', '<video hidden') : remote}`;
    return attach();
  }
  b.innerHTML = `<div class="c-in" role="dialog" aria-label="Звонок">${remote}
    <div class="c-who">${avatar(u, 108, false)}<b>${name}</b><span id="callT">${time}</span></div>
    ${C.video && C.local ? '<video id="callLocal" class="c-local" autoplay playsinline muted></video>' : ''}
    <div class="c-bar">${st === 'incoming' ? btn('call-decline', I.phone, 'Отклонить', 'end') + btn('call-pick', I.phone, 'Ответить', 'pick')
      : btn('call-mic', C.mic ? I.mic : I.micOff, C.mic ? 'Микрофон' : 'Выключен', C.mic ? '' : 'off') + (C.video ? btn('call-cam', C.cam ? I.cam : I.camOff, 'Камера', C.cam ? '' : 'off') : '')
        + btn('call-min', I.down, 'Свернуть') + btn('call-end', I.phone, 'Завершить', 'end')}</div></div>`;
  attach();
}
