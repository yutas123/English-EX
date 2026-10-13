// English EX 学習アプリ（静的・ビルド不要）
const $ = (s) => document.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), player = $("#player");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- 保存 ---------- */
const KEY = "english-ex-v1";
const DAY = 864e5, GAP = [0, 1, 3, 7, 14, 30, 60]; // 正解が続くほど出題間隔を空ける（日）
let db = load();
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { items: {}, settings: {} }; }
  catch { return { items: {}, settings: {} }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 保存不可でも動作は継続 */ } }
db.items = Object.fromEntries(Object.entries(db.items).map(([id, v]) => [id, { ...v, u: v.u || v.t || 0 }])); // 旧データに更新時刻(u)を補う
const st = (id) => (db.items[id] ||= { a: 0, c: 0, w: 0, box: 0, due: 0, ok: null, bm: false });
const setting = (k, d) => (k in db.settings ? db.settings[k] : d);

function record(id, ok) {
  const s = st(id), snap = { ...s };
  s.a++; s.t = Date.now();
  if (ok) { s.c++; s.box = Math.min(GAP.length - 1, s.box + 1); } else { s.w++; s.box = 0; }
  s.ok = ok;
  s.due = ok ? Date.now() + GAP[s.box] * DAY : 0;
  touch(id);
  return snap;
}
/* ---------- サーバー同期（Neon）: 更新時刻(u)の新しい方を採用 ---------- */
const dirty = new Set(db.dirty || []);
let flushTimer;
function touch(id) { st(id).u = Date.now(); dirty.add(id); db.dirty = [...dirty]; save(); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 1500); }
const unauthorized = (r) => r.status === 401 && (location.href = "/login.html");
async function flush() {
  if (!dirty.size) return;
  const ids = [...dirty], items = Object.fromEntries(ids.map((id) => [id, db.items[id]]));
  try {
    const r = await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), keepalive: true });
    if (unauthorized(r) || !r.ok) return;
    ids.forEach((id) => dirty.delete(id)); db.dirty = [...dirty]; save();
  } catch { /* オフライン等: 未送信のまま残し、次回に再送 */ }
}
async function pull() {
  try {
    const r = await fetch("/api/progress", { cache: "no-store" });
    if (unauthorized(r) || !r.ok) return false;
    const { items } = await r.json();
    let changed = false;
    for (const [id, v] of Object.entries(items)) { const l = db.items[id]; if (!l || (v.u || 0) > (l.u || 0)) { db.items[id] = v; changed = true; } }
    for (const [id, l] of Object.entries(db.items)) { const v = items[id]; if (!v || (l.u || 0) > (v.u || 0)) dirty.add(id); }
    db.dirty = [...dirty]; save(); await flush();
    return changed;
  } catch { return false; }
}
const syncAndRefresh = () => pull().then((changed) => { if (changed && !location.hash.startsWith("#/quiz")) route(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncAndRefresh(); });

const isAnswered = (id) => (db.items[id]?.a || 0) > 0;
const isDue = (id) => isAnswered(id) && db.items[id].due <= Date.now();
const isWeak = (id) => { const s = db.items[id]; return !!s && s.w > 0 && s.box < 3; };
const isBm = (id) => !!db.items[id]?.bm;

/* ---------- データ ---------- */
const cache = {};
async function loadJson(path) {
  if (!cache[path]) cache[path] = fetch(path).then((r) => { if (r.status === 401) location.href = "/login.html"; if (!r.ok) throw new Error(path); return r.json(); });
  return cache[path];
}
const loadUnit = (u) => loadJson(`data/${u}.json`).then((items) => { // 各問題に所属する区切り(sec)を持たせる
  let cur = null;
  items.forEach((q) => { if (q.section) cur = q.section; q.sec = cur; });
  return items;
});
const loadIndex = () => loadJson("data/index.json");
async function loadAll() { const idx = await loadIndex(); return (await Promise.all(idx.map((u) => loadUnit(u.unit)))).flat(); }

/* ---------- ユーティリティ ---------- */
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const N = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[.,!?;:"]/g, " ").replace(/\s+/g, " ").trim();
function play(src) { if (!src) return; try { player.src = src; player.currentTime = 0; player.play().catch(() => {}); } catch { /* 無視 */ } }
function setView(title, back) { titleEl.textContent = title; backBtn.hidden = !back; backBtn.onclick = back || null; }

/* ---------- ルーティング ---------- */
let session = null;
window.addEventListener("hashchange", route);
function route() {
  const [, page, arg] = location.hash.split("/");
  player.pause();
  if (page === "unit") return unitScreen(arg);
  if (page === "quiz" && session) return quizScreen();
  if (page === "done" && session) return doneScreen();
  return homeScreen();
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

/* ---------- ホーム ---------- */
async function homeScreen() {
  setView("English EX", null);
  app.innerHTML = '<p class="sub">読み込み中…</p>';
  const idx = await loadIndex();
  const all = Object.keys(db.items);
  const due = all.filter(isDue).length, weak = all.filter(isWeak).length, bm = all.filter(isBm).length;
  app.innerHTML = `
    <div class="card">
      <div class="row"><b class="grow">全単元からまとめて</b></div>
      <div class="actions">
        <button class="btn" data-g="due" ${due ? "" : "disabled"}>復習 (${due})</button>
        <button class="btn ghost" data-g="weak" ${weak ? "" : "disabled"}>苦手 (${weak})</button>
        <button class="btn ghost" data-g="bm" ${bm ? "" : "disabled"}>★ (${bm})</button>
      </div>
    </div>
    <h2>単元</h2>
    <div class="units">${idx.map((u) => {
      const ids = all.filter((k) => k.startsWith(u.unit + "-"));
      const ans = ids.filter(isAnswered).length, ng = ids.filter(isWeak).length, dv = ids.filter(isDue).length;
      return `<button class="unit" data-u="${u.unit}">
        <b>${u.unit}</b>${ng ? `<span class="badge">苦手 ${ng}</span>` : ""}${dv ? `<span class="badge due">復習 ${dv}</span>` : ""}
        <div class="nm">${esc(u.title)}</div>
        <div class="sub">${ans} / ${u.count}</div>
        <div class="bar"><i style="width:${(ans / u.count) * 100}%"></i></div></button>`;
    }).join("")}</div>`;
  app.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => go("#/unit/" + b.dataset.u)));
  app.querySelectorAll("[data-g]").forEach((b) => (b.onclick = async () => {
    const items = await loadAll();
    const pick = { due: isDue, weak: isWeak, bm: isBm }[b.dataset.g];
    startSession(items.filter((q) => pick(q.id)), { due: "復習", weak: "苦手", bm: "★" }[b.dataset.g], true);
  }));
}

/* ---------- 単元 ---------- */
async function unitScreen(u) {
  const idx = await loadIndex();
  const meta = idx.find((x) => x.unit === u);
  if (!meta) return go("#/");
  setView(`${u}  ${meta.title}`, () => go("#/"));
  const items = await loadUnit(u);
  const modes = [
    ["all", "最初から全問", items],
    ["new", "未回答のみ", items.filter((q) => !isAnswered(q.id))],
    ["due", "復習（期限が来た問題）", items.filter((q) => isDue(q.id))],
    ["weak", "間違えた問題（苦手）", items.filter((q) => isWeak(q.id))],
    ["bm", "★ ブックマーク", items.filter((q) => isBm(q.id))],
  ];
  app.innerHTML = `
    <div class="card">
      <label class="toggle"><input type="checkbox" id="opt-shuf" ${setting("shuffle", false) ? "checked" : ""}> 順番をシャッフル</label>
      <label class="toggle"><input type="checkbox" id="opt-auto" ${setting("autoplay", true) ? "checked" : ""}> 解答後に音声を自動再生</label>
    </div>
    ${modes.map(([k, label, list]) => `<button class="btn ${k === "all" ? "" : "ghost"} block" style="margin-bottom:10px" data-m="${k}" ${list.length ? "" : "disabled"}>${label} (${list.length})</button>`).join("")}
    <h2>結果一覧 <span class="sub">○ 正解 / × 不正解 / － 未回答（最新の結果・タップで解き直し）</span></h2>
    <div class="card"><div class="grid">${items.map((q) => {
      const s = db.items[q.id], r = !s || s.ok === null ? ["na", "－"] : s.ok ? ["ok", "○"] : ["ng", "×"];
      return `${q.section ? `<div class="gsec">${esc(q.section.title)}</div>` : ""}<button class="cell ${r[0]}" data-q="${q.id}"><span>${q.id.slice(2)}</span><b>${r[1]}</b></button>`;
    }).join("")}</div></div>`;
  app.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => startSession([items.find((q) => q.id === b.dataset.q)], b.dataset.q, false, "#/unit/" + u)));
  const bind = (id, key) => ($(id).onchange = (e) => { db.settings[key] = e.target.checked; save(); });
  bind("#opt-shuf", "shuffle"); bind("#opt-auto", "autoplay");
  app.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
    let [, label, list] = modes.find((m) => m[0] === b.dataset.m);
    if (b.dataset.m === "new") { // 前回回答した問題の直後から始め、末尾まで行ったら先頭に戻る
      let last = -1, t = 0;
      items.forEach((q, i) => { const s = db.items[q.id]; if (s?.t > t) { t = s.t; last = i; } });
      const pos = new Map(items.map((q, i) => [q.id, i]));
      list = [...list.filter((q) => pos.get(q.id) > last), ...list.filter((q) => pos.get(q.id) < last)];
    }
    startSession(list, label.replace(/（.*/, ""), setting("shuffle", false), "#/unit/" + u);
  }));
}

