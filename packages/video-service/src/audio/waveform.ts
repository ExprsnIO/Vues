/**
 * Waveform Generation
 * Creates visual waveform data for audio visualization
 */

/**
 * Waveform peak data
 */
export interface WaveformPeak {
  min: number;
  max: number;
  rms: number;
}

/**
 * Waveform data structure
 */
export interface WaveformData {
  peaks: WaveformPeak[];
  sampleRate: number;
  duration: number;
  samplesPerPeak: number;
  channels: number;
}

/**
 * Configuration for waveform generation
 */
export interface WaveformConfig {
  targetPeaks: number;       // Target number of peaks in output
  bits: number;              // Precision (8, 16, or 32)
  splitChannels: boolean;    // Generate separate waveforms per channel
}

const DEFAULT_CONFIG: WaveformConfig = {
  targetPeaks: 1800,  // ~30 peaks per second for 1 minute
  bits: 16,
  splitChannels: false,
};

/**
 * Calculate RMS (Root Mean Square) of samples
 */
function calculateRMS(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sumOfSquares = samples.reduce((sum, s) => sum + s * s, 0);
  return Math.sqrt(sumOfSquares / samples.length);
}

/**
 * Generate waveform peaks from audio samples
 */
export function generateWaveform(
  samples: number[],
  sampleRate: number,
  config: Partial<WaveformConfig> = {}
): WaveformData {
  const { targetPeaks, bits } = { ...DEFAULT_CONFIG, ...config };

  const duration = samples.length / sampleRate;
  const samplesPerPeak = Math.max(1, Math.floor(samples.length / targetPeaks));
  const numPeaks = Math.ceil(samples.length / samplesPerPeak);

  const peaks: WaveformPeak[] = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, samples.length);
    const chunk = samples.slice(start, end);

    if (chunk.length === 0) continue;

    let min = Infinity;
    let max = -Infinity;

    for (const sample of chunk) {
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    const rms = calculateRMS(chunk);

    // Quantize based on bit depth
    const scale = Math.pow(2, bits - 1) - 1;

    peaks.push({
      min: Math.round(min * scale) / scale,
      max: Math.round(max * scale) / scale,
      rms: Math.round(rms * scale) / scale,
    });
  }

  return {
    peaks,
    sampleRate,
    duration,
    samplesPerPeak,
    channels: 1,
  };
}

/**
 * Generate multi-channel waveform
 */
export function generateMultiChannelWaveform(
  channelData: number[][],
  sampleRate: number,
  config: Partial<WaveformConfig> = {}
): WaveformData[] {
  return channelData.map((samples) => generateWaveform(samples, sampleRate, config));
}

/**
 * Mix stereo to mono
 */
export function mixToMono(leftChannel: number[], rightChannel: number[]): number[] {
  const length = Math.max(leftChannel.length, rightChannel.length);
  const mono = new Array(length);

  for (let i = 0; i < length; i++) {
    const left = leftChannel[i] || 0;
    const right = rightChannel[i] || 0;
    mono[i] = (left + right) / 2;
  }

  return mono;
}

/**
 * Downsample waveform peaks for zoom-out view
 */
export function downsamplePeaks(peaks: WaveformPeak[], targetCount: number): WaveformPeak[] {
  if (peaks.length <= targetCount) return peaks;

  const ratio = peaks.length / targetCount;
  const result: WaveformPeak[] = [];

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), peaks.length);

    let min = Infinity;
    let max = -Infinity;
    let rmsSum = 0;
    let count = 0;

    for (let j = start; j < end; j++) {
      const peak = peaks[j];
      if (!peak) continue;
      if (peak.min < min) min = peak.min;
      if (peak.max > max) max = peak.max;
      rmsSum += peak.rms * peak.rms;
      count++;
    }

    result.push({
      min: count > 0 ? min : 0,
      max: count > 0 ? max : 0,
      rms: count > 0 ? Math.sqrt(rmsSum / count) : 0,
    });
  }

  return result;
}

/**
 * Get peaks for a specific time range (for zoomed view)
 */
