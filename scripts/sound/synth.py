"""Offline synthesis for the clips the Kenney packs do not cover (numpy only).

Everything here is our own work, so it carries no licence question. All
functions return stereo float64 arrays of shape (n, 2) at 48 kHz, and every
random choice is seeded, so a rebuild produces the same audio.

  spin ticks      soft detent ticks for the globe turning
  notes           tuned bell/pluck tones in three registers (path stars, hearts)
  sparkles        tuned high shimmer, the "air" layer on important cues
  jingles         reveal-sting candidates per tier, with their note content
  cue candidates  alternative hover/tap ticks to audition

Pitches are by construction (a MIDI number per partial); build_sprite.py then
measures every render and checks the measured pitch against the intended one.
"""

from __future__ import annotations

import math

import numpy as np

import sound_dsp as dsp

SR = dsp.SR
TAU = 2 * math.pi


def mtof(m: float) -> float:
    return dsp.midi_to_hz(m)


def tgrid(seconds: float) -> np.ndarray:
    return np.arange(int(round(seconds * SR))) / SR


def pan_gains(pan: float) -> tuple[float, float]:
    a = (pan + 1) * math.pi / 4
    return math.cos(a), math.sin(a)


def stereo(mono: np.ndarray, pan: float = 0.0) -> np.ndarray:
    l, r = pan_gains(pan)
    return np.stack([mono * l, mono * r], axis=1)


def expdecay(t: np.ndarray, attack: float, decay: float) -> np.ndarray:
    """Linear attack then exponential decay reaching -60 dB at `decay`."""
    env = np.exp(-6.9078 * np.clip(t - attack, 0, None) / max(decay, 1e-3))
    if attack > 0:
        env = np.where(t < attack, t / attack, env)
    return env


def place(buf: np.ndarray, x: np.ndarray, at: float, gain: float = 1.0) -> None:
    a = int(round(at * SR))
    if a >= len(buf):
        return
    n = min(len(x), len(buf) - a)
    buf[a : a + n] += x[:n] * gain


def fade_out(x: np.ndarray, ms: float) -> np.ndarray:
    n = min(len(x), int(ms / 1000 * SR))
    if n > 0:
        x[-n:] *= np.linspace(1, 0, n)[:, None] if x.ndim == 2 else np.linspace(1, 0, n)
    return x


