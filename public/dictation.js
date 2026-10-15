// ディクテーション練習（ReStart）。音声を聞いて英文を打ち込み、正誤判定する。
const $ = (s) => document.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), player = $("#player");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- 保存（この端末のみ）: 各音声の正解済みフラグ ---------- */
const KEY = "english-ex-dictation-v1";
let done = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* 保存不可でも継続 */ } };

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
const restart = () => { try { player.currentTime = 0; player.play().catch(() => {}); } catch { /* 無視 */ } };
// 再生中なら停止、停止中なら続きから（終了後は頭から）再生
const toggle = () => { if (!player.paused) player.pause(); else if (player.ended) restart(); else player.play().catch(() => {}); };
// 共通ショートカット: Ctrl+↓ 再生/停止、Ctrl+← 頭から再生
function audioKeys(e) {
  if (!e.ctrlKey) return false;
  if (e.key === "ArrowDown") { e.preventDefault(); toggle(); return true; }
  if (e.key === "ArrowLeft") { e.preventDefault(); restart(); return true; }
  return false;
}
const syncBtn = () => { const b = $("#play"); if (b) b.textContent = player.paused ? "🔊 再生" : "⏹ 停止"; };
player.addEventListener("play", syncBtn); player.addEventListener("pause", syncBtn); player.addEventListener("ended", syncBtn);
let onKey = null; // 画面ごとのキー操作
document.addEventListener("keydown", (e) => onKey && !e.isComposing && !e.repeat && onKey(e));
function setView(title, back) { titleEl.textContent = title; backBtn.onclick = back; onKey = null; scrollTo(0, 0); }

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
  app.innerHTML = `<div class="card hero">
      <div class="sub">クリアした文</div>
      <div class="big">${got}<small> / ${total}</small> <span class="pct">${pct}%</span></div>
      <div class="bar"><i style="width:${(got / total) * 100}%"></i></div>
      <div class="sub" style="margin-top:6px">完全クリア ${full} / ${lessons.length} レッスン${full < lessons.length ? ` ・ あと${Math.min(goal, lessons.length) - full}レッスンで${Math.min(goal, lessons.length)}レッスン達成！` : " 🎉 全レッスン制覇！"}</div>
      ${next ? `<button class="btn block" id="cont" style="margin-top:12px">▶ 続きから：レッスン ${String(next.no).padStart(2, "0")}${cleared(next) ? `（${cleared(next)}/${next.clips.length}）` : ""}</button>` : ""}
    </div>
    <div class="legend sub"><i class="lg"></i>未着手 <i class="lg part"></i>途中 <i class="lg full"></i>完全クリア</div>
    <div class="lgrid">${cells}</div>`;
  if (next) $("#cont").onclick = () => lessonScreen(next);
  app.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => lessonScreen(lessons.find((l) => l.no === +b.dataset.l))));
}

/* ---------- 練習 ---------- */
function lessonScreen(lesson, only) {
  const clips = only || lesson.clips, st = { i: 0, ok: 0, ng: 0, wrong: [] };
  const label = `レッスン ${String(lesson.no).padStart(2, "0")}`;
  setView(label, listScreen);

  function question() {
    const c = clips[st.i];
    onKey = null;
    player.src = `dictation/audio/${c.id}.mp3`;
    app.innerHTML = `<div class="card">
        <div class="q-meta"><span>${c.id}</span><span>${st.i + 1} / ${clips.length}</span></div>
        <textarea class="ans" id="ans" rows="3" placeholder="聞こえた英文を入力" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
        <div class="actions"><button class="btn ghost" id="play">🔊 再生</button><button class="btn ghost" id="head">⏮ 頭から</button><button class="btn" id="send">送信</button></div>
        <p class="sub">Ctrl+↓: 再生/停止 ／ Ctrl+←: 頭から ／ Ctrl+Enter または Enter: 送信</p>
      </div>`;
    const ta = $("#ans");
    $("#play").onclick = () => { toggle(); ta.focus(); };
    $("#head").onclick = () => { restart(); ta.focus(); };
    $("#send").onclick = () => submit(ta.value);
    ta.onkeydown = (e) => {
      e.stopPropagation(); // 送信直後に有効になる画面側のキー処理へ同じ入力が伝わらないように
      if (e.isComposing) return;
      if (audioKeys(e)) return;
      if (e.key === "Enter") { e.preventDefault(); submit(ta.value); }
      else if (e.key === " " && !ta.value) { e.preventDefault(); toggle(); }
    };
    ta.focus(); restart();
  }

  function submit(text) {
    if (!text.trim()) return;
    const c = clips[st.i], r = judge(text, c.en), d = diffHtml(text, r.b);
    if (r.ok) { st.ok++; done[c.id] = 1; save(); } else { st.ng++; if (!st.wrong.includes(c)) st.wrong.push(c); }
    const last = st.i === clips.length - 1;
    app.innerHTML = `<div class="card">
        <div class="q-meta"><span>${c.id}</span><span>${st.i + 1} / ${clips.length}</span></div>
        <div class="sub">あなたの入力</div><div class="en ${r.ok ? "dok" : ""}" style="line-height:1.6">${d.input}</div>
        <div class="sub" style="margin-top:10px">正解</div><div class="en ${r.ok ? "dok" : ""}" style="line-height:1.6">${r.ok ? esc(c.en) : d.answer}</div>
        <div class="jp" style="margin-top:12px">${esc(c.ja)}</div>
        <div class="actions"><button class="btn ghost" id="play">🔊 再生</button><button class="btn ghost" id="retry">もう一度挑戦</button><button class="btn" id="next">${last ? "結果を見る" : "次へ"}</button></div>
        <p class="sub">Ctrl+↓: 再生/停止 ／ Ctrl+←: 頭から ／ Enter: ${last ? "結果へ" : "次へ"}</p>
      </div>`;
    player.pause();
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
    const perfect = isComplete(lesson), nextL = lessons.find((l) => l.no === lesson.no + 1);
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

fetch("dictation/lessons.json").then((r) => r.json()).then((j) => { lessons = j; listScreen(); })
  .catch(() => { app.innerHTML = '<p class="sub">教材を読み込めませんでした。</p>'; });
