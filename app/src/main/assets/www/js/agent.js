'use strict';
/* ============ yol çözümleme ============ */
let WSO = null; // bu çalıştırma için geçici çalışma klasörü (proje eşleşmesi)
const cwdNow = () => (WSO !== null ? WSO : S.cwd);
function normPath(p) { const o = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') { o.pop(); continue; } o.push(s); } return o.join('/'); }
function rp(p) {
  p = String(p == null ? '' : p).trim();
  if (p === '' || p === '.') return cwdNow();
  if (p.startsWith('/') || p.startsWith('~/')) return normPath(p.replace(/^~?\/(storage\/emulated\/0|sdcard)?/, '').replace(/^(storage\/emulated\/0|sdcard)\/?/, ''));
  return normPath((cwdNow() ? cwdNow() + '/' : '') + p);
}
const TEXT_RE = /\.(txt|md|json|js|ts|jsx|tsx|html?|css|scss|py|kt|java|c|h|cpp|cs|gd|gdshader|tscn|tres|godot|cfg|ini|toml|ya?ml|xml|sh|gradle|properties|lua|rb|go|rs|php|sql|csv)$/i;
const isText = p => TEXT_RE.test(p);

/* ============ <fs> etiketleri ============ */
const fsRe = () => /<fs\b([^>]*?)(?:\/>|>([\s\S]*?)<\/fs>)/g;
function parseAttrs(s) { const o = {}; s.replace(/(\w+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = v; return m; }); return o; }
function fsFromMatch(m) { const a = parseAttrs(m[1]); return { op: a.op, path: a.path || '.', to: a.to, q: a.q, l1: a.l1, l2: a.l2, body: m[2] }; }
function fsParse(text) { const out = []; const re = fsRe(); let m; while ((m = re.exec(text))) out.push(fsFromMatch(m)); return out; }
function stripFs(text) { return String(text || '').replace(fsRe(), '').replace(/<fs\b[\s\S]*$/, '').trim(); }
/* Modeller içeriği <![CDATA[ ]]> veya ``` ile sarabiliyor: dosyaya girmeden temizle */
function stripWrap(t) {
  let x = String(t == null ? '' : t).replace(/^\uFEFF/, '');
  for (let i = 0; i < 3; i++) {
    const y = x
      .replace(/^\s*<!\[CDATA\[[ \t]*\r?\n?/, '').replace(/\r?\n?[ \t]*\]\]>\s*$/, '')
      .replace(/^\s*```[^\n]*\r?\n/, '').replace(/\r?\n```\s*$/, '');
    if (y === x) break; x = y;
  }
  return x;
}
function cleanBody(b) { return stripWrap((b || '').replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '')); }
function applyEdit(src, body) {
  const re = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n?=======\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g;
  let m, n = 0, out = src;
  while ((m = re.exec(body || ''))) {
    const i = out.indexOf(m[1]);
    if (i < 0) throw new Error('SEARCH bulunamadı: ' + m[1].slice(0, 60).replace(/\n/g, '⏎'));
    out = out.slice(0, i) + m[2] + out.slice(i + m[1].length); n++;
  }
  if (!n) throw new Error('SEARCH/REPLACE bloğu yok');
  return { out, n };
}
const hasTrunc = t => /<fs\b/.test(String(t || '').replace(fsRe(), ''));
const WRITE_OPS = new Set(['write', 'append', 'edit', 'mkdir']);
const READ_OPS = new Set(['ls', 'tree', 'read', 'grep', 'find']);
function fmtTree(entries, max = 150) {
  const L = entries.slice(0, max).map(e => e.p + (e.d ? '/' : ' (' + hsz(e.s) + ')'));
  if (entries.length > max) L.push('… +' + (entries.length - max) + ' öğe daha');
  return L.join('\n') || '(boş)';
}

function runOp(c) {
  try {
    const op = c.op; const p = rp(c.path || '.'); const to = c.to ? rp(c.to) : ''; let r;
    const bad = x => ({ ok: false, out: x.error || 'hata' });
    switch (op) {
      case 'ls': r = N.list(p); if (!r.ok) return bad(r);
        return { ok: true, out: r.entries.slice(0, 200).map(e => (e.d ? 'd ' : 'f ') + e.n + (e.d ? '/' : ' (' + hsz(e.s) + ')')).join('\n') || '(boş)' };
      case 'tree': r = N.tree(p, 3); if (!r.ok) return bad(r); return { ok: true, out: fmtTree(r.entries) };
      case 'read': {
        r = N.read(p, 300000); if (!r.ok) return bad(r);
        let t = r.content;
        if (c.l1) { const L = t.split('\n'); t = L.slice((+c.l1 || 1) - 1, +c.l2 || undefined).join('\n'); }
        if (t.length > 14000) t = t.slice(0, 14000) + '\n…[kesildi; toplam ' + r.size + ' bayt. l1/l2 ile satır aralığı iste]';
        return { ok: true, out: t };
      }
      case 'write': { const t = cleanBody(c.body) + '\n'; r = N.write(p, t, false); if (!r.ok) return bad(r); return { ok: true, out: 'yazıldı /' + p + ' (' + hsz(t.length) + ')' }; }
      case 'append': { r = N.write(p, cleanBody(c.body) + '\n', true); if (!r.ok) return bad(r); return { ok: true, out: 'eklendi /' + p }; }
      case 'edit': {
        const rd = N.read(p, 3000000); if (!rd.ok) return bad(rd);
        if (rd.truncated) return { ok: false, out: 'Dosya düzenleme için çok büyük' };
        const e = applyEdit(rd.content, cleanBody(c.body)); r = N.write(p, e.out, false); if (!r.ok) return bad(r);
        return { ok: true, out: 'düzenlendi /' + p + ' (' + e.n + ' blok)' };
      }
      case 'mkdir': r = N.mkdir(p); return r.ok ? { ok: true, out: 'klasör /' + p } : bad(r);
      case 'rm': r = N.del(p); return r.ok ? { ok: true, out: 'silindi /' + p } : bad(r);
      case 'mv': r = N.mv(p, to); return r.ok ? { ok: true, out: 'taşındı → ' + r.path } : bad(r);
      case 'cp': r = N.cp(p, to); return r.ok ? { ok: true, out: 'kopyalandı → ' + r.path } : bad(r);
      case 'zip': r = N.zip(p, to || p.replace(/\/+$/, '') + '.zip'); return r.ok ? { ok: true, out: 'zip → ' + r.path + ' (' + hsz(r.size) + ')' } : bad(r);
      case 'unzip': r = N.unzip(p, to || p.replace(/\.zip$/i, '')); return r.ok ? { ok: true, out: 'açıldı → ' + r.path + ' (' + r.count + ' dosya)' } : bad(r);
      case 'grep': case 'find': r = N.search(p, c.q || '', op === 'grep'); if (!r.ok) return bad(r);
        return { ok: true, out: r.results.join('\n') + (r.truncated ? '\n…[sonuçlar kesildi]' : '') || '(sonuç yok)' };
      default: return { ok: false, out: 'Bilinmeyen op: ' + op };
    }
  } catch (e) { return { ok: false, out: e.message || String(e) }; }
}