export function getTimeRangePeaks(
  waveform: WaveformData,
  startTime: number,
  endTime: number,
  targetPeaks: number
): WaveformPeak[] {
  const startPeak = Math.floor((startTime / waveform.duration) * waveform.peaks.length);
  const endPeak = Math.ceil((endTime / waveform.duration) * waveform.peaks.length);

  const rangePeaks = waveform.peaks.slice(
    Math.max(0, startPeak),
    Math.min(waveform.peaks.length, endPeak)
  );

  if (rangePeaks.length <= targetPeaks) {
    return rangePeaks;
  }

  return downsamplePeaks(rangePeaks, targetPeaks);
}

/**
 * Normalize waveform peaks to -1..1 range
 */
export function normalizePeaks(peaks: WaveformPeak[]): WaveformPeak[] {
  let globalMax = 0;

  for (const peak of peaks) {
    if (Math.abs(peak.min) > globalMax) globalMax = Math.abs(peak.min);
    if (Math.abs(peak.max) > globalMax) globalMax = Math.abs(peak.max);
  }

  if (globalMax === 0) return peaks;

  return peaks.map((peak) => ({
    min: peak.min / globalMax,
    max: peak.max / globalMax,
    rms: peak.rms / globalMax,
  }));
}

/**
 * Convert peaks to simple array format (for JSON serialization)
 */
export function peaksToArray(peaks: WaveformPeak[]): number[] {
  const result: number[] = [];
  for (const peak of peaks) {
    result.push(peak.min, peak.max);
  }
  return result;
}

/**
 * Convert array format back to peaks
 */
export function arrayToPeaks(data: number[]): WaveformPeak[] {
  const peaks: WaveformPeak[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const min = data[i] ?? 0;
    const max = data[i + 1] ?? data[i] ?? 0;
    peaks.push({
      min,
      max,
      rms: Math.sqrt((min * min + max * max) / 2),
    });
  }
  return peaks;
}

/**
 * Encode peaks to base64 for efficient storage
 */
export function encodePeaks(peaks: WaveformPeak[], bits: number = 8): string {
  const scale = Math.pow(2, bits - 1) - 1;
  const bytes = new Uint8Array(peaks.length * 2);

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    if (!peak) continue;
    // Map -1..1 to 0..255 (for 8-bit)
    bytes[i * 2] = Math.round((peak.min + 1) * 0.5 * 255);
    bytes[i * 2 + 1] = Math.round((peak.max + 1) * 0.5 * 255);
  }

  // Convert to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Decode base64 peaks
 */
export function decodePeaks(encoded: string): WaveformPeak[] {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const peaks: WaveformPeak[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    // Map 0..255 back to -1..1
    const min = ((bytes[i] ?? 0) / 255) * 2 - 1;
    const max = ((bytes[i + 1] ?? 0) / 255) * 2 - 1;
    peaks.push({
      min,
      max,
      rms: Math.sqrt((min * min + max * max) / 2),
    });
  }

  return peaks;
}

/**
 * Calculate loudness (LUFS approximation)
 */
export function calculateLoudness(samples: number[], sampleRate: number): number {
  // Simple approximation - actual LUFS requires K-weighting filter
  const rms = calculateRMS(samples);
  return 20 * Math.log10(rms + 1e-10);
}

/**
 * Find silence regions in audio
 */
export function findSilenceRegions(
  peaks: WaveformPeak[],
  threshold: number = 0.01,
  minDurationPeaks: number = 10
): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  let silenceStart: number | null = null;

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    if (!peak) continue;
    const isSilent = Math.abs(peak.max) < threshold && Math.abs(peak.min) < threshold;

    if (isSilent && silenceStart === null) {
      silenceStart = i;
    } else if (!isSilent && silenceStart !== null) {
      if (i - silenceStart >= minDurationPeaks) {
        regions.push({ start: silenceStart, end: i });
      }
      silenceStart = null;
    }
  }

  // Check for trailing silence
  if (silenceStart !== null && peaks.length - silenceStart >= minDurationPeaks) {
    regions.push({ start: silenceStart, end: peaks.length });
  }

  return regions;
}
