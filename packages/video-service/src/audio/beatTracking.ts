/**
 * Beat Detection and BPM Estimation
 * Uses onset detection and autocorrelation for tempo analysis
 */

import {
  fft,
  getMagnitudeSpectrum,
  hanningWindow,
  nextPowerOf2,
  type Complex,
} from './fft.js';

/**
 * Detected beat information
 */
export interface Beat {
  time: number;      // Time in seconds
  strength: number;  // Beat strength (0-1)
  confidence: number; // Detection confidence (0-1)
}

/**
 * BPM estimation result
 */
export interface BPMResult {
  bpm: number;
  confidence: number;
  alternatives: Array<{ bpm: number; confidence: number }>;
}

/**
 * Beat detection configuration
 */
export interface BeatDetectorConfig {
  sampleRate: number;
  fftSize: number;
  hopSize: number;
  minBPM: number;
  maxBPM: number;
  onsetThreshold: number;
  smoothingWindow: number;
}

const DEFAULT_CONFIG: BeatDetectorConfig = {
  sampleRate: 44100,
  fftSize: 2048,
  hopSize: 512,
  minBPM: 60,
  maxBPM: 200,
  onsetThreshold: 0.1,
  smoothingWindow: 5,
};

/**
 * Compute spectral flux (onset detection function)
 */
export function computeSpectralFlux(
  samples: number[],
  config: Partial<BeatDetectorConfig> = {}
): number[] {
  const { sampleRate, fftSize, hopSize } = { ...DEFAULT_CONFIG, ...config };

  const flux: number[] = [];
  let prevSpectrum: number[] | null = null;

  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    let frame = samples.slice(start, start + fftSize);

    // Zero-pad if necessary
    while (frame.length < fftSize) {
      frame.push(0);
    }

    // Apply window
    frame = hanningWindow(frame);

    // Compute FFT
    const fftResult = fft(frame);
    const spectrum = getMagnitudeSpectrum(fftResult).slice(0, fftSize / 2);

    if (prevSpectrum) {
      // Compute half-wave rectified spectral flux
      let fluxValue = 0;
      for (let j = 0; j < spectrum.length; j++) {
        const specVal = spectrum[j] ?? 0;
        const prevVal = prevSpectrum[j] ?? 0;
        const diff = specVal - prevVal;
        if (diff > 0) {
          fluxValue += diff;
        }
      }
      flux.push(fluxValue);
    } else {
      flux.push(0);
    }

    prevSpectrum = spectrum;
  }

  return flux;
}

/**
 * Normalize array to 0-1 range
 */
function normalize(arr: number[]): number[] {
  const max = Math.max(...arr);
  if (max === 0) return arr.map(() => 0);
  return arr.map((v) => v / max);
}

/**
 * Apply median filter for smoothing
 */
function medianFilter(arr: number[], windowSize: number): number[] {
  const halfWindow = Math.floor(windowSize / 2);
  const result: number[] = [];

  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(arr.length, i + halfWindow + 1);
    const window = arr.slice(start, end).sort((a, b) => a - b);
    result.push(window[Math.floor(window.length / 2)] ?? 0);
  }

  return result;
}

/**
 * Peak picking from onset function
 */
export function pickPeaks(
  onsetFunction: number[],
  threshold: number = 0.1,
  minDistance: number = 3
): number[] {
  const peaks: number[] = [];
  const normalized = normalize(onsetFunction);

  for (let i = 1; i < normalized.length - 1; i++) {
    const curr = normalized[i] ?? 0;
    const prev = normalized[i - 1] ?? 0;
    const next = normalized[i + 1] ?? 0;
    // Local maximum check
    if (curr > prev && curr >= next) {
      // Above threshold
      if (curr > threshold) {
        // Check minimum distance from last peak
        const lastPeak = peaks[peaks.length - 1];
        if (peaks.length === 0 || (lastPeak !== undefined && i - lastPeak >= minDistance)) {
          peaks.push(i);
        } else if (lastPeak !== undefined && curr > (normalized[lastPeak] ?? 0)) {
          // Replace last peak if this one is stronger
          peaks[peaks.length - 1] = i;
        }
      }
    }
  }

  return peaks;
}

/**
 * Compute autocorrelation for tempo estimation
 */
function autocorrelation(signal: number[]): number[] {
  const n = signal.length;
  const paddedLength = nextPowerOf2(n * 2);

  // Pad signal
  const padded = [...signal, ...new Array(paddedLength - n).fill(0)];

  // FFT of signal
  const fftSignal = fft(padded);

  // Compute power spectrum
  const powerSpectrum = fftSignal.map((c) => ({
    re: c.re * c.re + c.im * c.im,
    im: 0,
  }));

  // Inverse FFT to get autocorrelation
  const result = fft(powerSpectrum as Complex[]);

  // Take real part and normalize
  const autocorr = result.slice(0, n).map((c) => c.re);
  const maxVal = Math.max(...autocorr.map(Math.abs));
  return autocorr.map((v) => v / maxVal);
}

/**
 * Estimate BPM from autocorrelation
 */