const PROTO_MIN = 'Dosyaları şu etiketlerle yaz (uygulama kaydeder):\n<fs op="write" path="yol/dosya.ext">\nTAM İÇERİK\n</fs>\nKüçük değişiklik için:\n<fs op="edit" path="yol/dosya.ext">\n<<<<<<< SEARCH\neski (birebir)\n=======\nyeni\n>>>>>>> REPLACE\n</fs>\nİçerik HAM yazılır: <![CDATA[ ]]>, ``` kod bloğu, dil adı veya ek kelime KOYMA. Okuma etiketi yok.';
const PLAN_SYS = 'Sen deneyimli bir yazılım planlayıcısısın (Raphael ekibinin planlama üyesi). Araç erişimin yok; dosya yazma. Verilen görev için KISA, numaralı bir plan yaz (en fazla ~25 madde). Yalnızca kendi rolünün bakış açısına odaklan; diğer uzmanlar başka açıları işliyor, onların işini tekrarlama. Tam kod yazma.';
const FIX_SYS = 'Sen Düzeltici\'sin (Raphael ekibi). Sana verilen SORUNLARI, yalnızca belirtilen dosyalarda çöz. KURALLAR: dosyayı baştan yazma; yalnızca hatalı yeri edit (SEARCH/REPLACE) ile düzelt, SEARCH metni dosyadakiyle birebir olsun; hatayla ilgisiz hiçbir satıra dokunma; listelenmeyen dosyaya dokunma.\n' + PROTO_MIN;
const ARCH_NOTE = '\n\nMİMAR MODU: Aşağıdaki PLANLAR üç farklı uzmandan geldi (mimar / risk / deneyim). Önce ortak kararı kendin ver: çelişkileri çöz, planı daha iyi hale getir. Sonra TEK yanıtta şunları ver:\n1) <contract>…</contract>: ortak sözleşme — dosya listesi, her dosyanın dışa açtığı sınıf/fonksiyon adları ve imzaları, paylaşılan sabitler, veri biçimleri (kısa, madde madde).\n2) TEMEL: tüm ajanların üzerine inşa edeceği çekirdek dosyalar (paylaşılan sabitler/arayüz/iskelet) <fs op="write"> etiketleriyle — yalnızca gerçekten ortak olanlar, kısa tut.\n3) 1-5 adet <task n="1" files="a.js,b.js" title="kısa">o ajanın işi: ne yazacak, hangi arayüzleri sunacak/kullanacak</task>. Her dosya YALNIZCA bir görevde geçsin; görevler birbirinden tamamen farklı parçalar olsun; iş küçükse 1-2 görev yeter. Okuma etiketi kullanma.';
const TEST_SYS = 'Sen Test ajanısın (Raphael ekibi). Araç erişimin yok; yalnızca verilen kodu analiz ediyorsun. Bak: söz dizimi, import/export ve fonksiyon adı uyumu, ajanlar arası arayüz uyumsuzluğu, eksik dosya/yol, görevle uyum, açık mantık hatası. Stil sorunlarını yazma.\nÇIKTI (başka hiçbir şey yazma):\n- Sorun yoksa yalnızca: <approved/>\n- Varsa en fazla 3 grup: <fixgroup n="1" files="a.js,b.js">kısa, net talimat: hangi dosyada, hangi fonksiyonda/satırda, neyi nasıl değiştireceği</fixgroup>\nÖNEMLİ: files içine YALNIZCA gerçekten hatalı dosyaları yaz; hatasız dosyayı asla ekleme. Gruplar farklı dosyaları kapsasın; her talimat ~1200 karakteri geçmesin; uzunsa gruplara böl.';
const FINAL_SYS = 'Sen Onay ajanısın (Raphael ekibi). Test bulgularına ve düzeltmelerin uygulama sonucuna bak. Düzeltmeler başarılıysa kısa bir onay özeti yaz (Türkçe, 2-4 cümle, ne yapıldı). Başarısız kalan bir şey varsa açıkça söyle. Araç etiketi kullanma.';

/* ============================================================
   ÖZGÜR AJAN SİSTEMİ — Raphael/agent/ klasöründeki dosyalarla tanımlanır.
   Uygulama yalnızca motoru ve dosya komut dilini sağlar; ajanlar, modeller,
   talimatlar ve akış tamamen kullanıcıya aittir.
   ============================================================ */
