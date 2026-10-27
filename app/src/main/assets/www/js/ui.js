'use strict';
let CH = [], cur = null, busy = false, CTL = null, stick = true;
const ELS = new Map(), OPEN = new Set(), PEND = {};
const inp = () => $('#inp');

/* ============ sohbet yönetimi ============ */
function newChat() {
  return { id: uid(), title: 'Yeni sohbet', mode: cur ? cur.mode : 'chat', model: S.defModel, created: Date.now(), updated: Date.now(), messages: [] };
}
function touch() {
  cur.updated = Date.now();
  if (cur.messages.length && !CH.includes(cur)) CH.unshift(cur);
  S.last = cur.id; saveS(); saveChat(cur);
}
function openChat(c) { cur = c; S.last = c.id; saveS(); renderAll(); }
function curModelRef() { return cur.model && findModel(cur.model) ? cur.model : S.defModel; }
const lastAi = () => { for (let i = cur.messages.length - 1; i >= 0; i--) if (cur.messages[i].role === 'ai') return cur.messages[i]; return null; };

/* ============ render ============ */
function scrollEnd() { const e = $('#msgs'); e.scrollTop = e.scrollHeight; }
function renderAll() {
  $('#seg').dataset.m = cur.mode;
  $$('#seg button').forEach(b => b.classList.toggle('on', b.dataset.m === cur.mode));
  document.body.dataset.mode = cur.mode;
  renderChat(); renderChips(); updateSend();
}
function renderChat() {
  const box = $('#msgs'); box.innerHTML = ''; ELS.clear();
  if (!cur.messages.length) { box.innerHTML = welcomeHtml(); return; }
  cur.messages.forEach(renderMsg); stick = true; scrollEnd();
}
function welcomeHtml() {
  const ag = cur.mode === 'agent';
  return `<div class="welcome"><div class="wl">&gt;_ <span>${ag ? 'raphael' : 'raphael code'}</span><i class="cur"></i></div>
  <p>${ag ? 'Raphael senin tanımladığın agent akışını çalıştırır. Kurulum ve rehber: /agent · proje klasörü: /Raphael' : 'Bir şey sor, kod iste ya da / yazarak komutlara bak.'}</p>
  ${S.apis.length ? '' : `<button class="btn pri" data-act="api">${ic('plus')} API bağla</button>`}
  <div class="wc">${[['/model ', '/model'], ['/api ', '/api'], ['/cd ', '/cd'], ['/raphael', '/raphael'], ['/help', '/help']].map(x => `<button data-fill="${x[0]}">${x[1]}</button>`).join('')}</div></div>`;
}
function renderMsg(m) {
  let el = ELS.get(m.id);
  if (!el) {
    el = document.createElement('div'); ELS.set(m.id, el);
    const w = $('.welcome', $('#msgs')); if (w) w.remove();
    $('#msgs').appendChild(el);
  }
  el.className = 'm ' + m.role + (m.state ? ' ' + m.state : '');
  el.innerHTML = msgHtml(m);
  $$('.th.live+.tb', el).forEach(t => { t.scrollTop = t.scrollHeight; });
  if (stick) scrollEnd();
}
function schedule(m) { if (PEND[m.id]) return; PEND[m.id] = setTimeout(() => { delete PEND[m.id]; renderMsg(m); }, 110); }

function msgHtml(m) {
  if (m.role === 'user') return `<div class="u"><span class="pr">❯</span><div class="ut">${esc(m.text)}</div></div>`;
  if (m.role === 'info') return `<div class="inf${m.ok ? ' okk' : ''}">${m.busy ? '<span class="spin"></span>' : ''}${esc(m.text)}</div>`;
  if (m.role === 'sys') return `<div class="sc"><div class="sh">❯ ${esc(m.cmd)}</div><pre>${esc(m.text)}</pre></div>`;
  return aiHtml(m);
}
function toolCard(c, st) {
  const s = st ? st.status : 'wait';
  return `<div class="tool ${s}"><span class="top">${esc(c.op)}</span><span class="tp">${esc(c.path)}${c.to ? ' → ' + esc(c.to) : ''}</span><span class="dot"></span>${st && st.out ? `<details><summary>çıktı</summary><pre>${esc(st.out)}</pre></details>` : ''}</div>`;
}
function agentHtml(m) {
  const t = m.text || ''; let h = '', pos = 0, k = 0, r; const re = fsRe();
  while ((r = re.exec(t))) { h += md(t.slice(pos, r.index)); h += toolCard(fsFromMatch(r), m.calls && m.calls[k]); k++; pos = r.index + r[0].length; }
  const tail = t.slice(pos), i = tail.indexOf('<fs');
  if (i >= 0) h += md(tail.slice(0, i)) + '<div class="tool wait"><span class="top">…</span><span class="tp">yazılıyor</span><span class="dot"></span></div>';
  else h += md(tail);
  return h;
}
function aiHtml(m) {
  let h = '';
  if (m.model) {
    h += `<div class="ah"><span class="gl">◆</span>${m.tag ? `<span class="tg">${esc(m.tag)}</span>` : ''}<span class="mn">${esc(labelOf(m.model))}</span></div>`;
    const has = !!m.thought, open = OPEN.has(m.id) ? ' open' : '';
    if (m.state === 'think') h += `<div class="th live${has ? ' has' : ''}${open}" data-id="${m.id}"><span class="spin"></span><span>Düşünüyor</span><b class="lv" data-t0="${m.t0}"></b>${has ? ic('down', 'chev') : ''}</div>` + (has ? `<div class="tb">${esc(m.thought)}</div>` : '');
    else if (m.thinkMs != null) h += `<div class="th${has ? ' has' : ''}${open}" data-id="${m.id}"><span class="gl2">◔</span><span>Düşündü ${fmtT(m.thinkMs)}</span>${has ? ic('down', 'chev') : ''}</div>` + (has ? `<div class="tb">${esc(m.thought)}</div>` : '');
  }
  const body = '<div class="ab">' + (m.agent ? agentHtml(m) : md(m.text || '')) + (m.state === 'write' ? '<span class="cur"></span>' : '') + '</div>';
  h += m.fold ? `<details class="fold" data-id="${m.id}"${OPEN.has(m.id + 'f') ? ' open' : ''}><summary>${esc(m.tag || 'çıktı')} çıktısını göster</summary>${body}</details>` : body;
  if (m.err) h += `<div class="er">⚠ ${esc(m.err)}</div>`;
  if (m.state === 'stop') h += '<div class="dim">— durduruldu</div>';
  if (['done', 'stop', 'err'].includes(m.state)) {
    const meta = [m.ms ? fmtT(m.ms) : '', m.usage ? tk(m.usage.i) + '↑ ' + tk(m.usage.o + (m.usage.t || 0)) + '↓' : ''].filter(Boolean).join(' · ');
    h += `<div class="af"><span>${esc(meta)}</span><span class="acts">${m.text ? `<button data-a="cpall" data-id="${m.id}">${ic('copy')}</button>` : ''}${!busy && lastAi() === m ? `<button data-a="retry">${ic('refresh')}</button>` : ''}</span></div>`;
  }
  return h;
}
setInterval(() => $$('b.lv').forEach(e => { e.textContent = fmtT(Date.now() - (+e.dataset.t0)); }), 100);

