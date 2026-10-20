"""Measurement helpers for the ScrollFlix sound set (numpy + ffmpeg only).

Everything is measured on 48 kHz mono float audio:

  loudness_lufs   ITU-R BS.1770-4 K-weighted, gated (-70 abs / -10 rel), on a
                  clip zero-padded to at least 400 ms. Padding is deliberate:
                  it makes a 50 ms tick read as quieter than a 1 s tone of the
                  same RMS, which is how a short sound is heard.
  true_peak_db    4x oversampled peak (FFT zero-padding), dBTP.
  centroid_hz     power-weighted mean frequency of the whole clip.
  rolloff_hz      frequency below which 95% of the power sits.
  attack_ms       10% -> 90% rise of the 1 ms peak envelope.
  f0_hz           strongest pitch (harmonic product spectrum); only trusted
                  when `tonal` is true.

Nothing here claims how a sound *sounds*. These are numbers.
"""

from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 48000

# BS.1770-4 K-weighting at 48 kHz: a high-shelf then an RLB high-pass.
_SHELF_B = (1.53512485958697, -2.69169618940638, 1.19839281085285)
_SHELF_A = (1.0, -1.69065929318241, 0.73248077421585)
_RLB_B = (1.0, -2.0, 1.0)
_RLB_A = (1.0, -1.99004745483398, 0.99007225036621)


def ffmpeg_bin() -> str:
    return "ffmpeg"


def channel_count(path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=channels", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True,
    ).stdout
    return int(out.decode().strip().splitlines()[0])


def decode(path: Path, sr: int = SR) -> np.ndarray:
    """Any audio file -> stereo float64 (n, 2) at `sr`.

    A mono file is duplicated to both channels at full level, which is exactly
    what Web Audio does when a mono buffer plays to stereo speakers (ffmpeg's
    own upmix would drop it by 3 dB).
    """
    n = channel_count(path)
    out = subprocess.run(
        [ffmpeg_bin(), "-v", "error", "-i", str(path),
         "-ac", "1" if n == 1 else "2", "-ar", str(sr), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    x = np.frombuffer(out, dtype=np.float32).astype(np.float64)
    return np.stack([x, x], axis=1) if n == 1 else x.reshape(-1, 2)


def mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=1) if x.ndim == 2 else x


def _biquad(x: np.ndarray, b, a) -> np.ndarray:
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2 = b
    _, a1, a2 = a
    for i in range(len(x)):
        xi = x[i]
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[i] = yi
        x2, x1 = x1, xi
        y2, y1 = y1, yi
    return y


def k_weight(x: np.ndarray) -> np.ndarray:
    return _biquad(_biquad(x, _SHELF_B, _SHELF_A), _RLB_B, _RLB_A)


def loudness_lufs(x: np.ndarray) -> float:
    """Gated integrated loudness of a (possibly very short) mono clip."""
    block = int(0.4 * SR)
    hop = int(0.1 * SR)
    chans = [x[:, 0], x[:, 1]] if x.ndim == 2 else [x, x]  # mono = dual mono
    if len(chans[0]) < block:
        pad = np.zeros(block - len(chans[0]))
        chans = [np.concatenate([c, pad]) for c in chans]
    z = sum(k_weight(c) ** 2 for c in chans)
    csum = np.concatenate([[0.0], np.cumsum(z)])
    starts = np.arange(0, len(z) - block + 1, hop)
    ms = (csum[starts + block] - csum[starts]) / block
    with np.errstate(divide="ignore"):
        lk = -0.691 + 10 * np.log10(ms)
    keep = lk > -70
    if not keep.any():
        return -120.0
    rel = -0.691 + 10 * math.log10(ms[keep].mean()) - 10
    keep &= lk > rel
    if not keep.any():
        return -120.0
    return float(-0.691 + 10 * math.log10(ms[keep].mean()))


def true_peak_db(x: np.ndarray, oversample: int = 4) -> float:
    if len(x) == 0:
        return -120.0
    peak = 1e-9
    for c in (x.T if x.ndim == 2 else [x]):
        up = np.fft.irfft(np.fft.rfft(c), n=len(c) * oversample) * oversample
        peak = max(peak, float(np.max(np.abs(up))))
    return 20 * math.log10(peak)


def sample_peak_db(x: np.ndarray) -> float:
    return 20 * math.log10(max(float(np.max(np.abs(x))), 1e-9)) if len(x) else -120.0


def spectrum(x: np.ndarray):
    n = len(x)
    win = np.hanning(n)
    size = 1 << max(10, int(math.ceil(math.log2(max(n, 2)))))
    mag = np.abs(np.fft.rfft(x * win, n=size))
    freqs = np.fft.rfftfreq(size, 1 / SR)
    return freqs, mag


def centroid_and_rolloff(x: np.ndarray) -> tuple[float, float]:
    freqs, mag = spectrum(x)
    power = mag**2
    total = power.sum()
    if total <= 0:
        return 0.0, 0.0
    centroid = float((freqs * power).sum() / total)
    cum = np.cumsum(power) / total
    rolloff = float(freqs[int(np.searchsorted(cum, 0.95))])
    return centroid, rolloff


def attack_ms(x: np.ndarray) -> float:
    if len(x) == 0:
        return 0.0
    win = max(1, int(0.001 * SR))
    env = np.abs(x)
    # 1 ms running max, cheap and good enough for a 10-90% rise.
    pad = np.concatenate([env, np.zeros(win)])
    shape = (len(env), win)
    strides = (pad.strides[0], pad.strides[0])
    env = np.max(np.lib.stride_tricks.as_strided(pad, shape, strides), axis=1)
    peak = env.max()
    if peak <= 0:
        return 0.0
    i10 = int(np.argmax(env >= 0.1 * peak))
    i90 = int(np.argmax(env >= 0.9 * peak))
    return max(0.0, (i90 - i10) / SR * 1000)


def onset_s(x: np.ndarray, floor_db: float = -45.0) -> float:
    peak = np.max(np.abs(x)) if len(x) else 0
    if peak <= 0:
        return 0.0
    idx = int(np.argmax(np.abs(x) >= peak * 10 ** (floor_db / 20)))
    return idx / SR


def flatness(x: np.ndarray) -> float:
    _, mag = spectrum(x)
    p = mag[1:] ** 2 + 1e-18
    return float(np.exp(np.mean(np.log(p))) / np.mean(p))


def f0_hz(x: np.ndarray, lo: float = 90.0, hi: float = 3500.0) -> float:
    """Pitch by harmonic product spectrum over the first 350 ms after onset."""
    start = int(onset_s(x) * SR)
    seg = x[start : start + int(0.35 * SR)]
    if len(seg) < 512:
        return 0.0
    win = np.hanning(len(seg))
    size = 1 << 17
    mag = np.abs(np.fft.rfft(seg * win, n=size))
    freqs = np.fft.rfftfreq(size, 1 / SR)
    hps = mag.copy()
    for h in (2, 3):
        dec = mag[::h]
        hps[: len(dec)] *= dec
        hps[len(dec) :] = 0
    band = (freqs >= lo) & (freqs <= hi)
    if not band.any() or hps[band].max() <= 0:
        return 0.0
    i = int(np.argmax(np.where(band, hps, 0)))
    # Prefer the strongest partial when the HPS winner is a lone sub-harmonic.
    return float(freqs[i])


def hz_to_midi(hz: float) -> float:
    return 69 + 12 * math.log2(hz / 440.0) if hz > 0 else 0.0


def midi_to_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_name(m: float) -> str:
    r = int(round(m))
    return f"{NOTE_NAMES[r % 12]}{r // 12 - 1}"


def strongest_partial_hz(x: np.ndarray, lo: float = 150.0, hi: float = 8000.0) -> float:
    """Frequency of the strongest spectral peak, parabolically interpolated."""
    start = int(onset_s(x) * SR)
    seg = x[start : start + int(0.3 * SR)]
    if len(seg) < 256:
        return 0.0
    size = 1 << 17
    mag = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=size))
    freqs = np.fft.rfftfreq(size, 1 / SR)
    band = np.where((freqs >= lo) & (freqs <= hi), mag, 0)
    i = int(np.argmax(band))
    if 0 < i < len(mag) - 1:
        a, b, c = np.log(mag[i - 1] + 1e-12), np.log(mag[i] + 1e-12), np.log(mag[i + 1] + 1e-12)
        den = a - 2 * b + c
        shift = 0.5 * (a - c) / den if den != 0 else 0.0
        return float((i + shift) * (freqs[1] - freqs[0]))
    return float(freqs[i])