const AGENT_DIR = 'Raphael/agent';
const TOOL_DOC = DEF_PROTO;
let BUDGET = 0, WAIT_OVR = null;
const abortErr = () => Object.assign(new Error('durduruldu'), { name: 'AbortError' });
const over = ref => { const f = findModel(ref); return f && f.model.limit && (usage().n[ref] || 0) >= f.model.limit ? 1 : 0; };
const isDaily = e => /per ?day|daily|PerDay/i.test((e && e.message) || '');
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const settled = a => a.filter(r => r.status === 'fulfilled').map(r => r.value);
const fileList = paths => paths.map(p => '/' + p).join(', ');
function budgetCheck() {
  const n = Object.values(RUN || {}).reduce((a, b) => a + b, 0);
  if (BUDGET && n >= BUDGET) throw Object.assign(new Error('İstek bütçesi doldu (' + BUDGET + '). agent.json içindeki "butce" değerini artırabilirsin.'), { budget: true });
}
function parseWaits() { const src = WAIT_OVR || String(S.rph.waits || '').split(/[ ,;]+/); const a = src.map(Number).filter(n => n > 0); return a.length ? a : [10, 30, 60]; }

/* ---------- model çözümleme: "gemini-3.5-flash-lite", "nvidia/deepseek v4", "gemini/gemini 3.8" ---------- */
function resolveModel(str) {
  str = String(str == null ? '' : str).trim(); if (!str) return S.defModel || '';
  let pool = allModels(); let q = str;
  const exact = pool.find(x => x.model.id === str); if (exact) return exact.ref;
  const i = str.indexOf('/');
  if (i > 0) {
    const prov = norm(str.slice(0, i)).replace(/\s+/g, '-');
    const sel = S.apis.filter(a => slug(a) === prov || a.type === prov || slug(a).startsWith(prov));
    if (sel.length) { pool = pool.filter(y => sel.includes(y.api)); q = str.slice(i + 1); }
  }
  const x = pool.find(y => y.model.id === q || y.model.id.endsWith('/' + q)); if (x) return x.ref;
  const L = filterModels(pool, q); return L.length ? L[0].ref : '';
}
function chainFor(ag) {
  const refs = []; const push = r => { if (r && findModel(r) && !refs.includes(r)) refs.push(r); };
  push(resolveModel(ag.model)); (ag.yedek || []).forEach(x => push(resolveModel(x)));
  if (!refs.length) push(S.defModel);
  if (!refs.length) throw new Error('Kullanılabilir model yok: önce /api ekle ile bir API bağla.');
  return refs.sort((a, b) => over(a) - over(b)); // limiti dolanlar sona (sıra korunur)
}

/* ---------- dayanıklı çağrı: bekle → tekrar dene (3 kez) → yedek modele geç ---------- */
async function countdown(chat, sec, mk) {
  const inf = addInfo(chat, mk(sec), true); const end = Date.now() + sec * 1000;
  while (Date.now() < end) {
    if (CTL.signal.aborted) { setInfo(inf, '⏹ beklemeden vazgeçildi'); throw abortErr(); }
    const left = Math.ceil((end - Date.now()) / 1000); setInfo(inf, mk(left)); stage(mk(left)); await sleep(500);
  }
  setInfo(inf, '↻ tekrar deneniyor');
}
async function resilient(chat, chain, o, m) {
  const ws = parseWaits(); let lastErr;
  for (let ci = 0; ci < chain.length; ci++) {
    const ref = chain[ci];
    for (let a = 0; a <= ws.length; a++) {
      budgetCheck();
      try { return await streamAI(chat, m, Object.assign({}, o, { ref })); }
      catch (e) {
        if (e.name === 'AbortError' || e.budget) throw e;
        lastErr = e;
        if (e.status === 404 || isDaily(e)) break;
        if (!isRetryable(e)) throw e;
        if (a < ws.length) { await countdown(chat, ws[a], l => '⏳ ' + shortOf(ref) + ' yoğun — ' + l + ' sn sonra tekrar (' + (a + 1) + '/' + ws.length + ')'); continue; }
        break;
      }
    }
    if (ci < chain.length - 1) addInfo(chat, '⚠ ' + shortOf(ref) + ' yanıt vermedi → ' + shortOf(chain[ci + 1]) + ' deneniyor');
  }
  throw lastErr;
}

/* ---------- mesaj yardımcıları ---------- */
function newAi(chat, agent, tag, hide) {
  const m = { id: uid(), role: 'ai', agent: !!agent, text: '', ts: Date.now() };
  if (tag) m.tag = tag; if (hide) { m.hide = true; m.fold = true; }
  chat.messages.push(m); return m;
}
function addInfo(chat, text, busy) { const m = { id: uid(), role: 'info', text, busy: !!busy, ts: Date.now() }; chat.messages.push(m); logw(chat, '[' + hm() + '] ℹ ' + text); renderMsg(m); return m; }
function setInfo(m, text, busy) { m.text = text; m.busy = !!busy; renderMsg(m); }
function okInfo(chat, text) { const m = { id: uid(), role: 'info', ok: true, text, ts: Date.now() }; chat.messages.push(m); logw(chat, '[' + hm() + '] ✓ ' + text); renderMsg(m); return m; }
function agentHist(chat) {
  const out = [];
  for (const m of chat.messages.slice(0, -1)) {
    if (m.local || m.hide || m.role === 'info' || m.role === 'sys') continue;
    if (m.role === 'user') out.push({ role: 'user', text: m.text.slice(0, 1500) });
    else if (m.role === 'ai' && m.text && m.state !== 'skip') {
      let t = m.agent ? stripFs(m.text) : m.text;
      if (m.calls && m.calls.length) t += ' [işlem: ' + m.calls.filter(c => c.status === 'ok').map(c => c.op + ' ' + c.path).join(', ') + ']';
      if (t.trim()) out.push({ role: 'ai', text: t.slice(0, 1200) });
    }
  }
  return out.slice(-8);
}
const mkCalls = (calls, st) => calls.map(c => ({ op: c.op, path: c.path, to: c.to, status: st }));
const logCall = (chat, c, ok, out) => logw(chat, '    🔧 ' + c.op + ' ' + (c.path || '') + (c.to ? ' → ' + c.to : '') + ' ' + (ok ? 'ok' : '✗') + ' — ' + String(out).replace(/\s+/g, ' ').slice(0, 160));
function summarize(n) { const T = { write: 'dosya yazıldı', append: 'dosyaya eklendi', edit: 'dosya düzenlendi', mkdir: 'klasör oluşturuldu', rm: 'öğe silindi', mv: 'öğe taşındı', cp: 'öğe kopyalandı', zip: 'zip oluşturuldu', unzip: 'zip açıldı' }; const p = Object.keys(n).map(k => n[k] + ' ' + (T[k] || k)); return p.join(' · '); }

