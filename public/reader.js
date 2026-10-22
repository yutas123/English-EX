// 英文・音声を見る／聞くページ。和訳はボタンを押すと表示される。
import * as N from "./dnotes.js";
const $ = (s) => document.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), player = $("#player");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let lessons = [], playingId = null;

const mobile = matchMedia("(pointer: coarse)").matches; // スマホ・タブレットは「頭から再生」だけにする
// 常に頭から鳴らす。スマホは再生し終えた音声に currentTime=0 + play() が効かないことがあるので、終了後や失敗したときは読み込み直してから鳴らす
function restart(id) {
  const reload = () => { player.load(); player.play().catch(() => player.addEventListener("canplay", () => player.play().catch(() => {}), { once: true })); };
  const url = `dictation/audio/${id}.mp3`;
  if (playingId !== id) { playingId = id; player.src = url; reload(); sync(); return; }
  if (player.ended) { reload(); sync(); return; }
  try { player.pause(); player.currentTime = 0; } catch { /* 無視 */ }
  const p = player.play();
  if (p) p.catch(reload);
  sync();
}
// タッチ端末では click を待たず指を離した瞬間に実行し、押した瞬間に色を変える。キーボード操作の click も拾う
function onTap(btn, fn) {
  let last = 0;
  const flash = () => { btn.classList.add("hit"); setTimeout(() => btn.classList.remove("hit"), 250); };
  btn.addEventListener("pointerdown", () => flash());
  btn.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") return; last = Date.now(); fn(); });
  btn.addEventListener("click", () => { if (Date.now() - last > 700) fn(); });
}

function setView(title, back) { titleEl.textContent = title; backBtn.onclick = back; scrollTo(0, 0); }

const cleared = (l) => l.clips.filter((c) => N.isChk(c.id)).length;
function listScreen() {
  setView("英文と音声", () => (location.href = "/"));
  const total = lessons.reduce((n, l) => n + l.clips.length, 0), got = lessons.reduce((n, l) => n + cleared(l), 0);
  const cells = lessons.map((l) => {
    const n = cleared(l), len = l.clips.length, cls = n === len ? "full" : n ? "part" : "";
    return `<button class="lcell ${cls}" data-l="${l.no}"><span>${String(l.no).padStart(2, "0")}</span><b>${n === len ? "✓" : n ? `${n}/${len}` : `${len}文`}</b>${cls === "part" ? `<i style="width:${(n / len) * 100}%"></i>` : ""}</button>`;
  }).join("");
  app.innerHTML = `<div class="card hero"><div class="sub">完了にした文</div><div class="big">${got}<small> / ${total}</small> <span class="pct">${total ? Math.floor((got / total) * 100) : 0}%</span></div></div><div class="lgrid">${cells}</div>`;
  app.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => lessonScreen(lessons.find((l) => l.no === +b.dataset.l))));
}

function lessonScreen(lesson) {
  setView(`レッスン ${String(lesson.no).padStart(2, "0")}`, listScreen);
  player.pause(); playingId = null;
  app.innerHTML = lesson.clips.map((c) => `<div class="card" data-id="${c.id}">
      <div class="q-meta"><span>${c.id} <button class="chip bm" data-act="bm">${N.isBm(c.id) ? "★" : "☆"}</button> <button class="chip bm" data-act="chk">${N.isChk(c.id) ? "✅" : "☐"}</button></span></div>
      <div class="rd-en" hidden>${esc(c.en)}</div>
      <div class="actions"><button class="btn ghost" data-act="play">${mobile ? "🔊 頭から再生" : "🔊 再生"}</button><button class="btn ghost" data-act="en">英文を見る</button><button class="btn ghost" data-act="ja" hidden>和訳を見る</button></div>
      <div class="rd-ja jp" hidden>${esc(c.ja)}</div>
    </div>`).join("") + `<div class="actions"><button class="btn ghost" id="home">一覧へ</button></div>`;
  $("#home").onclick = listScreen;
  app.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id, play = card.querySelector('[data-act="play"]'), ja = card.querySelector('[data-act="ja"]'), en = card.querySelector('[data-act="en"]'), enBox = card.querySelector(".rd-en"), jaBox = card.querySelector(".rd-ja");
    if (mobile) onTap(play, () => restart(id));
    else play.onclick = () => {
      if (playingId === id && !player.paused) return player.pause();
      if (playingId === id && !player.ended) { player.play().catch(() => {}); sync(); return; } // 一時停止からは続きから
      restart(id);
    };
    const bm = card.querySelector('[data-act="bm"]');
    bm.onclick = () => { bm.textContent = N.toggleBm(id) ? "★" : "☆"; };
    const chk = card.querySelector('[data-act="chk"]');
    chk.onclick = () => { chk.textContent = N.toggleChk(id) ? "✅" : "☐"; };
    en.onclick = () => {
      enBox.hidden = !enBox.hidden; en.textContent = enBox.hidden ? "英文を見る" : "英文を隠す";
      ja.hidden = enBox.hidden; // 英文を表示している間だけ和訳ボタンを出す
      if (enBox.hidden) { jaBox.hidden = true; ja.textContent = "和訳を見る"; }
    };
    ja.onclick = () => { jaBox.hidden = !jaBox.hidden; ja.textContent = jaBox.hidden ? "和訳を見る" : "和訳を隠す"; };
  });
}

function sync() {
  app.querySelectorAll(".card").forEach((card) => {
    const on = card.dataset.id === playingId && !player.paused;
    if (!mobile) card.querySelector('[data-act="play"]').textContent = on ? "⏹ 停止" : "🔊 再生";
  });
}
["play", "playing", "pause", "ended", "emptied", "error"].forEach((ev) => player.addEventListener(ev, sync));

fetch("dictation/lessons.json").then((r) => r.json()).then((j) => { lessons = j; listScreen(); N.pull().then((ch) => { if (ch && app.querySelector(".lgrid")) listScreen(); }); })
  .catch(() => { app.innerHTML = '<p class="sub">教材を読み込めませんでした。</p>'; });
