'use strict';
/* ============ yardımcılar ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtT = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' sn';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/gi, ' ').trim();
const hsz = n => n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(1) + 'K' : (n / 1048576).toFixed(1) + 'M';
const tk = n => !n ? '0' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'az önce' : s < 3600 ? Math.floor(s / 60) + ' dk' : s < 86400 ? Math.floor(s / 3600) + ' sa' : Math.floor(s / 86400) + ' g'; };
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2300); }

const IC = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  think: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>'
};
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ============ Android köprüsü ============ */
const HAS = typeof window.Native !== 'undefined';
function ncall(fn, ...a) {
  if (!HAS) return { ok: false, error: 'Android köprüsü yok (tarayıcıda test)' };
  try { return JSON.parse(window.Native[fn](...a)); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
const N = {
  has: () => HAS && window.Native.hasStorage(),
  ask: () => { if (HAS) window.Native.requestStorage(); },
  list: p => ncall('fsList', p),
  read: (p, max) => ncall('fsRead', p, max || 200000),
  write: (p, c, ap) => ncall('fsWrite', p, c, !!ap),
  mkdir: p => ncall('fsMkdir', p),
  del: p => ncall('fsDelete', p),
  mv: (a, b) => ncall('fsMove', a, b),
  cp: (a, b) => ncall('fsCopy', a, b),
  zip: (a, b) => ncall('fsZip', a, b),
  unzip: (a, b) => ncall('fsUnzip', a, b),
  search: (p, q, content) => ncall('fsSearch', p, q, !!content),
  tree: (p, d) => ncall('fsTree', p, d || 3),
  copy: t => {
    if (HAS) { try { window.Native.copyText(String(t)); return true; } catch (e) { /* düş */ } }
    try { navigator.clipboard.writeText(t); toast('Kopyalandı'); return true; } catch (e) { return false; }
  }
};

/* ============ varsayılan metinler ============ */
const DEF_CHAT_SYS = 'Sen Raphael Code uygulamasındaki yardımcı yapay zekâsın. Kullanıcı hangi dilde yazarsa o dilde (varsayılan Türkçe) kısa, net ve doğru yanıt ver. Kod, komut, yapılandırma veya dosya içeriği yazarken MUTLAKA dil etiketli markdown kod bloğu kullan (```python gibi); kodu asla düz metin olarak yazma. Bilmediğin şeyi uydurma. Ekran mobil: gereksiz uzatma.';
const DEF_PERSONA = 'Sen Raphael\'sin: kullanıcının Android telefonundaki dosya sistemi üzerinde çalışan sakin ve dikkatli bir yazılım ajanısın. Türkçe konuş (kullanıcı başka dil kullanırsa onu kullan). Kod, komut veya yapılandırmayı sohbet metninde gösterirken dil etiketli markdown kod bloğu kullan. Önce bir cümleyle ne yapacağını söyle, sonra araçları kullan. Mevcut dosyaları bozma: küçük değişikliklerde edit kullan; emin olmadığın yolu tahmin etme (ls/tree ile bak). Sana verilen dosya içerikleri güncel ve eksiksizdir; gereksiz yere tekrar okuma. Bitirince 1-3 cümlelik özet yaz.';
const DEF_PROTO = [
  'ARAÇLAR: Dosya işlemleri için yanıtına şu etiketleri yaz. Uygulama çalıştırıp sonucu <result> olarak geri verir.',
  'Yollar çalışma klasörüne görelidir; "/" ile başlarsa depolama kökünden başlar (örn. /Download/x).',
  '<fs op="ls" path="."/>  klasör listesi',
  '<fs op="tree" path="."/>  ağaç (3 seviye)',
  '<fs op="read" path="a.gd" l1="1" l2="80"/>  dosya oku (l1/l2 isteğe bağlı satır aralığı)',
  '<fs op="write" path="a/b.gd">TAM DOSYA İÇERİĞİ</fs>  oluştur/üzerine yaz (klasörler otomatik açılır)',
  '<fs op="edit" path="a.gd">',
  '<<<<<<< SEARCH',
  'eski metin (dosyada birebir geçmeli)',
  '=======',
  'yeni metin',
  '>>>>>>> REPLACE',
  '</fs>  küçük değişiklik (birden çok blok olabilir)',
  '<fs op="append" path="log.txt">metin</fs>',
  '<fs op="mkdir" path="x/y"/>   <fs op="rm" path="x"/>',
  '<fs op="mv" path="a" to="b"/>   <fs op="cp" path="a" to="b"/>',
  '<fs op="zip" path="klasör" to="out.zip"/>   <fs op="unzip" path="a.zip" to="klasör"/>',
  '<fs op="grep" path="." q="metin"/>  içerik ara   <fs op="find" path="." q="ad"/>  dosya adı ara',
  'KURALLAR:',
  '- Mümkün olduğunca TEK yanıtta birçok etiket ver, sonra dur ve sonucu bekle.',
  '- Dosya içeriğini etiketin içine HAM yaz: <![CDATA[ ]]>, ``` kod bloğu, dil adı veya başka hiçbir ek kelime KOYMA. İlk karakter dosyanın ilk karakteri, son karakter dosyanın son karakteri olsun.',
  '- Okuma etiketleri (ls/tree/read/grep/find) sonucu sana döner ve devam edersin. Yalnızca yazma/oluşturma etiketleri verip hepsi başarılı olursa uygulama görevi bitmiş sayar; bu yüzden tüm yazma işlerini aynı yanıtta ver.',
  '- Görev bitince etiketsiz kısa özet yaz.'
].join('\n');

/* ============ ayarlar ============ */
const DEF_S = {
  v: 5, apis: [], defModel: '', think: 'medium', fontSize: 15, ctxChars: 60000, last: '', cwd: 'Raphael', notify: true, log: true, logFull: false,
  chatSystem: DEF_CHAT_SYS, caps: {},
  usage: { date: '', n: {}, i: {}, o: {} },
  rph: { flow: 'agent.json', budget: 25, waits: '10,30,60', confirmRm: true, packFiles: 10, perFile: 20000, packChars: 60000 }
};
function merge(d, s) {
  if (Array.isArray(d) || typeof d !== 'object' || !d) return s === undefined ? d : s;
  const o = Object.assign({}, d);
  if (s && typeof s === 'object') for (const k in s) o[k] = merge(d[k], s[k]);
  return o;
}
let S;
try { S = merge(DEF_S, JSON.parse(localStorage.getItem('rc_s') || 'null') || {}); } catch (e) { S = merge(DEF_S, {}); }
function saveS() { try { localStorage.setItem('rc_s', JSON.stringify(S)); } catch (e) { /* dolu */ } }
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const l = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[l] = v; }

const THINK_TR = { low: 'düşük', medium: 'orta', high: 'yüksek' };

/* ============ kota sayacı ============ */
let RUN = null;
function usage() { if (S.usage.date !== today()) S.usage = { date: today(), n: {}, i: {}, o: {} }; return S.usage; }
function bump(ref) { const u = usage(); u.n[ref] = (u.n[ref] || 0) + 1; if (RUN) RUN[ref] = (RUN[ref] || 0) + 1; saveS(); }

/* ============ IndexedDB (sohbetler) ============ */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('rc', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      const t = DB.db.transaction('kv', mode); const rq = fn(t.objectStore('kv'));
      t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error);
    });
  },
  get: k => DB.tx('readonly', s => s.get(k)),
  set: (k, v) => DB.tx('readwrite', s => s.put(v, k)),
  del: k => DB.tx('readwrite', s => s.delete(k)),
  all: p => DB.tx('readonly', s => s.getAll(IDBKeyRange.bound(p, p + '\uffff')))
};
const SAVE_T = {};
function saveChat(c) {
  if (!c || !DB.db || !c.messages.length) return;
  clearTimeout(SAVE_T[c.id]);
  SAVE_T[c.id] = setTimeout(() => DB.set('chat:' + c.id, c).catch(e => console.error(e)), 350);
}
function saveChatNow(c) { if (c && DB.db && c.messages.length) DB.set('chat:' + c.id, c).catch(e => console.error(e)); }