/* ---------- araçları çalıştır ---------- */
function ownerOk(c, allowed) { return !allowed || !WRITE_OPS.has(c.op) || c.op === 'mkdir' || allowed.has(rp(c.path)); }
async function execCalls(ctx, m, calls, allowed) { // sonuçları modele geri vermek için (tam araç döngüsü)
  const chat = ctx.chat; const out = []; let allOk = true;
  for (let i = 0; i < calls.length; i++) {
    if (CTL.signal.aborted) throw abortErr();
    const c = calls[i]; let r;
    if (!ownerOk(c, allowed)) r = { ok: false, out: 'Bu dosya başka bir ajana ait; dokunma.' };
    else if (c.op === 'rm' && S.rph.confirmRm) {
      const ok = await dialog({ title: 'Silme onayı', msg: 'Raphael şunu silmek istiyor:\n/' + rp(c.path), ok: 'Sil', danger: true });
      r = ok ? runOp(c) : { ok: false, out: 'Kullanıcı silmeyi reddetti' };
    } else r = runOp(c);
    m.calls[i].status = r.ok ? 'ok' : 'err'; m.calls[i].out = String(r.out).slice(0, 3000); renderMsg(m); logCall(chat, c, r.ok, r.out);
    if (r.ok && WRITE_OPS.has(c.op) && c.op !== 'mkdir') ctx.written.add(rp(c.path));
    if (r.ok) ctx.ops[c.op] = (ctx.ops[c.op] || 0) + 1;
    out.push('<result op="' + c.op + '" path="' + c.path + '"' + (r.ok ? '' : ' error="1"') + '>' + String(r.out).slice(0, 14000) + '</result>');
    if (!r.ok) allOk = false;
  }
  return { out, allOk };
}
function applyWrites(ctx, m, calls, allowed) { // tek seferlik: yalnızca yazma komutları (okuma/silme/taşıma yok sayılır)
  const chat = ctx.chat; m.calls = mkCalls(calls, 'wait'); renderMsg(m); const res = [];
  calls.forEach((c, i) => {
    let ok = false, out;
    if (!WRITE_OPS.has(c.op)) { m.calls[i].status = 'skip'; out = 'Bu aşamada yalnızca yazma komutları geçerli'; }
    else if (!ownerOk(c, allowed)) { m.calls[i].status = 'skip'; out = 'Bu dosya başka bir ajana ait'; }
    else { const r = runOp(c); ok = r.ok; out = r.out; m.calls[i].status = r.ok ? 'ok' : 'err'; if (r.ok) { if (c.op !== 'mkdir') ctx.written.add(rp(c.path)); ctx.ops[c.op] = (ctx.ops[c.op] || 0) + 1; } }
    m.calls[i].out = String(out).slice(0, 1500); logCall(chat, c, ok, out); res.push({ ok, skipped: m.calls[i].status === 'skip' });
  });
  renderMsg(m); return res;
}
/* Tam araç döngüsü: modelin okuma/yazma komutlarını çalıştır, sonucu geri ver, bitene kadar sürdür */
async function toolLoop(ctx, o) {
  const chat = ctx.chat; const msgs = [{ role: 'user', text: o.first }]; const seen = new Set(); let bad = 0, last = '';
  for (let s = 0; s < o.steps; s++) {
    const m = newAi(chat, true, o.tag, o.hide); stage(o.tag + ' · adım ' + (s + 1) + '/' + o.steps);
    const res = await resilient(chat, o.chain, { system: o.system, msgs, think: o.think, tag: o.tag }, m);
    last = res.text; msgs.push({ role: 'ai', text: res.text });
    const calls = fsParse(res.text); const trunc = hasTrunc(res.text);
    m.calls = mkCalls(calls, 'wait'); renderMsg(m);
    if (!calls.length) { if (trunc) { msgs.push({ role: 'user', text: 'Yanıtın kesildi; etiket tamamlanmadı. Dosyayı daha kısa parçalara bölerek yeniden ver.' }); bad++; if (bad >= 2) return { text: last }; continue; } return { text: last }; }
    const sig = calls.map(c => c.op + '|' + c.path + '|' + hash(c.body || '')).join(';');
    if (seen.has(sig)) { m.calls.forEach(c => { c.status = 'skip'; }); renderMsg(m); addInfo(chat, '⚠ ' + o.tag + ' aynı işlemi tekrarladı — döngü kesildi'); return { text: last }; }
    seen.add(sig);
    const { out, allOk } = await execCalls(ctx, m, calls, o.allowed); saveChat(chat);
    if (allOk && !calls.some(c => READ_OPS.has(c.op)) && !trunc && o.finish) return { text: last };
    bad = allOk ? 0 : bad + 1; if (bad >= 2) { addInfo(chat, '⚠ ' + o.tag + ': art arda iki başarısız adım — durduruldu'); return { text: last }; }
    msgs.push({ role: 'user', text: out.join('\n') + (trunc ? '\nSon etiket kesildi; eksik dosyaları daha kısa parçalarla ver.' : '') + '\nDevam et. Görev tamamsa etiket kullanmadan kısa özet yaz.' });
  }
  addInfo(chat, '⚠ ' + o.tag + ': adım sınırına ulaşıldı (maxAdim)'); return { text: last };
}

