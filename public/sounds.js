// 音の特訓: 日本語話者がまちがえやすい音（r/l, th など）を、聞き分けクイズと単語の発音採点で練習する
// 教材は scripts/build-sounds.mjs が作る sounds/words.json。単語1語ずつ Azure で音ごとに採点し、「別の音に聞こえた」まで示す
const KEY = "english-ex-sounds-v1"; // st[グループID] = { quiz: { n, ok }, say: { 単語: { best, n } } }
const PASS = 80;
let st = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 保存不可でも継続 */ } };
const of = (id) => (st[id] ||= { quiz: { n: 0, ok: 0 }, say: {} });
const nz = (p) => p.replace(/[ːˑ]/g, "").replace("ɹ", "r").replace("ɡ", "g"); // Azure と教材の記号の書き方をそろえる
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const words = (g) => [...new Map((g.pairs ? g.pairs.flat() : g.words).map((e) => [e.w, e])).values()];

export function initSounds(c) {
  const { app, $, esc, setView, player, onTap } = c;
  let groups = null;
  const load = () => (groups ? Promise.resolve(groups) : fetch("sounds/words.json").then((r) => r.json()).then((j) => (groups = j)));
  const say = (w) => { player.src = `sounds/audio/${w}.mp3`; player.load(); player.play().catch(() => {}); }; // タップの中で同期的に呼ぶ
  const hear = (root) => root.querySelectorAll("[data-say]").forEach((b) => onTap(b, () => say(b.dataset.say)));
  const sentences = (g) => {
    const set = new Set(words(g).map((e) => e.w));
    return c.clips().filter((cl) => (cl.en.toLowerCase().match(/[a-z']+/g) || []).some((t) => set.has(t))).slice(0, 40);
  };

  /* ---------- 音の一覧 ---------- */
  function listScreen() {
    setView("🔤 音の特訓", c.back);
    app.innerHTML = '<p class="sub">読み込み中…</p>';
    load().then((gs) => {
      app.innerHTML = `<p class="sub">日本語話者がまちがえやすい音を、1つずつ練習します。まず聞き分け、次に発音の順がおすすめです。</p>` + gs.map((g) => {
        const s = of(g.id), ws = words(g), done = ws.filter((e) => (s.say[e.w]?.best || 0) >= PASS).length;
        return `<div class="card"><div class="q-meta"><b>${esc(g.title)}</b><span>発音 ${done}/${ws.length}${s.quiz.n ? ` ・ 聞き分け ${Math.round((s.quiz.ok / s.quiz.n) * 100)}%` : ""}</span></div>
          <div class="sub">${esc(g.desc)}</div><button class="btn block" data-g="${g.id}" style="margin-top:10px">練習する</button></div>`;
      }).join("");
      app.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => groupScreen(gs.find((g) => g.id === b.dataset.g))));
    }).catch(() => { app.innerHTML = '<p class="sub">教材を読み込めませんでした。</p>'; });
  }

  /* ---------- 1つの音のメニュー ---------- */
  function groupScreen(g) {
    setView(g.title, listScreen);
    const s = of(g.id), sent = sentences(g);
    app.innerHTML = `<div class="card"><div class="sub">${esc(g.desc)}</div>${g.tips.map((t) => `<div style="margin-top:8px">・${esc(t)}</div>`).join("")}</div>
      <div class="actions" style="flex-direction:column">
        ${g.pairs ? `<button class="btn" id="quiz">👂 聞き分けクイズ${s.quiz.n ? `（これまでの正答率 ${Math.round((s.quiz.ok / s.quiz.n) * 100)}%）` : ""}</button>` : ""}
        <button class="btn" id="say">🎤 単語を言って採点</button>
        ${sent.length ? `<button class="btn ghost" id="sent">📖 この音を含む文で練習（${sent.length}文）</button>` : ""}</div>`;
    if (g.pairs) $("#quiz").onclick = () => quizScreen(g, { i: 0, ok: 0, N: 10, order: shuffle(g.pairs.map((_, k) => k)) });
    $("#say").onclick = () => sayScreen(g);
    if (sent.length) $("#sent").onclick = () => c.startPron({ no: 0, custom: true, title: `🎤 ${g.title}`, clips: sent });
  }

  /* ---------- 聞き分けクイズ: 流れた音声がどちらの語か当てる ---------- */
  function quizScreen(g, r) {
    setView(`👂 ${g.title}`, () => groupScreen(g));
    if (r.i >= r.N) {
      app.innerHTML = `<div class="card" style="text-align:center"><div class="sub">${esc(g.title)} の聞き分け</div><div class="big">${r.ok} / ${r.N}</div>
        <div class="sub">${r.ok >= 9 ? "しっかり聞き分けられています！" : r.ok >= 6 ? "もう少し。間違えた語は、発音練習でも口の形を意識してみましょう。" : "まだ聞き分けにくい音です。お手本を何度も聞いて、違いを探してみましょう。"}</div></div>
        <div class="actions" style="flex-direction:column"><button class="btn" id="again">もう一度</button><button class="btn ghost" id="say">🎤 発音を練習する</button><button class="btn ghost" id="home">戻る</button></div>`;
      $("#again").onclick = () => quizScreen(g, { i: 0, ok: 0, N: r.N, order: shuffle(g.pairs.map((_, k) => k)) });
      $("#say").onclick = () => sayScreen(g); $("#home").onclick = () => groupScreen(g);
      return;
    }
    const pair = g.pairs[r.order[r.i % r.order.length]], ans = Math.random() < 0.5 ? 0 : 1, right = pair[ans];
    app.innerHTML = `<div class="card"><div class="q-meta"><span>どちらの語？</span><span>${r.i + 1} / ${r.N}</span></div>
      <div class="actions"><button class="btn ghost" data-say="${right.w}" style="touch-action:manipulation">🔊 もう一度聞く</button></div>
      <div class="actions" style="margin-top:12px">${pair.map((e, k) => `<button class="btn ghost" data-pick="${k}" style="flex:1"><b style="font-size:20px">${esc(e.w)}</b><br><small>${esc(e.ja)}</small></button>`).join("")}</div>
      <div id="fb"></div></div>`;
    hear(app);
    say(right.w); // 問題が出た瞬間に鳴らす（直前のタップの中なのでスマホでも鳴る）
    app.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => {
      const ok = +b.dataset.pick === ans, s = of(g.id);
      s.quiz.n++; if (ok) { s.quiz.ok++; r.ok++; } save();
      app.querySelectorAll("[data-pick]").forEach((x) => (x.disabled = true));
      b.style.outline = `3px solid ${ok ? "var(--ok)" : "var(--ng)"}`;
      $("#fb").innerHTML = `<div class="verdict ${ok ? "ok" : ""}" style="margin-top:12px">${ok ? "正解！" : `残念… 正解は ${esc(right.w)}`}</div>
        <div class="actions" style="margin-top:8px">${pair.map((e) => `<button class="btn ghost" data-say="${e.w}" style="touch-action:manipulation">🔊 ${esc(e.w)} <small>${esc(e.ipa)}</small></button>`).join("")}</div>
        <div class="actions" style="margin-top:8px"><button class="btn" id="nx">${r.i + 1 >= r.N ? "結果を見る" : "次へ"}</button></div>`;
      hear($("#fb"));
      $("#nx").onclick = () => { r.i++; quizScreen(g, r); };
    }));
  }

  /* ---------- 単語を言って音ごとに採点 ---------- */
  function sayScreen(g, i = 0) {
    setView(`🎤 ${g.title}`, () => groupScreen(g));
    const list = words(g), e = list[i], last = i === list.length - 1, p = of(g.id).say[e.w];
    app.innerHTML = `<div class="card"><div class="q-meta"><span>${i + 1} / ${list.length}</span><span>${p ? `最高 ${p.best}点` : ""}</span></div>
      <div style="text-align:center"><div class="big" style="font-size:38px">${esc(e.w)}</div><div style="font-size:24px">${esc(e.ipa)}</div><div class="jp">${esc(e.ja)}</div></div>
      <div class="actions"><button class="btn ghost" data-say="${e.w}" style="touch-action:manipulation">🔊 お手本</button><button class="btn" id="mic" style="touch-action:manipulation">🎤 話す</button></div>
      <div id="res" style="margin-top:12px"></div>
      <div class="actions" style="margin-top:12px"><button class="btn ghost" id="prev"${i ? "" : " disabled"}>前へ</button><button class="btn ghost" id="next">${last ? "メニューへ" : "次へ"}</button></div>
      <div class="sub" style="margin-top:10px">${g.tips.map((t) => `・${esc(t)}`).join("<br>")}</div></div>`;
    hear(app);
    $("#prev").onclick = () => sayScreen(g, i - 1);
    $("#next").onclick = () => (last ? groupScreen(g) : sayScreen(g, i + 1));
    const mic = $("#mic"), res = $("#res");
    c.azPrep();
    let busy = false;
    onTap(mic, async () => {
      if (busy) return;
      if (!c.azReady()) { c.azPrep(); res.innerHTML = `<div class="sub">${c.az.off ? "この機能には Azure の設定が必要です。" : "採点の準備中です。数秒待ってからもう一度押してください。"}</div>`; return; }
      busy = true;
      player.pause(); player.removeAttribute("src"); player.load(); // iPhone は再生した音声を持ったままだとマイクが無音になることがある
      mic.textContent = "🎤 聞いています…（話し終わると自動で採点）"; res.innerHTML = "";
      await new Promise((ok) => setTimeout(ok, 250));
      try {
        const x = await c.azAssess(e.w), S = c.az.sdk;
        if (x.reason !== S.ResultReason.RecognizedSpeech) { res.innerHTML = '<div class="sub">声を検知できませんでした。押してすぐ、少し大きめの声でどうぞ。</div>'; return; }
        const w = JSON.parse(x.properties.getProperty(S.PropertyId.SpeechServiceResponse_JsonResult)).NBest[0].Words?.[0];
        if (!w) { res.innerHTML = '<div class="sub">うまく聞き取れませんでした。もう一度どうぞ。</div>'; return; }
        const score = Math.round(w.PronunciationAssessment.AccuracyScore), phs = w.Phonemes || [];
        const tset = new Set(g.targets.map(nz));
        const tgt = new Set(phs.map((q, k) => (g.last ? k === phs.length - 1 : tset.has(nz(q.Phoneme))) ? k : -1).filter((k) => k >= 0));
        const row = phs.map((q, k) => { const a = Math.round(q.PronunciationAssessment.AccuracyScore);
          return `<span class="ph ${a >= 80 ? "" : a >= 60 ? "wk" : "dng"}${tgt.has(k) ? " tg" : ""}">${esc(q.Phoneme)}<small>${a}</small></span>`; }).join("");
        // 練習中の音が低いとき、代わりに何に聞こえたかを示す（r を言ったのに l に聞こえた、など）
        const hints = [...tgt].map((k) => phs[k]).filter((q) => q.PronunciationAssessment.AccuracyScore < PASS).map((q) => {
          const own = q.PronunciationAssessment.AccuracyScore, alt = (q.PronunciationAssessment.NBestPhonemes || []).filter((a) => nz(a.Phoneme) !== nz(q.Phoneme)).sort((a, b) => b.Score - a.Score)[0];
          return alt && alt.Score >= own ? `/${esc(q.Phoneme)}/ が <b>/${esc(alt.Phoneme)}/</b> に近く聞こえました。` : `/${esc(q.Phoneme)}/ がはっきりしません。もう少しゆっくり、口の形を意識して。`;
        });
        const s = of(g.id), q0 = s.say[e.w] || { best: 0, n: 0 };
        s.say[e.w] = { best: Math.max(q0.best, score), n: q0.n + 1 }; save();
        res.innerHTML = `<div style="text-align:center"><div class="big">${score}<small style="font-size:18px">点</small></div><div class="verdict ${score >= PASS ? "ok" : ""}">${score >= 95 ? "完璧！" : score >= PASS ? "合格！" : score >= 50 ? "惜しい！もう一度" : "お手本をよく聞いてもう一度"}</div></div>
          <div class="phs">${row}</div><div class="sub" style="text-align:center">枠つきが、今回練習している音です</div>
          ${hints.length ? `<div class="card" style="margin-top:8px">${hints.join("<br>")}</div>` : g.targets.length || g.last ? '<div class="sub" style="margin-top:8px;text-align:center">この音は通じています！</div>' : ""}`;
      } catch (err) {
        res.innerHTML = `<div class="sub">${/Permission|denied/i.test(String(err?.message || err)) ? "マイクが許可されていません。Safari のマイク許可を確認してください。" : "採点に失敗しました。もう一度試してください。"}</div>`;
      } finally { busy = false; mic.textContent = "🎤 話す"; c.azPrep(); }
    });
  }

  return { listScreen };
}
