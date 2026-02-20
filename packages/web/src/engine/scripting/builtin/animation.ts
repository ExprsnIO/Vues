/**
 * Animation utilities for expressions
 * Provides wiggle, noise, loop functions for After Effects-style expressions
 */

import { clamp, lerp } from './math';

// Simple seeded random for reproducible noise
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Perlin-style noise implementation
const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;

let perlinInited = false;
let perlin: number[] = [];

function initPerlin(): void {
  if (perlinInited) return;
  perlin = new Array(PERLIN_SIZE + 1);
  for (let i = 0; i < PERLIN_SIZE + 1; i++) {
    perlin[i] = Math.random();
  }
  perlinInited = true;
}

function scaledCosine(i: number): number {
  return 0.5 * (1.0 - Math.cos(i * Math.PI));
}

/**
 * Perlin noise function
 * Returns values in range [0, 1]
 */
export function noise(x: number, y: number = 0, z: number = 0): number {
  initPerlin();

  if (x < 0) x = -x;
  if (y < 0) y = -y;
  if (z < 0) z = -z;

  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;

  let r = 0;
  let ampl = 0.5;

  for (let o = 0; o < 4; o++) {
    let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

    const rxf = scaledCosine(xf);
    const ryf = scaledCosine(yf);

    let n1 = perlin[of & PERLIN_SIZE];
    n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
    let n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);

    of += PERLIN_ZWRAP;
    n2 = perlin[of & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
    let n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);

    n1 += scaledCosine(zf) * (n2 - n1);

    r += n1 * ampl;
    ampl *= 0.5;
    xi <<= 1;
    xf *= 2;
    yi <<= 1;
    yf *= 2;
    zi <<= 1;
    zf *= 2;

    if (xf >= 1.0) {
      xi++;
      xf--;
    }
    if (yf >= 1.0) {
      yi++;
      yf--;
    }
    if (zf >= 1.0) {
      zi++;
      zf--;
    }
  }

  return r;
}

/**
 * Wiggle function - creates random, organic movement
 * @param freq - Frequency of wiggles per second
 * @param amp - Amplitude of wiggle
 * @param octaves - Number of noise octaves (default 1)
 * @param ampMult - Amplitude multiplier per octave (default 0.5)
 * @param time - Current time in seconds
 */
export function wiggle(
  freq: number,
  amp: number,
  octaves: number = 1,
  ampMult: number = 0.5,
  time: number
): number {
  let result = 0;
  let currentAmp = amp;
  let currentFreq = freq;

  for (let i = 0; i < octaves; i++) {
    // Use noise with time-based seed for smooth variation
    const noiseVal = noise(time * currentFreq, i * 1000) * 2 - 1;
    result += noiseVal * currentAmp;
    currentAmp *= ampMult;
    currentFreq *= 2;
  }

  return result;
}

/**
 * 2D wiggle - returns {x, y} object
 */
export function wiggle2D(
  freq: number,
  amp: number,
  octaves: number = 1,
  ampMult: number = 0.5,
  time: number
): { x: number; y: number } {
  return {
    x: wiggle(freq, amp, octaves, ampMult, time),
    y: wiggle(freq, amp, octaves, ampMult, time + 1000),
  };
}

/**
 * Loop In - cycles animation from start
 * @param type - 'cycle' | 'pingpong' | 'offset' | 'continue'
 * @param duration - Duration to loop (in seconds)
 * @param time - Current time
 * @param startTime - Start time of the animation
 */