/* ---------- şablon değişkenleri ---------- */
function buildBaglam(ctx) {
  const R = S.rph; let h = '';
  if (ctx.auto) return wsNote() + '\nÇalışma klasörü: /' + cwdNow();
  h += 'Çalışma klasörü: /' + cwdNow() + '\n';
  const t = N.tree(cwdNow(), 4); if (!t.ok) return h + '(klasör okunamadı: ' + t.error + ')';
  const tree = fmtTree(t.entries, 150); if (tree !== '(boş)') h += 'Klasör yapısı:\n' + tree + '\n\n';
  const files = t.entries.filter(e => !e.d && isText(e.p)).sort((a, b) => a.s - b.s); const parts = []; let used = 0;
  for (const e of files) {
    if (parts.length >= R.packFiles || used > R.packChars - 500) break;
    const r = N.read(rp(e.p), R.perFile); if (!r.ok) continue; let c = r.content; if (used + c.length > R.packChars) c = c.slice(0, R.packChars - used) + '\n…[kesildi]';
    used += c.length; parts.push('<file path="' + e.p + '">\n' + c + '\n</file>');
  }
  return h + (parts.length ? 'Dosyalar (güncel içerik):\n' + parts.join('\n') : '');
}
function lookup(ctx, extra, name) {
  if (name in extra) return extra[name];
  switch (name) {
    case 'gorev': return ctx.task;
    case 'klasor': return '/' + cwdNow();
    case 'baglam': return ctx.baglam != null ? ctx.baglam : (ctx.baglam = buildBaglam(ctx));
    case 'agac': { const t = N.tree(cwdNow(), 4); return t.ok ? fmtTree(t.entries, 150) : ''; }
    case 'gecmis': return ctx.hist.map(h => (h.role === 'user' ? 'Kullanıcı: ' : 'Raphael: ') + h.text).join('\n');
    case 'dosyalar': return [...ctx.written].map(p => '/' + p).join(', ');
  }
  const m = /^(.+)\.(\d+)$/.exec(name); if (m && Array.isArray(ctx.arr[m[1]])) return ctx.arr[m[1]][+m[2] - 1] || '';
  if (name in ctx.vars) return ctx.vars[name];
  return undefined;
}
const VAR_RE = /\{(?:(oku|tag):)?([\wçğıöşüÇĞİÖŞÜ.]+)(?::([\wçğıöşüÇĞİÖŞÜ.]+))?\}/g;
const parseList = v => String(v == null ? '' : v).split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
function render(tpl, ctx, extra) {
  extra = extra || {};
  return String(tpl == null ? '' : tpl).replace(VAR_RE, (all, pre, a, b) => {
    if (pre === 'oku') { const v = lookup(ctx, extra, a); return v == null ? all : readFiles(parseList(v), S.rph.perFile, 60000) || '(dosya yok)'; }
    if (pre === 'tag') { const v = lookup(ctx, extra, b || ''); if (v == null) return all; const m = new RegExp('<' + a + '\\b[^>]*>([\\s\\S]*?)</' + a + '>').exec(String(v)); return m ? m[1].trim() : ''; }
    if (b) return all; const v = lookup(ctx, extra, a); return v == null ? all : String(v);
  });
}
function evalCond(c, ctx) {
  if (!c) return true; const v = String(ctx.vars[c.degisken] == null ? '' : ctx.vars[c.degisken]);
  if ('icerir' in c && !v.includes(c.icerir)) return false;
  if ('icermez' in c && v.includes(c.icermez)) return false;
  if ('bos' in c && (v.trim() === '') !== !!c.bos) return false;
  return true;
}
function fanItems(ctx, st) {
  const f = st.her; const src = String(ctx.vars[f.degisken] || ''); const cap = Math.min(8, Math.max(1, f.enFazla || 5));
  const re = new RegExp('<' + f.etiket + '\\b([^>]*)>([\\s\\S]*?)</' + f.etiket + '>', 'g'); const out = []; const owned = new Set(); let m;
  while ((m = re.exec(src)) && out.length < cap) {
    const a = parseAttrs(m[1]); let files = null;
    if (st.sahip) { files = String(a[st.sahip] || '').split(',').map(x => rp(x.trim())).filter(x => x && !owned.has(x)); if (!files.length) continue; files.forEach(x => owned.add(x)); }
    out.push({ n: out.length + 1, text: m[2].trim(), attrs: a, files });
  }
  return out;
}

