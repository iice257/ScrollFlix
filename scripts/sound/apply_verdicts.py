"""Turn the audition page's exported verdicts into build inputs.

    python -I scripts/sound/apply_verdicts.py path/to/scrollflix-sound-verdicts.json
    python -I scripts/sound/apply_verdicts.py verdicts.json --write

Without --write it only says what it would do. With --write it updates
trims.json, drops.json and keeps.json next to this file; run build_sprite.py
afterwards to rebuild the sprite, then check the lab again.

What each verdict becomes
    Too quiet / Too loud on a clip   a trim of +/-2 dB on top of any earlier trim
                                     (kept within +/-8 dB, so a clip that keeps being
                                     called too quiet is a clip to replace instead)
    Replace on a shipped clip        goes into drops.json and out of the sprite
    Keep on a held-back clip         goes into keeps.json: shipped despite the gate
    Keep on a lab jingle             goes into keeps.json: added to its tier
    Replace on a held-back clip or   nothing to do, it was never shipped; it is only noted
    a lab jingle
    Anything on a cue (cue:hover)    cannot be a trim: cues are stacks of clips, so these
                                     are listed for a human to change in
                                     app/audio/sound-cues.ts
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
STEP_DB = 2.0
LIMIT_DB = 8.0


def read(path: Path, default):
    return json.loads(path.read_text(encoding="utf8")) if path.exists() else default


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    write = "--write" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    export = json.loads(Path(args[0]).read_text(encoding="utf8"))
    verdicts: dict[str, dict] = export.get("verdicts", {})

    shipped = set(read(ROOT / "public/media/sfx/sprite.json", {}))
    lab = read(ROOT / "app/sound-lab/candidates-analysis.json", {}).get("clips", {})
    held_back = {n for n, c in lab.items() if c.get("kind") == "demoted"}
    jingles = {n for n, c in lab.items() if c.get("kind") == "jingle"}

    trims: dict[str, float] = read(HERE / "trims.json", {})
    drops: set[str] = set(read(HERE / "drops.json", []))
    keeps: set[str] = set(read(HERE / "keeps.json", []))
    notes: list[str] = []
    todo_cues: list[str] = []

    for name, v in sorted(verdicts.items()):
        decision, level = v.get("decision"), v.get("level")
        if name.startswith("cue:"):
            said = ", ".join(x for x in (decision, f"too {level}" if level else None) if x)
            todo_cues.append(f"{name[4:]}: {said}")
            continue
        known = name in shipped or name in held_back or name in jingles
        if not known:
            notes.append(f"{name}: not a clip any more, ignored")
            continue
        if level:
            step = STEP_DB if level == "quiet" else -STEP_DB
            now = max(-LIMIT_DB, min(LIMIT_DB, trims.get(name, 0.0) + step))
            trims[name] = round(now, 2)
            notes.append(f"{name}: too {level}, trim now {now:+.1f} dB")
        if decision == "replace":
            if name in shipped:
                drops.add(name)
                keeps.discard(name)
                notes.append(f"{name}: replace, dropped from the sprite")
            else:
                keeps.discard(name)
                notes.append(f"{name}: replace, was never shipped; noted for the next round of candidates")
        elif decision == "keep":
            if name in held_back or name in jingles:
                keeps.add(name)
                drops.discard(name)
                notes.append(f"{name}: keep, will ship")
            else:
                drops.discard(name)
                notes.append(f"{name}: keep, stays")

    print("\n".join(notes) or "no clip verdicts")
    if todo_cues:
        print("\nCue-level notes, to change by hand in app/audio/sound-cues.ts:")
        print("\n".join(f"  {line}" for line in todo_cues))
    if not write:
        print("\n(dry run; add --write to update trims.json, drops.json, keeps.json)")
        return 0
    (HERE / "trims.json").write_text(json.dumps(dict(sorted(trims.items())), indent=1) + "\n", encoding="utf8", newline="\n")
    (HERE / "drops.json").write_text(json.dumps(sorted(drops), indent=1) + "\n", encoding="utf8", newline="\n")
    (HERE / "keeps.json").write_text(json.dumps(sorted(keeps), indent=1) + "\n", encoding="utf8", newline="\n")
    print("\nwritten. Next: python -I scripts/sound/build_sprite.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
