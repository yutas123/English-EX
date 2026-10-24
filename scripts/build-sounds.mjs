// 音の特訓の教材を作る: 単語リスト → 発音記号(IPA) + お手本音声(Azure 音声合成) → public/sounds/
// 使い方: node scripts/build-sounds.mjs   （.env.local の AZURE_SPEECH_KEY / AZURE_SPEECH_REGION を使う。音声は作成済みならスキップ）
import fs from "node:fs";
import { dictionary } from "cmu-pronouncing-dictionary";

// pairs: 紛らわしい2語（聞き分けクイズにも使う）。words: ペアのない単語。[英語, 意味]
// targets: この練習で見る音（IPA）。last: true なら語末の音を見る
const GROUPS = [
  { id: "rl", title: "R と L", targets: ["r", "l"],
    desc: "日本語の「ラ行」は、どちらでもない音です。いちばん間違えやすい組み合わせ。",
    tips: ["L：舌先を上の前歯の裏につけたまま、声を出します。", "R：舌はどこにもつけません。舌を奥に引いて丸め、唇を少しすぼめます。"],
    pairs: [[["right", "右・正しい"], ["light", "光・軽い"]], [["reef", "サンゴ礁"], ["leaf", "葉"]], [["rock", "岩"], ["lock", "鍵"]], [["road", "道"], ["load", "荷物"]], [["rice", "米"], ["lice", "シラミ"]], [["race", "競争"], ["lace", "レース"]], [["grass", "草"], ["glass", "ガラス"]], [["free", "自由な"], ["flee", "逃げる"]], [["wrong", "間違った"], ["long", "長い"]], [["fry", "揚げる"], ["fly", "飛ぶ"]], [["correct", "正しい"], ["collect", "集める"]], [["rain", "雨"], ["lane", "車線"]], [["rip", "裂く"], ["lip", "唇"]]] },
  { id: "th", title: "TH（θ・ð）", targets: ["θ", "ð"],
    desc: "舌を歯に軽く当てて出す息の音。日本語の「サ行」「ザ行」で代用すると別の語になります。",
    tips: ["舌先を、上下の歯で軽くはさみます。", "θ（think）は息だけ、ð（this）は声を出します。", "舌を引っ込めて「サ」と言ってしまうのが典型的な間違いです。"],
    pairs: [[["think", "考える"], ["sink", "沈む"]], [["thank", "感謝する"], ["sank", "沈んだ"]], [["thick", "厚い"], ["sick", "病気の"]], [["three", "3"], ["free", "自由な"]], [["path", "小道"], ["pass", "通る"]], [["mouth", "口"], ["mouse", "ネズミ"]], [["they", "彼ら"], ["day", "日"]], [["then", "それから"], ["den", "巣穴"]], [["breathe", "息をする"], ["breeze", "そよ風"]]] },
  { id: "vb", title: "V と B", targets: ["v", "b"],
    desc: "V は、上の前歯を下唇に軽く当てて声を出します。B は両唇で作る音です。",
    tips: ["V：上の歯を下唇に当てて、すき間から声を出します。唇は閉じません。", "B：両唇をいったん閉じてから、はじくように開きます。"],
    pairs: [[["very", "とても"], ["berry", "ベリー"]], [["vest", "ベスト"], ["best", "最高の"]], [["van", "バン"], ["ban", "禁止"]], [["vote", "投票"], ["boat", "ボート"]], [["curve", "曲線"], ["curb", "縁石"]], [["marvel", "驚く"], ["marble", "大理石"]]] },
  { id: "fh", title: "F と H", targets: ["f", "h"],
    desc: "日本語の「フ」は両唇で出しますが、英語の F は歯と唇で出します。",
    tips: ["F：上の歯を下唇に当てて、息だけを出します。", "H：口を軽く開けて、のどから息を出します。"],
    pairs: [[["fire", "火"], ["hire", "雇う"]], [["fat", "太った"], ["hat", "帽子"]], [["fit", "合う"], ["hit", "打つ"]], [["fall", "落ちる"], ["hall", "広間"]], [["fair", "公平な"], ["hair", "髪"]]] },
  { id: "ae", title: "ア の3種類（æ・ʌ・ɑ）", targets: ["æ", "ʌ", "ɑ"],
    desc: "日本語の「ア」1つに対して、英語には似た音が3つあります。",
    tips: ["æ（cat）：口を横に大きく開け、「エ」と「ア」の中間の音を出します。", "ʌ（cut）：口を小さめに開け、短く「ア」と言います。", "ɑ（hot）：口を縦に大きく開け、のどの奥から「ア」と言います。"],
    pairs: [[["cat", "ネコ"], ["cut", "切る"]], [["bat", "コウモリ"], ["but", "しかし"]], [["cap", "帽子"], ["cup", "カップ"]], [["ran", "走った"], ["run", "走る"]], [["hat", "帽子"], ["hot", "熱い"]], [["bag", "かばん"], ["bug", "虫"]], [["cap", "帽子"], ["cop", "警官"]]] },
  { id: "sh", title: "S と SH", targets: ["s", "ʃ"],
    desc: "「シ」は英語では sh の音です。s の後に i が来ても「シ」にはなりません。",
    tips: ["S：舌先を歯ぐきに近づけ、すき間から息を出します。", "SH：唇を少し丸め、舌を少し奥に引いて息を出します。"],
    pairs: [[["see", "見る"], ["she", "彼女"]], [["sip", "すする"], ["ship", "船"]], [["save", "救う"], ["shave", "剃る"]], [["sock", "靴下"], ["shock", "衝撃"]], [["sore", "痛い"], ["shore", "岸"]]] },
  { id: "end", title: "語末の子音", targets: [], last: true,
    desc: "単語の最後の子音に「ウ」や「オ」を足さないための練習です。dog は「ドッグ」ではなく、「ドグ」と短く止めます。",
    tips: ["最後の子音は、母音を足さずに、息や音を短く止めます。", "d・g・b は、のどを少し鳴らして止めます。"],
    words: [["bag", "かばん"], ["dog", "犬"], ["cup", "カップ"], ["bed", "ベッド"], ["map", "地図"], ["book", "本"], ["desk", "机"], ["milk", "牛乳"], ["bread", "パン"], ["street", "通り"], ["big", "大きい"], ["cat", "ネコ"]] },
  { id: "ed", title: "-ed の音", targets: [], last: true,
    desc: "過去形の -ed は、「ド」ではなく、t・d・id の3通りに読み分けます。",
    tips: ["walked・watched・helped・stopped は、最後が t（息だけ）。", "played・called・cleaned は、最後が d（声を出す）。", "wanted・needed は、最後が id（1音節増える）。"],
    words: [["walked", "歩いた"], ["watched", "見た"], ["helped", "手伝った"], ["stopped", "止まった"], ["played", "遊んだ"], ["called", "呼んだ"], ["cleaned", "掃除した"], ["wanted", "欲しかった"], ["needed", "必要だった"]] },
];