/* ---------- adımları çalıştır ---------- */
async function runAgentCall(ctx, ag, input, it, st, hide) {
  const chat = ctx.chat; const tag = ag.ad + (it.total > 1 ? ' ' + it.n : '');
  const chain = chainFor(ag); const think = ag.dusunme === 'yok' ? null : (['low', 'medium', 'high'].includes(ag.dusunme) ? ag.dusunme : S.think);
  let system = ag.talimat || ''; if (ag.talimatDosya) { const r = N.read(normPath(ctx.dir + '/' + ag.talimatDosya), 200000); if (r.ok) system += (system ? '\n\n' : '') + r.content; }
  if (!system) system = 'Sen ' + ag.ad + ' ajanısın.';
  const arac = ag.arac || 'yok'; if (arac !== 'yok' && ag.aracTalimati !== false) system += '\n\n' + (arac === 'tam' ? TOOL_DOC : PROTO_MIN);
  const allowed = it.files ? new Set(it.files) : null; const apply = st.uygula !== 'yok' && arac !== 'yok';
  if (arac === 'tam' && apply) return (await toolLoop(ctx, { chain, system, first: input, steps: Math.min(12, Math.max(1, ag.maxAdim || 6)), think, tag, hide, allowed, finish: ag.yazincaBitir !== false })).text;
  const m = newAi(chat, arac !== 'yok', tag, hide);
  const res = await resilient(chat, chain, { system, msgs: [{ role: 'user', text: input }], think, maxOut: ag.maxCikti || undefined, tag }, m);
  if (arac !== 'yok') {
    const calls = fsParse(res.text); m.calls = mkCalls(calls, apply ? 'wait' : 'hold'); renderMsg(m);
    if (hasTrunc(res.text)) addInfo(chat, '⚠ ' + tag + ' çıktısı kesilmiş olabilir');
    if (apply) { applyWrites(ctx, m, calls, allowed); saveChat(chat); }
  }
  return res.text;
}
async function runStep(ctx, st, idx) {
  const chat = ctx.chat; const tur = st.tur || 'ajan';
  if (!evalCond(st.eger, ctx)) { addInfo(chat, '⤼ ' + st.id + ' atlandı (koşul sağlanmadı)'); return; }
  if (tur === 'mesaj') { addInfo(chat, render(st.metin, ctx)); return; }
  if (tur === 'uygula') {
    const src = String(ctx.vars[st.kaynak] || ''); const calls = fsParse(src);
    if (!calls.length) { addInfo(chat, '⤼ ' + st.id + ': "' + st.kaynak + '" içinde uygulanacak komut yok'); return; }
    const only = st.sadece ? new Set(parseList(render(st.sadece, ctx)).map(x => rp(x))) : null;
    stage('Kaydediliyor · ' + st.id); const m = newAi(chat, true, 'Kaydet'); m.text = src; renderMsg(m);
    const r = applyWrites(ctx, m, calls, only); saveChat(chat);
    addInfo(chat, '💾 ' + st.id + ': ' + r.filter(x => x.ok).length + '/' + calls.length + ' komut uygulandı'); return;
  }
  const ag = ctx.cfg.ajanlar[st.ajan];
  const items = st.her ? fanItems(ctx, st) : Array.from({ length: Math.min(8, Math.max(1, st.adet || 1)) }, (_, i) => ({ n: i + 1, rol: (st.roller || [])[i] || '' }));
  items.forEach(i => { i.total = items.length; });
  if (!items.length) { ctx.vars[st.cikti || st.id] = ''; addInfo(chat, '⤼ ' + st.id + ': dağıtılacak öğe bulunamadı'); return; }
  stage((idx + 1) + '/' + ctx.cfg.adimlar.length + ' · ' + ag.ad + (items.length > 1 ? ' ×' + items.length : ''));
  if (items.length > 1) addInfo(chat, '⟡ ' + st.id + ': ' + items.length + '× ' + ag.ad + (st.paralel === false ? ' (sırayla)' : ' (paralel)'));
  const hide = st.gizle != null ? !!st.gizle : items.length > 1;
  const one = async it => {
    const extra = { n: it.n, toplam: it.total, rol: it.rol || '', oge: it.text || '' };
    if (it.attrs) Object.keys(it.attrs).forEach(k => { extra['oge.' + k] = it.attrs[k]; });
    return runAgentCall(ctx, ag, render(st.girdi || '{gorev}', ctx, extra), it, st, hide);
  };
  let outs;
  if (items.length > 1 && st.paralel !== false) {
    const rs = await Promise.allSettled(items.map(one)); if (CTL.signal.aborted) throw abortErr();
    outs = rs.map((r, i) => { if (r.status === 'fulfilled') return r.value; if (r.reason && r.reason.budget) throw r.reason; addInfo(chat, '⚠ ' + ag.ad + ' ' + (i + 1) + ' başarısız: ' + errMsg(r.reason).slice(0, 120)); return ''; });
  } else { outs = []; for (const it of items) outs.push(await one(it)); }
  const name = st.cikti || st.id; ctx.arr[name] = outs;
  ctx.vars[name] = outs.length > 1 ? outs.map((t, i) => '--- ' + (i + 1) + ' ---\n' + t).join('\n\n') : (outs[0] || '');
}

