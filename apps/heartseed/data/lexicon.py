# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "misaki[en]==0.9.4",
#   "spacy==3.8.18",
#   "espeakng-loader==0.2.4",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Writes Heartseed's KJV pronunciation list, `kjv-phonemes.json`.

Every distinct word key of the KJV's displayed verses (a whitespace run that
holds a letter or a number, with its leading and trailing non-letter,
non-number characters stripped) maps to Misaki 0.9.4's phonemes for that key
alone, or to its entry in `kjv-phonemes.overrides.json`. Keys are sorted in
UTF-16 code-unit order, one entry per line, with a trailing newline, so two
runs write the same bytes.

Run from the repo root: uv run --no-project --python 3.12 apps/heartseed/data/lexicon.py
"""

import json
import re
import unicodedata
from pathlib import Path

from misaki import en, espeak

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(__file__).resolve().parent
KJV = ROOT / "packages/core/assets/kjv.json"
VOCAB = DATA / "kokoro-vocab.json"
OVERRIDES = DATA / "kjv-phonemes.overrides.json"
OUT = DATA / "kjv-phonemes.json"
MAX_OVERRIDES = 200


def is_word_char(char):
    return unicodedata.category(char)[0] in ("L", "N")


def display(text):
    text = re.sub(r"^¶\s*", "", text)
    return re.sub(r"[\[\]‹›]", "", text)


def key_of(run):
    first = 0
    while not is_word_char(run[first]):
        first += 1
    last = len(run) - 1
    while not is_word_char(run[last]):
        last -= 1
    return run[first : last + 1]


def kjv_keys():
    verses = json.loads(KJV.read_text(encoding="utf-8"))["verses"]
    keys = set()
    for verse in verses:
        for run in re.findall(r"\S+", display(verse["text"])):
            if any(is_word_char(char) for char in run):
                keys.add(key_of(run))
    for key in keys:
        if any(ord(char) > 0xFFFF for char in key):
            raise SystemExit(f"a key outside the BMP breaks code-unit order: {key!r}")
    return sorted(keys)


def checked(key, phonemes, vocab, source):
    if not phonemes or re.search(r"\s", phonemes):
        raise SystemExit(f"{source} gives {key!r} an empty or spaced phoneme string")
    outside = sorted({char for char in phonemes if char not in vocab})
    if outside:
        raise SystemExit(f"{source} gives {key!r} symbols outside Kokoro's vocab: {outside}")
    return phonemes


def main():
    vocab = set(json.loads(VOCAB.read_text(encoding="utf-8")))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    keys = kjv_keys()
    stray = sorted(set(overrides) - set(keys))
    if stray:
        raise SystemExit(f"overrides name keys the KJV lacks: {stray}")
    if len(overrides) > MAX_OVERRIDES:
        raise SystemExit(f"{len(overrides)} overrides, over {MAX_OVERRIDES}")
    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
    lines = []
    for key in keys:
        phonemes = g2p(key)[0].strip()
        if key in overrides:
            if overrides[key] == phonemes:
                raise SystemExit(f"the override for {key!r} equals Misaki's output")
            phonemes = checked(key, overrides[key], vocab, "an override")
        else:
            phonemes = checked(key, phonemes, vocab, "Misaki")
        lines.append(f"{json.dumps(key, ensure_ascii=False)}:{json.dumps(phonemes, ensure_ascii=False)}")
    OUT.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"kjv-phonemes.json keys={len(keys)} overrides={len(overrides)}")


main()