/* ============ akış ============ */
async function streamAI(chat, m, o) {
  m.model = o.ref; m.text = ''; m.thought = ''; m.err = null; m.thinkMs = null; m.state = 'think'; m.t0 = Date.now(); m.usage = null; m.ms = null;
  renderMsg(m); let lastSave = Date.now();
  const lab = m.tag || (chat.mode === 'agent' ? 'Raphael' : 'Sohbet'); const ind = t => String(t).split('\n').map(l => '  │ ' + l).join('\n');
  const lu = [...o.msgs].reverse().find(x => x.role === 'user'); const prev = lu ? lu.text : '';
  logw(chat, '\n[' + hm() + '] ▶ ' + lab + ' · ' + labelOf(o.ref) + ' · düşünme=' + (o.think || '—') + ' · girdi ' + o.msgs.reduce((a, x) => a + x.text.length, 0) + ' kr');
  if (S.logFull && o.system) logw(chat, '  ┌ sistem talimatı:\n' + ind(o.system));
  logw(chat, '  ┌ son girdi' + (S.logFull ? '' : ' (ilk 1500 kr)') + ':\n' + ind(S.logFull ? prev : prev.slice(0, 1500) + (prev.length > 1500 ? '\n…[' + prev.length + ' kr]' : '')));
  try {
    const r = await llm(Object.assign({}, o, {
      signal: CTL.signal,
      onThought: (d, all) => { m.thought = all; schedule(m); },
      onText: (d, all) => {
        if (m.thinkMs == null) { m.thinkMs = Date.now() - m.t0; m.state = 'write'; }
        m.text = all; schedule(m);
        if (Date.now() - lastSave > 3000) { lastSave = Date.now(); saveChat(chat); }
      }
    }));
    m.text = r.text; m.thought = r.thought || m.thought || '';
    if (m.thinkMs == null) m.thinkMs = Date.now() - m.t0;
    m.ms = Date.now() - m.t0; m.usage = r.usage; m.state = 'done';
    if (m.thought) logw(chat, '  ┌ düşünce (' + m.thought.length + ' kr):\n' + ind(m.thought));
    logw(chat, '  ┌ çıktı (' + m.text.length + ' kr):\n' + ind(m.text));
    logw(chat, '  └ ✓ ' + fmtT(m.ms) + ' · düşünme ' + fmtT(m.thinkMs) + (r.usage ? ' · token ' + r.usage.i + '↑ ' + r.usage.o + '↓' + (r.usage.t ? ' (düşünce ' + r.usage.t + ')' : '') : ''));
    if (r.usage) { const u = usage(); u.i[o.ref] = (u.i[o.ref] || 0) + r.usage.i; u.o[o.ref] = (u.o[o.ref] || 0) + r.usage.o + (r.usage.t || 0); saveS(); }
    return r;
  } catch (e) {
    m.ms = Date.now() - m.t0; if (m.thinkMs == null) m.thinkMs = m.ms;
    if (e.name === 'AbortError') m.state = 'stop'; else { m.state = 'err'; m.err = errMsg(e); }
    if (m.thought) logw(chat, '  ┌ düşünce (kısmi, ' + m.thought.length + ' kr):\n' + ind(m.thought));
    if (m.text) logw(chat, '  ┌ kısmi çıktı (' + m.text.length + ' kr):\n' + ind(m.text));
    logw(chat, '  └ ✗ ' + (e.name === 'AbortError' ? 'kullanıcı durdurdu' : (e.status ? 'HTTP ' + e.status + ' · ' : '') + String(e.message).slice(0, 300)) + ' · ' + fmtT(m.ms));
    throw e;
  } finally { clearTimeout(PEND[m.id]); delete PEND[m.id]; renderMsg(m); saveChat(chat); }
}

function histFor(chat) {
  const L = chat.messages.filter(m => (m.role === 'user' || m.role === 'ai') && !m.local && !m.hide && m.text && !m.err).map(m => ({ role: m.role, text: m.text }));
  let used = 0, i = L.length;
  while (i > 0 && used + L[i - 1].text.length <= S.ctxChars) { i--; used += L[i].text.length; }
  return L.slice(i);
}
async function runChat(chat) {
  const ref = curModelRef(); if (!ref) { toast('Model seçilmedi'); return; }
  const f = findModel(ref); if (f && over(ref)) toast('⚠ ' + f.model.label + ' günlük limitine ulaştı');
  const m = newAi(chat, false);
  await streamAI(chat, m, { ref, system: S.chatSystem, msgs: histFor(chat).filter(x => x !== m), think: S.think });
}
let RUNACT = false, STAGE_T = 0;
function stage(t) {
  const b = $('#run'); if (!b) return;
  if (!t) { b.classList.add('hide'); return; }
  b.classList.remove('hide'); $('.rt', b).textContent = t;
  if (HAS && RUNACT && Date.now() - STAGE_T > 1500) { STAGE_T = Date.now(); try { window.Native.runStart(t); } catch (e) { /* yoksay */ } }
}
async function runTurn(text) {
  busy = true; CTL = new AbortController(); RUN = {}; RUNACT = true; updateSend();
  const ag = cur.mode === 'agent'; $('#run b.lv').dataset.t0 = Date.now(); const tStart = Date.now();
  logw(cur, '\n════════ ' + new Date().toLocaleString('tr-TR') + ' ════════\n' + (ag ? 'Raphael akışı: /' + flowFile() + ' · klasör: /' + cwdNow() : 'Sohbet · model: ' + labelOf(curModelRef())) + ' · düşünme: ' + S.think);
  stage(ag ? 'Raphael başlıyor…' : 'Yanıt bekleniyor…');
  if (HAS) try { window.Native.runStart(ag ? 'Raphael çalışıyor…' : 'Yanıt hazırlanıyor…'); } catch (e) { /* yoksay */ }
  let failed = false, aborted = false;
  try { if (ag) await runAgent(cur, text); else await runChat(cur); }
  catch (e) {
    if (e.name === 'AbortError') aborted = true;
    else { failed = true; console.error(e); if (ag) addInfo(cur, '⚠ ' + errMsg(e)); }
  }
  finally {
    const r = RUN; RUN = null; busy = false; CTL = null; RUNACT = false; stage('');
    logw(cur, '\n[' + hm() + '] ■ BİTTİ · ' + fmtT(Date.now() - tStart) + ' · ' + (aborted ? 'durduruldu' : failed ? 'HATA' : 'tamam') + ' · istekler: ' + (r ? Object.keys(r).map(k => labelOf(k) + '×' + r[k]).join(', ') : '-'));
    if (HAS) try { window.Native.runStop(); } catch (e) { /* yoksay */ }
    if (ag && r && Object.keys(r).length) addInfo(cur, '◇ İstek: ' + Object.keys(r).map(k => shortOf(k, 16) + '×' + r[k]).join(' · '));
    const l = lastAi(); if (l) renderMsg(l);
    updateSend(); touch(); renderChips();
    if (HAS && S.log) exportLog(cur);
    if (HAS && S.notify && !aborted && (document.hidden || !document.hasFocus())) {
      const ok = [...cur.messages].reverse().find(m => m.role === 'info' && m.ok);
      const msg = failed ? 'Görev hata ile durdu. Ayrıntı için uygulamayı aç.' : (ag ? (ok ? ok.text : 'Görev bitti ✓') : 'Yanıt hazır ✓');
      try { window.Native.notifyDone('Raphael Code', msg); } catch (e) { /* yoksay */ }
    }
  }
}
function submit() {
  const raw = inp().value, v = raw.trim(); if (!v) return;
  if (raw.startsWith('/') && onEnter()) return;
  if (busy) { toast('Yanıt sürüyor — durdurmak için ■'); return; }
  if (!S.apis.length) { toast('Önce bir API bağla'); apiDialog(); return; }
  const um = { id: uid(), role: 'user', text: v, ts: Date.now() };
  if (cur.title === 'Yeni sohbet') cur.title = v.replace(/\s+/g, ' ').slice(0, 42);
  cur.messages.push(um); touch(); stick = true; renderMsg(um); setInp('');
  logw(cur, '\n[' + hm() + '] ❯ KULLANICI:\n' + v);
  runTurn(v);
}
function stop() { if (CTL) CTL.abort(); }
function retry() {
  if (busy) return;
  let i = cur.messages.length - 1; while (i >= 0 && cur.messages[i].role !== 'user') i--;
  if (i < 0) return;
  const um = cur.messages[i];
  cur.messages.splice(i + 1).forEach(x => { const e = ELS.get(x.id); if (e) { e.remove(); ELS.delete(x.id); } });
  runTurn(um.text);
}
function updateSend() {
  const b = $('#send'); const stopMode = busy && !inp().value.trim();
  b.classList.toggle('stop', stopMode); b.innerHTML = ic(stopMode ? 'stop' : 'up');
}

