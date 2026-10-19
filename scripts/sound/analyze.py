"""Measure every clip in a sprite and flag the ones that miss the plan.

    python -I scripts/sound/analyze.py [sprite.mp3 sprite.json] [--json out.json]

Defaults to the shipped sprite. Prints one row per clip and a list of flags.
Flags, per the roles in app/audio/sound-plan.json:

  QUIET / LOUD   more than toleranceLu away from the role's target LUFS
  CLIP           true peak above the ceiling
  DULL           centroid under the role's minCentroidHz (hover/tap/spin)
  SOFT-ATTACK    10-90% rise slower than the role's maxAttackMs
  LONG           longer than the role's maxMs
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sound_dsp as dsp  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PLAN = json.loads((ROOT / "app/audio/sound-plan.json").read_text())


def group_of(name: str) -> str:
    return name.rstrip("0123456789")


def role_of(name: str) -> str | None:
    return PLAN["groups"].get(group_of(name))


def slice_clip(sprite: np.ndarray, start: float, length: float) -> np.ndarray:  # (n, 2)
    a = int(round(start * dsp.SR))
    return sprite[a : a + int(round(length * dsp.SR))]


BLOCKING = ("CLIP", "LONG", "DULL", "SOFT-ATTACK")


def gate_failures(spec: dict, flags: list[str]) -> list[str]:
    """Flags that keep a clip out of the shipped sprite. DULL and SOFT-ATTACK
    only block for roles marked "gate" (the precision cues: hover, tap, spin)."""
    return [
        f for f in flags
        if f.split()[0] in ("CLIP", "LONG")
        or (spec.get("gate") and f.split()[0] in ("DULL", "SOFT-ATTACK"))
    ]


def flags_for(name: str, m: dict) -> list[str]:
    role = role_of(name)
    return flags_for_role(role, m)


def flags_for_role(role: str | None, m: dict) -> list[str]:
    spec = PLAN["roles"].get(role or "")
    if not spec:
        return []
    out = []
    delta = m["lufs"] - spec["lufs"]
    if delta < -PLAN["toleranceLu"]:
        out.append(f"QUIET {delta:+.1f} LU")
    elif delta > PLAN["toleranceLu"]:
        out.append(f"LOUD {delta:+.1f} LU")
    if m["truePeakDb"] > PLAN["truePeakCeilingDb"]:
        out.append(f"CLIP {m['truePeakDb']:+.1f} dBTP")
    if "minCentroidHz" in spec and m["centroidHz"] < spec["minCentroidHz"]:
        out.append(f"DULL {m['centroidHz']} Hz")
    if "maxAttackMs" in spec and m["attackMs"] > spec["maxAttackMs"]:
        out.append(f"SOFT-ATTACK {m['attackMs']} ms")
    if m["durationMs"] > spec["maxMs"]:
        out.append(f"LONG {m['durationMs']:.0f} ms")
    return out


def analyze(sprite_path: Path, manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    sprite = dsp.decode(sprite_path)
    clips = {}
    for name, entry in manifest.items():
        start, length, source = entry[:3]  # tuned clips carry a fourth field, the pitch
        m = dsp.measure(slice_clip(sprite, start, length))
        m["source"] = source
        m["role"] = role_of(name)
        m["flags"] = flags_for(name, m)
        clips[name] = m
    return clips


def print_table(clips: dict) -> None:
    print(
        f"{'clip':<11}{'role':<9}{'ms':>6}{'LUFS':>7}{'tgt':>5}{'TPdB':>7}"
        f"{'cent':>6}{'roll95':>7}{'atk':>6}  {'note':<5} flags"
    )
    for name, m in clips.items():
        spec = PLAN["roles"].get(m["role"] or "", {})
        tgt = spec.get("lufs", "")
        note = dsp.midi_name(m["intendedMidi"]) if m.get("intendedMidi") else "-"
        print(
            f"{name:<11}{m['role'] or '?':<9}{m['durationMs']:>6.0f}{m['lufs']:>7.1f}"
            f"{tgt:>5}{m['truePeakDb']:>7.1f}{m['centroidHz']:>6}{m['rolloffHz']:>7}"
            f"{m['attackMs']:>6.1f}  {note:<5} {'; '.join(m['flags'])}"
        )


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    out_json = None
    if "--json" in argv:
        out_json = Path(argv[argv.index("--json") + 1])
        args = [a for a in args if a != str(out_json)]
    sprite = Path(args[0]) if len(args) >= 1 else ROOT / "public/media/sfx/sprite.mp3"
    manifest = Path(args[1]) if len(args) >= 2 else ROOT / "public/media/sfx/sprite.json"
    clips = analyze(sprite, manifest)
    print_table(clips)
    flagged = {k: v["flags"] for k, v in clips.items() if v["flags"]}
    print(f"\n{len(clips)} clips, {len(flagged)} flagged")
    if out_json:
        out_json.write_text(json.dumps(clips, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