/* ---------- akış dosyası: yükle / doğrula ---------- */
function flowFile() { return AGENT_DIR + '/' + String(S.rph.flow || 'agent.json').replace(/^\/+/, ''); }
function jsonErrInfo(text, e) { const m = /position (\d+)/.exec(e.message); if (!m) return e.message; const pos = +m[1]; const line = text.slice(0, pos).split('\n').length; return e.message + ' (yaklaşık satır ' + line + ')'; }
function validateFlow(cfg, dir) {
  const E = [], W = [], info = []; let est = 0;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { errors: ['Dosyanın kökü bir nesne ({...}) olmalı'], warns: W, est, info };
  const ags = cfg.ajanlar, steps = cfg.adimlar;
  if (!ags || typeof ags !== 'object' || !Object.keys(ags).length) E.push('"ajanlar" boş veya eksik');
  if (!Array.isArray(steps) || !steps.length) E.push('"adimlar" boş veya eksik');
  if (E.length) return { errors: E, warns: W, est, info };
  Object.keys(ags).forEach(k => {
    const a = ags[k]; if (!a || typeof a !== 'object') { E.push('ajan "' + k + '": nesne olmalı'); return; }
    a.ad = a.ad || k; a.arac = a.arac || 'yok';
    if (!['yok', 'yaz', 'tam'].includes(a.arac)) E.push('ajan "' + k + '": "arac" yok / yaz / tam olmalı');
    const mr = resolveModel(a.model); if (a.model && !mr) E.push('ajan "' + k + '": model bulunamadı: "' + a.model + '" (/model ile doğru adı gör)'); else info.push(a.ad + ' → ' + (mr ? labelOf(mr) : '(varsayılan model yok)'));
    (a.yedek || []).forEach(y => { if (!resolveModel(y)) W.push('ajan "' + k + '": yedek model bulunamadı: "' + y + '"'); });
    if (a.talimatDosya && !N.read(normPath(dir + '/' + a.talimatDosya), 10).ok) E.push('ajan "' + k + '": talimat dosyası yok: ' + a.talimatDosya);
    if (!a.talimat && !a.talimatDosya) W.push('ajan "' + k + '": talimat yok (varsayılan kısa talimat kullanılacak)');
  });
  const known = new Set(['gorev', 'klasor', 'baglam', 'agac', 'gecmis', 'dosyalar', 'n', 'toplam', 'rol', 'oge']); const ids = new Set();
  const scan = (t, where, local) => { String(t == null ? '' : t).replace(VAR_RE, (all, pre, a, b) => { const nm = pre === 'tag' ? b : a; if (!nm) return all; const base = nm.replace(/\.\d+$/, ''); if (!known.has(base) && !local.has(base) && !/^oge\./.test(nm)) W.push(where + ': bilinmeyen değişken {' + all.slice(1, -1) + '}'); return all; }); };
  steps.forEach((s, i) => {
    const w = 'adım ' + (i + 1) + (s && s.id ? ' (' + s.id + ')' : ''); if (!s || typeof s !== 'object') { E.push(w + ': nesne olmalı'); return; }
    if (!s.id) E.push(w + ': "id" yok'); else if (ids.has(s.id)) E.push(w + ': tekrar eden id'); else ids.add(s.id);
    const tur = s.tur || 'ajan'; if (!['ajan', 'uygula', 'mesaj'].includes(tur)) { E.push(w + ': "tur" ajan / uygula / mesaj olmalı'); return; }
    const local = new Set(); if (s.her) { local.add('oge'); }
    if (s.eger && !known.has(s.eger.degisken)) W.push(w + ': koşul değişkeni henüz yok: ' + s.eger.degisken);
    if (tur === 'mesaj') { scan(s.metin, w, local); return; }
    if (tur === 'uygula') { if (!s.kaynak) E.push(w + ': "kaynak" yok'); else if (!known.has(s.kaynak)) E.push(w + ': "kaynak" henüz üretilmemiş: ' + s.kaynak); if (s.sadece) scan(s.sadece, w, local); known.add(s.id); return; }
    const ag = ags[s.ajan]; if (!ag) { E.push(w + ': ajan yok: ' + s.ajan); return; }
    let n = 1;
    if (s.her) {
      if (!s.her.degisken || !s.her.etiket) E.push(w + ': "her" için "degisken" ve "etiket" gerekir');
      else { if (!known.has(s.her.degisken)) E.push(w + ': "her.degisken" henüz üretilmemiş: ' + s.her.degisken); if (!/^[\w-]+$/.test(s.her.etiket)) E.push(w + ': "her.etiket" yalnızca harf/rakam/- içerebilir'); }
      n = Math.min(8, s.her.enFazla || 5);
    } else { n = s.adet || 1; if (n < 1 || n > 8) E.push(w + ': "adet" 1-8 arasında olmalı'); if (s.roller && s.roller.length < n) W.push(w + ': "roller" adetten az'); }
    scan(s.girdi || '{gorev}', w, local);
    est += n * (ag.arac === 'tam' ? Math.min(12, ag.maxAdim || 6) : 1);
    const name = s.cikti || s.id; known.add(name);
  });
  const bud = cfg.butce || S.rph.budget; if (est > bud) W.push('Tahmini en fazla ' + est + ' istek, bütçe ' + bud + ' — bütçe erken dolabilir');
  return { errors: E, warns: W, est, info };
}
function loadFlow() {
  const fp = flowFile(); const r = N.read(fp, 400000);
  if (!r.ok) return { ok: false, errors: ['Akış dosyası okunamadı: /' + fp + ' — ' + r.error], warns: [], info: [] };
  let cfg; const txt = stripWrap(r.content); try { cfg = JSON.parse(txt); } catch (e) { return { ok: false, errors: ['JSON hatası: ' + jsonErrInfo(txt, e)], warns: [], info: [] }; }
  const dir = fp.replace(/\/[^\/]*$/, ''); const v = validateFlow(cfg, dir);
  return { ok: !v.errors.length, cfg, dir, fp, errors: v.errors, warns: v.warns, est: v.est, info: v.info };
}
function listFlows() {
  const out = []; const a = N.list(AGENT_DIR); if (a.ok) a.entries.forEach(e => { if (!e.d && /\.json$/i.test(e.n)) out.push(e.n); });
  const b = N.list(AGENT_DIR + '/ornekler'); if (b.ok) b.entries.forEach(e => { if (!e.d && /\.json$/i.test(e.n)) out.push('ornekler/' + e.n); });
  return out;
}
function flowReport() {
  const L = loadFlow(); const n = L.cfg && Array.isArray(L.cfg.adimlar) ? L.cfg.adimlar.length : 0;
  let t = 'Akış: /' + flowFile() + (L.cfg ? ' — "' + (L.cfg.ad || '?') + '" · ' + Object.keys(L.cfg.ajanlar || {}).length + ' ajan · ' + n + ' adım' : '') + '\n';
  if (L.info && L.info.length) t += '\nAjan modelleri:\n  ' + L.info.join('\n  ') + '\n';
  if (L.errors.length) t += '\n✗ HATALAR:\n  ' + L.errors.join('\n  ') + '\n';
  if (L.warns.length) t += '\n⚠ UYARILAR:\n  ' + L.warns.join('\n  ') + '\n';
  if (!L.errors.length) t += '\n✓ Geçerli · tahmini en fazla ' + L.est + ' istek (bütçe ' + ((L.cfg && L.cfg.butce) || S.rph.budget) + ')';
  return t;
}

