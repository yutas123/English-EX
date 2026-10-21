// ディクテーション練習（ReStart）。音声を聞いて英文を打ち込み、正誤判定する。
import * as N from "./dnotes.js";
const $ = (s) => document.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), player = $("#player");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- 保存（端末 + サーバー同期）: 各音声の正解済みフラグ ---------- */
const KEY = "english-ex-dictation-v1";
let done = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* 保存不可でも継続 */ } };
const save = () => { saveLocal(); push(); };
// 正解済みは増えるだけなので、サーバーとの同期は和集合を取るだけでよい
function push() {
  fetch("/api/dictation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: Object.keys(done) }), keepalive: true }).catch(() => {});
}
async function pull() {
  try {
    const r = await fetch("/api/dictation", { cache: "no-store" });
    if (!r.ok) return;
    const { ids } = await r.json();
    const before = Object.keys(done).length;
    for (const id of ids) done[id] = 1;
    saveLocal();
    if (Object.keys(done).length !== before && !app.querySelector("textarea")) listScreen(); // 入力中でなければ一覧を更新
    if (Object.keys(done).length > ids.length) push(); // 端末にだけある分を送る
  } catch { /* オフラインでも継続 */ }
}

/* ---------- 判定 ---------- */
// 大文字小文字・句読点・引用符・空白の違いは無視し、単語単位で比較する
const IRREG = { "won't": "will not", "can't": "can not", "cannot": "can not", "shan't": "shall not", "ain't": "is not", "let's": "let us", "y'all": "you all" };
const PRON = /^(i|you|he|she|it|we|they|that|there|here|this|what|who|where|when|how|why|everyone|everybody|someone|somebody|nobody)$/;
const PART = /^(been|got|gotten|gone|done|had|made|become|come|taken|seen|given|known)$|(ed|en)$/; // 's の直後がこれなら has
// 短縮形を展開する（she's → she is / she has, don't → do not, I'm → i am）。両辺に同じ処理をかけて比べる
function expand(w, next) {
  if (IRREG[w]) return IRREG[w].split(" ");
  let m;
  if ((m = w.match(/^(.+)n't$/))) return [m[1], "not"];
  if ((m = w.match(/^(.+)'re$/))) return [m[1], "are"];
  if ((m = w.match(/^(.+)'ve$/))) return [m[1], "have"];
  if ((m = w.match(/^(.+)'ll$/))) return [m[1], "will"];
  if ((m = w.match(/^(.+)'m$/))) return [m[1], "am"];
  if ((m = w.match(/^(.+)'d$/))) return [m[1], next && /^(better|rather|like|love|prefer)$/.test(next) ? "would" : next && PART.test(next) ? "had" : "would"];
  if ((m = w.match(/^(.+)'s$/)) && PRON.test(m[1])) return [m[1], next && PART.test(next) ? "has" : "is"];
  return [w];
}
const norm = (s) => {
  const ws = s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
  return ws.flatMap((w, i) => expand(w.replace(/^'+|'+$/g, ""), ws[i + 1]));
};
function judge(input, answer) {
  const a = norm(input), b = norm(answer);
  return { ok: a.length === b.length && a.every((w, i) => w === b[i]), a, b };
}
// 入力と正解を単語単位(LCS)で突き合わせ、入力側の誤り・正解側の取りこぼしを赤く示す
function diffHtml(input, b) {
  const toks = input.trim().split(/\s+/), a = [], owner = [];
  toks.forEach((t, k) => norm(t).forEach((w) => (a.push(w), owner.push(k))));
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hitA = new Set(), hitB = new Set();
  for (let i = 0, j = 0; i < n && j < m;) { if (a[i] === b[j]) { hitA.add(i); hitB.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const badTok = new Set(owner.filter((_, i) => !hitA.has(i)));
  return {
    input: toks.map((t, k) => (badTok.has(k) ? `<span class="dng">${esc(t)}</span>` : esc(t))).join(" "),
    answer: b.map((w, j) => (hitB.has(j) ? esc(w) : `<span class="dng">${esc(w)}</span>`)).join(" "),
  };
}

let lessons = [];
// スマホ対策: play() はタップ操作の中で同期的に呼ぶ。読み込み前なら再生開始位置は0なのでそのまま呼べばよい
const restart = () => {
  try { if (player.readyState >= 1) player.currentTime = 0; } catch { /* 無視 */ }
  player.play().catch(() => {}); syncBtn();
};
// 再生中なら停止、停止中なら続きから（終了後は頭から）再生
const toggle = () => { if (!player.paused) player.pause(); else if (player.ended) restart(); else player.play().catch(() => {}); syncBtn(); };
// 共通ショートカット: Ctrl+↓ 再生/停止、Ctrl+← 頭から再生
function audioKeys(e) {
  if (!e.ctrlKey) return false;
  if (e.key === "ArrowDown") { e.preventDefault(); toggle(); return true; }
  if (e.key === "ArrowLeft") { e.preventDefault(); restart(); return true; }
  return false;
}
const syncBtn = () => { const b = $("#play"); if (b) b.textContent = player.paused ? "🔊 再生" : "⏹ 停止"; };
["play", "playing", "pause", "ended", "emptied", "error"].forEach((ev) => player.addEventListener(ev, syncBtn));
let onKey = null; // 画面ごとのキー操作
document.addEventListener("keydown", (e) => onKey && !e.isComposing && !e.repeat && onKey(e));
function setView(title, back) { titleEl.textContent = title; backBtn.onclick = back; onKey = null; scrollTo(0, 0); }

function bindBm() {
  app.querySelectorAll("[data-bm]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.onclick = () => { b.textContent = N.toggleBm(b.dataset.bm) ? "★" : "☆"; };
  });
}
const allClips = () => lessons.flatMap((l) => l.clips);
const custom = (title, clips) => ({ no: 0, custom: true, title, clips });

/* ---------- ブックマーク一覧 ---------- */
function bookmarkScreen() {
  setView("★ ブックマーク", listScreen);
  const clips = allClips().filter((c) => N.isBm(c.id));
  if (!clips.length) { app.innerHTML = '<p class="sub">ブックマークはまだありません。問題画面の ☆ を押すと追加できます。</p>'; return; }
  app.innerHTML = `<button class="btn block" id="go" style="margin-bottom:12px">この ${clips.length} 問に挑戦</button>` + clips.map((c) => `<div class="card">
      <div class="q-meta"><span>${c.id}${done[c.id] ? " ✓" : ""}</span><button class="chip" data-un="${c.id}">★ 外す</button></div>
      <div class="rd-en">${esc(c.en)}</div><div class="jp">${esc(c.ja)}</div>
      <div class="actions"><button class="btn ghost" data-pl="${c.id}">🔊 再生</button></div></div>`).join("");
  $("#go").onclick = () => lessonScreen(custom("★ ブックマーク", clips), clips);
  app.querySelectorAll("[data-un]").forEach((b) => (b.onclick = () => { N.toggleBm(b.dataset.un); bookmarkScreen(); }));
  app.querySelectorAll("[data-pl]").forEach((b) => (b.onclick = () => { player.src = `dictation/audio/${b.dataset.pl}.mp3`; player.load(); player.play().catch(() => {}); }));
}

/* ---------- ミス記録（要因別の集計） ---------- */
function missScreen(kind) {
  setView("📊 ミス記録", listScreen);
  const byId = Object.fromEntries(allClips().map((c) => [c.id, c]));
  const rows = Object.entries(N.notes).filter(([id, n]) => n.miss.length && byId[id]);
  if (!rows.length) { app.innerHTML = '<p class="sub">ミスの記録はまだありません。間違えると要因が自動で分類されて記録されます。</p>'; return; }
  const count = {}; let total = 0;
  for (const [, n] of rows) for (const m of n.miss) for (const e of m.errs) { count[e.k] = (count[e.k] || 0) + 1; total++; }
  const kinds = Object.keys(N.KINDS).filter((k) => count[k]).sort((x, y) => count[y] - count[x]);
  const list = rows.filter(([, n]) => !kind || n.miss.some((m) => m.errs.some((e) => e.k === kind)))
    .sort((x, y) => y[1].miss.length - x[1].miss.length || y[1].miss.at(-1).t - x[1].miss.at(-1).t);
  app.innerHTML = `<div class="card"><div class="sub">ミスの要因（誤りの箇所 ${total} 件）</div>${kinds.map((k) => `<button class="kind ${kind === k ? "on" : ""}" data-k="${k}">
      <span>${esc(N.KINDS[k])}</span><b>${count[k]}</b><i style="width:${(count[k] / total) * 100}%"></i></button>`).join("")}
      ${kind ? '<button class="btn ghost block" id="all" style="margin-top:8px">絞り込みを解除</button>' : ""}</div>
    <button class="btn block" id="go" style="margin-bottom:12px">${kind ? "この要因の" : "ミスした"} ${list.length} 文に挑戦</button>` +
    list.map(([id, n]) => { const c = byId[id], last = n.miss.at(-1); return `<div class="card">
      <div class="q-meta"><span>${id}${done[id] ? " ✓" : ""}</span><span>ミス ${n.miss.length} 回</span></div>
      <div class="rd-en">${esc(c.en)}</div>
      <div class="sub">前回の入力: ${esc(last.inp)}</div>
      <div class="errs">${[...new Set(n.miss.flatMap((m) => m.errs.map((e) => e.k)))].map((k) => `<span class="etag">${esc(N.KINDS[k])}</span>`).join("")}</div></div>`; }).join("");
  app.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => missScreen(kind === b.dataset.k ? null : b.dataset.k)));
  if (kind) $("#all").onclick = () => missScreen();
  const clips = list.map(([id]) => byId[id]);
  $("#go").onclick = () => lessonScreen(custom("ミスした文", clips), clips);
}

/* ---------- レッスン一覧 ---------- */
const cleared = (l) => l.clips.filter((c) => done[c.id]).length;
const isComplete = (l) => cleared(l) === l.clips.length;
function listScreen() {
  setView("ディクテーション", () => (location.href = "/"));
  const total = lessons.reduce((n, l) => n + l.clips.length, 0), got = lessons.reduce((n, l) => n + cleared(l), 0);
  const full = lessons.filter(isComplete).length, goal = (Math.floor(full / 10) + 1) * 10;
  const next = lessons.find((l) => !isComplete(l));
  const pct = total ? Math.floor((got / total) * 100) : 0;
  const cells = lessons.map((l) => {
    const n = cleared(l), len = l.clips.length, cls = n === len ? "full" : n ? "part" : "";
    return `<button class="lcell ${cls}" data-l="${l.no}"><span>${String(l.no).padStart(2, "0")}</span><b>${n === len ? "✓" : `${n}/${len}`}</b>${cls === "part" ? `<i style="width:${(n / len) * 100}%"></i>` : ""}</button>`;
  }).join("");
  const nbm = Object.keys(N.notes).filter(N.isBm).length, nmiss = Object.values(N.notes).filter((x) => x.miss.length).length;
  app.innerHTML = `<a class="btn ghost block" href="reader.html" style="margin-bottom:8px">📖 英文・和訳・音声ページへ</a>
    <div class="actions" style="margin:0 0 12px"><button class="btn ghost" id="bmlist">★ ブックマーク (${nbm})</button><button class="btn ghost" id="misslist">📊 ミス記録 (${nmiss})</button></div>
    <div class="card hero">
      <div class="sub">クリアした文</div>
      <div class="big">${got}<small> / ${total}</small> <span class="pct">${pct}%</span></div>
      <div class="bar"><i style="width:${(got / total) * 100}%"></i></div>
      <div class="sub" style="margin-top:6px">完全クリア ${full} / ${lessons.length} レッスン${full < lessons.length ? ` ・ あと${Math.min(goal, lessons.length) - full}レッスンで${Math.min(goal, lessons.length)}レッスン達成！` : " 🎉 全レッスン制覇！"}</div>
      ${next ? `<button class="btn block" id="cont" style="margin-top:12px">▶ 続きから：レッスン ${String(next.no).padStart(2, "0")}${cleared(next) ? `（${cleared(next)}/${next.clips.length}）` : ""}</button>` : ""}
    </div>
    <div class="legend sub"><i class="lg"></i>未着手 <i class="lg part"></i>途中 <i class="lg full"></i>完全クリア</div>
    <div class="lgrid">${cells}</div>`;
  $("#bmlist").onclick = bookmarkScreen; $("#misslist").onclick = () => missScreen();
  if (next) $("#cont").onclick = () => lessonScreen(next);
  app.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => lessonScreen(lessons.find((l) => l.no === +b.dataset.l))));
}

/* ---------- 練習 ---------- */
function lessonScreen(lesson, only) {
  const clips = only || lesson.clips, st = { i: 0, ok: 0, ng: 0, wrong: [] };
  const label = lesson.custom ? lesson.title : `レッスン ${String(lesson.no).padStart(2, "0")}`;
  setView(label, listScreen);

  function question() {
    const c = clips[st.i];
    onKey = null;
    player.src = `dictation/audio/${c.id}.mp3`; player.load();
    app.innerHTML = `<div class="card">
        <div class="q-meta"><span>${c.id} <button class="chip bm" data-bm="${c.id}">${N.isBm(c.id) ? "★" : "☆"}</button></span><span>${st.i + 1} / ${clips.length}</span></div>
        <textarea class="ans" id="ans" rows="3" placeholder="聞こえた英文を入力" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
        <div class="actions"><button class="btn ghost" id="play">🔊 再生</button><button class="btn ghost" id="head">⏮ 頭から</button><button class="btn" id="send">送信</button></div>
        <p class="sub">Ctrl+↓: 再生/停止 ／ Ctrl+←: 頭から ／ Ctrl+Enter または Enter: 送信</p>
      </div>`;
    const ta = $("#ans");
    bindBm();
    app.querySelectorAll(".actions button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault())); // ボタンで入力欄のフォーカスを奪わない
    $("#play").onclick = toggle;
    $("#head").onclick = restart;
    $("#send").onclick = () => submit(ta.value);
    ta.onkeydown = (e) => {
      e.stopPropagation(); // 送信直後に有効になる画面側のキー処理へ同じ入力が伝わらないように
      if (e.isComposing) return;
      if (audioKeys(e)) return;
      if (e.key === "Enter") { e.preventDefault(); submit(ta.value); }
      else if (e.key === " " && !ta.value) { e.preventDefault(); toggle(); }
    };
    ta.focus(); restart(); syncBtn();
  }

  function submit(text) {
    if (!text.trim()) return;
    const c = clips[st.i], r = judge(text, c.en), d = diffHtml(text, r.b);
    const errs = r.ok ? [] : N.classify(r.a, r.b);
    // 正解の語のうち一致したのが3割未満なら聞き取れなかったものとし、ミスの集計には入れない
    const gaveUp = !r.ok && r.b.length - errs.filter((e) => e.a).length < r.b.length * 0.3;
    if (r.ok) { st.ok++; done[c.id] = 1; save(); } else { st.ng++; if (!st.wrong.includes(c)) st.wrong.push(c); if (!gaveUp) N.addMiss(c.id, text.trim(), errs); }
    const last = st.i === clips.length - 1;
    app.innerHTML = `<div class="card">
        <div class="q-meta"><span>${c.id} <button class="chip bm" data-bm="${c.id}">${N.isBm(c.id) ? "★" : "☆"}</button></span><span>${st.i + 1} / ${clips.length}</span></div>
        <div class="sub">あなたの入力</div><div class="en ${r.ok ? "dok" : ""}" style="line-height:1.6">${d.input}</div>
        <div class="sub" style="margin-top:10px">正解</div><div class="en ${r.ok ? "dok" : ""}" style="line-height:1.6">${r.ok ? esc(c.en) : d.answer}</div>
        ${gaveUp ? '<div class="sub" style="margin-top:8px">聞き取れなかった文として、ミス記録には入れていません</div>' : errs.length ? `<div class="errs">${errs.map((e) => `<span class="etag">${esc(N.KINDS[e.k])}${e.a || e.i ? `：${esc(e.i || "なし")} → ${esc(e.a || "なし")}` : ""}</span>`).join("")}</div>` : ""}
        <div class="jp" style="margin-top:12px">${esc(c.ja)}</div>
        <div class="actions"><button class="btn ghost" id="play">🔊 再生</button><button class="btn ghost" id="retry">もう一度挑戦</button><button class="btn" id="next">${last ? "結果を見る" : "次へ"}</button></div>
        <p class="sub">Ctrl+↓: 再生/停止 ／ Ctrl+←: 頭から ／ Enter: ${last ? "結果へ" : "次へ"}</p>
      </div>`;
    player.pause();
    bindBm();
    $("#play").onclick = toggle;
    $("#retry").onclick = question;
    const next = () => (last ? result() : (st.i++, question()));
    $("#next").onclick = next;
    $("#next").focus();
    onKey = (e) => {
      if (audioKeys(e)) return;
      if (e.key === "Enter") { e.preventDefault(); next(); }
    };
  }

  function result() {
    onKey = null;
    st.wrong = st.wrong.filter((c) => !done[c.id]); // 挑戦し直して正解した文は除く
    const perfect = !lesson.custom && isComplete(lesson), nextL = lesson.custom ? null : lessons.find((l) => l.no === lesson.no + 1);
    app.innerHTML = `<div class="card" style="text-align:center">
        ${perfect ? '<div class="party">🎉</div><div class="verdict ok">レッスン完全クリア！</div>' : ""}
        <div class="sub">${label}</div>
        <div class="big">${st.ok} / ${clips.length}</div><div class="sub">正解（誤答 ${st.ng}）</div>
        ${perfect ? `<div class="sub" style="margin-top:6px">完全クリア ${lessons.filter(isComplete).length} / ${lessons.length} レッスン</div>` : ""}</div>
      <div class="actions" style="flex-direction:column">
        ${nextL ? `<button class="btn" id="nextl">次のレッスン（${String(nextL.no).padStart(2, "0")}）へ ▶</button>` : ""}
        ${st.wrong.length ? `<button class="btn ghost" id="wrong">間違えた文だけやり直す（${st.wrong.length}）</button>` : ""}
        <button class="btn ghost" id="again">このレッスンをもう一度</button><button class="btn ghost" id="home">一覧へ</button></div>`;
    if (nextL) $("#nextl").onclick = () => lessonScreen(nextL);
    if (st.wrong.length) $("#wrong").onclick = () => lessonScreen(lesson, st.wrong);
    $("#again").onclick = () => lessonScreen(lesson);
    $("#home").onclick = listScreen;
  }
  question();
}

fetch("dictation/lessons.json").then((r) => r.json()).then((j) => { lessons = j; listScreen(); pull(); N.pull().then((c) => { if (c && !app.querySelector("textarea") && titleEl.textContent === "ディクテーション") listScreen(); }); })
  .catch(() => { app.innerHTML = '<p class="sub">教材を読み込めませんでした。</p>'; });
