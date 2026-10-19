"""Rebuild the shipped sound sprite to the loudness plan.

    python -I scripts/sound/build_sprite.py

Inputs   scripts/sound/source/sprite-v1.{mp3,json}   the original Kenney clips
         scripts/sound/synth.py                      spin ticks, tuned notes, sparkle
         scripts/sound/trims.json                    optional {clip: dB} from auditions
         scripts/sound/drops.json                    optional [clip] the owner said to replace
         scripts/sound/keeps.json                    optional [clip] to ship even if the gate held
                                                     it back, or a lab jingle to add to its tier
         (the three are written by apply_verdicts.py from the lab's exported verdicts)
Outputs  public/media/sfx/sprite.mp3 + sprite.json   what the site loads
         app/audio/sound-analysis.json               measurements of the *built* mp3
         app/sound-lab/assets/candidates.mp3 + .json   lab-only: jingle and tick
         app/sound-lab/candidates-analysis.json        candidates, never shipped

Every clip is gain-matched to its role's LUFS target (app/audio/sound-plan.json),
true-peak limited, and written with a 100 ms lead-in and 150 ms gaps so a
decoder that is a few ms off the MP3 priming never clips a neighbour.
The built MP3 is decoded again and measured, so the numbers in the analysis
file are of what ships, not of what we meant to ship.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze  # noqa: E402
import sound_dsp as dsp  # noqa: E402
import synth  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PLAN = analyze.PLAN
SRC_DIR = ROOT / "scripts/sound/source"
OUT_DIR = ROOT / "public/media/sfx"
LAB_DIR = ROOT / "app/sound-lab"
LEAD = 0.1
GAP = 0.15
CEIL_DB = PLAN["truePeakCeilingDb"] - 0.3  # headroom for the MP3 encoder
TRIMS_PATH = ROOT / "scripts/sound/trims.json"
DROPS_PATH = ROOT / "scripts/sound/drops.json"
KEEPS_PATH = ROOT / "scripts/sound/keeps.json"


# ------------------------------------------------------------------ levelling


def limit(x: np.ndarray, ceiling_db: float) -> np.ndarray:
    """Look-ahead peak limiter: 1.5 ms ahead, 25 ms release, then a true-peak check."""
    ceil = 10 ** (ceiling_db / 20)
    for _ in range(4):
        peak = np.max(np.abs(x), axis=1)
        need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
        look = int(0.0015 * dsp.SR)
        # take the minimum over the look-ahead window, then smooth the release
        padded = np.concatenate([need, np.ones(look)])
        win = np.lib.stride_tricks.sliding_window_view(padded, look + 1)
        env = win.min(axis=1)
        rel = np.exp(-1 / (0.025 * dsp.SR))
        out = np.empty_like(env)
        g = 1.0
        for i, v in enumerate(env):
            g = v if v < g else rel * g + (1 - rel) * v
            out[i] = g
        out = np.minimum(out, env)
        x = x * out[:, None]
        if dsp.true_peak_db(x) <= ceiling_db + 0.05:
            break
        x = x * 10 ** ((ceiling_db - dsp.true_peak_db(x)) / 20)
    return x


def level_to(x: np.ndarray, target_lufs: float) -> tuple[np.ndarray, float, bool]:
    """Returns (levelled clip, applied gain dB, whether the limiter had to act)."""
    gain_db = target_lufs - dsp.loudness_lufs(x)
    y = x * dsp.db_to_gain(gain_db)
    limited = False
    if dsp.true_peak_db(y) > CEIL_DB:
        y = limit(y, CEIL_DB)
        limited = True
    # refine once: the limiter lowers loudness a little
    if limited:
        extra = target_lufs - dsp.loudness_lufs(y)
        if extra > 0.1:
            y2 = limit(y * dsp.db_to_gain(extra), CEIL_DB)
            if abs(target_lufs - dsp.loudness_lufs(y2)) < abs(extra):
                y = y2
    return y, gain_db, limited


def tail_fade(x: np.ndarray) -> np.ndarray:
    ms = 5 if len(x) / dsp.SR < 0.15 else 15
    return synth.fade_out(x.copy(), ms)


# ------------------------------------------------------------------- gathering


def load_v1() -> dict[str, tuple[np.ndarray, str]]:
    sprite = dsp.decode(SRC_DIR / "sprite-v1.mp3")
    manifest = json.loads((SRC_DIR / "sprite-v1.json").read_text())
    return {
        name: (analyze.slice_clip(sprite, start, length), source)
        for name, (start, length, source) in manifest.items()
    }


def encode_mp3(stereo: np.ndarray, path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "in.wav"
        dsp.write_wav(wav, stereo)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "libmp3lame",
             "-q:a", "2", "-ar", str(dsp.SR), "-ac", "2", str(path)],
            check=True,
        )


def sha1(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def assemble(clips: dict[str, tuple[np.ndarray, str, float | None]], path: Path):
    """clips: name -> (audio, source label, pitch midi or None)."""
    total = LEAD + sum(len(a) / dsp.SR + GAP for a, _, _ in clips.values())
    buf = np.zeros((int(np.ceil(total * dsp.SR)), 2))
    manifest = {}
    at = LEAD
    for name, (audio, source, pitch) in clips.items():
        a = int(round(at * dsp.SR))
        buf[a : a + len(audio)] += audio
        entry = [round(a / dsp.SR, 4), round(len(audio) / dsp.SR, 4), source]
        if pitch is not None:
            entry.append(round(pitch, 2))
        manifest[name] = entry
        at += len(audio) / dsp.SR + GAP
    encode_mp3(buf, path)
    return manifest


def verify_pitch(name: str, measured: dict, intended: float) -> str | None:
    midi = dsp.hz_to_midi(measured["f0Hz"])
    err = midi - intended
    return None if abs(err) < 0.2 else f"{name}: measured {midi:.2f} vs intended {intended:.2f}"


def note_check(audio: np.ndarray, notes) -> list[dict]:
    """For each scheduled (t, midi): is that partial really in the render?"""
    x = dsp.mono(audio)
    out = []
    for t, midi in notes:
        a = int(t * dsp.SR)
        seg = x[a : a + int(0.3 * dsp.SR)]
        if len(seg) < 512:
            out.append({"t": t, "note": dsp.midi_name(midi), "found": False, "cents": None})
            continue
        size = 1 << 17
        mag = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=size))
        f = np.fft.rfftfreq(size, 1 / dsp.SR)
        hz = dsp.midi_to_hz(midi)
        near = (f > hz * 2 ** (-40 / 1200)) & (f < hz * 2 ** (40 / 1200))
        wide = (f > hz * 2 ** (-3 / 12)) & (f < hz * 2 ** (3 / 12))
        peak = mag[near].max() if near.any() else 0
        floor = np.median(mag[wide]) + 1e-12
        i = int(np.argmax(np.where(near, mag, 0)))
        cents = 1200 * np.log2(f[i] / hz) if f[i] > 0 else None
        out.append({"t": round(t, 3), "note": dsp.midi_name(midi), "midi": midi,
                    "found": bool(peak / floor > 6), "cents": round(float(cents), 1) if cents is not None else None})
    return out


# ------------------------------------------------------------------------ main


def analysis_for(sprite_path: Path, manifest: dict, extra: dict | None = None) -> dict:
    clips = analyze.analyze(sprite_path, _tmp_manifest(manifest))
    return clips


def _tmp_manifest(manifest: dict) -> Path:
    p = Path(tempfile.gettempdir()) / "scrollflix-manifest.json"
    p.write_text(json.dumps({k: v[:3] for k, v in manifest.items()}))
    return p


def assemble_closed_loop(levelled, path: Path, target_for, applied: dict, passes: int = 3):
    """Encode, decode, measure, and nudge the clips the MP3 pulled off target.

    An MP3 takes a little off bright, noisy clips, so a clip levelled to -24 LUFS
    can decode at -25.3. Each pass corrects by what was lost, so the numbers we
    report are the numbers of the file that ships."""
    work = dict(levelled)
    manifest: dict = {}
    measured: dict = {}
    for attempt in range(passes):
        manifest = assemble(work, path)
        measured = analysis_for(path, manifest)
        moved = False
        for name, m in measured.items():
            err = target_for(name) - m["lufs"]
            if abs(err) > 0.25 and attempt < passes - 1:
                audio, source, pitch = work[name]
                y = audio * dsp.db_to_gain(err)
                if dsp.true_peak_db(y) > CEIL_DB:
                    y = limit(y, CEIL_DB)
                work[name] = (y, source, pitch)
                applied.setdefault(name, {"gainDb": 0.0})
                applied[name]["gainDb"] = round(applied[name]["gainDb"] + err, 2)
                moved = True
        if not moved:
            break
    return manifest, measured


def next_name(pool: dict, group: str) -> str:
    n = 1
    while f"{group}{n}" in pool:
        n += 1
    return f"{group}{n}"


def main() -> int:
    trims = json.loads(TRIMS_PATH.read_text()) if TRIMS_PATH.exists() else {}
    drops = set(json.loads(DROPS_PATH.read_text())) if DROPS_PATH.exists() else set()
    keeps = set(json.loads(KEEPS_PATH.read_text())) if KEEPS_PATH.exists() else set()
    problems: list[str] = []

    # ---- gather everything that wants to ship
    raw = load_v1()
    pool: dict[str, tuple[np.ndarray, str, float | None]] = {
        n: (a, s, None) for n, (a, s) in raw.items()
    }
    for n, a in synth.spin_ticks().items():
        pool[n] = (a, "synth: detent tick", None)
    for n, (a, pitch) in synth.tuned_notes().items():
        pool[n] = (a, "synth: tuned note", pitch)
    for n, (a, pitch) in synth.sparkles().items():
        pool[n] = (a, "synth: tuned sparkle", pitch)
    for cue, desc, a in synth.cue_variants():
        pool[next_name(pool, cue)] = (a, f"synth: {desc}", None)

    # A lab jingle the owner kept joins its tier's clips, under the next free number.
    jingles = synth.jingle_candidates()
    promoted: dict[str, str] = {}
    for name, c in jingles.items():
        if name in keeps:
            promoted[name] = next_name(pool, c["tier"])
            pool[promoted[name]] = (c["audio"], f"synth: {c['desc']}", None)
            if name in trims:  # the trim given in the lab follows the clip
                trims[promoted[name]] = trims[name]
    dropped = sorted(n for n in drops if n in pool)
    for name in drops - set(pool):
        problems.append(f"drops.json names {name}, which is not in the pool")
    for name in keeps - set(pool) - set(jingles):
        problems.append(f"keeps.json names {name}, which does not exist")

    # ---- level every clip to its role, then apply the objective gate
    levelled: dict[str, tuple[np.ndarray, str, float | None]] = {}
    demoted: dict[str, tuple[np.ndarray, str, float | None]] = {}
    applied: dict[str, dict] = {}
    gate_reasons: dict[str, list[str]] = {}
    for name, (audio, source, pitch) in pool.items():
        if name in drops:
            continue
        role = analyze.role_of(name)
        spec = PLAN["roles"].get(role or "")
        if not spec:
            problems.append(f"{name}: no role")
            continue
        y, gain_db, limited = level_to(audio, spec["lufs"] + trims.get(name, 0.0))
        y = tail_fade(y)
        applied[name] = {"gainDb": round(gain_db, 2), "limited": limited, "trimDb": trims.get(name, 0.0)}
        if gain_db > 24:
            problems.append(f"{name}: needs +{gain_db:.0f} dB, probably a weak source")
        failures = analyze.gate_failures(spec, analyze.flags_for_role(role, dsp.measure(y)))
        if failures and name not in keeps:
            demoted[name] = (y, source, pitch)
            gate_reasons[name] = failures
        else:
            levelled[name] = (y, source, pitch)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite_path = OUT_DIR / "sprite.mp3"
    manifest, measured = assemble_closed_loop(
        levelled,
        sprite_path,
        lambda name: PLAN["roles"][analyze.role_of(name)]["lufs"] + trims.get(name, 0.0),
        applied,
    )
    (OUT_DIR / "sprite.json").write_text(json.dumps(manifest, indent=1) + "\n", newline="\n")

    for name, m in measured.items():
        m.update(applied[name])
        if len(manifest[name]) > 3:
            m["intendedMidi"] = manifest[name][3]
            bad = verify_pitch(name, m, manifest[name][3])
            m["pitchOk"] = bad is None
            if bad:
                problems.append(bad)
    analysis = {
        "spriteSha1": sha1(sprite_path),
        "spriteBytes": sprite_path.stat().st_size,
        "plan": {"toleranceLu": PLAN["toleranceLu"], "truePeakCeilingDb": PLAN["truePeakCeilingDb"]},
        "demoted": {k: v for k, v in gate_reasons.items()},
        "dropped": dropped,
        "promoted": promoted,
        "clips": measured,
    }
    (ROOT / "app/audio/sound-analysis.json").write_text(json.dumps(analysis, indent=1) + "\n")

    # ---- lab candidates (never shipped): demoted clips and the reveal jingles
    cands: dict[str, tuple[np.ndarray, str, float | None]] = {}
    meta: dict[str, dict] = {}
    for name, (y, source, pitch) in demoted.items():
        role = analyze.role_of(name)
        cands[name] = (y, source, pitch)
        meta[name] = {"kind": "demoted", "cue": role, "desc": f"held back: {', '.join(gate_reasons[name])}",
                      "gainDb": applied[name]["gainDb"], "limited": applied[name]["limited"]}
    for name, c in jingles.items():
        if name in promoted:
            continue
        role = c["tier"]
        y, gain_db, limited = level_to(c["audio"], PLAN["roles"][role]["lufs"] + trims.get(name, 0.0))
        cands[name] = (tail_fade(y), f"synth: {c['desc']}", None)
        meta[name] = {"kind": "jingle", "tier": c["tier"], "desc": c["desc"],
                      "notes": [{"t": round(t, 3), "note": dsp.midi_name(m), "midi": m} for t, m in c["notes"]],
                      "noteCheck": note_check(c["audio"], c["notes"]),
                      "gainDb": round(gain_db, 2), "limited": limited}
    assets = LAB_DIR / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    cand_path = assets / "candidates.mp3"
    cand_manifest, cmeasured = assemble_closed_loop(
        cands,
        cand_path,
        lambda name: PLAN["roles"][meta[name].get("tier") or meta[name].get("cue")]["lufs"] + trims.get(name, 0.0),
        {},
    )
    for name, m in cmeasured.items():
        m.update(meta[name])
        role = meta[name].get("tier") or meta[name].get("cue")
        m["role"] = role
        m["flags"] = analyze.flags_for_role(role, m)
    (assets / "candidates.json").write_text(json.dumps(cand_manifest, indent=1) + "\n")
    (LAB_DIR / "candidates-analysis.json").write_text(
        json.dumps({"spriteSha1": sha1(cand_path), "clips": cmeasured}, indent=1) + "\n")

    # ---- report
    analyze.print_table(measured)
    flagged = {k: v["flags"] for k, v in measured.items() if v["flags"]}
    print(f"\nshipped: {len(measured)} clips, {len(flagged)} with advisory flags, "
          f"{sprite_path.stat().st_size / 1024:.0f} KB")
    if dropped:
        print(f"dropped on the owner's say-so: {', '.join(dropped)}")
    if promoted:
        print("promoted from the lab: " + ", ".join(f"{a} -> {b}" for a, b in promoted.items()))
    print(f"held back by the gate: {len(demoted)}")
    for k, v in gate_reasons.items():
        print(f"  {k}: {', '.join(v)}")
    print(f"lab candidates: {len(cmeasured)} clips, {cand_path.stat().st_size / 1024:.0f} KB (not shipped)")
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