const IPA = { AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɝ", EY: "eɪ", F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p", R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ" };
const VOWEL = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)/;
function ipa(word) {
  const ph = (dictionary[word] || "").split(" ").filter(Boolean);
  if (!ph.length) throw new Error(`辞書にない語: ${word}`);
  const vowels = ph.filter((p) => VOWEL.test(p)).length;
  let out = "", prevVowel = -1;
  ph.forEach((p, i) => {
    const m = p.match(/^([A-Z]+)([012])?$/), base = m[1], st = m[2];
    if (VOWEL.test(base) && st === "1" && vowels > 1) { // 強勢のある音節の頭（直前の子音まで）に ˈ を置く
      let at = out.length; for (let k = i - 1; k > prevVowel && !VOWEL.test(ph[k]); k--) at -= IPA[ph[k].replace(/\d/, "")].length;
      out = out.slice(0, at) + "ˈ" + out.slice(at);
    }
    if (VOWEL.test(base)) prevVowel = i;
    out += base === "AH" && st === "0" ? "ə" : base === "ER" && st === "0" ? "ɚ" : IPA[base];
  });
  return `/${out}/`;
}

const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^(AZURE_SPEECH_\w+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
async function tts(word, file) {
  if (fs.existsSync(file)) return;
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><prosody rate="-15%">${word}</prosody></voice></speak>`;
  const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-16khz-64kbitrate-mono-mp3", "User-Agent": "english-ex" }, body: ssml,
  });
  if (!r.ok) throw new Error(`TTS ${word}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

fs.mkdirSync("public/sounds/audio", { recursive: true });
const seen = new Map();
const entry = ([w, ja]) => { const e = { w, ja, ipa: ipa(w) }; seen.set(w, e); return e; };
const out = GROUPS.map((g) => ({ ...g, pairs: g.pairs?.map((p) => p.map(entry)), words: g.words?.map(entry) }));
for (const w of seen.keys()) await tts(w, `public/sounds/audio/${w}.mp3`);
fs.writeFileSync("public/sounds/words.json", JSON.stringify(out));
console.log(`${out.length} groups, ${seen.size} words`);
