'use strict';
/* ============ model kaydı ============ */
const GEM = 'https://generativelanguage.googleapis.com/v1beta';
const ORU = 'https://openrouter.ai/api/v1';
// Önayarlar: kimlikler senkronda doğrulanır; listede yoksa ⚠ işareti çıkar, /model ile düzeltilebilir.
const GEM_PRE = [
  ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 500],
  ['gemini-3.5-flash', 'Gemini 3.5 Flash', null],
  ['gemini-3.6-flash', 'Gemini 3.6 Flash', 20],
  ['gemini-3.8-flash', 'Gemini 3.8 Flash', 20],
  ['gemma-4-31b-it', 'Gemma 4 31B', 14400]
];
const NVU = 'https://integrate.api.nvidia.com/v1';
const NV_PRE = [
  ['deepseek-ai/deepseek-v4-flash-0731', 'DeepSeek V4 Flash'],
  ['deepseek-ai/deepseek-v4-pro', 'DeepSeek V4 Pro'],
  ['z-ai/glm5', 'GLM 5'],
  ['moonshotai/kimi-k2.5', 'Kimi K2.5'],
  ['nvidia/nemotron-3-super-120b-a12b', 'Nemotron 3 Super 120B'],
  ['openai/gpt-oss-120b', 'GPT-OSS 120B'],
  ['qwen/qwen3-coder-480b-a35b-instruct', 'Qwen3 Coder 480B'],
  ['meta/llama-3.3-70b-instruct', 'Llama 3.3 70B']
];
const NV_BEST = /deepseek-v4|glm-?5|kimi-k2|nemotron-3|gpt-oss-120b|qwen3.*coder|llama-3\.3-70b|minimax-m2/i;
const NV_SKIP = /embed|rerank|guard|safety|reward|parakeet|canary|whisper|tts|clip|vila|cosmos|retriev|paddle|ocr|ranking|flux|diffusion|sdxl|image|audio|speech|parse|bge|vlm|vision|segment|riva|maxine|earth|fourcast|molmim|genmol|diffdock|esm\d|alphafold|evo2|bionemo|nemoguard|translate/i;
const OR_PRE = [
  ['openai/gpt-oss-120b:free', 'GPT-OSS 120B (free)'],
  ['qwen/qwen3-coder:free', 'Qwen3 Coder (free)'],
  ['deepseek/deepseek-r1-0528:free', 'DeepSeek R1 (free)'],
  ['meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B (free)'],
  ['z-ai/glm-4.5-air:free', 'GLM 4.5 Air (free)'],
  ['google/gemma-3-27b-it:free', 'Gemma 3 27B (free)']
];
function presetsFor(t) {
  if (t === 'gemini') return GEM_PRE.map(([id, label, limit]) => ({ id, label, limit, pin: true, pre: true }));
  if (t === 'nvidia') return NV_PRE.map(([id, label]) => ({ id, label, pin: true, pre: true }));
  if (t === 'openrouter') return OR_PRE.map(([id, label]) => ({ id, label, pin: true, pre: true }));
  return [];
}
const baseOf = a => a.type === 'gemini' ? GEM : a.type === 'openrouter' ? ORU : a.type === 'nvidia' ? NVU : String(a.base || '').replace(/\/+$/, '');

function findModel(ref) {
  if (!ref) return null;
  const i = ref.indexOf('|'); const aid = ref.slice(0, i), id = ref.slice(i + 1);
  const api = S.apis.find(a => a.id === aid); if (!api) return null;
  const model = api.models.find(m => m.id === id); if (!model) return null;
  return { api, model, ref };
}
function allModels() { const o = []; for (const api of S.apis) for (const m of api.models) o.push({ api, model: m, ref: api.id + '|' + m.id }); return o; }
const labelOf = ref => { const f = findModel(ref); return f ? f.model.label : (ref || '?'); };
const shortOf = (ref, n = 22) => { const l = labelOf(ref); return l.length > n ? l.slice(0, n - 1) + '…' : l; };
function quota(f) {
  const used = usage().n[f.ref] || 0, lim = f.model.limit;
  return { used, lim, cls: lim ? (used >= lim ? 'full' : used >= lim * 0.8 ? 'warn' : '') : '' };
}
function autoRoles() { // yalnızca varsayılan sohbet modelini seçer
  const all = allModels(); const find = re => { const x = all.find(x => re.test(x.model.id)); return x ? x.ref : ''; };
  if (!S.defModel || !findModel(S.defModel)) S.defModel = find(/3\.5-flash-lite/) || find(/flash-lite/) || (all[0] ? all[0].ref : '');
  saveS();
}
const isRetryable = e => !!e && e.name !== 'AbortError' && ([429, 500, 502, 503, 504].includes(e.status) || /overload|demand|unavailable|exhaust|quota|rate|try again|Boş yanıt|too many|busy|timed out|timeout|Unable to resolve|connection|socket|Failed to fetch/i.test(e.message || ''));