def lowpass_fft(x: np.ndarray, cutoff: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(spec, n=len(x))


def bandpass_fft(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    return np.fft.irfft(spec, n=len(x))


# ------------------------------------------------------------------ voices


def partials_voice(
    freq: float,
    dur: float,
    partials,
    spread: float = 0.0,
    attack: float = 0.001,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Sum of decaying sines. partials: (ratio, amp, decay_s)."""
    rng = rng or np.random.default_rng(1)
    t = tgrid(dur)
    out = np.zeros((len(t), 2))
    for i, (ratio, amp, decay) in enumerate(partials):
        f = freq * ratio
        if f > 20000:
            continue
        ph = rng.uniform(0, TAU)
        tone = np.sin(TAU * f * t + ph) * expdecay(t, attack, decay) * amp
        pan = spread * math.sin(i * 2.399)  # golden-angle walk across the field
        out += stereo(tone, pan)
    return out


def glass_bell(m: float, dur: float = 1.0, ring: float = 1.0, spread: float = 0.5,
               seed: int = 1) -> np.ndarray:
    d = ring
    return partials_voice(
        mtof(m), dur,
        [(1, 1.0, d), (2.0, 0.32, 0.7 * d), (2.76, 0.5, 0.5 * d),
         (5.4, 0.22, 0.28 * d), (8.93, 0.08, 0.16 * d)],
        spread=spread, rng=np.random.default_rng(seed),
    )


def soft_bell(m: float, dur: float = 1.4, ring: float = 1.2, spread: float = 0.4,
              seed: int = 2) -> np.ndarray:
    d = ring
    return partials_voice(
        mtof(m), dur,
        [(0.5, 0.5, 1.2 * d), (1, 1.0, d), (1.19, 0.5, 0.8 * d), (1.5, 0.3, 0.6 * d),
         (2.0, 0.4, 0.5 * d), (2.67, 0.15, 0.3 * d)],
        spread=spread, rng=np.random.default_rng(seed),
    )


def warm_pluck(m: float, dur: float = 0.7, ring: float = 0.55, spread: float = 0.0,
               seed: int = 3) -> np.ndarray:
    return partials_voice(
        mtof(m), dur,
        [(1, 1.0, ring), (2, 0.38, 0.6 * ring), (3, 0.16, 0.4 * ring), (4.01, 0.06, 0.25 * ring)],
        spread=spread, attack=0.002, rng=np.random.default_rng(seed),
    )


def ks_pluck(m: float, dur: float = 0.9, damp: float = 0.996, seed: int = 4) -> np.ndarray:
    """Karplus-Strong string, lightly stereo-chorused."""
    rng = np.random.default_rng(seed)
    out = np.zeros((int(dur * SR), 2))
    for ch, det in enumerate((-3.0, 3.0)):
        f = mtof(m) * 2 ** (det / 1200)
        n = int(round(SR / f))
        line = rng.uniform(-1, 1, n)
        line -= line.mean()
        buf = np.empty(len(out))
        prev = 0.0
        for i in range(len(out)):
            idx = i % n
            cur = line[idx]
            line[idx] = damp * 0.5 * (cur + prev)
            prev = cur
            buf[i] = cur
        out[:, ch] = buf
    return out * 0.7


def marimba(m: float, dur: float = 0.55, seed: int = 5) -> np.ndarray:
    return partials_voice(
        mtof(m), dur,
        [(1, 1.0, 0.42), (3.93, 0.45, 0.11), (9.9, 0.18, 0.05)],
        spread=0.15, attack=0.001, rng=np.random.default_rng(seed),
    )


def steel_drum(m: float, dur: float = 0.8, seed: int = 6) -> np.ndarray:
    f = mtof(m)
    t = tgrid(dur)
    out = np.zeros((len(t), 2))
    # Two slightly detuned fundamentals beat slowly: the "wobble" of a pan.
    for i, (r, a, d, det) in enumerate(
        [(1, 1.0, 0.7, -2.5), (1, 0.8, 0.7, 2.5), (2, 0.5, 0.45, 0), (3.02, 0.22, 0.25, 0), (4.1, 0.09, 0.15, 0)]
    ):
        tone = np.sin(TAU * f * r * 2 ** (det / 1200) * t + i) * expdecay(t, 0.002, d) * a
        out += stereo(tone, 0.35 * math.sin(i * 2.4))
    return out


def breathy_flute(m: float, dur: float = 0.6, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = mtof(m)
    t = tgrid(dur)
    vib = 1 + 0.003 * np.sin(TAU * 5.2 * t)
    ph = np.cumsum(f * vib) / SR * TAU
    tone = (np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)) * (
        np.minimum(t / 0.06, 1) * np.exp(-3.2 * t / dur)
    )
    breath = bandpass_fft(rng.uniform(-1, 1, len(t)), f * 0.8, f * 3) * expdecay(t, 0.03, 0.22) * 0.5
    return stereo(tone, -0.1) + stereo(breath, 0.2)


def brass(m: float, dur: float = 1.8, attack: float = 0.06, seed: int = 8) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = mtof(m)
    t = tgrid(dur)
    out = np.zeros((len(t), 2))
    for h in range(1, 13):
        env = np.minimum(t / (attack + 0.012 * h), 1) * np.exp(-0.9 * t / dur)
        for det, pan in ((-4, -0.4), (4, 0.4)):
            tone = np.sin(TAU * f * h * 2 ** (det / 1200) * t + rng.uniform(0, TAU))
            out += stereo(tone * env / h**1.1, pan) * 0.5
    return out


def choir(m: float, dur: float = 2.2, attack: float = 0.55, seed: int = 9) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = mtof(m)
    t = tgrid(dur)
    vib = 1 + 0.004 * np.sin(TAU * 5.6 * t + rng.uniform(0, 6))
    out = np.zeros((len(t), 2))
    for h in range(1, 17):
        fh = f * h
        w = math.exp(-(((fh - 800) / 260) ** 2)) + 0.6 * math.exp(-(((fh - 1250) / 320) ** 2)) + 0.05
        for det, pan in ((-6, -0.5), (0, 0.0), (6, 0.5)):
            ph = np.cumsum(fh * vib * 2 ** (det / 1200)) / SR * TAU + rng.uniform(0, TAU)
            tone = np.sin(ph) * np.minimum(t / attack, 1) * np.exp(-0.7 * np.clip(t - attack, 0, None) / dur)
            out += stereo(tone * w, pan) * 0.18
    return out


def sub_boom(hz_from: float = 90, hz_to: float = 46, dur: float = 1.0) -> np.ndarray:
    t = tgrid(dur)
    f = hz_to + (hz_from - hz_to) * np.exp(-t / 0.08)
    ph = np.cumsum(f) / SR * TAU
    return stereo(np.sin(ph) * expdecay(t, 0.004, dur * 0.9))


def click(rng: np.random.Generator, ms: float = 2.5, lo: float = 3000, hi: float = 9000) -> np.ndarray:
    n = int(ms / 1000 * SR)
    x = bandpass_fft(rng.uniform(-1, 1, max(n, 64)), lo, hi)[:n]
    return stereo(x * np.linspace(1, 0, n) ** 2)


# ------------------------------------------------------------------ builders


def render(events, seconds: float) -> np.ndarray:
    """events: (time_s, stereo_array, gain)."""
    buf = np.zeros((int(seconds * SR), 2))
    for at, x, gain in events:
        place(buf, x, at, gain)
    return buf


def trim_tail(x: np.ndarray, floor_db: float = -48.0, fade_ms: float = 40) -> np.ndarray:
    peak = np.max(np.abs(x))
    if peak <= 0:
        return x
    win = int(0.01 * SR)
    mono = np.max(np.abs(x), axis=1)
    mx = np.array([mono[i : i + win].max() for i in range(0, len(mono), win)])
    live = np.where(mx > peak * 10 ** (floor_db / 20))[0]
    end = min(len(x), (live[-1] + 1) * win + int(0.02 * SR)) if len(live) else len(x)
    return fade_out(x[:end].copy(), fade_ms)


# --- production extras ------------------------------------------------------


def spin_ticks() -> dict[str, np.ndarray]:
    """Soft detent ticks: a damped noise tick over a short low 'tok'."""
    out = {}
    for i, (tok_hz, noise_band, ms) in enumerate(
        [(640, (1500, 5200), 34), (780, (1800, 6000), 30), (900, (1400, 4600), 38), (560, (1700, 5600), 32)]
    ):
        rng = np.random.default_rng(100 + i)
        n = int(ms / 1000 * SR)
        t = np.arange(n) / SR
        tok = np.sin(TAU * tok_hz * t) * np.exp(-t / 0.007)
        nz = bandpass_fft(rng.uniform(-1, 1, n), *noise_band) * np.exp(-t / 0.004)
        x = (0.8 * tok + 0.55 * nz) * np.minimum(t / 0.0006, 1)
        out[f"spin{i + 1}"] = fade_out(stereo(x), 6)
    return out


# (register midi, timbre) -> note clips. Registers chosen so a scale walk
# between A3 and A6 is never more than a few semitones away from a source.
NOTE_REGISTERS = (57, 69, 81)  # A3, A4, A5


def tuned_notes() -> dict[str, tuple[np.ndarray, float]]:
    out = {}
    n = 1
    for reg in NOTE_REGISTERS:
        warm = trim_tail(warm_pluck(reg, 0.8, 0.5, seed=reg), -45, 25)
        glass = trim_tail(glass_bell(reg + 12, 0.9, 0.55, spread=0.0, seed=reg + 1), -45, 25)
        out[f"note{n}"] = (_mono_dual(warm), float(reg))
        out[f"note{n + 1}"] = (_mono_dual(glass), float(reg + 12))
        n += 2
    return out


def sparkles() -> dict[str, tuple[np.ndarray, float]]:
    out = {}
    n = 1
    for reg in (81, 93):  # A5, A6
        for ring, seed in ((0.34, 11), (0.26, 12)):
            x = trim_tail(glass_bell(reg, 0.5, ring, spread=0.0, seed=seed + reg), -45, 25)
            out[f"sparkle{n}"] = (_mono_dual(x), float(reg))
            n += 1
    return out


def _mono_dual(x: np.ndarray) -> np.ndarray:
    m = x.mean(axis=1)
    return np.stack([m, m], axis=1)


# --- reveal jingle candidates -------------------------------------------------

# name -> (tier, description, [(t, midi, label)], builder)


def _seq(spec, voice, gain_decay=0.0):
    ev = []
    for i, (t, m, *rest) in enumerate(spec):
        ev.append((t, voice(m), 1.0 - gain_decay * i))
    return ev


def jingle_candidates() -> dict[str, dict]:
    """Returns {name: {tier, desc, notes: [(t, midi)], audio}}."""
    out: dict[str, dict] = {}

    def add(name, tier, desc, notes, events, seconds):
        audio = trim_tail(render(events, seconds), -50, 60)
        out[name] = {"tier": tier, "desc": desc, "notes": notes, "audio": audio}

    # --- frost: glassy, cold, climbing and twinkling ---
    n = [(0.00, 81), (0.085, 84), (0.17, 88), (0.255, 93)]
    add("frost-a", "frost", "glass bells climbing A5 C6 E6 A6, last note rings",
        n, [(t, glass_bell(m, 1.1, 0.9 if i == 3 else 0.35, seed=20 + i), 1.0 + 0.1 * i)
            for i, (t, m) in enumerate(n)], 1.5)
    n = [(0.00, 88), (0.16, 93)]
    add("frost-b", "frost", "two glass pings, E6 then A6 a fourth up, long shimmer",
        n, [(0.00, glass_bell(88, 1.0, 0.7, seed=30), 1.0), (0.16, glass_bell(93, 1.1, 0.95, seed=31), 1.1),
            (0.17, glass_bell(100, 0.8, 0.5, seed=32), 0.25)], 1.4)
    n = [(0.00, 86), (0.06, 88), (0.12, 91), (0.18, 93), (0.24, 96)]
    add("frost-c", "frost", "fast ripple D6 E6 G6 A6 C7 up a pentatonic run, top note lingers",
        n, [(t, glass_bell(m, 1.0, 0.8 if i == 4 else 0.22, seed=40 + i), 0.9 + 0.08 * i)
            for i, (t, m) in enumerate(n)], 1.4)

    # --- amethyst: dreamy, mysterious, falling ---
    n = [(0.00, 76), (0.14, 74), (0.28, 72), (0.42, 69)]
    ev = [(t, ks_pluck(m, 1.2, 0.9965, seed=50 + i), 1.0) for i, (t, m) in enumerate(n)]
    ev.append((0.42, soft_bell(57, 1.6, 1.2, seed=54), 0.45))
    add("amethyst-a", "amethyst", "plucked strings falling E5 D5 C5 A4 over a soft A3 bell",
        n + [(0.42, 57)], ev, 2.0)
    n = [(0.00, 69), (0.07, 76), (0.14, 72)]
    add("amethyst-b", "amethyst", "one soft bell chord, A4 E5 C5 struck close together, long ring",
        n, [(t, soft_bell(m, 1.8, 1.4, seed=60 + i), 1.0 - 0.1 * i) for i, (t, m) in enumerate(n)], 2.2)
    n = [(0.00, 72), (0.11, 76), (0.22, 81), (0.33, 76), (0.44, 72), (0.55, 69)]
    add("amethyst-c", "amethyst", "wobbly arpeggio up and back C5 E5 A5 E5 C5 A4",
        n, [(t, breathy_flute(m, 0.7, seed=70 + i), 0.9) for i, (t, m) in enumerate(n)], 1.5)

    # --- jade: bright, airy runs ---
    n = [(0.00, 74), (0.07, 76), (0.14, 79), (0.21, 81), (0.28, 86)]
    add("jade-a", "jade", "marimba run D5 E5 G5 A5 D6",
        n, [(t, marimba(m, 0.7, seed=80 + i), 1.0 + 0.06 * i) for i, (t, m) in enumerate(n)], 1.2)
    n = [(0.00, 79), (0.09, 74), (0.18, 81), (0.32, 79), (0.41, 88)]
    add("jade-b", "jade", "steel-drum hop G5 D5 A5 G5 E6, syncopated",
        n, [(t, steel_drum(m, 0.9, seed=90 + i), 1.0) for i, (t, m) in enumerate(n)], 1.5)
    n = [(0.00, 81), (0.12, 86), (0.24, 88)]
    add("jade-c", "jade", "airy flute rise A5 D6 E6 with breath",
        n, [(t, breathy_flute(m, 0.9, seed=95 + i), 1.0) for i, (t, m) in enumerate(n)], 1.4)

    # --- gold: the grandest. C major, shares its notes with the A-minor tiers ---
    chord = [48, 55, 60, 64, 67, 72]  # C3 G3 C4 E4 G4 C5
    n = [(0.00, 55), (0.09, 60), (0.18, 64)] + [(0.30, m) for m in chord]
    ev = [(t, brass(m, 0.5, 0.025, seed=100 + i), 0.8) for i, (t, m) in enumerate(n[:3])]
    ev += [(0.30, brass(m, 2.3, 0.07, seed=110 + i), 0.9) for i, m in enumerate(chord)]
    ev += [(0.40 + 0.09 * i, glass_bell(m, 1.4, 0.9, seed=120 + i), 0.55) for i, m in enumerate([79, 84, 88, 91])]
    ev.append((0.30, sub_boom(70, 40, 1.2), 0.9))
    n += [(0.40 + 0.09 * i, m) for i, m in enumerate([79, 84, 88, 91])]
    add("gold-a", "gold", "brass pickup G3 C4 E4 into a held C-major chord, bell cascade on top, sub boom",
        n, ev, 3.0)

    chord = [48, 55, 64]
    n = [(0.00, 72), (0.05, 76), (0.10, 79)] + [(0.00, m) for m in chord]
    ev = [(0.00, soft_bell(72, 2.6, 2.0, spread=0.7, seed=130), 1.1),
          (0.05, soft_bell(76, 2.4, 1.8, spread=0.7, seed=131), 0.8),
          (0.10, soft_bell(79, 2.4, 1.8, spread=0.7, seed=132), 0.7)]
    ev += [(0.00, choir(m, 2.4, 0.4, seed=140 + i), 0.8) for i, m in enumerate(chord)]
    ev += [(0.35 + 0.1 * i, glass_bell(m, 1.2, 0.8, seed=150 + i), 0.5) for i, m in enumerate([84, 88, 91, 96])]
    ev.append((0.00, sub_boom(80, 44, 1.4), 0.8))
    n += [(0.35 + 0.1 * i, m) for i, m in enumerate([84, 88, 91, 96])]
    add("gold-b", "gold", "big C5 bell with E5 G5, choir pad C3 G3 E4, shimmering cascade, sub boom",
        n, ev, 3.1)

    chord = [48, 55, 60, 64, 67]
    n = [(0.00, m) for m in chord] + [(1.10, 84)]
    ev = [(0.00, choir(m, 2.8, 0.7, seed=160 + i), 0.9) for i, m in enumerate(chord)]
    ev += [(0.00, brass(m, 2.0, 0.5, seed=170 + i), 0.35) for i, m in enumerate(chord[:3])]
    ev.append((0.85, glass_bell(84, 1.6, 1.3, seed=180), 0.9))
    ev.append((0.85, sub_boom(70, 42, 1.4), 0.85))
    n = [(0.00, m) for m in chord] + [(0.85, 84)]
    add("gold-c", "gold", "choir and brass swell on C major rising to a C6 bell strike and sub boom",
        n, ev, 3.4)
    return out


# --- extra hover / tap ticks ------------------------------------------------


def cue_variants() -> list[tuple[str, str, np.ndarray]]:
    """(cue, description, audio). These ship only if they pass the objective gate."""
    out: list[tuple[str, str, np.ndarray]] = []
    rng = np.random.default_rng(300)
    # glass ticks: a short tuned ping that sits on the pentatonic set
    for m in (88, 91, 93):
        t = tgrid(0.09)
        x = (np.sin(TAU * mtof(m) * t) + 0.3 * np.sin(TAU * mtof(m) * 2.76 * t)) * expdecay(t, 0.0008, 0.05)
        out.append(("hover", f"glass tick {dsp.midi_name(m)}", fade_out(stereo(x * 0.5), 8)))
    # felt ticks: rounded and warm, but still with some air in them
    for lo, hi, tok in ((1800, 4800, 1250), (2200, 5600, 1500)):
        n = int(0.05 * SR)
        t = np.arange(n) / SR
        x = bandpass_fft(rng.uniform(-1, 1, n), lo, hi) * np.exp(-t / 0.008)
        x += 0.6 * np.sin(TAU * tok * t) * np.exp(-t / 0.008)
        out.append(("hover", f"felt tick, air {lo}-{hi} Hz over a {tok} Hz tok", fade_out(stereo(x * np.minimum(t / 0.0005, 1)), 8)))
    # taps: a short knock under a bright glass edge
    for body_hz, lo, hi, bd, ed, bg in (
        (780, 2600, 7000, 0.008, 0.007, 0.35),
        (900, 3200, 8000, 0.007, 0.006, 0.30),
        (680, 2200, 6000, 0.009, 0.008, 0.40),
    ):
        n = int(0.11 * SR)
        t = np.arange(n) / SR
        body = np.sin(TAU * body_hz * (1 - 0.2 * t / 0.11) * t) * np.exp(-t / bd)
        edge = bandpass_fft(rng.uniform(-1, 1, n), lo, hi) * np.exp(-t / ed)
        x = bg * body + edge
        out.append(("tap", f"knock {body_hz} Hz under a {lo}-{hi} Hz edge", fade_out(stereo(x * np.minimum(t / 0.0005, 1)), 10)))
    return out
