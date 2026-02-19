// Editor Types - Based on exprsn-studio keyframe system

// Keyframe System
export type InterpolationType = 'linear' | 'bezier' | 'hold' | 'auto-bezier';

export type EasingType =
  | 'linear'
  // Standard easing
  | 'ease-in' | 'ease-out' | 'ease-in-out'
  // Quadratic
  | 'ease-in-quad' | 'ease-out-quad' | 'ease-in-out-quad'
  // Cubic
  | 'ease-in-cubic' | 'ease-out-cubic' | 'ease-in-out-cubic'
  // Quartic
  | 'ease-in-quart' | 'ease-out-quart' | 'ease-in-out-quart'
  // Quintic
  | 'ease-in-quint' | 'ease-out-quint' | 'ease-in-out-quint'
  // Exponential
  | 'ease-in-expo' | 'ease-out-expo' | 'ease-in-out-expo'
  // Sine
  | 'ease-in-sine' | 'ease-out-sine' | 'ease-in-out-sine'
  // Circular
  | 'ease-in-circ' | 'ease-out-circ' | 'ease-in-out-circ'
  // Back (with overshoot)
  | 'ease-in-back' | 'ease-out-back' | 'ease-in-out-back'
  // Elastic
  | 'ease-in-elastic' | 'ease-out-elastic' | 'ease-in-out-elastic'
  // Bounce
  | 'ease-in-bounce' | 'ease-out-bounce' | 'ease-in-out-bounce'
  // Custom bezier
  | 'bezier';

export interface BezierHandle {
  x: number; // Time offset (0-1)
  y: number; // Value offset (relative)
}

export type KeyframeValue = number | { x: number; y: number } | string;

export interface Keyframe {
  id: string;
  frame: number;
  value: KeyframeValue;
  interpolation: InterpolationType;
  easing?: EasingType;
  handleIn?: BezierHandle;
  handleOut?: BezierHandle;
  expression?: string;
}

export interface AnimatableProperty {
  id: string;
  name: string;
  path: string; // e.g., "transform.position.x"
  type: 'number' | 'vector2' | 'color' | 'string';
  keyframes: Keyframe[];
  expression?: string;
}

// Blend Modes
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

// Transitions
export type TransitionType =
  | 'none'
  | 'cross-dissolve'
  | 'fade-to-black'
  | 'fade-to-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'push-left'
  | 'push-right'
  | 'push-up'
  | 'push-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'iris-in'
  | 'iris-out'
  | 'slide-left'
  | 'slide-right';

export interface Transition {
  id: string;
  type: TransitionType;
  duration: number; // in frames
  easing: EasingType;
  params?: {
    direction?: number;
    softness?: number;
    color?: string;
  };
}

// Text Overlay with Keyframe Support
export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  color: string;
  backgroundColor?: string;
  backgroundPadding?: number;
  borderRadius?: number;
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  stroke?: {
    color: string;
    width: number;
  };
  blendMode: BlendMode;
  opacity: number;
  rotation: number;
  startTime: number;
  endTime: number;
  transitionIn?: Transition;
  transitionOut?: Transition;
  properties: AnimatableProperty[];
}

// Closed Captions
export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  style?: CaptionStyle;
}

export interface CaptionStyle {
  position: 'top' | 'center' | 'bottom';
  align: 'left' | 'center' | 'right';
  fontSize: 'small' | 'medium' | 'large';
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
}

// Platform Sound/Music
export interface Sound {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  coverUrl?: string;
  audioUrl: string;
  useCount?: number;
}

export interface AudioTrack {
  id: string;
  type: 'music' | 'voiceover' | 'effect';
  sound?: Sound;
  file?: File;
  startFrame: number;
  endFrame: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

// Video Clip
export interface VideoClip {
  id: string;
  name: string;
  type: 'original' | 'response';
  file?: File;
  url?: string;
  thumbnailUrl?: string;
  startFrame: number;
  endFrame: number;
  trimStart: number;
  trimEnd: number;
  speed: number;
  reversed: boolean;
  volume: number;
  opacity: number;
  blendMode: BlendMode;
  transitionIn?: Transition;
  transitionOut?: Transition;
  properties: AnimatableProperty[];
}

// Editor Track
export interface EditorTrack {
  id: string;
  name: string;
  type: 'video' | 'text' | 'audio' | 'caption';
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: (VideoClip | TextOverlay | AudioTrack | Caption)[];
}

// Editor State
export interface EditorState {
  projectName: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  currentFrame: number;
  isPlaying: boolean;
  tracks: EditorTrack[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  zoom: number;
  timelineZoom: number;
}

// Easing Function Type
export type EasingFunction = (t: number) => number;