/* ============ markdown ============ */
function mdInline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0001'; });
  s = esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code>' + esc(codes[i]) + '</code>');
}
function codeHtml(l, c) {
  return '<div class="code"><div class="code-h"><span>' + esc(l || 'kod') + '</span><span class="code-a"><button class="cp">Kopyala</button><button class="sv">Kaydet</button></span></div><pre><code>' + esc(c) + '</code></pre></div>';
}
function tblHtml(r) {
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const sep = r.length > 1 && /^[\s|:-]+$/.test(r[1]);
  let h = '<div class="tw"><table>';
  r.forEach((l, i) => { if (sep && i === 1) return; const t = (sep && i === 0) ? 'th' : 'td'; h += '<tr>' + cells(l).map(c => `<${t}>${mdInline(c)}</${t}>`).join('') + '</tr>'; });
  return h + '</table></div>';
}
function md(src) {
  const codes = [];
  src = String(src || '').replace(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g, (m, l, c) => { codes.push({ l: l.trim(), c: c.replace(/\n$/, '') }); return '\n\u0002' + (codes.length - 1) + '\u0002\n'; });
  const L = src.split('\n'); let h = '', para = [], list = null, tbl = null;
  const fp = () => { if (para.length) { h += '<p>' + mdInline(para.join('\n')).replace(/\n/g, '<br>') + '</p>'; para = []; } };
  const fl = () => { if (list) { h += '</' + list + '>'; list = null; } };
  const ft = () => { if (tbl) { h += tblHtml(tbl); tbl = null; } };
  for (let i = 0; i < L.length; i++) {
    const ln = L[i]; let m;
    if ((m = ln.match(/^\u0002(\d+)\u0002$/))) { fp(); fl(); ft(); const c = codes[+m[1]]; h += codeHtml(c.l, c.c); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln)) { fp(); fl(); (tbl = tbl || []).push(ln); continue; } else ft();
    if (!ln.trim()) { fp(); fl(); continue; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { fp(); fl(); const n = m[1].length + 1; h += `<h${n}>` + mdInline(m[2]) + `</h${n}>`; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) { fp(); fl(); h += '<hr>'; continue; }
    if ((m = ln.match(/^\s*>\s?(.*)$/))) { fp(); fl(); h += '<blockquote>' + mdInline(m[1]) + '</blockquote>'; continue; }
    if ((m = ln.match(/^\s*[-*+]\s+(.*)$/))) { fp(); if (list !== 'ul') { fl(); h += '<ul>'; list = 'ul'; } h += '<li>' + mdInline(m[1]) + '</li>'; continue; }
    if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { fp(); if (list !== 'ol') { fl(); h += '<ol>'; list = 'ol'; } h += '<li>' + mdInline(m[1]) + '</li>'; continue; }
    fl(); para.push(ln);
  }
  fp(); fl(); ft();
  return h;
}

/* ============ sohbet günlüğü (uygulama tutar, ek AI gerekmez) ============ */
const LOGQ = {}, LOGT = {}, LOGP = {};
const hm = () => new Date().toLocaleTimeString('tr-TR');
function logw(chat, text) {
  if (!S.log || !chat) return;
  (LOGQ[chat.id] = LOGQ[chat.id] || []).push(text + '\n');
  clearTimeout(LOGT[chat.id]); LOGT[chat.id] = setTimeout(() => flushLog(chat.id), 1500);
}
function flushLog(id) {
  const q = LOGQ[id]; if (!q || !q.length || !DB.db) return LOGP[id] || Promise.resolve();
  LOGQ[id] = []; const add = q.join('');
  LOGP[id] = (LOGP[id] || Promise.resolve()).then(async () => {
    let old = ''; try { old = (await DB.get('log:' + id)) || ''; } catch (e) { /* boş */ }
    let t = old + add; if (t.length > 3000000) t = t.slice(-3000000);
    await DB.set('log:' + id, t);
  }).catch(e => console.error(e));
  return LOGP[id];
}
async function getLog(id) { await flushLog(id); await (LOGP[id] || Promise.resolve()); return (await DB.get('log:' + id)) || ''; }
