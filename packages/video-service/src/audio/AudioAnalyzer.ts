/**
 * Audio Analyzer
 * Orchestrates audio analysis operations including beat detection and waveform generation
 */

import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { analyzeBeats, type Beat, type BPMResult } from './beatTracking.js';
import {
  generateWaveform,
  type WaveformData,
  type WaveformPeak,
  normalizePeaks,
} from './waveform.js';
import { spectrogram } from './fft.js';

/**
 * Complete audio analysis result
 */
export interface AudioAnalysisResult {
  waveform: WaveformData;
  beats: Beat[];
  bpm: BPMResult;
  duration: number;
  sampleRate: number;
  channels: number;
  spectralData?: number[][];
}

/**
 * Analysis options
 */
export interface AnalysisOptions {
  includeSpectral?: boolean;
  targetWaveformPeaks?: number;
  fftSize?: number;
  hopSize?: number;
}

const DEFAULT_OPTIONS: Required<AnalysisOptions> = {
  includeSpectral: false,
  targetWaveformPeaks: 1800,
  fftSize: 2048,
  hopSize: 512,
};

/**
 * Extract audio from video file using ffmpeg
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  sampleRate: number = 44100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vn',                        // No video
      '-acodec', 'pcm_s16le',       // 16-bit PCM
      '-ar', sampleRate.toString(), // Sample rate
      '-ac', '1',                   // Mono
      '-f', 'wav',                  // WAV format
      '-y',                         // Overwrite output
      outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Read WAV file and return samples
 */
export async function readWavFile(filePath: string): Promise<{
  samples: number[];
  sampleRate: number;
  channels: number;
}> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    createReadStream(filePath)
      .on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);

          // Parse WAV header
          const riff = buffer.toString('ascii', 0, 4);
          if (riff !== 'RIFF') {
            throw new Error('Invalid WAV file: missing RIFF header');
          }

          const wave = buffer.toString('ascii', 8, 12);
          if (wave !== 'WAVE') {
            throw new Error('Invalid WAV file: missing WAVE format');
          }

          // Find fmt chunk
          let offset = 12;
          let sampleRate = 44100;
          let channels = 1;
          let bitsPerSample = 16;

          while (offset < buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);

            if (chunkId === 'fmt ') {
              channels = buffer.readUInt16LE(offset + 10);
              sampleRate = buffer.readUInt32LE(offset + 12);
              bitsPerSample = buffer.readUInt16LE(offset + 22);
            } else if (chunkId === 'data') {
              // Read audio data
              const dataStart = offset + 8;
              const dataEnd = dataStart + chunkSize;
              const dataBuffer = buffer.subarray(dataStart, dataEnd);

              // Convert to normalized samples (-1 to 1)
              const samples: number[] = [];
              const bytesPerSample = bitsPerSample / 8;
              const scale = Math.pow(2, bitsPerSample - 1);

              for (let i = 0; i < dataBuffer.length; i += bytesPerSample) {
                let sample: number;
                if (bitsPerSample === 16) {
                  sample = dataBuffer.readInt16LE(i) / scale;
                } else if (bitsPerSample === 8) {
                  sample = (dataBuffer.readUInt8(i) - 128) / 128;
                } else {
                  sample = dataBuffer.readInt32LE(i) / scale;
                }
                samples.push(sample);
              }

              resolve({ samples, sampleRate, channels });
              return;
            }

            offset += 8 + chunkSize;
            // Align to even offset
            if (chunkSize % 2 !== 0) offset++;
          }

          throw new Error('Invalid WAV file: no data chunk found');
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

/**
 * Main audio analyzer class
 */
export class AudioAnalyzer {
  private workDir: string;
  private options: Required<AnalysisOptions>;

  constructor(workDir?: string, options: AnalysisOptions = {}) {
    this.workDir = workDir || `/tmp/audio-analysis-${Date.now()}`;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Analyze audio from a video or audio file
   */
  async analyzeFile(inputPath: string): Promise<AudioAnalysisResult> {
    // Create work directory
    await mkdir(this.workDir, { recursive: true });

    const wavPath = join(this.workDir, 'audio.wav');

    try {
      // Check if input is already WAV
      const inputStat = await stat(inputPath);
      const isWav = inputPath.toLowerCase().endsWith('.wav');

      if (isWav) {
        // Use directly
        const { samples, sampleRate, channels } = await readWavFile(inputPath);
        return this.analyzesamples(samples, sampleRate, channels);
      }

      // Extract audio from video/other format
      await extractAudio(inputPath, wavPath);

      // Read WAV file
      const { samples, sampleRate, channels } = await readWavFile(wavPath);

      return this.analyzesamples(samples, sampleRate, channels);
    } finally {
      // Cleanup
      try {
        await rm(this.workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Analyze raw audio samples
   */
  analyzesamples(
    samples: number[],
    sampleRate: number,
    channels: number = 1
  ): AudioAnalysisResult {
    const duration = samples.length / sampleRate;

    // Generate waveform
    const waveform = generateWaveform(samples, sampleRate, {
      targetPeaks: this.options.targetWaveformPeaks,
    });
    waveform.peaks = normalizePeaks(waveform.peaks);

    // Analyze beats
    const beatAnalysis = analyzeBeats(samples, sampleRate);

    // Optional: Generate spectral data
    let spectralData: number[][] | undefined;
    if (this.options.includeSpectral) {
      spectralData = spectrogram(
        samples,
        this.options.fftSize,
        this.options.hopSize
      );
    }

    return {
      waveform,
      beats: beatAnalysis.beats,
      bpm: beatAnalysis.bpm,
      duration,
      sampleRate,
      channels,
      spectralData,
    };
  }

  /**
   * Analyze audio from URL (download first)
   */
  async analyzeUrl(url: string): Promise<AudioAnalysisResult> {
    await mkdir(this.workDir, { recursive: true });
    const tempPath = join(this.workDir, 'input');

    // Download file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write to temp file
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(tempPath);
      stream.write(buffer);
      stream.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return this.analyzeFile(tempPath);
  }
}

/**
 * Convenience function for one-off analysis
 */
export async function analyzeAudio(
  input: string | number[],
  sampleRate?: number,
  options?: AnalysisOptions
): Promise<AudioAnalysisResult> {
  const analyzer = new AudioAnalyzer(undefined, options);

  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return analyzer.analyzeUrl(input);
    }
    return analyzer.analyzeFile(input);
  }

  return analyzer.analyzesamples(input, sampleRate || 44100);
}

export default AudioAnalyzer;