/* ============ giriş / palet ============ */
let PAL = { items: [] };
function setInp(v) { const i = inp(); i.value = v; autoGrow(); updatePal(); updateSend(); }
function autoGrow() { const i = inp(); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 140) + 'px'; }
const ALIAS = { settings: 'ayarlar', chat: 'sohbet', new: 'yeni', clear: 'temizle', help: 'yardim', yardım: 'yardim', thinking: 'think', dusunme: 'think', düşünme: 'think' };
function resolveName(n) {
  n = n.toLowerCase(); n = ALIAS[n] || n; if (CMD[n]) return n;
  const c = Object.keys(CMD).filter(k => k.startsWith(n)); return c.length === 1 ? c[0] : null;
}
function parseCmd(v) {
  const m = /^\/([^\s\/]*)([\s\S]*)$/.exec(v); const name = m[1].toLowerCase(), rest = m[2]; const n = resolveName(name);
  let arg; if (rest === '') arg = null; else if (n === 'model') arg = rest.startsWith(' ') ? rest.slice(1) : rest; else arg = rest.replace(/^[\s\/]/, '');
  return { name, arg };
}
function computePal(v) {
  const { name, arg } = parseCmd(v);
  if (arg === null) {
    return Object.keys(CMD).filter(k => k.startsWith(name) || (ALIAS[name] === k)).map(k => {
      const c = CMD[k], takes = c.a || c.sel || c.pal;
      return { k: '/' + k, d: c.d, fill: takes ? '/' + k + ' ' : null, run: takes ? null : () => exec(k, '') };
    });
  }
  const n = resolveName(name); const c = n && CMD[n]; if (!c) return [];
  if (c.pal) return c.pal(arg);
  return [{ k: '/' + n + ' ' + arg, d: 'Enter ile çalıştır', run: () => exec(n, arg.trim()) }];
}
function updatePal() {
  const v = inp().value; const p = $('#pal');
  const items = v.startsWith('/') ? computePal(v) : null; PAL.items = items || [];
  if (!items || !items.length) { p.classList.add('hide'); p.innerHTML = ''; return; }
  p.classList.remove('hide');
  p.innerHTML = items.slice(0, 60).map((it, i) => `<div class="pi${it.active ? ' act' : ''}" data-i="${i}"><div class="pl"><div class="pk">${esc(it.k)}</div><div class="pd">${esc(it.d || '')}</div></div>${it.starFn ? `<button class="pst${it.star ? ' on' : ''}" data-s="${i}">${ic('star')}</button>` : ''}</div>`).join('');
}
function pick(i) {
  const it = PAL.items[i]; if (!it) return;
  if (it.run) { const r = it.run(); if (r !== 'keep') setInp(''); } else if (it.fill != null) setInp(it.fill);
  inp().focus();
}
function onEnter() {
  const v = inp().value; const pc = parseCmd(v); const name = resolveName(pc.name); const arg = (pc.arg || '').trim(); const c = name && CMD[name];
  if (c) {
    if (c.sel) { if (pc.arg === null || !arg) return true; const it = PAL.items[0]; if (it) pick(0); return true; }
    const r = exec(name, arg); setInp(r === 'keep' ? v : ''); return true;
  }
  const it = PAL.items[0]; if (it) { pick(0); return true; }
  toast('Bilinmeyen komut. Düz mesaj için başına boşluk koy.'); return true;
}

