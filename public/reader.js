// 英文・音声を見る／聞くページ。和訳はボタンを押すと表示される。
import * as N from "./dnotes.js";
const $ = (s) => document.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), player = $("#player");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let lessons = [], playingId = null;

function setView(title, back) { titleEl.textContent = title; backBtn.onclick = back; scrollTo(0, 0); }

function listScreen() {
  setView("英文と音声", () => (location.href = "/"));
  app.innerHTML = `<div class="lgrid">${lessons.map((l) => `<button class="lcell" data-l="${l.no}"><span>${String(l.no).padStart(2, "0")}</span><b>${l.clips.length}文</b></button>`).join("")}</div>`;
  app.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => lessonScreen(lessons.find((l) => l.no === +b.dataset.l))));
}

function lessonScreen(lesson) {
  setView(`レッスン ${String(lesson.no).padStart(2, "0")}`, listScreen);
  player.pause(); playingId = null;
  app.innerHTML = lesson.clips.map((c) => `<div class="card" data-id="${c.id}">
      <div class="q-meta"><span>${c.id} <button class="chip bm" data-act="bm">${N.isBm(c.id) ? "★" : "☆"}</button></span></div>
      <div class="rd-en" hidden>${esc(c.en)}</div>
      <div class="actions"><button class="btn ghost" data-act="play">🔊 再生</button><button class="btn ghost" data-act="en">英文を見る</button><button class="btn ghost" data-act="ja" hidden>和訳を見る</button></div>
      <div class="rd-ja jp" hidden>${esc(c.ja)}</div>
    </div>`).join("") + `<div class="actions"><button class="btn ghost" id="home">一覧へ</button></div>`;
  $("#home").onclick = listScreen;
  app.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id, play = card.querySelector('[data-act="play"]'), ja = card.querySelector('[data-act="ja"]'), en = card.querySelector('[data-act="en"]'), enBox = card.querySelector(".rd-en"), jaBox = card.querySelector(".rd-ja");
    play.onclick = () => {
      if (playingId === id && !player.paused) return player.pause();
      if (playingId !== id) { playingId = id; player.src = `dictation/audio/${id}.mp3`; player.load(); } else if (player.ended) player.currentTime = 0;
      player.play().catch(() => {}); sync();
    };
    const bm = card.querySelector('[data-act="bm"]');
    bm.onclick = () => { bm.textContent = N.toggleBm(id) ? "★" : "☆"; };
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
    card.querySelector('[data-act="play"]').textContent = on ? "⏹ 停止" : "🔊 再生";
  });
}
["play", "playing", "pause", "ended", "emptied", "error"].forEach((ev) => player.addEventListener(ev, sync));

fetch("dictation/lessons.json").then((r) => r.json()).then((j) => { lessons = j; listScreen(); N.pull(); })
  .catch(() => { app.innerHTML = '<p class="sub">教材を読み込めませんでした。</p>'; });
