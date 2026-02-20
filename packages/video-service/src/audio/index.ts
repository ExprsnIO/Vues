/**
 * Audio Analysis Module
 *
 * Provides audio processing capabilities including:
 * - FFT (Fast Fourier Transform) for spectral analysis
 * - Beat detection and BPM estimation
 * - Waveform generation for visualization
 *
 * Usage:
 * ```typescript
 * import { AudioAnalyzer, analyzeAudio } from './audio';
 *
 * // Analyze a video file
 * const result = await analyzeAudio('/path/to/video.mp4');
 * console.log(`BPM: ${result.bpm.bpm}, Confidence: ${result.bpm.confidence}`);
 *
 * // Or use the class directly
 * const analyzer = new AudioAnalyzer();
 * const result = await analyzer.analyzeFile('/path/to/audio.wav');
 * ```
 */

// Main analyzer
export {
  AudioAnalyzer,
  analyzeAudio,
  extractAudio,
  readWavFile,
  type AudioAnalysisResult,
  type AnalysisOptions,
} from './AudioAnalyzer.js';

// Beat detection
export {
  detectBeats,
  analyzeBeats,
  estimateBPM,
  computeSpectralFlux,
  pickPeaks,
  refineBeatGrid,
  type Beat,
  type BPMResult,
  type BeatDetectorConfig,
} from './beatTracking.js';

// Waveform generation
export {
  generateWaveform,
  generateMultiChannelWaveform,
  mixToMono,
  downsamplePeaks,
  getTimeRangePeaks,
  normalizePeaks,
  peaksToArray,
  arrayToPeaks,
  encodePeaks,
  decodePeaks,
  calculateLoudness,
  findSilenceRegions,
  type WaveformData,
  type WaveformPeak,
  type WaveformConfig,
} from './waveform.js';

// FFT utilities
export {
  fft,
  ifft,
  stft,
  spectrogram,
  getMagnitudeSpectrum,
  getPowerSpectrum,
  getPhaseSpectrum,
  hanningWindow,
  hammingWindow,
  blackmanWindow,
  freqToMel,
  melToFreq,
  createMelFilterbank,
  applyMelFilterbank,
  nextPowerOf2,
  type Complex,
} from './fft.js';