/* ---------- 出題 ---------- */
function startSession(list, label, doShuffle, backHash = "#/") {
  if (!list.length) return;
  session = { label, backHash, queue: doShuffle ? shuffle(list) : [...list], i: 0, ok: 0, ng: 0, wrong: [], requeued: new Set(), total: list.length };
  go("#/quiz");
}

function quizScreen() {
  const s = session;
  if (s.i >= s.queue.length) return go("#/done");
  const q = s.queue[s.i];
  setView(`${s.label}  ${s.i + 1}/${s.queue.length}`, () => go(s.backHash));
  const qs = { answered: false, order: {}, snap: null, ok: null };
  const showJp = q.type === "recall" || q.type === "compose" || (q.type !== "translate" && q.sheetJp);
  const tags = (q.tags || []).map((t) => `<span class="instr">${esc(t)}</span>`).join("");
  let body = "";

  if (q.type === "fill") {
    let slot = 0;
    body = '<div class="en">' + q.segments.map((g) => {
      if (g.t === "text") return esc(g.v);
      const k = slot++;
      if (g.t === "blank") return `<input class="blank" data-k="${k}" ${g.hint ? `placeholder="${esc(g.hint)}-"` : ""} style="width:${g.hint ? 6.5 : 5.5}em" ${noAssist}>`;
      if (g.t === "choice") return `<select data-k="${k}"><option value="">―</option>${g.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
      qs.order[k] = [];
      return `<span class="chosen" data-chosen="${k}">&nbsp;</span><span class="chips" data-chips="${k}">${shuffle(g.words.map((w, i) => [w, i])).map(([w, i]) => `<button type="button" class="chip" data-w="${i}">${esc(w)}</button>`).join("")}</span>`;
    }).join("") + "</div>";
    if (q.bank) body += `<ol class="bank">${q.bank.map((b) => `<li>${esc(b)}</li>`).join("")}</ol>`;
    body += '<div class="actions"><button class="btn" data-act="submit">回答する</button></div>';
  } else if (q.type === "proof") {
    body = `<textarea class="ans" ${noAssist}>${esc(q.stem)}</textarea>
      <div class="actions"><button class="btn ok" data-act="asis">このままで正しい</button><button class="btn" data-act="submit">訂正して回答</button></div>`;
  } else if (q.type === "compose") {
    body = `<div class="en">${esc(q.stem)}</div><textarea class="ans" placeholder="英文を入力" ${noAssist}></textarea>
      <div class="actions"><button class="btn" data-act="submit">回答する</button></div>`;
  } else if (q.type === "translate") {
    body = `<div class="en">${esc(q.stem)}</div><textarea class="ans" placeholder="自分の訳（任意）"></textarea>
      <div class="actions"><button class="btn" data-act="reveal">答えを見る</button></div>`;
  } else { // recall
    body = `<textarea class="ans" placeholder="英文を入力" ${noAssist}></textarea>
      <div class="actions">${q.audio ? '<button class="btn ghost" data-act="listen">🔊 音声</button>' : ""}<button class="btn" data-act="submit">回答する</button></div>`;
  }

  app.innerHTML = `<div class="card">
    ${q.sec ? `<details class="sec" ${q.section ? "open" : ""}><summary>${esc(q.sec.title)}</summary>${q.sec.body ? `<p>${esc(q.sec.body)}</p>` : ""}</details>` : ""}
    <div class="q-meta"><span>${q.id}</span><button class="chip" data-act="bm">${isBm(q.id) ? "★" : "☆"}</button></div>
    ${tags ? `<div>${tags}</div>` : ""}
    ${showJp ? `<div class="jp">${esc(q.jp)}</div>` : ""}
    ${body}<div id="res"></div></div>
    <div class="progress"><i style="width:${(s.i / s.queue.length) * 100}%"></i></div>`;

  const $q = (sel) => app.querySelectorAll(sel);
  // 並べ替えチップ
  const redrawOrder = (k) => {
    const seg = q.segments.filter((g) => g.t !== "text")[k];
    app.querySelector(`[data-chosen="${k}"]`).textContent = qs.order[k].map((i) => seg.words[i]).join(" ") || " ";
    $q(`[data-chips="${k}"] .chip`).forEach((c) => c.classList.toggle("used", qs.order[k].includes(+c.dataset.w)));
  };
  $q("[data-chips] .chip").forEach((c) => (c.onclick = () => {
    if (qs.answered || c.classList.contains("used")) return;
    const k = +c.parentElement.dataset.chips; qs.order[k].push(+c.dataset.w); redrawOrder(k);
  }));
  $q("[data-chosen]").forEach((c) => (c.onclick = () => { if (!qs.answered) { const k = +c.dataset.chosen; qs.order[k] = []; redrawOrder(k); } }));
  $q('[data-act="bm"]').forEach((b) => (b.onclick = () => { st(q.id).bm = !isBm(q.id); touch(q.id); b.textContent = isBm(q.id) ? "★" : "☆"; }));
  $q('[data-act="listen"]').forEach((b) => (b.onclick = () => play(q.audio)));

  const finish = (ok, extra = {}) => {
    if (qs.answered) return;
    qs.answered = true; qs.ok = ok; qs.snap = record(q.id, ok);
    app.querySelectorAll("input,select,textarea,[data-act=submit],[data-act=asis],[data-act=reveal],.chip[data-w]").forEach((e) => (e.disabled = true));
    showResult(q, qs, extra);
  };
  const submit = () => {
    if (qs.answered) return;
    if (q.type === "fill") {
      const vals = []; let n = 0;
      q.segments.forEach((g) => {
        if (g.t === "text") return;
        const k = n++;
        if (g.t === "order") vals.push(qs.order[k].map((i) => g.words[i]).join(" "));
        else vals.push(app.querySelector(`[data-k="${k}"]`).value);
      });
      let best = -1, bestSol = q.solutions[0];
      q.solutions.forEach((sol) => { const m = sol.filter((a, i) => N(a) === N(vals[i] || "")).length; if (m > best) { best = m; bestSol = sol; } });
      bestSol.forEach((a, i) => {
        const el = app.querySelector(`[data-k="${i}"]`) || app.querySelector(`[data-chosen="${i}"]`);
        if (el) el.classList.add(N(a) === N(vals[i] || "") ? "slot-ok" : "slot-ng");
      });
      finish(best === bestSol.length);
    } else {
      const v = app.querySelector("textarea").value;
      finish(q.answers.some((a) => N(a) === N(v)));
    }
  };
  $q('[data-act="submit"]').forEach((b) => (b.onclick = submit));
  $q('[data-act="asis"]').forEach((b) => (b.onclick = () => finish(q.answers.some((a) => N(a) === N(q.stem)))));
  $q('[data-act="reveal"]').forEach((b) => (b.onclick = () => {
    b.disabled = true; qs.answered = false;
    $("#res").innerHTML = `<div class="result"><div class="correct">${q.answers.map(esc).join("<br>")}</div><div class="jp">${esc(q.jp)}</div>
      <div class="sub">自分の訳は合っていましたか？</div>
      <div class="actions"><button class="btn ok" data-self="1">○ 分かった</button><button class="btn ng" data-self="0">× 違った</button></div></div>`;
    if (setting("autoplay", true)) play(q.audio);
    $q("[data-self]").forEach((x) => (x.onclick = () => { $("#res").innerHTML = ""; finish(x.dataset.self === "1", { self: true }); }));
  }));
  app.onkeydown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    if (qs.answered) { e.preventDefault(); next(); }
    else if (e.target.matches("input.blank, textarea")) { e.preventDefault(); submit(); }
  };
  const first = app.querySelector("input.blank, textarea.ans"); if (first && q.type !== "proof") first.focus({ preventScroll: true });
}
const noAssist = 'autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"';

function showResult(q, qs, { self } = {}) {
  const s = session;
  const ok = qs.ok;
  s.ok += ok ? 1 : 0; s.ng += ok ? 0 : 1;
  if (!ok) {
    if (!s.wrong.includes(q)) s.wrong.push(q);
    if (!s.requeued.has(q.id)) { s.requeued.add(q.id); s.queue.push(q); } // 間違えた問題は最後にもう一度
  }
  const render = () => {
    const ok2 = qs.ok;
    $("#res").innerHTML = `<div class="result ${ok2 ? "ok" : "ng"}">
      <div class="verdict">${ok2 ? "✓ 正解" : "✗ 不正解"}</div>
      <div class="correct">${q.answers.map(esc).join("<br>")}</div>
      <div class="jp">${esc(q.jp)}</div>
      ${q.pronNote ? `<div class="note">🔈 ${esc(q.pronNote)}</div>` : ""}
      <div class="actions">
        ${q.audio ? '<button class="btn ghost" data-act="again">🔊 もう一度</button>' : ""}
        ${self ? "" : `<button class="btn ghost" data-act="flip">${ok2 ? "不正解にする" : "正解にする"}</button>`}
        <button class="btn" data-act="next">次へ ›</button>
      </div></div>`;
    const a = (n) => $(`#res [data-act="${n}"]`);
    a("next").onclick = next;
    if (a("again")) a("again").onclick = () => play(q.audio);
    if (a("flip")) a("flip").onclick = () => { // 判定の取り消し（厳密採点で誤判定のとき用）
      db.items[q.id] = qs.snap; qs.snap = record(q.id, !qs.ok);
      s.ok += qs.ok ? -1 : 1; s.ng += qs.ok ? 1 : -1; qs.ok = !qs.ok;
      if (qs.ok) s.wrong = s.wrong.filter((x) => x !== q); else if (!s.wrong.includes(q)) s.wrong.push(q);
      render();
    };
    a("next").scrollIntoView({ block: "nearest" });
  };
  render();
  if (setting("autoplay", true)) play(q.audio);
}
function next() { session.i++; quizScreen(); }

/* ---------- 結果 ---------- */
function doneScreen() {
  const s = session;
  setView("結果", () => go(s.backHash));
  const done = s.ok + s.ng;
  app.innerHTML = `<div class="card" style="text-align:center">
      <div class="sub">${esc(s.label)}</div>
      <div class="big">${s.total ? Math.round((1 - s.wrong.length / s.total) * 100) : 0}%</div>
      <div class="sub">初回正解 ${s.total - s.wrong.length} / ${s.total}（解答 ${done}回）</div>
    </div>
    ${s.wrong.length ? `<h2>間違えた問題 (${s.wrong.length})</h2><div class="card">${s.wrong.map((q) =>
      `<div class="listitem"><div class="sub">${q.id}</div><div>${q.answers.map(esc).join("<br>")}</div><div class="sub">${esc(q.jp)}</div></div>`).join("")}</div>
      <button class="btn block" id="retry" style="margin-bottom:10px">間違えた問題をもう一度</button>` : ""}
    <button class="btn ghost block" id="home">戻る</button>`;
  if ($("#retry")) $("#retry").onclick = () => startSession(s.wrong, "やり直し", true, s.backHash);
  $("#home").onclick = () => go(s.backHash);
}

/* ---------- データ管理 ---------- */
$("#menu").onclick = () => {
  const d = document.createElement("dialog");
  d.innerHTML = `<h3 style="margin-top:0">学習データ</h3>
    <p class="sub">学習履歴はこの端末に保存され、ログイン中は自動でサーバーと同期されます（未送信: ${dirty.size}件）。書き出しはバックアップ用です。</p>
    <div class="actions"><button class="btn" id="ex">書き出し</button><button class="btn ghost" id="im">読み込み</button></div>
    <div class="actions"><button class="btn ng" id="rs">履歴をリセット</button><button class="btn ghost" id="cl">閉じる</button></div>
    <input type="file" id="file" accept="application/json" hidden>`;
  document.body.appendChild(d); d.showModal();
  d.addEventListener("close", () => d.remove());
  d.querySelector("#cl").onclick = () => d.close();
  d.querySelector("#ex").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: "application/json" }));
    a.download = `english-ex-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  d.querySelector("#im").onclick = () => d.querySelector("#file").click();
  d.querySelector("#file").onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (!j.items) throw 0;
      if (!confirm("読み込んだ内容を履歴に反映します（同期先にも反映されます）。よろしいですか？")) return;
      Object.entries(j.items).forEach(([id, v]) => { db.items[id] = { ...v }; touch(id); });
      d.close(); route();
syncAndRefresh();
    } catch { alert("読み込めないファイルです"); }
  };
  d.querySelector("#rs").onclick = () => { if (confirm("学習履歴をすべて消します。よろしいですか？")) { db = { items: {}, settings: db.settings, dirty: [] }; dirty.clear(); save(); fetch("/api/progress", { method: "DELETE" }).catch(() => {}); d.close(); go("#/"); } };
};

route();
