# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "misaki==0.9.4",
# ]
# ///
"""Writes Heartseed's KJV sounds-alike table, `kjv-hearings.json`.

For each archaic KJV word, its hearings are the modern words a recognizer
writes for the same sound, found in Misaki 0.9.4's pronunciation dictionary
(`us_gold.json`). Every us_gold entry of ASCII letters alone is a word (its
key: its lowercase; the first entry of a key gives each sound); its sounds
are its value, or every non-null value of its dict, in us_gold's order. A
sound's normal form drops the stress marks and spaces and writes ð as θ.

A hearing of a word K is, for each of K's own sounds in order: a word W ≠ K
whose sound has the same normal form (kept with W's first such sound), then,
for each cut of the normal form, shortest left part first, two KJV words
A B whose sounds' normal forms are the left and right parts (kept with A's
and B's sounds joined by one space). The first finding of a hearing is kept.
No hearing is one of K's modern forms or a pronoun, nor holds one as a word.

The file holds each word's modern forms (a reader's modernizing, which never
counts), its sounds and its hearings, then the pronouns, then the extras:
hearings the rule misses, each with why. Keys sort in code-unit order, one
archaic word per line, with a trailing newline, so two runs write the same
bytes.

Run from the repo root: uv run --no-project --python 3.12 apps/heartseed/data/hearings.py
"""

import json
import re
import unicodedata
from importlib import resources
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(__file__).resolve().parent
KJV = ROOT / "packages/core/assets/kjv.json"
OUT = DATA / "kjv-hearings.json"
MAX_EXTRAS = 20

ARCHAIC = {
    "art": ["are"],
    "betwixt": ["between"],
    "canst": ["can"],
    "couldest": ["could"],
    "didst": ["did"],
    "dost": ["do", "does"],
    "doth": ["does", "do"],
    "ere": ["before"],
    "hadst": ["had"],
    "hast": ["have", "has"],
    "hath": ["has", "have"],
    "hence": ["from here"],
    "hither": ["here"],
    "lo": ["look"],
    "mayest": ["may"],
    "mightest": ["might"],
    "naught": ["nothing"],
    "nay": ["no"],
    "saith": ["says", "said"],
    "sayest": ["say", "says"],
    "shalt": ["shall"],
    "shouldest": ["should"],
    "spake": ["spoke"],
    "sware": ["swore"],
    "thee": ["you"],
    "thence": ["there", "from there"],
    "thine": ["your", "yours"],
    "thither": ["there"],
    "thou": ["you"],
    "thy": ["your"],
    "thyself": ["yourself"],
    "twain": ["two"],
    "unto": ["to", "into"],
    "verily": ["truly"],
    "wast": ["was", "were"],
    "wert": ["were"],
    "whence": ["where", "from where"],
    "wherefore": ["why", "therefore"],
    "whither": ["where"],
    "wilt": ["will"],
    "wist": ["knew"],
    "wot": ["know"],
    "wouldest": ["would"],
    "ye": ["you"],
    "yea": ["yes"],
}

PRONOUNS = [
    "i", "me", "my", "mine", "myself",
    "we", "us", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "it", "its", "itself",
    "they", "them", "their", "theirs", "themselves",
]

EXTRA = {
    "thy": {"thai": "a recognizer's spelling of the same sound with a t"},
    "yea": {"yeah": "the common vowel of yea"},
}


def code_units(text):
    return text.encode("utf-16-be")


def is_word_char(char):
    return unicodedata.category(char)[0] in ("L", "N")


def kjv_keys():
    verses = json.loads(KJV.read_text(encoding="utf-8"))["verses"]
    keys = set()
    for verse in verses:
        for run in re.split(r"\s+", verse["text"]):
            if any(is_word_char(char) for char in run):
                keys.add("".join(char for char in run.lower() if is_word_char(char)))
    return keys


def normal(sound):
    return re.sub(r"[ˈˌ ]", "", sound).replace("ð", "θ")


def sounds_of(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return [sound for sound in value.values() if isinstance(sound, str)]


def by_sound(gold):
    table = {}
    for entry, value in gold.items():
        if not re.fullmatch(r"[A-Za-z]+", entry):
            continue
        word = entry.lower()
        for sound in sounds_of(value):
            words = table.setdefault(normal(sound), {})
            words.setdefault(word, sound)
    return table


def hearings(word, modern, gold, sounds, kjv):
    never = set(PRONOUNS) | set(modern)
    found = {}
    for own in sounds_of(gold.get(word)):
        whole = normal(own)
        for other, sound in sounds.get(whole, {}).items():
            if other != word and other not in never:
                found.setdefault(other, sound)
        for cut in range(1, len(whole)):
            left = sounds.get(whole[:cut])
            right = sounds.get(whole[cut:])
            if not left or not right:
                continue
            for a, a_sound in left.items():
                for b, b_sound in right.items():
                    if a in kjv and b in kjv and a not in never and b not in never:
                        found.setdefault(f"{a} {b}", f"{a_sound} {b_sound}")
    return {key: found[key] for key in sorted(found, key=code_units)}


def checked(kjv, table):
    extras = sum(len(entry) for entry in EXTRA.values())
    if extras > MAX_EXTRAS:
        raise SystemExit(f"{extras} extras, over {MAX_EXTRAS}")
    for word, entry in table.items():
        if word not in kjv:
            raise SystemExit(f"{word!r} is no KJV word")
        for hearing in EXTRA.get(word, {}):
            if hearing in entry["hearings"]:
                raise SystemExit(f"{word!r}: the extra {hearing!r} is a dictionary hearing")
            if set(hearing.split(" ")) & (set(PRONOUNS) | set(entry["modern"])):
                raise SystemExit(f"{word!r}: the extra {hearing!r} holds a modern form or a pronoun")


def line(key, value):
    return f"{json.dumps(key, ensure_ascii=False)}:{json.dumps(value, ensure_ascii=False, separators=(',', ':'))}"


def main():
    gold_file = resources.files("misaki") / "data" / "us_gold.json"
    gold = json.loads(gold_file.read_text(encoding="utf-8"))
    kjv = kjv_keys()
    sounds = by_sound(gold)
    table = {}
    for word in sorted(ARCHAIC, key=code_units):
        modern = ARCHAIC[word]
        table[word] = {
            "modern": modern,
            "sounds": sounds_of(gold.get(word)),
            "hearings": hearings(word, modern, gold, sounds, kjv),
        }
    checked(kjv, table)
    archaic = ",\n".join(line(word, entry) for word, entry in table.items())
    pronouns = sorted(PRONOUNS, key=code_units)
    extra = {word: EXTRA[word] for word in sorted(EXTRA, key=code_units)}
    OUT.write_text(
        "{\n"
        + '"archaic":{\n'
        + archaic
        + "\n},\n"
        + line("pronouns", pronouns)
        + ",\n"
        + line("extra", extra)
        + "\n}\n",
        encoding="utf-8",
    )
    found = sum(len(entry["hearings"]) for entry in table.values())
    print(f"kjv-hearings.json words={len(table)} hearings={found} extras={sum(map(len, EXTRA.values()))}")


main()