export function estimateBPM(
  onsetFunction: number[],
  config: Partial<BeatDetectorConfig> = {}
): BPMResult {
  const { sampleRate, hopSize, minBPM, maxBPM } = { ...DEFAULT_CONFIG, ...config };

  const onsetRate = sampleRate / hopSize;

  // Compute autocorrelation of onset function
  const autocorr = autocorrelation(onsetFunction);

  // Convert BPM range to lag range
  const minLag = Math.floor((60 / maxBPM) * onsetRate);
  const maxLag = Math.ceil((60 / minBPM) * onsetRate);

  // Find peaks in autocorrelation within BPM range
  const candidates: Array<{ lag: number; strength: number }> = [];

  for (let lag = minLag; lag <= Math.min(maxLag, autocorr.length - 1); lag++) {
    const curr = autocorr[lag] ?? 0;
    const prev = autocorr[lag - 1] ?? 0;
    const next = autocorr[lag + 1] ?? 0;
    if (curr > prev && curr >= next && curr > 0.1) {
      candidates.push({ lag, strength: curr });
    }
  }

  // Sort by strength
  candidates.sort((a, b) => b.strength - a.strength);

  if (candidates.length === 0) {
    return { bpm: 120, confidence: 0, alternatives: [] };
  }

  // Convert lag to BPM
  const lagToBPM = (lag: number) => (60 * onsetRate) / lag;

  const bestCandidate = candidates[0]!;
  const bestBPM = lagToBPM(bestCandidate.lag);
  const confidence = bestCandidate.strength;

  // Get alternatives (harmonically related tempos)
  const alternatives = candidates.slice(1, 4).map((c) => ({
    bpm: Math.round(lagToBPM(c.lag)),
    confidence: c.strength,
  }));

  return {
    bpm: Math.round(bestBPM),
    confidence,
    alternatives,
  };
}

/**
 * Detect beats in audio samples
 */
export function detectBeats(
  samples: number[],
  config: Partial<BeatDetectorConfig> = {}
): Beat[] {
  const { sampleRate, hopSize, onsetThreshold, smoothingWindow } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Compute onset function
  let onsetFunction = computeSpectralFlux(samples, config);

  // Smooth onset function
  onsetFunction = medianFilter(onsetFunction, smoothingWindow);

  // Normalize
  const normalized = normalize(onsetFunction);

  // Estimate BPM for adaptive peak picking
  const bpmResult = estimateBPM(onsetFunction, config);
  const onsetRate = sampleRate / hopSize;
  const expectedBeatInterval = (60 / bpmResult.bpm) * onsetRate;

  // Pick peaks with adaptive threshold
  const minDistance = Math.max(3, Math.floor(expectedBeatInterval * 0.5));
  const peakIndices = pickPeaks(normalized, onsetThreshold, minDistance);

  // Convert to beat objects
  const beats: Beat[] = peakIndices.map((idx) => ({
    time: (idx * hopSize) / sampleRate,
    strength: normalized[idx] ?? 0,
    confidence: bpmResult.confidence,
  }));

  return beats;
}

/**
 * Refine beat grid using detected beats and estimated BPM
 */
export function refineBeatGrid(
  beats: Beat[],
  bpm: number,
  duration: number
): Beat[] {
  if (beats.length === 0) {
    // Generate beats from BPM alone
    const interval = 60 / bpm;
    const refinedBeats: Beat[] = [];
    for (let t = 0; t < duration; t += interval) {
      refinedBeats.push({ time: t, strength: 0.5, confidence: 0.3 });
    }
    return refinedBeats;
  }

  // Find best phase offset
  const interval = 60 / bpm;
  let bestOffset = 0;
  let bestScore = -Infinity;

  // Try different phase offsets
  for (let offset = 0; offset < interval; offset += interval / 10) {
    let score = 0;
    for (const beat of beats) {
      const nearestGridBeat = Math.round((beat.time - offset) / interval) * interval + offset;
      const distance = Math.abs(beat.time - nearestGridBeat);
      score += beat.strength * Math.exp(-distance * 10);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  // Generate refined beat grid
  const refinedBeats: Beat[] = [];
  for (let t = bestOffset; t < duration; t += interval) {
    // Find nearest detected beat
    let nearestBeat: Beat | null = null;
    let minDistance = Infinity;

    for (const beat of beats) {
      const distance = Math.abs(beat.time - t);
      if (distance < minDistance && distance < interval * 0.3) {
        minDistance = distance;
        nearestBeat = beat;
      }
    }

    refinedBeats.push({
      time: t,
      strength: nearestBeat ? nearestBeat.strength : 0.3,
      confidence: nearestBeat ? nearestBeat.confidence : 0.2,
    });
  }

  return refinedBeats;
}

/**
 * Full beat analysis pipeline
 */
export function analyzeBeats(
  samples: number[],
  sampleRate: number = 44100
): { beats: Beat[]; bpm: BPMResult; duration: number } {
  const config: Partial<BeatDetectorConfig> = { sampleRate };
  const duration = samples.length / sampleRate;

  // Compute onset function
  const onsetFunction = computeSpectralFlux(samples, config);

  // Estimate BPM
  const bpm = estimateBPM(onsetFunction, config);

  // Detect beats
  const rawBeats = detectBeats(samples, config);

  // Refine beat grid
  const beats = refineBeatGrid(rawBeats, bpm.bpm, duration);

  return { beats, bpm, duration };
}
