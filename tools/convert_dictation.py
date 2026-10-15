"""ReStart-E-J.txt (cp932) -> public/dictation/lessons.json
[001-01] の次行が英文、その次行が和訳。音声は public/dictation/audio/<id>.mp3。
テキストの無い音声(027-03, 163-03)は出題しない。"""
import json, os, re
base = os.path.join(os.path.dirname(__file__), "..")
txt = open(os.path.join(base, "tools", "ReStart-E-J.txt"), "rb").read().decode("cp932")
audio = os.path.join(base, "public", "dictation", "audio")
lessons = {}
for m in re.finditer(r"^\[([\w-]+)\][ \t]*\r?\n(.*?)\r?\n(.*?)(?=\r?\n\[|\Z)", txt, re.M | re.S):
    cid, en, ja = m.group(1), m.group(2).strip(), m.group(3).strip()
    if not os.path.exists(os.path.join(audio, cid + ".mp3")):
        print("音声なし:", cid); continue
    lessons.setdefault(cid[:3], []).append({"id": cid, "en": en, "ja": ja})
out = [{"no": int(k), "clips": v} for k, v in sorted(lessons.items())]
json.dump(out, open(os.path.join(base, "public", "dictation", "lessons.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "lessons", sum(len(l["clips"]) for l in out), "clips")