/* ============ komutlar ============ */
function sys(cmd, text) { const m = { id: uid(), role: 'sys', cmd, text, local: true, ts: Date.now() }; cur.messages.push(m); touch(); stick = true; renderMsg(m); }
function args(a) { const o = []; String(a || '').replace(/"([^"]*)"|(\S+)/g, (m, x, y) => { o.push(x != null ? x : y); return m; }); return o; }
const pathItems = (name, dirsOnly) => arg => {
  const a = arg || ''; if (/\s/.test(a)) return [];
  const i = a.lastIndexOf('/'); const dp = i >= 0 ? a.slice(0, i + 1) : ''; const pre = a.slice(i + 1).toLowerCase();
  const r = N.list(rp(dp || '.')); if (!r.ok) return [];
  return r.entries.filter(e => (!dirsOnly || e.d) && e.n.toLowerCase().startsWith(pre)).slice(0, 50)
    .map(e => ({ k: (e.d ? '▸ ' : '· ') + e.n, d: e.d ? 'klasör' : hsz(e.s), fill: '/' + name + ' ' + dp + e.n + (e.d ? '/' : '') }));
};
function cdItems(arg) {
  const q = (arg || '').toLowerCase(); const r = N.list(S.cwd); const L = [];
  L.push({ k: 'Raphael', d: 'uygulamanın proje klasörü (otomatik proje klasörleri)', run: () => { S.cwd = 'Raphael'; N.mkdir('Raphael'); saveS(); renderChips(); setInp('/cd '); return 'keep'; } });
  L.push({ k: '/ (kök)', d: 'depolama kökü', run: () => { S.cwd = ''; saveS(); renderChips(); setInp('/cd '); return 'keep'; } });
  if (S.cwd) L.push({ k: '.. (yukarı)', d: '/' + S.cwd.split('/').slice(0, -1).join('/'), run: () => { S.cwd = S.cwd.split('/').slice(0, -1).join('/'); saveS(); renderChips(); setInp('/cd '); return 'keep'; } });
  if (r.ok) r.entries.filter(e => e.d && e.n.toLowerCase().includes(q)).forEach(e => L.push({ k: '▸ ' + e.n, d: 'içine gir', run: () => { S.cwd = (S.cwd ? S.cwd + '/' : '') + e.n; saveS(); renderChips(); setInp('/cd '); return 'keep'; } }));
  return L;
}
function cmdCd(a) {
  if (!a) { toast('/cd yazıp listeden klasör seç'); return 'keep'; }
  const p = rp(a); const r = N.list(p); if (!r.ok) { sys('cd ' + a, '✗ ' + r.error); return; }
  S.cwd = p; saveS(); renderChips(); toast('Çalışma klasörü: /' + p);
}
const slug = a => norm(a.name).replace(/\s+/g, '-');
function lev(a, b) { const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function tokOk(t, hay, fz) { if (hay.includes(t)) return true; if (!fz || t.length < 4) return false; return hay.split(' ').some(w => w.length >= 3 && lev(t, w.slice(0, t.length)) <= (t.length >= 6 ? 2 : 1)); }
function filterModels(list, q) { // önce tam eşleşme; yoksa yazım hatasına tolerans
  const toks = norm(q).split(' ').filter(Boolean); if (!toks.length) return list;
  const hay = x => norm(x.model.id + ' ' + x.model.label + ' ' + x.api.name);
  let r = list.filter(x => { const h = hay(x); return toks.every(t => tokOk(t, h, false)); });
  if (!r.length) r = list.filter(x => { const h = hay(x); return toks.every(t => tokOk(t, h, true)); });
  return r;
}
function modelRow(x, cr) {
  const qt = quota(x);
  return { k: x.model.label, d: x.api.name + ' · bugün ' + qt.used + (qt.lim ? '/' + qt.lim : '') + (x.model.missing ? ' · ⚠ listede yok' : ''), star: x.model.pin, active: x.ref === cr, run: () => setModel(x.ref), starFn: () => { x.model.pin = !x.model.pin; saveS(); } };
}
function providerItems(q) {
  const qq = norm(q).replace(/\s+/g, '-'); const cr = curModelRef();
  const rows = S.apis.filter(a => !qq || slug(a).startsWith(qq) || a.type.startsWith(qq)).map(a => ({ k: '/model/' + slug(a), d: a.name + ' · ' + a.models.length + ' model · ★ ' + a.models.filter(m => m.pin).length, fill: '/model/' + slug(a) + '/' }));
  if (qq && !rows.length) return filterModels(allModels(), q).sort((a, b) => (b.model.pin ? 1 : 0) - (a.model.pin ? 1 : 0)).slice(0, 40).map(x => modelRow(x, cr));
  if (!qq) allModels().filter(x => x.model.pin).slice(0, 10).forEach(x => rows.push(modelRow(x, cr)));
  return rows;
}
function modelItems(arg) {
  const a = String(arg || '').replace(/^ /, ''); const cr = curModelRef(); let pool = allModels(), q = a;
  if (a.startsWith('/')) {
    const rest = a.slice(1); const i = rest.indexOf('/');
    if (i < 0) return providerItems(rest);
    const prov = norm(rest.slice(0, i)).replace(/\s+/g, '-'); q = rest.slice(i + 1);
    const sel = S.apis.filter(x => slug(x).startsWith(prov) || x.type === prov || slug(x).includes(prov));
    if (sel.length) pool = pool.filter(x => sel.includes(x.api));
  } else if (!a.trim()) return providerItems('');
  const L = filterModels(pool, q).sort((x, y) => (y.model.pin ? 1 : 0) - (x.model.pin ? 1 : 0));
  const items = L.slice(0, 50).map(x => modelRow(x, cr));
  const id = q.trim();
  if (!L.length && id && /^[\w.\-/:]+$/.test(id) && S.apis.length) items.push({ k: '+ "' + id + '" ekle ve kullan', d: 'Model kimliği olarak eklenir', run: () => addModelId(id) });
  return items;
}
function setModel(ref) { cur.model = ref; saveChat(cur); renderChips(); toast('Model: ' + labelOf(ref)); }
function addModelId(id) {
  const cr = findModel(curModelRef()); const api = cr ? cr.api : S.apis[0];
  api.models.unshift({ id, label: id, pin: true, man: true }); saveS(); setModel(api.id + '|' + id);
}
function thinkItems(a) {
  const t = a.trim().toLowerCase(); const map = [['low', 'düşük', 'hızlı, az token'], ['medium', 'orta', 'dengeli'], ['high', 'yüksek', 'en derin düşünme']];
  return map.filter(x => !t || x[0].startsWith(t) || x[1].startsWith(t)).map(x => ({ k: x[1], d: x[2], active: S.think === x[0], run: () => { S.think = x[0]; saveS(); renderChips(); toast('Düşünme: ' + x[1]); } }));
}
function agentItems(a) {
  const t = a.trim().toLowerCase(), parts = t.split(/\s+/), sub = parts[0] || '';
  if (/\s/.test(a.trimStart()) && sub === 'kullan') {
    const q = parts.slice(1).join(' '); const cur0 = String(S.rph.flow || 'agent.json');
    return listFlows().filter(f => !q || f.toLowerCase().includes(q)).map(f => ({ k: f, d: f === cur0 ? 'şu an etkin' : 'etkin akış yap', active: f === cur0, run: () => { S.rph.flow = f; saveS(); renderChips(); toast('Etkin akış: ' + f); sys('agent kullan ' + f, flowReport()); } }));
  }
  return [['dogrula', 'Akışı kontrol et (hata, uyarı, modeller, tahmini istek)', { run: () => { sys('agent dogrula', flowReport()); } }], ['kur', 'Raphael/agent klasörünü ve şablonları oluştur (var olanı silmez)', { run: () => { const m = setupAgentDir(false); sys('agent kur', m.length ? '✓ Oluşturulan dosyalar:\n' + m.map(x => '/' + AGENT_DIR + '/' + x).join('\n') : '✓ Her şey zaten hazır: /' + AGENT_DIR); } }],
    ['kullan', 'Etkin akış dosyasını seç (ornekler dahil)', { fill: '/agent kullan ' }], ['doc', 'AGENT.md rehberini yeniden yaz', { run: () => { setupAgentDir(true); sys('agent doc', '✓ /' + AGENT_DIR + '/AGENT.md güncellendi'); } }],
    ['araclar', 'Dosya oluşturma/düzenleme komut dili', { run: () => sys('agent araclar', TOOL_DOC) }]]
    .filter(x => x[0].startsWith(sub)).map(x => Object.assign({ k: '/agent ' + x[0], d: x[1] }, x[2]));
}
function apiItems(a) {
  const t = a.trim().toLowerCase(), parts = t.split(/\s+/), s = parts[0] || '';
  if (/\s/.test(a.trimStart()) && (s === 'sil' || s === 'yenile')) {
    const q = parts.slice(1).join(' ');
    const L = S.apis.filter(x => x.name.toLowerCase().includes(q)).map(x => ({ k: x.name, d: (s === 'sil' ? 'Sil · ' : 'Yenile · ') + x.models.length + ' model', run: () => s === 'sil' ? delApi(x.id) : syncOne(x.id) }));
    if (s === 'yenile') L.unshift({ k: 'Hepsi', d: 'Tüm API’ler', run: () => syncAll() });
    return L;
  }
  return [['ekle', 'Yeni API bağla', { run: () => apiDialog() }], ['liste', 'Bağlı API’leri göster', { run: () => cmdApiList() }], ['yenile', 'Modelleri yeniden çek', { fill: '/api yenile ' }], ['sil', 'Bir API’yi sil', { fill: '/api sil ' }]]
    .filter(x => x[0].startsWith(s)).map(x => Object.assign({ k: '/api ' + x[0], d: x[1] }, x[2]));
}
function cmdApiList() {
  sys('api liste', S.apis.map(a => `${a.name} [${a.type}] — ${a.models.length} model, ${a.models.filter(m => m.pin).length} favori`).join('\n') || 'Bağlı API yok. /api ekle');
}
async function syncOne(id) { const a = S.apis.find(x => x.id === id); if (!a) return; toast('Modeller çekiliyor…'); try { const n = await syncApi(a); autoRoles(); toast(a.name + ': ' + n + ' model'); } catch (e) { toast('Senkron hatası: ' + errMsg(e).slice(0, 90)); } renderChips(); if (settingsOpen()) renderSettings(); }
async function syncAll() { for (const a of S.apis) await syncOne(a.id); }
async function delApi(id) {
  const a = S.apis.find(x => x.id === id); if (!a) return;
  const ok = await dialog({ title: 'API silinsin mi?', msg: a.name + ' bağlantısı ve anahtarı bu cihazdan silinecek.', ok: 'Sil', danger: true }); if (!ok) return;
  S.apis = S.apis.filter(x => x.id !== id); autoRoles(); saveS(); renderChips(); if (settingsOpen()) renderSettings(); toast('API silindi');
}
async function apiDialog() {
  const r = await dialog({
    title: 'API bağla', fields: [
      { k: 'type', label: 'Sağlayıcı', type: 'select', options: [['gemini', 'Google Gemini'], ['nvidia', 'NVIDIA (build.nvidia.com)'], ['openrouter', 'OpenRouter'], ['openai', 'OpenAI uyumlu (özel)']] },
      { k: 'name', label: 'İsim', ph: 'örn. Gemini ana' },
      { k: 'key', label: 'API anahtarı', type: 'password', ph: 'AQ.… · nvapi-… · sk-or-…' },
      { k: 'base', label: 'Base URL (yalnız özel)', ph: 'https://api.groq.com/openai/v1' }
    ], ok: 'Bağla'
  });
  if (!r) return;
  if (!r.key.trim()) { toast('API anahtarı boş'); return; }
  if (r.type === 'openai' && !r.base.trim()) { toast('Özel API için Base URL gerekli'); return; }
  const api = { id: uid(), type: r.type, name: r.name.trim() || { gemini: 'Gemini', nvidia: 'NVIDIA', openrouter: 'OpenRouter', openai: 'Özel API' }[r.type], key: r.key.trim(), base: r.base.trim(), models: presetsFor(r.type), synced: 0 };
  S.apis.push(api); autoRoles(); saveS(); renderChips(); toast('Modeller çekiliyor…');
  try { const n = await syncApi(api); toast(n + ' model bulundu'); } catch (e) { toast('Bağlandı ama liste alınamadı: ' + errMsg(e).slice(0, 80)); }
  autoRoles(); saveS(); renderChips(); renderChat(); if (settingsOpen()) renderSettings();
}
function setMode(m) { cur.mode = m; saveChat(cur); renderAll(); if (m === 'agent' && !S.defModel) toast('Önce bir API bağla'); }

const CMD = {
  model: { d: 'Model seç: /model/nvidia/deepseek', sel: 1, pal: modelItems },
  api: { d: 'API bağla ve yönet', sel: 1, pal: apiItems },
  think: { d: 'Düşünme seviyesi', sel: 1, pal: thinkItems },
  raphael: { d: 'Raphael (agent) moduna geç', run: () => setMode('agent') },
  sohbet: { d: 'Normal sohbete geç', run: () => setMode('chat') },
  agent: { d: 'Agent sistemi: kur / dogrula / kullan / doc / araclar', sel: 1, pal: agentItems },
  komutlar: { d: 'Dosya oluşturma/düzenleme komut dili', run: () => sys('komutlar', TOOL_DOC) },
  log: { d: 'Bu sohbetin günlüğünü Download/RaphaelLog’a kaydet', run: async () => { const r = await exportLog(cur); sys('log', r.ok ? '✓ Günlük kaydedildi: ' + r.path + ' (' + hsz(r.size) + ')\nBu .txt dosyasını paylaşabilirsin.' : '✗ ' + r.error); } },
  onar: { d: 'Klasördeki dosyalardan CDATA/``` artıklarını temizle', a: 1, run: a => { const r = repairTree(a || ''); sys('onar ' + (a || ''), r.ok ? (r.fixed ? '✓ ' + r.fixed + '/' + r.seen + ' dosya onarıldı:\n' + r.list.join('\n') : '✓ ' + r.seen + ' dosya tarandı, temiz') : '✗ ' + r.error); } },
  cd: { d: 'Çalışma klasörünü seç', a: 1, pal: cdItems, run: cmdCd },
  pwd: { d: 'Çalışma klasörünü göster', run: () => sys('pwd', '/' + S.cwd) },
  ls: { d: 'Klasörü listele', a: 1, pal: pathItems('ls'), run: a => { const r = N.list(rp(a || '.')); sys('ls ' + (a || ''), r.ok ? (r.entries.map(e => (e.d ? '▸ ' : '  ') + e.n + (e.d ? '/' : '  ' + hsz(e.s))).join('\n') || '(boş)') : '✗ ' + r.error); } },
  tree: { d: 'Klasör ağacı', a: 1, pal: pathItems('tree', true), run: a => { const r = N.tree(rp(a || '.'), 3); sys('tree ' + (a || ''), r.ok ? fmtTree(r.entries, 300) : '✗ ' + r.error); } },
  cat: { d: 'Dosya içeriğini göster', a: 1, pal: pathItems('cat'), run: a => { const r = N.read(rp(a), 6000); sys('cat ' + a, r.ok ? r.content + (r.truncated ? '\n…[kesildi]' : '') : '✗ ' + r.error); } },
  mkdir: { d: 'Klasör oluştur', a: 1, run: a => { const r = N.mkdir(rp(a)); sys('mkdir ' + a, r.ok ? '✓ ' + r.path : '✗ ' + r.error); } },
  rm: { d: 'Sil (onaylı)', a: 1, pal: pathItems('rm'), run: async a => { if (!a) return; const ok = await dialog({ title: 'Silinsin mi?', msg: '/' + rp(a), ok: 'Sil', danger: true }); if (!ok) return; const r = N.del(rp(a)); sys('rm ' + a, r.ok ? '✓ silindi ' + r.path : '✗ ' + r.error); } },
  mv: { d: 'Taşı / yeniden adlandır: /mv kaynak hedef', a: 1, run: a => { const x = args(a); if (x.length < 2) return sys('mv', 'Kullanım: /mv kaynak hedef'); const r = N.mv(rp(x[0]), rp(x[1])); sys('mv ' + a, r.ok ? '✓ → ' + r.path : '✗ ' + r.error); } },
  cp: { d: 'Kopyala: /cp kaynak hedef', a: 1, run: a => { const x = args(a); if (x.length < 2) return sys('cp', 'Kullanım: /cp kaynak hedef'); const r = N.cp(rp(x[0]), rp(x[1])); sys('cp ' + a, r.ok ? '✓ → ' + r.path : '✗ ' + r.error); } },
  zip: { d: 'Zip oluştur: /zip kaynak [hedef.zip]', a: 1, pal: pathItems('zip'), run: a => { const x = args(a); if (!x.length) return sys('zip', 'Kullanım: /zip kaynak [hedef.zip]'); const s = rp(x[0]); const r = N.zip(s, x[1] ? rp(x[1]) : s.replace(/\/+$/, '') + '.zip'); sys('zip ' + a, r.ok ? '✓ ' + r.path + ' (' + hsz(r.size) + ')' : '✗ ' + r.error); } },
  unzip: { d: 'Zip aç: /unzip dosya.zip [hedef]', a: 1, pal: pathItems('unzip'), run: a => { const x = args(a); if (!x.length) return sys('unzip', 'Kullanım: /unzip dosya.zip [hedef]'); const s = rp(x[0]); const r = N.unzip(s, x[1] ? rp(x[1]) : s.replace(/\.zip$/i, '')); sys('unzip ' + a, r.ok ? '✓ ' + r.path + ' (' + r.count + ' dosya)' : '✗ ' + r.error); } },
  find: { d: 'Dosya adı ara', a: 1, run: a => { const r = N.search(rp('.'), a, false); sys('find ' + a, r.ok ? (r.results.join('\n') || '(sonuç yok)') : '✗ ' + r.error); } },
  grep: { d: 'Dosya içinde metin ara', a: 1, run: a => { const r = N.search(rp('.'), a, true); sys('grep ' + a, r.ok ? (r.results.join('\n') || '(sonuç yok)') : '✗ ' + r.error); } },
  yeni: { d: 'Yeni sohbet', run: () => { cur = newChat(); renderAll(); closeDrawer(); } },
  temizle: { d: 'Bu sohbetin mesajlarını sil', run: async () => { const ok = await dialog({ title: 'Sohbet temizlensin mi?', msg: 'Bu sohbetteki tüm mesajlar silinir.', ok: 'Temizle', danger: true }); if (!ok) return; cur.messages = []; if (DB.db) DB.set('chat:' + cur.id, cur); renderAll(); } },
  stats: { d: 'Bugünkü istek/token kullanımı', run: () => { const u = usage(); const L = allModels().filter(x => u.n[x.ref]).map(x => x.model.label + ': ' + u.n[x.ref] + (x.model.limit ? '/' + x.model.limit : '') + ' istek · ' + tk(u.i[x.ref]) + '↑ ' + tk(u.o[x.ref]) + '↓'); sys('stats', L.join('\n') || 'Bugün henüz istek yok'); } },
  export: { d: 'Sohbeti Download klasörüne .md olarak kaydet', run: () => { const t = '# ' + cur.title + '\n\n' + cur.messages.filter(m => m.role === 'user' || (m.role === 'ai' && m.text)).map(m => (m.role === 'user' ? '**Sen:** ' : '**AI:** ') + m.text).join('\n\n'); const p = 'Download/' + (cur.title.replace(/[^\w\u00c0-\u024f]+/g, '_') || 'sohbet') + '.md'; const r = N.write(p, t, false); sys('export', r.ok ? '✓ /' + p : '✗ ' + r.error); } },
  ayarlar: { d: 'Ayarları aç', run: () => openSettings() },
  yardim: { d: 'Komut listesi', run: () => sys('help', Object.keys(CMD).map(k => ('/' + k).padEnd(10) + CMD[k].d).join('\n')) }
};
function exec(name, arg) { const c = CMD[name]; if (!c || !c.run) return; return c.run(arg); }

/* ============ günlük dışa aktarma ============ */
async function exportLog(chat) {
  const t = await getLog(chat.id); if (!t) return { ok: false, error: 'Bu sohbette günlük yok' };
  let cfgTxt = ''; try { const r = N.read(flowFile(), 8000); cfgTxt = r.ok ? r.content : '(okunamadı)'; } catch (e) { /* yoksay */ }
  const head = 'RAPHAEL CODE GÜNLÜĞÜ\nSohbet: ' + chat.title + ' (' + chat.id + ')\nOluşturulma: ' + new Date().toLocaleString('tr-TR') + '\nAkış: /' + flowFile() + ' · klasör: /' + S.cwd + ' · düşünme (varsayılan): ' + S.think + '\n--- akış dosyası ---\n' + cfgTxt + '\n' + '─'.repeat(40) + '\n';
  const path = 'Download/RaphaelLog/' + ((chat.title || 'sohbet').replace(/[^\w\u00c0-\u024f]+/g, '_').slice(0, 30) || 'sohbet') + '-' + chat.id.slice(-4) + '.txt';
  const w = N.write(path, head + t, false); return w.ok ? { ok: true, path: '/' + path, size: (head + t).length } : { ok: false, error: w.error };
}

/* ============ chip’ler / üst bar ============ */
function renderChips() {
  const ag = cur.mode === 'agent'; let h = '';
  if (!ag) {
    const f = findModel(curModelRef()); const q = f ? quota(f) : null;
    h += `<button class="chip mod ${q ? q.cls : ''}" data-fill="/model "><i class="qd"></i><span>${esc(f ? shortOf(f.ref) : 'model seç')}</span>${ic('down')}</button>`;
  } else {
    h += `<button class="chip rph" data-fill="/agent ">${ic('spark')}<span>Raphael · ${esc(String(S.rph.flow || 'agent.json').replace(/\.json$/, ''))}</span></button>`;
    h += `<button class="chip" data-fill="/cd ">${ic('folder')}<span>${esc(S.cwd ? '/' + S.cwd : '/')}</span></button>`;
  }
  h += `<button class="chip" data-fill="/think ">${ic('think')}<span>${THINK_TR[S.think]}</span></button>`;
  $('#chips').innerHTML = h;
}

/* ============ çekmece ============ */
const drawerOpen = () => $('#drawer').classList.contains('open');
function openDrawer() { renderDrawer(); $('#drawer').classList.add('open'); $('#scrim').classList.remove('hide'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.add('hide'); }
function renderDrawer() {
  $('#drawer').innerHTML = `<div class="dh"><div class="logo">raphael<span>code</span></div><button class="ib" data-d="close">${ic('x')}</button></div>
  <button class="newc" data-d="new">${ic('plus')} Yeni sohbet</button><input id="dq" placeholder="Sohbetlerde ara…" autocomplete="off"><div class="dl"></div>
  <button class="setb" data-d="set">${ic('gear')} Ayarlar</button>`;
  renderDrawerList('');
}
function renderDrawerList(q) {
  const L = CH.filter(c => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  $('#drawer .dl').innerHTML = L.map(c => `<div class="di${c === cur ? ' on' : ''}" data-id="${c.id}"><div class="dt"><span class="bd">${c.mode === 'agent' ? '✦' : '◇'}</span><span class="tt">${esc(c.title)}</span></div><div class="ds">${ago(c.updated)}</div><button class="ib sm" data-del="${c.id}">${ic('trash')}</button></div>`).join('') || '<div class="empty">Henüz sohbet yok</div>';
}
async function delChat(id) {
  const c = CH.find(x => x.id === id); if (!c) return;
  const ok = await dialog({ title: 'Sohbet silinsin mi?', msg: c.title, ok: 'Sil', danger: true }); if (!ok) return;
  CH = CH.filter(x => x !== c); if (DB.db) { DB.del('chat:' + id); DB.del('log:' + id); }
  if (c === cur) { cur = newChat(); renderAll(); }
  renderDrawerList($('#dq') ? $('#dq').value : '');
}

/* ============ diyalog ============ */
let DLG = null;
function fieldHtml(f) {
  const id = 'f_' + f.k; const lab = `<label for="${id}">${esc(f.label)}</label>`;
  if (f.type === 'select') return lab + `<select id="${id}">${f.options.map(o => `<option value="${esc(o[0])}"${o[0] === f.value ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  if (f.type === 'textarea') return lab + `<textarea id="${id}" rows="4" placeholder="${esc(f.ph || '')}">${esc(f.value || '')}</textarea>`;
  return lab + `<input id="${id}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.ph || '')}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
}
function dialog(o) {
  return new Promise(res => {
    const M = $('#modal'); const fields = o.fields || [];
    M.innerHTML = `<div class="dlg"><h3>${esc(o.title)}</h3>${o.msg ? `<p>${esc(o.msg)}</p>` : ''}${fields.map(fieldHtml).join('')}<div class="dbtn"><button class="btn" data-x="0">${o.cancel || 'Vazgeç'}</button><button class="btn ${o.danger ? 'dng' : 'pri'}" data-x="1">${o.ok || 'Tamam'}</button></div></div>`;
    M.classList.remove('hide');
    const done = v => { M.classList.add('hide'); M.innerHTML = ''; DLG = null; res(v); };
    DLG = () => done(null);
    M.onclick = e => {
      const b = e.target.closest('[data-x]');
      if (b) { if (b.dataset.x === '0') return done(null); const v = {}; fields.forEach(f => { v[f.k] = $('#f_' + f.k).value; }); return done(fields.length ? v : true); }
      if (e.target === M) done(null);
    };
    M.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const ok = M.querySelector('[data-x="1"]'); if (ok) ok.click(); } };
    const f0 = $('input,textarea', M); if (f0) setTimeout(() => f0.focus(), 120);
  });
}

/* ============ kod bloğu: kopyala / kaydet ============ */
const EXT = { html: 'html', css: 'css', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', gdscript: 'gd', gd: 'gd', json: 'json', kotlin: 'kt', java: 'java', bash: 'sh', sh: 'sh', markdown: 'md', md: 'md', xml: 'xml', csharp: 'cs', cs: 'cs', c: 'c', cpp: 'cpp', yaml: 'yml', toml: 'toml', sql: 'sql' };
async function saveCode(code, lang) {
  const ext = EXT[(lang || '').toLowerCase()] || 'txt';
  const r = await dialog({ title: 'Dosyaya kaydet', msg: 'Yol, çalışma klasörüne göredir. "/Download/x.html" gibi yazarsan depolama kökünden başlar.', fields: [{ k: 'p', label: 'Dosya yolu', value: (S.cwd ? '' : '/Download/') + 'dosya.' + ext }], ok: 'Kaydet' });
  if (!r || !r.p.trim()) return;
  const w = N.write(rp(r.p), code + '\n', false); toast(w.ok ? 'Kaydedildi: ' + w.path : 'Hata: ' + w.error);
}

/* ============ ayarlar (kategori sayfaları) ============ */
let SPAGE = 'home', MSHOW = 60;
const settingsOpen = () => $('#settings').classList.contains('open');
const PAGES = { home: 'Ayarlar', api: 'Bağlantılar (API)', models: 'Modeller', raphael: 'Raphael agent sistemi', chat: 'Sohbet', look: 'Görünüm ve bildirim', data: 'Veri ve günlük' };
function pageTitle(p) { if (p.startsWith('models:')) { if (p === 'models:all') return 'Tüm modeller'; const a = S.apis.find(x => x.id === p.slice(7)); return a ? a.name : 'Modeller'; } return PAGES[p] || 'Ayarlar'; }
const parentPage = p => p.startsWith('models:') ? 'models' : 'home';
function goPage(p) { SPAGE = p; MSHOW = 60; renderSettings(true); }
function openSettings(p) { closeDrawer(); SPAGE = p || 'home'; renderSettings(true); $('#settings').classList.add('open'); }
function closeSettings() { $('#settings').classList.remove('open'); SPAGE = 'home'; renderChips(); }
function settingsBack() { if (SPAGE === 'home') closeSettings(); else goPage(parentPage(SPAGE)); }
function modelOpts(val, def) { return '<option value="">' + esc(def || '(seçilmedi)') + '</option>' + allModels().map(x => `<option value="${esc(x.ref)}"${x.ref === val ? ' selected' : ''}>${esc(x.model.label)} — ${esc(x.api.name)}</option>`).join(''); }
const nav = (go, icon, t, d) => `<button class="nav" data-go="${go}">${ic(icon)}<span class="nt"><b>${t}</b><small>${esc(d)}</small></span>${ic('down', 'nchev')}</button>`;
const sNum = (p, l, hint) => `<label>${l}</label><input type="number" inputmode="numeric" data-s="${p}" value="${getPath(S, p)}">${hint ? `<small>${hint}</small>` : ''}`;
const sChk = (p, l) => `<label class="ck"><input type="checkbox" data-s="${p}"${getPath(S, p) ? ' checked' : ''}><span>${l}</span></label>`;
const PG = {
  home() {
    const n = allModels().length, pin = allModels().filter(x => x.model.pin).length;
    return nav('api', 'refresh', 'Bağlantılar (API)', S.apis.length + ' API bağlı') + nav('models', 'star', 'Modeller', n + ' model · ★ ' + pin + ' favori · limitler')
      + nav('raphael', 'spark', 'Raphael agent sistemi', 'Akış: ' + (S.rph.flow || 'agent.json') + ' · klasör: Raphael/agent')
      + nav('chat', 'copy', 'Sohbet', 'Varsayılan model ve talimat') + nav('look', 'gear', 'Görünüm ve bildirim', 'Yazı ' + S.fontSize + ' px · bildirim ' + (S.notify ? 'açık' : 'kapalı')) + nav('data', 'folder', 'Veri ve günlük', 'Günlük ' + (S.log ? 'açık' : 'kapalı') + ' · yedek · izin');
  },
  api() {
    return '<section>' + (S.apis.map(a => `<div class="card"><div class="ct"><b>${esc(a.name)}</b><span class="tag">${a.type}</span></div><div class="cd">${a.models.length} model · ${a.synced ? new Date(a.synced).toLocaleString('tr-TR') : 'senkronize edilmedi'}</div><div class="cb"><button class="btn" data-sync="${a.id}">Modelleri yenile</button><button class="btn dng" data-delapi="${a.id}">Sil</button></div></div>`).join('') || '<p class="dim">Henüz API yok.</p>') + `<button class="btn pri" data-st="addapi">${ic('plus')} API ekle</button></section>`;
  },
  models() {
    const tot = allModels(); return '<section><small>Bir sağlayıcı seç; ★ olanlar üstte, diğerleri altta listelenir. Her modele günlük istek limiti yazabilirsin.</small></section>'
      + nav('models:all', 'star', 'Tüm modeller', tot.length + ' model · ★ ' + tot.filter(x => x.model.pin).length)
      + S.apis.map(a => nav('models:' + a.id, 'folder', esc(a.name), a.models.length + ' model · ★ ' + a.models.filter(m => m.pin).length)).join('');
  },
  modelsx() { return '<section><input id="msq" placeholder="Model ara…" autocomplete="off"><div id="mlist"></div></section>'; },
  raphael() {
    const flows = listFlows(); const cur0 = String(S.rph.flow || 'agent.json'); if (!flows.includes(cur0)) flows.unshift(cur0);
    return `<section><h3>Kendi agent sistemin</h3><small>Ajanları, modellerini, talimatlarını ve çalışma sırasını sen belirlersin. Her şey <b>/storage/emulated/0/Raphael/agent/</b> klasöründeki dosyalarla tanımlanır; rehber orada <b>AGENT.md</b> dosyasıdır.</small>
    <label>Etkin akış dosyası</label><select data-s="rph.flow">${flows.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
    <button class="btn pri" data-st="agentkur">Klasörü ve şablonları hazırla</button><button class="btn" data-st="agentcheck">Akışı doğrula</button>
    <button class="btn" data-st="copytools">Dosya komut dilini kopyala</button><button class="btn" data-st="agentdoc">AGENT.md’yi yeniden yaz</button>
    <pre id="acheck" class="chk hide"></pre></section>
    <section><h3>Varsayılanlar</h3><small>Akış dosyasındaki "butce" ve "bekleme" bunların yerine geçer.</small>
    ${sNum('rph.budget', 'Görev başına istek bütçesi')}<label>Bekleme süreleri (sn, virgüllü)</label><input type="text" data-s="rph.waits" value="${esc(S.rph.waits)}">
    ${sChk('rph.confirmRm', 'Silmeden önce onay iste')}</section>
    <section><h3>Bağlam paketi ({baglam})</h3>${sNum('rph.packFiles', 'Maks. dosya')}${sNum('rph.perFile', 'Dosya başı karakter')}${sNum('rph.packChars', 'Toplam karakter')}</section>`;
  },
  chat() {
    return `<section><label>Varsayılan model</label><select data-s="defModel">${modelOpts(S.defModel)}</select>
    <label>Düşünme seviyesi</label><select data-s="think"><option value="low">düşük</option><option value="medium">orta</option><option value="high">yüksek</option></select>
    ${sNum('ctxChars', 'Bağlam hafızası (karakter)', 'Sohbette modele geri gönderilen geçmiş miktarı.')}
    <label>Sistem talimatı</label><textarea rows="7" data-s="chatSystem"></textarea><button class="btn" data-reset="chat">Varsayılana dön</button></section>`;
  },
  look() {
    return `<section><label>Yazı boyutu: <span id="fsv">${S.fontSize}</span> px</label><input type="range" min="13" max="19" data-s="fontSize" value="${S.fontSize}">
    ${sChk('notify', 'İş bitince bildirim gönder (uygulama arka plandayken)')}</section>`;
  },
  data() {
    return `<section><h3>Günlük</h3><small>Her sohbet için istek, düşünce zinciri, çıktı, araç sonuçları ve hatalar sırayla bir .txt günlüğüne yazılır. Dosyayı paylaşarak Raphael’ın doğru çalışıp çalışmadığını inceletebilirsin. Yer: Download/RaphaelLog</small>
    ${sChk('log', 'Günlük tut')}${sChk('logFull', 'Günlükte tam girdi ve sistem talimatını da yaz (büyük dosya)')}
    <button class="btn pri" data-st="exportlog">Bu sohbetin günlüğünü kaydet</button></section>
    <section><h3>İzin ve yedek</h3><p class="dim">Dosya izni: ${N.has() ? 'verildi ✓' : 'verilmedi'}</p><button class="btn" data-st="perm">Dosya izni iste</button>
    <button class="btn" data-st="export">Tüm sohbetleri Download’a yedekle</button><button class="btn dng" data-st="wipe">Tüm sohbetleri sil</button></section>`;
  }
};
function renderSettings(top) {
  const el = $('#settings'); const sc = top ? 0 : (($('.sb', el) || {}).scrollTop || 0);
  const pg = SPAGE.startsWith('models:') ? PG.modelsx() : (PG[SPAGE] || PG.home)();
  el.innerHTML = `<div class="sh"><button class="ib" data-st="back">${ic('back')}</button><h2>${esc(pageTitle(SPAGE))}</h2></div><div class="sb">${pg}</div>`;
  $$('textarea[data-s]', el).forEach(t => { t.value = getPath(S, t.dataset.s) || ''; });
  $$('select[data-s]', el).forEach(x => { const v = getPath(S, x.dataset.s); if ([...x.options].some(o => o.value === v)) x.value = v; });
  if (SPAGE.startsWith('models:')) renderMList(''); $('.sb', el).scrollTop = sc;
}
function renderMList(q) {
  const scope = SPAGE.slice(7); const all = scope === 'all';
  const L = filterModels(allModels().filter(x => all || x.api.id === scope), q || '').sort((a, b) => ((b.model.pin ? 1 : 0) - (a.model.pin ? 1 : 0)) || a.model.label.localeCompare(b.model.label));
  const show = L.slice(0, MSHOW); let lastPin = null; let h = '';
  show.forEach(x => {
    if (lastPin !== !!x.model.pin) { lastPin = !!x.model.pin; h += `<div class="grp">${lastPin ? '★ Favoriler' : 'Diğer modeller'}</div>`; }
    h += `<div class="mr"><button class="pst${x.model.pin ? ' on' : ''}" data-pin="${esc(x.ref)}">${ic('star')}</button><div class="mi"><div>${esc(x.model.label)}</div><div class="dim">${esc(x.model.id)}${all ? ' · ' + esc(x.api.name) : ''}${x.model.missing ? ' · ⚠ listede yok' : ''}</div></div><input class="lim" type="number" inputmode="numeric" placeholder="limit" value="${x.model.limit || ''}" data-lim="${esc(x.ref)}"></div>`;
  });
  if (L.length > MSHOW) h += `<button class="btn" data-st="more">Daha fazla göster (${L.length - MSHOW})</button>`;
  $('#mlist').innerHTML = h || '<p class="dim">Model yok</p>';
}
function bindSettings() {
  const el = $('#settings');
  const h = e => {
    const t = e.target.closest('[data-s]'); if (t) {
      const v = t.type === 'checkbox' ? t.checked : (t.type === 'number' || t.type === 'range') ? Number(t.value) : t.value;
      setPath(S, t.dataset.s, v); saveS();
      if (t.dataset.s === 'fontSize') { document.documentElement.style.setProperty('--fs', v + 'px'); $('#fsv').textContent = v; }
      return;
    }
    const l = e.target.closest('[data-lim]'); if (l) { const f = findModel(l.dataset.lim); if (f) { f.model.limit = Number(l.value) || null; saveS(); } }
    if (e.target.id === 'msq' && e.type === 'input') { MSHOW = 60; renderMList(e.target.value); }
  };
  el.addEventListener('input', h); el.addEventListener('change', h);
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.go) return goPage(d.go);
    if (d.st === 'back') return settingsBack();
    if (d.st === 'addapi') return apiDialog();
    if (d.st === 'perm') { N.ask(); return; }
    if (d.st === 'agentkur') { const m = setupAgentDir(false); const c = $('#acheck'); c.classList.remove('hide'); c.textContent = m.length ? '✓ Oluşturulan dosyalar:\n' + m.map(x => '/' + AGENT_DIR + '/' + x).join('\n') : '✓ Her şey zaten hazır: /' + AGENT_DIR; return; }
    if (d.st === 'agentcheck') { const c = $('#acheck'); c.classList.remove('hide'); c.textContent = flowReport(); return; }
    if (d.st === 'agentdoc') { setupAgentDir(true); return toast('AGENT.md yeniden yazıldı'); }
    if (d.st === 'copytools') { N.copy(TOOL_DOC); return toast('Komut dili kopyalandı'); }
    if (d.st === 'more') { MSHOW += 60; renderMList(($('#msq') || {}).value || ''); return; }
    if (d.st === 'exportlog') { const r = await exportLog(cur); return toast(r.ok ? 'Kaydedildi: ' + r.path : 'Hata: ' + r.error); }
    if (d.st === 'export') { const r = N.write('Download/raphael-code-yedek.json', JSON.stringify(CH, null, 1), false); return toast(r.ok ? 'Kaydedildi: /Download/raphael-code-yedek.json' : 'Hata: ' + r.error); }
    if (d.st === 'wipe') { const ok = await dialog({ title: 'Tüm sohbetler silinsin mi?', msg: 'Bu geri alınamaz.', ok: 'Hepsini sil', danger: true }); if (!ok) return; for (const c of CH) if (DB.db) { await DB.del('chat:' + c.id); await DB.del('log:' + c.id); } CH = []; cur = newChat(); renderAll(); return toast('Silindi'); }
    if (d.sync) return syncOne(d.sync);
    if (d.delapi) return delApi(d.delapi);
    if (d.pin) { const f = findModel(d.pin); if (f) { f.model.pin = !f.model.pin; saveS(); b.classList.toggle('on', f.model.pin); } return; }
    if (d.reset) { if (d.reset === 'chat') S.chatSystem = DEF_CHAT_SYS; saveS(); renderSettings(); toast('Varsayılana döndü'); }
  });
}

/* ============ olaylar / önyükleme ============ */
function bind() {
  const i = inp();
  i.addEventListener('input', () => { autoGrow(); updatePal(); updateSend(); });
  i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && i.value.startsWith('/')) { e.preventDefault(); submit(); } });
  i.addEventListener('focus', () => setTimeout(() => { if (stick) scrollEnd(); }, 350));
  $('#send').addEventListener('click', () => { if (busy && !i.value.trim()) stop(); else submit(); });
  $('#pal').addEventListener('mousedown', e => e.preventDefault());
  $('#pal').addEventListener('click', e => {
    const s = e.target.closest('[data-s]'); if (s) { const it = PAL.items[+s.dataset.s]; if (it && it.starFn) { it.starFn(); updatePal(); } return; }
    const p = e.target.closest('.pi'); if (p) pick(+p.dataset.i);
  });
  $('#btnMenu').addEventListener('click', openDrawer);
  $('#btnSet').addEventListener('click', () => openSettings());
  $('#scrim').addEventListener('click', closeDrawer);
  $('#seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.m !== cur.mode) setMode(b.dataset.m); });
  $('#toBottom').addEventListener('click', () => { stick = true; scrollEnd(); });
  const ms = $('#msgs');
  ms.addEventListener('scroll', () => { stick = ms.scrollHeight - ms.scrollTop - ms.clientHeight < 90; $('#toBottom').classList.toggle('hide', stick); }, { passive: true });
  window.addEventListener('resize', () => { if (stick) scrollEnd(); });
  ms.addEventListener('click', e => {
    const fd = e.target.closest('.fold'); if (fd && e.target.closest('summary')) { const k = fd.dataset.id + 'f'; fd.open ? OPEN.delete(k) : OPEN.add(k); return; }
    const th = e.target.closest('.th.has'); if (th) { const id = th.dataset.id; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); th.classList.toggle('open'); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp') || b.classList.contains('sv')) {
      const code = b.closest('.code').querySelector('code').textContent;
      if (b.classList.contains('sv')) return saveCode(code, b.closest('.code').querySelector('.code-h span').textContent);
      N.copy(code); const o = b.textContent; b.textContent = 'Kopyalandı ✓'; setTimeout(() => { b.textContent = o; }, 1400); return;
    }
    if (b.dataset.a === 'cpall') { const m = cur.messages.find(x => x.id === b.dataset.id); if (m) N.copy(m.agent ? stripFs(m.text) : m.text); }
    if (b.dataset.a === 'retry') retry();
  });
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fill]'); if (f) { setInp(f.dataset.fill); inp().focus(); return; }
    const a = e.target.closest('[data-act]'); if (a && a.dataset.act === 'api') { apiDialog(); return; }
    const d = e.target.closest('#drawer [data-d]');
    if (d) { if (d.dataset.d === 'close') closeDrawer(); if (d.dataset.d === 'new') { cur = newChat(); renderAll(); closeDrawer(); } if (d.dataset.d === 'set') openSettings(); return; }
    const del = e.target.closest('#drawer [data-del]'); if (del) { delChat(del.dataset.del); return; }
    const di = e.target.closest('#drawer .di'); if (di) { const c = CH.find(x => x.id === di.dataset.id); if (c) { openChat(c); closeDrawer(); } }
  });
  document.addEventListener('input', e => { if (e.target.id === 'dq') renderDrawerList(e.target.value); });
  bindSettings();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveChatNow(cur); });
  window.__back = () => {
    if (!$('#modal').classList.contains('hide')) { if (DLG) DLG(); return true; }
    if (settingsOpen()) { settingsBack(); return true; }
    if (drawerOpen()) { closeDrawer(); return true; }
    if (inp().value) { setInp(''); return true; }
    return false;
  };
}
async function boot() {
  document.documentElement.style.setProperty('--fs', S.fontSize + 'px');
  try { await DB.open(); CH = (await DB.all('chat:')) || []; } catch (e) { toast('Sohbet deposu açılamadı: ' + e); }
  CH.sort((a, b) => b.updated - a.updated);
  cur = CH.find(c => c.id === S.last) || newChat();
  // yarım kalan akışlar (uygulama kapandıysa)
  CH.forEach(c => c.messages.forEach(m => {
    if (m.state === 'think' || m.state === 'write') m.state = 'stop';
    if (m.role === 'info' && m.busy) { m.busy = false; m.text += ' — kesildi'; }
    if (m.calls) m.calls.forEach(k => { if (k.status === 'wait' || k.status === 'hold') { k.status = 'err'; k.out = 'Uygulama kapandığı için yarım kaldı'; } });
  }));
  if (S.v < 5) { S.rph.flow = 'agent.json'; if (!(S.rph.budget > 0)) S.rph.budget = 25; if (S.log === undefined) S.log = true; S.v = 5; saveS(); }
  bind(); renderAll();
  if (S.apis.length) autoRoles();
  if (HAS && N.has()) { try { setupAgentDir(false); } catch (e) { /* yoksay */ } }
  if (HAS && !N.has()) toast('Dosya erişimi için izin gerekli: Ayarlar > Veri');
}
document.addEventListener('DOMContentLoaded', boot);
