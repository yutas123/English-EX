"""ENGLISH_EX-CD (Review.xls + Q-sheets PDF + MP3) -> web/data/*.json

Usage: python -I tools/convert.py
"""
import difflib
import io
import json
import re
import shutil
import sys
from pathlib import Path

import pymupdf
import xlrd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ENGLISH_EX-CD"
OUT = ROOT / "public" / "data"
AUDIO_OUT = ROOT / "public" / "audio"

CJK = re.compile(r"[぀-ヿ㐀-鿿＀-￯]")
JUNK = {"ENGLISH EX", "UNIV.", "STEP", "TOEIC", "TOEFL", "Grammar"}
HEAD = re.compile(r"^(\d{2})[\s　]*(.*)$")
AB = re.compile(r"^([a-h])\)\s*(.*)$")
TAG = re.compile(r"[（(]{2}(.+?)[）)]\s*[）)]")
OPT = re.compile(r"^(\d{1,2})\.\s+(.+)$")
COMPOSE = r"変え|変換|作る|作り|書き換|言い換|参考|にする|に直|に整|並べ|完成|続け|つなげ|結び|合わせ"
PAREN = re.compile(r"\(\s*([^()]*?)\s*\)")


def norm(s):
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s.replace("　", " ")).strip()


def make_section(lines):
    """問題と問題の間にある説明文 -> {title, body}（先頭行が見出し）"""
    if not lines:
        return None
    body = ""
    for l in lines[1:]:
        body += (" " if body and re.search(r"[A-Za-z0-9,.]$", body) and re.match(r"[A-Za-z0-9(]", l) else "") + l
    return {"title": lines[0].strip(), "body": body.strip()}


def parse_sheet(pdf_path):
    """-> {"09-a": {no, tags, sheetJp, en}}"""
    pages = [[l.strip() for l in p.get_text().splitlines() if l.strip()] for p in pymupdf.open(pdf_path)]
    pages = [pg[3:] if "ENGLISH EX" in pg[:3] else pg for pg in pages]  # page numbers + running head
    freq = {}
    for pg in pages:
        for l in set(pg):
            freq[l] = freq.get(l, 0) + 1
    junk = {l for l, n in freq.items() if n >= max(3, len(pages) * 0.4) and not AB.match(l)}
    lines = [l for pg in pages for l in pg if l not in junk]

    items = {}
    pending = []
    i, n = 0, len(lines)
    while i < n:
        m = re.match(r"^(\d{2})(?:[\s　]+(.*))?$", lines[i])
        if not m:
            if not re.fullmatch(r"[ぁ-ん]{1,6}", lines[i]):  # ルビ（だいかこ 等）は除く
                pending.append(lines[i])
            i += 1
            continue
        section, pending = make_section(pending), []
        no, head = m.group(1), (m.group(2) or "").strip()
        i += 1
        while head.count("（") > head.count("）") and i < n:  # tag wraps lines
            head += " " + lines[i]
            i += 1
        if not head and i < n and CJK.search(lines[i]) and not AB.match(lines[i]) and not lines[i].startswith("（"):
            head = lines[i]  # "49<tab>" then JP on the next line
            i += 1
        tags = TAG.findall(head)
        head_jp = TAG.sub("", head).strip()

        subs, order, key, bank = {}, [], None, []
        while i < n:
            ln = lines[i]
            if re.match(r"^\d{2}(\s|　|$)", ln):
                break
            am = AB.match(ln)
            om = OPT.match(ln) if key is not None else None
            if om:
                bank.append(om.group(2).strip())
            elif am:
                key = am.group(1)
                order.append(key)
                subs[key] = {"jp": [], "en": [], "gloss": False}
                rest = am.group(2).strip()
                if rest:
                    subs[key]["jp" if CJK.search(rest) else "en"].append(rest)
            else:
                if key is None:
                    key = ""
                    order.append("")
                    subs[""] = {"jp": [], "en": [], "gloss": False}
                cur = subs[key]
                if CJK.search(ln):
                    if (ln.startswith("（") or ln.startswith("→")) and (cur["en"] or ln.startswith("→")):
                        cur["gloss"] = True
                    elif not cur["en"]:
                        cur["jp"].append(ln)
                    else:
                        break  # explanation text: block is over
                elif ln.startswith("→"):
                    cur["gloss"] = True
                else:
                    cur["en"].append(ln)
            i += 1
        for k in order:
            sub = subs[k]
            if not sub["en"]:
                continue
            sid = f"{no}-{k}" if k else no
            first = not any(v["no"] == no for v in items.values())
            items[sid] = {
                "no": no,
                "tags": tags,
                "sheetJp": bool(head_jp or sub["jp"] or sub["gloss"]),
                "en": norm(" ".join(sub["en"])),
            }
            if bank:
                items[sid]["bank"] = bank
            if section and first:
                items[sid]["section"] = section
    return items


def sheet_title(pdf_path, unit):
    pages = [[l.strip() for l in p.get_text().splitlines() if l.strip()] for p in pymupdf.open(pdf_path)]
    freq = {}
    for pg in pages:
        for l in set(pg):
            freq[l] = freq.get(l, 0) + 1
    skip = JUNK | {unit}
    return " ".join(l for l in pages[0] if freq[l] >= max(3, len(pages) * 0.4) and l not in skip and not AB.match(l))