/* ============ yerel HTTP (CORS'suz) ============ */
const NH = {};
window.__nh = (id, k, d) => {
  const s = NH[id]; if (!s) return;
  if (k === 's') { s.status = +d; if (s.res) s.res(); }
  else if (k === 'd') { const bin = atob(d), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); s.q.push(u); }
  else if (k === 'e') s.done = true;
  else if (k === 'x') { s.err = new Error(d); s.done = true; if (!s.status && s.rej) s.rej(s.err); }
  if (s.wake) s.wake();
};
function nfetch(url, o) {
  o = o || {};
  if (!HAS || !window.Native.httpStart) return fetch(url, o);
  return new Promise((resolve, reject) => {
    const id = uid(); const s = NH[id] = { q: [], done: false, status: 0, err: null, wake: null };
    const aborted = () => Object.assign(new Error('durduruldu'), { name: 'AbortError' });
    if (o.signal) {
      if (o.signal.aborted) { delete NH[id]; return reject(aborted()); }
      o.signal.addEventListener('abort', () => { try { window.Native.httpAbort(id); } catch (e) { /* yoksay */ } s.err = aborted(); s.done = true; if (!s.status) reject(s.err); if (s.wake) s.wake(); });
    }
    const read = () => new Promise((res, rej) => {
      const step = () => {
        if (s.q.length) { s.wake = null; return res({ done: false, value: s.q.shift() }); }
        if (s.err) { s.wake = null; delete NH[id]; return rej(s.err); }
        if (s.done) { s.wake = null; delete NH[id]; return res({ done: true }); }
        s.wake = step;
      }; step();
    });
    const text = async () => { const dec = new TextDecoder(); let t = ''; for (;;) { const r = await read(); if (r.done) break; t += dec.decode(r.value, { stream: true }); } return t; };
    s.rej = reject;
    s.res = () => resolve({ ok: s.status >= 200 && s.status < 300, status: s.status, body: { getReader: () => ({ read }) }, text, json: async () => JSON.parse(await text()) });
    window.Native.httpStart(id, url, o.method || 'GET', JSON.stringify(o.headers || {}), o.body || '');
  });
}
const fetchFor = api => (api.type === 'nvidia' || api.type === 'openai') ? nfetch : fetch;

