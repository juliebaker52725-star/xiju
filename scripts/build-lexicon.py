#!/usr/bin/env python3
"""Build a compact English-Chinese lexicon from ECDICT.

Source: https://github.com/skywind3000/ECDICT (MIT License).
The full CSV is not committed. This script keeps frequent headwords,
short glosses, and an inflection map back to the lemma.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path("/tmp/ecdict/ecdict.csv")
OUT_DIR = Path(__file__).resolve().parents[1] / "data"

PREFIXES = [
    (re.compile(r"^(aux|modal)\.\s*", re.I), "x"),
    (re.compile(r"^art\.\s*", re.I), "t"),
    (re.compile(r"^pron\.\s*", re.I), "r"),
    (re.compile(r"^prep\.\s*", re.I), "p"),
    (re.compile(r"^conj\.\s*", re.I), "c"),
    (re.compile(r"^adv\.\s*", re.I), "d"),
    (re.compile(r"^(adj|a)\.\s*", re.I), "a"),
    (re.compile(r"^(vt|vi|v|vbl)\.\s*", re.I), "v"),
    (re.compile(r"^num\.\s*", re.I), "m"),
    (re.compile(r"^(n|pl)\.\s*", re.I), "n"),
]

JUNK = re.compile(
    r"第一个字母|人名|DOS|批处理|累加器|汇编|异步|\[计\]|\[化\]|\[医\]|\[网络\]|\[经\]|\[法\]"
)
MORPH_ONLY = re.compile(
    r"^(?:be|have|do|write|buy|go|come)?的?(?:过去式|过去分词|现在分词|第三人称|复数|比较级|最高级)"
)
WORD_RE = re.compile(r"^[a-z][a-z'\-]{0,24}$")
FORM_KINDS = {"p", "d", "i", "3", "r", "t", "s"}


def clean_piece(piece: str) -> str:
    piece = re.sub(r"\([^)]*\)", "", piece)
    piece = re.sub(r"\[[^\]]*\]", "", piece)
    piece = piece.strip(" ；;，,、:：")
    if not piece or JUNK.search(piece):
        return ""
    if MORPH_ONLY.search(piece):
        return ""
    letters = len(re.findall(r"[A-Za-z]", piece))
    if letters > len(piece) * 0.4:
        return ""
    if "\\" in piece or re.search(r"\b(n|v|vt|vi|adj|adv|aux)\.", piece):
        return ""
    if len(piece) > 16:
        return ""
    return piece


def senses_from(translation: str) -> list[list[str]]:
    text = translation.replace("\r\n", "\n").replace("\r", "\n").replace("\\n", "\n")
    buckets: dict[str, list[str]] = {}
    order: list[str] = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line or line.startswith("["):
            continue
        if MORPH_ONLY.search(line) or "的过去" in line or "的现在" in line or "的第三人称" in line or "的复数" in line:
            if not re.match(r"^(n|v|vt|vi|a|adj|adv|prep|conj|pron|art|aux)\.", line, re.I):
                continue
        pos = "o"
        for pattern, code in PREFIXES:
            match = pattern.match(line)
            if match:
                pos = code
                line = line[match.end() :]
                break
        pieces: list[str] = []
        for part in re.split(r"[；;，,]", line):
            cleaned = clean_piece(part)
            if cleaned and cleaned not in pieces:
                pieces.append(cleaned)
            if len(pieces) >= 2:
                break
        if not pieces:
            continue
        if pos not in buckets:
            buckets[pos] = []
            order.append(pos)
        for piece in pieces:
            if piece not in buckets[pos] and len(buckets[pos]) < 2:
                buckets[pos].append(piece)
    result: list[list[str]] = []
    for pos in order:
        gloss = "；".join(buckets[pos])
        if gloss:
            result.append([pos, gloss])
        if len(result) >= 4:
            break
    return result


def rank_of(frq: str, bnc: str, collins: str, oxford: str) -> int | None:
    frq_n = int(frq or 0)
    bnc_n = int(bnc or 0)
    collins_n = int(collins or 0)
    oxford_n = int(oxford or 0)
    if 0 < frq_n <= 12000:
        return frq_n
    if oxford_n and bnc_n and bnc_n <= 15000:
        return 20000 + bnc_n
    if collins_n >= 2 and bnc_n and bnc_n <= 12000:
        return 40000 + bnc_n
    return None


def main() -> None:
    csv.field_size_limit(10_000_000)
    lexicon: dict[str, list] = {}
    ranks: dict[str, int] = {}
    exchanges: list[tuple[str, str, int]] = []

    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            word = (row.get("word") or "").strip().lower()
            if not WORD_RE.match(word):
                continue
            rank = rank_of(row.get("frq", ""), row.get("bnc", ""), row.get("collins", ""), row.get("oxford", ""))
            exchange = (row.get("exchange") or "").strip()
            if exchange:
                exchanges.append((word, exchange, rank if rank is not None else 10**9))
            if rank is None:
                continue
            senses = senses_from(row.get("translation") or "")
            if not senses:
                continue
            phonetic = (row.get("phonetic") or "").strip()
            if word in ranks and ranks[word] <= rank:
                continue
            ranks[word] = rank
            lexicon[word] = [phonetic, senses]

    # surface -> lemma -> form codes, plus the best (lowest) rank seen.
    grouped: dict[str, dict[str, set[str]]] = {}
    grouped_rank: dict[str, dict[str, int]] = {}

    def add_form(surface: str, lemma: str, code: str, rank: int) -> None:
        if not code or surface == lemma:
            return
        if not WORD_RE.match(surface) or not WORD_RE.match(lemma):
            return
        if lemma not in lexicon:
            return
        grouped.setdefault(surface, {}).setdefault(lemma, set()).add(code)
        ranks_for_surface = grouped_rank.setdefault(surface, {})
        ranks_for_surface[lemma] = min(ranks_for_surface.get(lemma, 10**9), rank)

    for lemma, exchange, rank in exchanges:
        pointer: str | None = None
        self_code: str | None = None
        outgoing: list[tuple[str, str]] = []
        for part in exchange.split("/"):
            if ":" not in part:
                continue
            kind, value = part.split(":", 1)
            value = value.strip().lower()
            if kind == "0" and value:
                pointer = value
            elif kind == "1" and value:
                self_code = value
            elif kind in FORM_KINDS and value and value != lemma:
                outgoing.append((value, kind))
        if pointer is None:
            for surface, kind in outgoing:
                add_form(surface, lemma, kind, rank)
        elif self_code and pointer != lemma:
            code = "pd" if self_code in {"pd", "dp"} else self_code
            if code in FORM_KINDS or code == "pd":
                add_form(lemma, pointer, code, rank)

    morph: dict[str, list[str]] = {}
    for surface, lemmas in grouped.items():
        best = sorted(lemmas, key=lambda item: grouped_rank[surface][item])[0]
        kinds = lemmas[best]
        if "p" in kinds and "d" in kinds or "pd" in kinds or "dp" in kinds:
            code = "pd"
        else:
            code = sorted(kinds)[0]
        morph[surface] = [best, code]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "lexicon.json").write_text(
        json.dumps(lexicon, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (OUT_DIR / "morph.json").write_text(
        json.dumps(morph, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"lexicon {len(lexicon)} morph {len(morph)}")
    for sample in ["book", "write", "can", "rain", "fine", "interest", "the", "a", "experiment", "buy"]:
        print(sample, lexicon.get(sample))
    for sample in ["bought", "written", "raining", "failed", "known", "languages", "walked", "wrote", "interested"]:
        print("morph", sample, morph.get(sample))


if __name__ == "__main__":
    main()