export function loopIn(
  type: 'cycle' | 'pingpong' | 'offset' | 'continue',
  duration: number,
  time: number,
  startTime: number,
  getValue: (t: number) => number
): number {
  if (time >= startTime) {
    return getValue(time);
  }

  const timeDiff = startTime - time;

  switch (type) {
    case 'cycle': {
      const cycleTime = timeDiff % duration;
      return getValue(startTime + duration - cycleTime);
    }
    case 'pingpong': {
      const cycles = Math.floor(timeDiff / duration);
      const cycleTime = timeDiff % duration;
      if (cycles % 2 === 0) {
        return getValue(startTime + duration - cycleTime);
      } else {
        return getValue(startTime + cycleTime);
      }
    }
    case 'offset': {
      const cycles = Math.ceil(timeDiff / duration);
      const startValue = getValue(startTime);
      const endValue = getValue(startTime + duration);
      const offset = (endValue - startValue) * cycles;
      const cycleTime = timeDiff % duration;
      return getValue(startTime + duration - cycleTime) - offset;
    }
    case 'continue': {
      // Extrapolate from the derivative at the start
      const epsilon = 0.001;
      const derivative = (getValue(startTime + epsilon) - getValue(startTime)) / epsilon;
      return getValue(startTime) - derivative * timeDiff;
    }
  }
}

/**
 * Loop Out - cycles animation after end
 * @param type - 'cycle' | 'pingpong' | 'offset' | 'continue'
 * @param duration - Duration to loop (in seconds)
 * @param time - Current time
 * @param endTime - End time of the animation
 */
export function loopOut(
  type: 'cycle' | 'pingpong' | 'offset' | 'continue',
  duration: number,
  time: number,
  endTime: number,
  getValue: (t: number) => number
): number {
  if (time <= endTime) {
    return getValue(time);
  }

  const timeDiff = time - endTime;

  switch (type) {
    case 'cycle': {
      const cycleTime = timeDiff % duration;
      return getValue(endTime - duration + cycleTime);
    }
    case 'pingpong': {
      const cycles = Math.floor(timeDiff / duration);
      const cycleTime = timeDiff % duration;
      if (cycles % 2 === 0) {
        return getValue(endTime - duration + cycleTime);
      } else {
        return getValue(endTime - cycleTime);
      }
    }
    case 'offset': {
      const cycles = Math.ceil(timeDiff / duration);
      const startValue = getValue(endTime - duration);
      const endValue = getValue(endTime);
      const offset = (endValue - startValue) * cycles;
      const cycleTime = timeDiff % duration;
      return getValue(endTime - duration + cycleTime) + offset;
    }
    case 'continue': {
      // Extrapolate from the derivative at the end
      const epsilon = 0.001;
      const derivative = (getValue(endTime) - getValue(endTime - epsilon)) / epsilon;
      return getValue(endTime) + derivative * timeDiff;
    }
  }
}

/**
 * Time remapping with speed control
 */
export function timeRemap(
  time: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number
): number {
  const t = clamp((time - inStart) / (inEnd - inStart), 0, 1);
  return lerp(outStart, outEnd, t);
}

/**
 * Bounce effect - simulates bouncing motion
 */
export function bounce(
  t: number,
  amp: number = 1,
  freq: number = 3,
  decay: number = 5
): number {
  return amp * Math.abs(Math.sin(freq * Math.PI * t)) * Math.exp(-decay * t);
}

/**
 * Elastic effect - spring-like overshoot
 */
export function elastic(
  t: number,
  amp: number = 1,
  freq: number = 3,
  decay: number = 5
): number {
  if (t <= 0) return 0;
  return amp * Math.sin(freq * Math.PI * t) * Math.exp(-decay * t) + (t >= 1 ? 1 : 0);
}

/**
 * Overshoot effect
 */
export function overshoot(
  t: number,
  amount: number = 1.70158
): number {
  return t * t * ((amount + 1) * t - amount);
}

/**
 * Random function with optional seed
 */
export function random(min: number = 0, max: number = 1, seed?: number): number {
  const rand = seed !== undefined ? seededRandom(seed) : Math.random();
  return min + rand * (max - min);
}

/**
 * Gaussian random (normal distribution)
 */
export function gaussRandom(mean: number = 0, stdDev: number = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + n * stdDev;
}

/**
 * Posterize time - quantize time to steps
 */
export function posterizeTime(time: number, fps: number): number {
  return Math.floor(time * fps) / fps;
}

export const animationFunctions = {
  noise,
  wiggle,
  wiggle2D,
  loopIn,
  loopOut,
  timeRemap,
  bounce,
  elastic,
  overshoot,
  random,
  gaussRandom,
  posterizeTime,
};