def band_shares(x: np.ndarray) -> tuple[float, float, float]:
    """Share of power below 200 Hz, 200 Hz - 2 kHz, and above 2 kHz."""
    freqs, mag = spectrum(x)
    p = mag**2
    total = p.sum() or 1.0
    return (
        float(p[freqs < 200].sum() / total),
        float(p[(freqs >= 200) & (freqs < 2000)].sum() / total),
        float(p[freqs >= 2000].sum() / total),
    )


def measure(stereo_x: np.ndarray) -> dict:
    x = mono(stereo_x)
    low, mid, high = band_shares(x)
    cen, roll = centroid_and_rolloff(x)
    flat = flatness(x)
    hz = strongest_partial_hz(x)
    return {
        "durationMs": round(len(x) / SR * 1000, 1),
        "lufs": round(loudness_lufs(stereo_x), 2),
        "truePeakDb": round(true_peak_db(stereo_x), 2),
        "samplePeakDb": round(sample_peak_db(stereo_x), 2),
        "centroidHz": round(cen),
        "rolloffHz": round(roll),
        "lowShare": round(low, 3),
        "midShare": round(mid, 3),
        "highShare": round(high, 3),
        "attackMs": round(attack_ms(x), 2),
        "flatness": round(flat, 4),
        "tonal": bool(flat < 0.01 and hz > 0),
        "f0Hz": round(hz, 1),
        "midi": round(hz_to_midi(hz), 2),
        "note": midi_name(hz_to_midi(hz)) if hz > 0 else "",
    }


def write_wav(path: Path, x: np.ndarray, sr: int = SR) -> None:
    pcm = np.clip(x, -1, 1)
    data = (pcm * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1] if x.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data)


def db_to_gain(db: float) -> float:
    return 10 ** (db / 20)