def build_segments(en):
    segs, pos = [], 0
    for m in PAREN.finditer(en):
        inner = m.group(1).strip().strip("　").strip()
        hint = re.fullmatch(r"([A-Za-z]+)-", inner)
        if inner == "":
            seg = {"t": "blank"}
        elif hint:
            seg = {"t": "blank", "hint": hint.group(1)}
        elif "/" in inner:
            seg = {"t": "order", "words": [o.strip() for o in inner.split("/")]}
        elif "," in inner:
            seg = {"t": "choice", "options": [o.strip() for o in inner.split(",")]}
        else:
            continue
        if m.start() > pos:
            segs.append({"t": "text", "v": en[pos:m.start()]})
        segs.append(seg)
        pos = m.end()
    if pos < len(en):
        segs.append({"t": "text", "v": en[pos:]})
    return segs


def match_answer(segs, answer, greedy_word=True):
    """Return list of per-slot answers if `answer` fits the template, else None."""
    pat = "^"
    for s in segs:
        if s["t"] == "text":
            v = s["v"].replace("　", " ")
            pat += (r"\s*" if v[:1].isspace() else "") + r"\s*".join(re.escape(t) for t in v.split()) + (r"\s*" if v[-1:].isspace() else "")
        elif s["t"] == "choice":
            opts = sorted(s["options"], key=len, reverse=True)
            pat += "(" + "|".join(re.escape(o) for o in opts) + ")"
        elif s["t"] == "order":
            pat += r"(.+?)"
        elif s.get("hint"):
            pat += "(" + re.escape(s["hint"]) + r"\S*)" if greedy_word else "(" + re.escape(s["hint"]) + ".*?)"
        else:
            pat += r"(\S+)" if greedy_word else r"(.+?)"
    pat += "$"
    # whitespace around slots is optional-tolerant
    pat = pat.replace(r"\s*(", r"\s*(")
    m = re.match(pat, norm(answer), re.I)
    return list(m.groups()) if m else None


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    wb = xlrd.open_workbook(SRC / "Review.xls")
    notes = {}
    for r in range(wb.sheet_by_name("発音の注意点").nrows):
        row = wb.sheet_by_name("発音の注意点").row_values(r)
        notes[row[0]] = row[1]

    index, report = [], []
    for sh in wb.sheets():
        if not re.fullmatch(r"[A-Z]", sh.name):
            continue
        unit = sh.name
        review = {}
        order = []
        for r in range(sh.nrows):
            row = sh.row_values(r)
            iid = row[1].strip()
            if iid not in review:
                review[iid] = {"jp": row[2].strip(), "answers": []}
                order.append(iid)
            review[iid]["answers"].append(row[5].strip())
        sheet = parse_sheet(SRC / "Q-sheets" / f"{unit}.pdf")
        audio_dir = SRC / "MP3" / unit
        (AUDIO_OUT / unit).mkdir(parents=True, exist_ok=True)

        cur_sec = None
        items, stat = [], {"fill": 0, "proof": 0, "translate": 0, "compose": 0, "recall": 0, "audio_missing": 0}
        for iid in order:
            rv = review[iid]
            key = iid.split("-", 1)[1]  # "09-a"
            sh_item = sheet.get(key) or sheet.get(key + "-a") or sheet.get(key.split("-")[0])
            item = {
                "id": iid, "unit": unit, "no": key.split("-")[0],
                "jp": rv["jp"], "answers": rv["answers"],
            }
            mp3 = audio_dir / f"{iid}-.mp3"
            if mp3.exists():
                item["audio"] = f"audio/{unit}/{mp3.name}"
                dst = AUDIO_OUT / unit / mp3.name
                if not dst.exists():
                    shutil.copy2(mp3, dst)
            else:
                stat["audio_missing"] += 1
            if iid in notes:
                item["pronNote"] = notes[iid]

            if not sh_item:
                item["type"] = "recall"
                report.append(f"{iid}: not found in Q-sheet -> recall")
            else:
                if sh_item.get("section"):
                    cur_sec = sh_item["section"]
                    item["section"] = cur_sec
                en = sh_item["en"]
                tags = sh_item["tags"]
                item["tags"] = tags
                item["sheetJp"] = sh_item["sheetJp"]
                segs = build_segments(en)
                has_slot = any(s["t"] != "text" for s in segs)
                if any("和訳" in t for t in tags):
                    item["type"] = "translate"
                    item["stem"] = en
                elif has_slot:
                    sols = []
                    for a in rv["answers"]:
                        got = match_answer(segs, a) or match_answer(segs, a, False)
                        if got:
                            sols.append(got)
                    if sols:
                        item["type"] = "fill"
                        item["segments"] = segs
                        if sh_item.get("bank"):
                            item["bank"] = sh_item["bank"]
                        item["solutions"] = sols
                    else:
                        item["type"] = "recall"
                        report.append(f"{iid}: slots did not match answer -> recall | {en} || {rv['answers']}")
                else:
                    ttxt = " ".join(tags)
                    ratio = max(difflib.SequenceMatcher(None, norm(en).lower(), norm(a).lower()).ratio() for a in rv["answers"])
                    if re.search(r"訂正|間違", ttxt) or (ratio >= 0.6 and not re.search(COMPOSE, ttxt)):
                        item["type"] = "proof"
                    else:
                        item["type"] = "compose"
                    item["stem"] = en
            if cur_sec:
                item["secTitle"] = cur_sec["title"]
            stat[item["type"]] += 1
            items.append(item)

        extra = set(sheet) - {i.split("-", 1)[1] for i in order}
        for e in sorted(extra):
            report.append(f"{unit}-{e}: in Q-sheet but not in Review")
        (OUT / f"{unit}.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({"unit": unit, "title": sheet_title(SRC / "Q-sheets" / f"{unit}.pdf", unit), "count": len(items), **stat})
        print(unit, len(items), stat)

    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "tools" / "convert_report.txt").write_text("\n".join(report), encoding="utf-8")
    print("report lines:", len(report))


if __name__ == "__main__":
    main()