/* ============ HTTP / SSE ============ */
async function httpErr(r) {
  let t = ''; try { t = await r.text(); } catch (e) { /* boş */ }
  let msg = t;
  try {
    const j = JSON.parse(t); const e = Array.isArray(j) ? (j[0] && j[0].error) : j.error;
    msg = (e && (e.message || e)) || t; if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch (e) { /* düz metin */ }
  const err = new Error(String(msg).slice(0, 300) || ('HTTP ' + r.status)); err.status = r.status; return err;
}
async function* sse(r) {
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  const evs = b => b.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const d = evs(ev); if (d) yield d;
    }
  }
  const d = evs(buf); if (d) yield d;
}
function normMsgs(msgs) {
  const out = [];
  for (const m of msgs) {
    const t = (m.text || '').trim(); if (!t) continue;
    const l = out[out.length - 1];
    if (l && l.role === m.role) l.text += '\n\n' + t; else out.push({ role: m.role, text: t });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
const G_LV = { low: 'low', medium: 'medium', high: 'high' };
const G_BUD = { low: 1024, medium: 8192, high: 24576 };

/* ============ ana çağrı ============ */
async function llm(o) {
  const f = findModel(o.ref); if (!f) throw new Error('Model bulunamadı (API silinmiş olabilir): ' + o.ref);
  bump(o.ref);
  o = Object.assign({}, o, { msgs: normMsgs(o.msgs) });
  try { return await (f.api.type === 'gemini' ? llmGemini(f, o) : llmOAI(f, o)); }
  catch (e) {
    if (e && [429, 500, 502, 503, 504].includes(e.status)) { const u = usage(); if (u.n[o.ref] > 0) u.n[o.ref]--; saveS(); if (RUN && RUN[o.ref] > 0) RUN[o.ref]--; }
    throw e;
  }
}

async function llmGemini(f, o) {
  const { api, model } = f; const gemma = /gemma/i.test(model.id);
  let sys = o.system || '';
  const contents = o.msgs.map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] }));
  if (gemma && sys) { // Gemma sistem talimatını desteklemez: ilk mesaja göm
    if (contents.length) contents[0].parts[0].text = sys + '\n\n---\n\n' + contents[0].parts[0].text;
    else contents.push({ role: 'user', parts: [{ text: sys }] });
    sys = '';
  }
  const c = S.caps[o.ref];
  const modes = (o.think && !gemma) ? (c === 'none' ? ['none'] : c ? [c, 'none'] : ['level', 'budget', 'none']) : ['none'];
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i]; const gc = {};
    if (o.maxOut) gc.maxOutputTokens = o.maxOut;
    if (mode === 'level') gc.thinkingConfig = { thinkingLevel: G_LV[o.think], includeThoughts: true };
    if (mode === 'budget') gc.thinkingConfig = { thinkingBudget: G_BUD[o.think], includeThoughts: true };
    const body = { contents, generationConfig: gc }; if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    const r = await fetch(`${GEM}/models/${model.id}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api.key },
      body: JSON.stringify(body), signal: o.signal
    });
    if (!r.ok) {
      const e = await httpErr(r);
      if (e.status === 400 && i < modes.length - 1 && /think|thought|reason/i.test(e.message)) continue;
      throw e;
    }
    if (o.think && !gemma && S.caps[o.ref] !== mode) { S.caps[o.ref] = mode; saveS(); }
    let text = '', thought = '', usageMeta = null, fin = '';
    for await (const d of sse(r)) {
      let j; try { j = JSON.parse(d); } catch (e) { continue; }
      if (j.error) throw new Error(j.error.message || 'API hatası');
      const cd = j.candidates && j.candidates[0];
      if (cd && cd.content && cd.content.parts) for (const p of cd.content.parts) {
        if (!p.text) continue;
        if (p.thought) { thought += p.text; if (o.onThought) o.onThought(p.text, thought); }
        else { text += p.text; if (o.onText) o.onText(p.text, text); }
      }
      if (cd && cd.finishReason) fin = cd.finishReason;
      if (j.usageMetadata) usageMeta = { i: j.usageMetadata.promptTokenCount || 0, o: j.usageMetadata.candidatesTokenCount || 0, t: j.usageMetadata.thoughtsTokenCount || 0 };
    }
    if (!text && !thought) throw new Error('Boş yanıt' + (fin ? ' (' + fin + ')' : ''));
    return { text, thought, usage: usageMeta };
  }
}

const O_EFF = { low: 'low', medium: 'medium', high: 'high' };
async function llmOAI(f, o) {
  const { api, model } = f; const base = baseOf(api); const F = fetchFor(api); const nv = api.type === 'nvidia';
  const messages = []; if (o.system) messages.push({ role: 'system', content: o.system });
  for (const m of o.msgs) messages.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text });
  const modes = o.think ? (S.caps[o.ref] === 'none' ? ['none'] : ['r', 'none']) : ['none'];
  for (let i = 0; i < modes.length; i++) {
    const body = { model: model.id, messages, stream: true };
    if (api.type === 'openrouter') body.stream_options = { include_usage: true };
    if (o.maxOut) body.max_tokens = o.maxOut; else if (nv) body.max_tokens = 16384;
    if (modes[i] === 'r') { if (api.type === 'openrouter') body.reasoning = { effort: O_EFF[o.think] }; else { body.reasoning_effort = O_EFF[o.think]; if (nv) body.chat_template_kwargs = { thinking: true, enable_thinking: true }; } }
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.key };
    if (api.type === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/raphael-code'; headers['X-Title'] = 'Raphael Code'; }
    const r = await F(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal: o.signal });
    if (!r.ok) {
      const e = await httpErr(r);
      if ((e.status === 400 || e.status === 422) && i < modes.length - 1 && (api.type !== 'openrouter' || /think|reason/i.test(e.message))) { S.caps[o.ref] = 'none'; saveS(); continue; }
      throw e;
    }
    let text = '', thought = '', usageMeta = null;
    for await (const d of sse(r)) {
      if (d === '[DONE]') break;
      let j; try { j = JSON.parse(d); } catch (e) { continue; }
      if (j.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error.message || 'API hatası'));
      const dl = j.choices && j.choices[0] && j.choices[0].delta;
      if (dl) {
        const th = dl.reasoning || dl.reasoning_content;
        if (th) { thought += th; if (o.onThought) o.onThought(th, thought); }
        if (dl.content) { text += dl.content; if (o.onText) o.onText(dl.content, text); }
      }
      if (j.usage) usageMeta = { i: j.usage.prompt_tokens || 0, o: j.usage.completion_tokens || 0, t: 0 };
    }
    if (!text && !thought) throw new Error('Boş yanıt (model bu isteği yanıtlamadı)');
    return { text, thought, usage: usageMeta };
  }
}

function errMsg(e) {
  const m = e && e.message ? e.message : String(e);
  if (e && e.status === 429) return 'Kota/hız sınırı doldu (429). ' + m.slice(0, 120) + ' — başka model seç (/model).';
  if (e && (e.status === 401 || e.status === 403)) return 'API anahtarı geçersiz veya yetkisiz (' + e.status + '). ' + m.slice(0, 120);
  if (e && e.status === 404) return 'Model bulunamadı (404). Kimliği kontrol et: /api yenile veya /model. ' + m.slice(0, 100);
  if (/Failed to fetch|NetworkError|Load failed|Unable to resolve|timed out|Software caused/i.test(m)) return 'Ağ hatası: internet bağlantısını kontrol et.';
  return m;
}

/* ============ otomatik model senkronu ============ */
function mergeModels(api, found) {
  const old = new Map(api.models.map(m => [m.id, m])); const ids = new Set(found.map(m => m.id));
  const out = found.map(m => { const o = old.get(m.id) || {}; return { id: m.id, label: (o.pre && o.label) || m.label, pin: !!o.pin, limit: o.limit || null, pre: !!o.pre, man: !!o.man, ctx: m.ctx || 0 }; });
  for (const o of api.models) if (!ids.has(o.id) && (o.man || (o.pre && (api.type === 'gemini' || api.type === 'nvidia')))) out.push(Object.assign({}, o, { missing: !o.man }));
  if (api.type !== 'gemini' && api.type !== 'nvidia' && out.filter(m => m.pin).length < 4) out.slice().sort((a, b) => (b.ctx || 0) - (a.ctx || 0)).slice(0, 5).forEach(m => { m.pin = true; });
  out.sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || a.label.localeCompare(b.label));
  api.models = out;
}
async function syncApi(api) {
  let found = [];
  if (api.type === 'gemini') {
    let tok = '';
    do {
      const r = await fetch(`${GEM}/models?pageSize=200${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`, { headers: { 'x-goog-api-key': api.key } });
      if (!r.ok) throw await httpErr(r);
      const j = await r.json(); tok = j.nextPageToken || '';
      for (const m of (j.models || [])) {
        const id = String(m.name || '').replace(/^models\//, '');
        if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
        if (/embed|imagen|veo|tts|image|aqa|live|audio|robotics|computer-use|lyria|dialog/i.test(id)) continue;
        found.push({ id, label: m.displayName || id, ctx: m.inputTokenLimit || 0 });
      }
    } while (tok);
  } else if (api.type === 'openrouter') {
    const r = await fetch(ORU + '/models', { headers: { Authorization: 'Bearer ' + api.key } });
    if (!r.ok) throw await httpErr(r);
    const j = await r.json();
    for (const m of (j.data || [])) {
      const p = m.pricing || {};
      if (!(Number(p.prompt) === 0 && Number(p.completion) === 0)) continue; // yalnız ücretsizler
      if ((m.architecture && m.architecture.output_modalities || []).includes('image')) continue;
      found.push({ id: m.id, label: m.name || m.id, ctx: m.context_length || 0 });
    }
  } else if (api.type === 'nvidia') {
    const r = await nfetch(NVU + '/models', { headers: { Authorization: 'Bearer ' + api.key } });
    if (!r.ok) throw await httpErr(r);
    const j = await r.json(); const old = new Set(api.models.map(m => m.id));
    for (const m of (j.data || [])) {
      if (!m.id || NV_SKIP.test(m.id)) continue;
      found.push({ id: m.id, label: m.id.split('/').pop(), ctx: 0, best: !old.has(m.id) && NV_BEST.test(m.id) });
    }
  } else {
    const r = await fetchFor(api)(baseOf(api) + '/models', { headers: { Authorization: 'Bearer ' + api.key } });
    if (!r.ok) throw await httpErr(r);
    const j = await r.json();
    for (const m of (j.data || [])) found.push({ id: m.id, label: m.id, ctx: m.context_length || 0 });
  }
  mergeModels(api, found);
  if (api.type === 'nvidia') api.models.forEach(m => { if (found.some(f => f.id === m.id && f.best)) m.pin = true; }); // yeni gelen en iyiler ★
  api.models.sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || a.label.localeCompare(b.label));
  api.synced = Date.now(); saveS();
  return found.length;
}
