// ディクテーションの文ごとのメモ: ブックマークとミス記録（端末 + サーバー同期）
// notes[id] = { bm: bool, chk: bool（英文ページの完了）, miss: [{ t, inp, errs: [{ k, i, a }] }], u }
const KEY = "english-ex-dictation-notes-v1";
export let notes = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch { /* 保存不可でも継続 */ } };
const dirty = new Set();
let timer = 0;
function push() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!dirty.size) return;
    const items = {}; dirty.forEach((id) => (items[id] = notes[id]));
    fetch("/api/dictation-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), keepalive: true })
      .then((r) => { if (r.ok) dirty.clear(); }).catch(() => {});
  }, 600);
}
const get = (id) => (notes[id] ||= { bm: false, miss: [], u: 0 });
function touch(id) { get(id).u = Date.now(); dirty.add(id); saveLocal(); push(); }

export const isBm = (id) => !!notes[id]?.bm;
export const isChk = (id) => !!notes[id]?.chk;
export function toggleChk(id) { get(id).chk = !get(id).chk; touch(id); return get(id).chk; }
export function toggleBm(id) { get(id).bm = !get(id).bm; touch(id); return get(id).bm; }
export function addMiss(id, inp, errs) {
  const n = get(id); n.miss.push({ t: Date.now(), inp, errs }); n.miss = n.miss.slice(-30); touch(id);
}

// サーバーの内容を取り込む。ミス記録は時刻で和集合、ブックマークは新しい方を採用
export async function pull() {
  try {
    const r = await fetch("/api/dictation-notes", { cache: "no-store" });
    if (!r.ok) return false;
    const { items } = await r.json();
    let changed = false;
    for (const [id, s] of Object.entries(items)) {
      const l = notes[id];
      if (!l) { notes[id] = s; changed = true; continue; }
      const seen = new Set(l.miss.map((m) => m.t)), extra = (s.miss || []).filter((m) => !seen.has(m.t));
      const newer = (s.u || 0) > (l.u || 0), bm = newer ? !!s.bm : l.bm, chk = newer ? !!s.chk : !!l.chk;
      if (extra.length || bm !== l.bm || chk !== !!l.chk) {
        l.miss = [...l.miss, ...extra].sort((x, y) => x.t - y.t).slice(-30); l.bm = bm; l.chk = chk; l.u = Math.max(l.u || 0, s.u || 0); changed = true;
      }
      if ((l.u || 0) > (s.u || 0) || l.miss.length > (s.miss || []).length) dirty.add(id); // 端末側にだけある分を送る
    }
    for (const id of Object.keys(notes)) if (!items[id] && (notes[id].bm || notes[id].chk || notes[id].miss.length)) dirty.add(id);
    saveLocal(); if (dirty.size) push();
    return changed;
  } catch { return false; }
}

/* ---------- ミスの分類 ---------- */
export const KINDS = {
  art: "冠詞の抜け・余計", prep: "前置詞の抜け・余計", aux: "助動詞・be動詞の抜け・余計", miss: "その他の語の抜け", extra: "余計な語を入れた",
  infl: "語形の違い（-s/-ed/-ing など）", spell: "綴りのミス", func: "機能語の聞き違い", heard: "別の語に聞こえた",
};
const ART = /^(a|an|the)$/, PREP = /^(in|on|at|to|of|for|from|with|by|about|into|over|under|after|before|than|as)$/;
const AUX = /^(am|is|are|was|were|be|been|do|does|did|have|has|had|will|would|can|could|should|may|might|must|not)$/;
const FUNC = /^(a|an|the|in|on|at|to|of|for|from|with|by|about|into|am|is|are|was|were|be|been|do|does|did|have|has|had|will|would|can|could|should|may|might|must|not|he|she|it|they|we|you|i|his|her|its|their|our|your|my|this|that|these|those|and|or|but|if|than|as)$/;
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const stem = (w) => w.replace(/(ies|ied|ing|es|ed|s|d)$/, "").replace(/y$/, "i");
const gapKind = (w) => (ART.test(w) ? "art" : PREP.test(w) ? "prep" : AUX.test(w) ? "aux" : null);
function subKind(x, y) { // x: 入力した語, y: 正解の語
  if (x !== y && (stem(x) === stem(y) || x + "s" === y || y + "s" === x)) return "infl";
  if (FUNC.test(x) && FUNC.test(y)) return "func";
  if (Math.min(x.length, y.length) >= 3 && lev(x, y) <= 2) return "spell";
  return "heard";
}
// a: 入力の単語列, b: 正解の単語列 → 誤りの一覧 [{k, i(入力側), a(正解側)}]
export function classify(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const errs = []; let i = 0, j = 0, xs = [], ys = [];
  const flush = () => {
    const k = Math.min(xs.length, ys.length);
    for (let t = 0; t < k; t++) errs.push({ k: subKind(xs[t], ys[t]), i: xs[t], a: ys[t] });
    for (const y of ys.slice(k)) errs.push({ k: gapKind(y) || "miss", i: "", a: y });
    for (const x of xs.slice(k)) errs.push({ k: gapKind(x) || "extra", i: x, a: "" });
    xs = []; ys = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; }
    else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) xs.push(a[i++]);
    else ys.push(b[j++]);
  }
  flush();
  return errs;
}