/* ---------- çalıştırma ---------- */
function pickProject(task) {
  const r = N.list('Raphael'); if (!r.ok) return null; const nt = ' ' + norm(task) + ' '; let best = null;
  for (const e of r.entries) {
    if (!e.d || e.n.toLowerCase() === 'agent') continue; const nn = norm(e.n); if (nn.length < 3) continue;
    if (nt.includes(' ' + nn + ' ') || nn.split(' ').filter(w => w.length > 2).every(w => nt.includes(w))) { if (!best || nn.length > best.l) best = { n: e.n, l: nn.length }; }
  }
  return best && best.n;
}
function wsNote() {
  const r = N.list('Raphael'); const L = r.ok ? r.entries.filter(e => e.d && e.n.toLowerCase() !== 'agent').map(e => e.n).slice(0, 40) : [];
  return 'ÇALIŞMA ALANI: /Raphael (uygulamanın proje klasörü). Kullanıcı özel klasör vermedi. Yeni bir iş için proje adına uygun kısa bir alt klasör aç (küçük harf, tire, ASCII; örn. /Raphael/godot-saglik-bari) ve tüm dosyaları onun İÇİNE yaz; yolları "/Raphael/..." ile başlat. Mevcut projeler: ' + (L.length ? L.join(', ') : '(henüz yok)') + '. Kullanıcı mevcut bir projeyi kastediyorsa onun klasörünü kullan. "/Raphael/agent" klasörüne dokunma.';
}
function readFiles(paths, perFile, total) { // diskten güncel içerik
  const parts = []; let used = 0;
  for (const p of paths) {
    const r = N.read(rp(p), perFile); if (!r.ok) continue;
    let c = r.content; if (used + c.length > total) c = c.slice(0, Math.max(0, total - used)) + '\n…[kesildi]';
    if (r.truncated) c += '\n…[dosya kesildi]'; used += c.length;
    parts.push('<file path="' + p + '">\n' + c + '\n</file>'); if (used >= total) break;
  }
  return parts.join('\n');
}
async function runAgent(chat, task) {
  if (!N.read(AGENT_DIR + '/agent.json', 10).ok && !N.list(AGENT_DIR).ok) { const made = setupAgentDir(false); addInfo(chat, '⟡ Raphael/agent klasörü ilk kez hazırlandı (' + made.length + ' dosya). Rehber: /Raphael/agent/AGENT.md'); }
  const L = loadFlow();
  if (!L.ok) { addInfo(chat, '⚠ Agent akışı çalıştırılamadı:\n' + L.errors.join('\n') + '\n\n/agent dogrula yazarak ayrıntıyı gör.'); return; }
  const cfg = L.cfg; BUDGET = cfg.butce || S.rph.budget; WAIT_OVR = Array.isArray(cfg.bekleme) ? cfg.bekleme : null; WSO = null;
  if (!S.cwd) S.cwd = 'Raphael'; if (S.cwd === 'Raphael') N.mkdir('Raphael');
  const ctx = { chat, cfg, dir: L.dir, task, hist: agentHist(chat), vars: {}, arr: {}, written: new Set(), ops: {}, auto: false, baglam: null };
  try {
    if (S.cwd === 'Raphael') { const pj = pickProject(task); if (pj) WSO = 'Raphael/' + pj; else ctx.auto = true; }
    addInfo(chat, '⟡ ' + (cfg.ad || 'Akış') + ' · ' + cfg.adimlar.length + ' adım · ' + (ctx.auto ? 'Raphael/ (yeni proje)' : '/' + cwdNow()) + ' · bütçe ' + BUDGET);
    for (let i = 0; i < cfg.adimlar.length; i++) { if (CTL.signal.aborted) throw abortErr(); await runStep(ctx, cfg.adimlar[i], i); }
    const sm = summarize(ctx.ops); okInfo(chat, '✓ ' + (cfg.ad || 'Akış') + ' tamamlandı' + (sm ? ' · ' + sm : ''));
  } finally { WSO = null; BUDGET = 0; WAIT_OVR = null; }
}

/* ---------- mevcut dosyaları onar: CDATA / ``` sarmalarını temizle ---------- */
function repairTree(p) {
  const t = N.tree(rp(p || '.'), 8); if (!t.ok) return { ok: false, error: t.error };
  let fixed = 0, seen = 0; const list = [];
  for (const e of t.entries) {
    if (e.d || !isText(e.p) || e.s > 2000000) continue; seen++;
    const fp = rp((p ? p.replace(/\/+$/, '') + '/' : '') + e.p); const r = N.read(fp, 3000000); if (!r.ok || r.truncated) continue;
    const c = stripWrap(r.content); if (c !== r.content) { const w = N.write(fp, c.endsWith('\n') ? c : c + '\n', false); if (w.ok) { fixed++; list.push(e.p); } }
  }
  return { ok: true, fixed, seen, list };
}
