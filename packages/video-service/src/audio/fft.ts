/**
 * Fast Fourier Transform (FFT) implementation
 * Used for audio spectral analysis and beat detection
 */

/**
 * Complex number representation for FFT
 */
export interface Complex {
  re: number;
  im: number;
}

/**
 * Create a complex number
 */
export function complex(re: number, im: number = 0): Complex {
  return { re, im };
}

/**
 * Add two complex numbers
 */
export function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Subtract two complex numbers
 */
export function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Multiply two complex numbers
 */
export function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/**
 * Get magnitude of complex number
 */
export function cMag(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

/**
 * Get phase of complex number (in radians)
 */
export function cPhase(c: Complex): number {
  return Math.atan2(c.im, c.re);
}

/**
 * Euler's formula: e^(i*theta) = cos(theta) + i*sin(theta)
 */
export function cExp(theta: number): Complex {
  return { re: Math.cos(theta), im: Math.sin(theta) };
}

/**
 * Check if number is power of 2
 */
function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Get next power of 2
 */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Bit reversal permutation
 */
function bitReverse(arr: Complex[]): Complex[] {
  const n = arr.length;
  const bits = Math.log2(n);
  const result = new Array(n);

  for (let i = 0; i < n; i++) {
    let reversed = 0;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | ((i >> j) & 1);
    }
    result[reversed] = arr[i];
  }

  return result;
}

/**
 * Cooley-Tukey FFT algorithm (in-place, iterative)
 * @param input - Array of real or complex samples (length must be power of 2)
 * @returns Array of complex frequency bins
 */
export function fft(input: number[] | Complex[]): Complex[] {
  let n = input.length;

  // Ensure power of 2
  if (!isPowerOf2(n)) {
    const newN = nextPowerOf2(n);
    input = [...input, ...new Array(newN - n).fill(0)];
    n = newN;
  }

  // Convert to complex if needed
  let data: Complex[];
  if (typeof input[0] === 'number') {
    data = (input as number[]).map((x) => complex(x, 0));
  } else {
    data = [...(input as Complex[])];
  }

  // Bit reversal permutation
  data = bitReverse(data);

  // Cooley-Tukey iterative FFT
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const w = cExp(angle * j);
        const even = data[i + j] ?? complex(0);
        const oddVal = data[i + j + halfSize] ?? complex(0);
        const odd = cMul(w, oddVal);

        data[i + j] = cAdd(even, odd);
        data[i + j + halfSize] = cSub(even, odd);
      }
    }
  }

  return data;
}

/**
 * Inverse FFT
 */
export function ifft(input: Complex[]): Complex[] {
  const n = input.length;

  // Conjugate input
  const conjugated = input.map((c) => ({ re: c.re, im: -c.im }));

  // Apply forward FFT
  const result = fft(conjugated);

  // Conjugate and scale result
  return result.map((c) => ({
    re: c.re / n,
    im: -c.im / n,
  }));
}

/**
 * Get magnitude spectrum from FFT result
 */
export function getMagnitudeSpectrum(fftResult: Complex[]): number[] {
  return fftResult.map(cMag);
}

/**
 * Get power spectrum (magnitude squared)
 */
export function getPowerSpectrum(fftResult: Complex[]): number[] {
  return fftResult.map((c) => c.re * c.re + c.im * c.im);
}

/**
 * Get phase spectrum
 */
export function getPhaseSpectrum(fftResult: Complex[]): number[] {
  return fftResult.map(cPhase);
}

/**
 * Apply Hanning window to reduce spectral leakage
 */
export function hanningWindow(samples: number[]): number[] {
  const n = samples.length;
  return samples.map((s, i) => {
    const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    return s * multiplier;
  });
}

/**
 * Apply Hamming window
 */
export function hammingWindow(samples: number[]): number[] {
  const n = samples.length;
  return samples.map((s, i) => {
    const multiplier = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    return s * multiplier;
  });
}

/**
 * Apply Blackman window
 */
export function blackmanWindow(samples: number[]): number[] {
  const n = samples.length;
  const a0 = 0.42;
  const a1 = 0.5;
  const a2 = 0.08;
  return samples.map((s, i) => {
    const multiplier =
      a0 -
      a1 * Math.cos((2 * Math.PI * i) / (n - 1)) +
      a2 * Math.cos((4 * Math.PI * i) / (n - 1));
    return s * multiplier;
  });
}

/**
 * Short-time Fourier Transform (STFT)
 * @param samples - Audio samples
 * @param fftSize - FFT window size
 * @param hopSize - Hop size between windows
 * @param windowFn - Window function to apply
 */
export function stft(
  samples: number[],
  fftSize: number = 2048,
  hopSize: number = 512,
  windowFn: (s: number[]) => number[] = hanningWindow
): Complex[][] {
  const frames: Complex[][] = [];
  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const frame = samples.slice(start, start + fftSize);

    // Zero-pad if necessary
    while (frame.length < fftSize) {
      frame.push(0);
    }

    // Apply window and FFT
    const windowed = windowFn(frame);
    frames.push(fft(windowed));
  }

  return frames;
}

/**
 * Compute spectrogram (magnitude STFT)
 */
export function spectrogram(
  samples: number[],
  fftSize: number = 2048,
  hopSize: number = 512
): number[][] {
  const stftResult = stft(samples, fftSize, hopSize);
  return stftResult.map((frame) => getMagnitudeSpectrum(frame).slice(0, fftSize / 2));
}

/**
 * Frequency to mel scale conversion
 */
export function freqToMel(freq: number): number {
  return 2595 * Math.log10(1 + freq / 700);
}

/**
 * Mel to frequency conversion
 */
export function melToFreq(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Create mel filterbank
 */
export function createMelFilterbank(
  numFilters: number,
  fftSize: number,
  sampleRate: number,
  lowFreq: number = 0,
  highFreq?: number
): number[][] {
  highFreq = highFreq || sampleRate / 2;

  const lowMel = freqToMel(lowFreq);
  const highMel = freqToMel(highFreq);

  // Create evenly spaced mel points
  const melPoints: number[] = [];
  for (let i = 0; i <= numFilters + 1; i++) {
    melPoints.push(lowMel + (i * (highMel - lowMel)) / (numFilters + 1));
  }

  // Convert back to frequency
  const freqPoints = melPoints.map(melToFreq);

  // Convert to FFT bin indices
  const binPoints = freqPoints.map((f) =>
    Math.floor(((fftSize + 1) * f) / sampleRate)
  );

  // Create filterbank
  const filterbank: number[][] = [];
  const numBins = fftSize / 2 + 1;

  for (let i = 0; i < numFilters; i++) {
    const filter = new Array(numBins).fill(0);
    const binI = binPoints[i] ?? 0;
    const binI1 = binPoints[i + 1] ?? 0;
    const binI2 = binPoints[i + 2] ?? 0;

    const denom1 = binI1 - binI;
    const denom2 = binI2 - binI1;

    for (let j = binI; j < binI1; j++) {
      if (denom1 !== 0) {
        filter[j] = (j - binI) / denom1;
      }
    }

    for (let j = binI1; j < binI2; j++) {
      if (denom2 !== 0) {
        filter[j] = (binI2 - j) / denom2;
      }
    }

    filterbank.push(filter);
  }

  return filterbank;
}

/**
 * Apply mel filterbank to power spectrum
 */
export function applyMelFilterbank(
  powerSpectrum: number[],
  filterbank: number[][]
): number[] {
  return filterbank.map((filter) =>
    filter.reduce((sum, coef, i) => sum + coef * (powerSpectrum[i] || 0), 0)
  );
}
