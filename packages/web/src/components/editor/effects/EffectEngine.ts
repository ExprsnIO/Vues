/**
 * Effect Engine
 * Manages visual effects using WebGL shaders
 * Can be used with PixiJS or standalone canvas rendering
 */

/**
 * Base effect parameter definition
 */
export interface EffectParameter {
  name: string;
  type: 'number' | 'boolean' | 'color' | 'vector2' | 'select';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  label: string;
  description?: string;
}

/**
 * Effect definition
 */
export interface EffectDefinition {
  id: string;
  name: string;
  category: 'distortion' | 'color' | 'blur' | 'stylize' | 'time' | 'generate';
  description: string;
  parameters: EffectParameter[];
  fragmentShader: string;
  vertexShader?: string;
}

/**
 * Active effect instance
 */
export interface EffectInstance {
  id: string;
  effectId: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  order: number;
}

/**
 * Default vertex shader for 2D effects
 */
export const DEFAULT_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

/**
 * Compile WebGL shader
 */
function compileShader(
  gl: WebGLRenderingContext,
  source: string,
  type: number
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${error}`);
  }

  return shader;
}

/**
 * Create WebGL program from shaders
 */
function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking error: ${error}`);
  }

  return program;
}

/**
 * Effect Engine class
 */
export class EffectEngine {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private programs: Map<string, WebGLProgram> = new Map();
  private definitions: Map<string, EffectDefinition> = new Map();
  private framebuffers: WebGLFramebuffer[] = [];
  private textures: WebGLTexture[] = [];
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  constructor() {
    // Register built-in effects
    this.registerBuiltinEffects();
  }

  /**
   * Initialize with canvas
   */
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error('WebGL not supported');
    }

    this.gl = gl;

    // Create position buffer (full-screen quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    // Create texture coordinate buffer
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    // Create ping-pong framebuffers for multi-pass effects
    for (let i = 0; i < 2; i++) {
      const framebuffer = gl.createFramebuffer();
      const texture = gl.createTexture();

      if (!framebuffer || !texture) {
        throw new Error('Failed to create framebuffer');
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.framebuffers.push(framebuffer);
      this.textures.push(texture);
    }

    // Compile programs for all registered effects
    for (const [id, definition] of this.definitions) {
      this.compileEffect(id, definition);
    }
  }

  /**
   * Resize framebuffers
   */
  resize(width: number, height: number): void {
    if (!this.gl) return;
    const gl = this.gl;

    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
    }
  }

  /**
   * Register an effect definition
   */
  registerEffect(definition: EffectDefinition): void {
    this.definitions.set(definition.id, definition);

    if (this.gl) {
      this.compileEffect(definition.id, definition);
    }
  }

  /**
   * Compile an effect's shaders
   */
  private compileEffect(id: string, definition: EffectDefinition): void {
    if (!this.gl) return;
    const gl = this.gl;

    const vertexShader = compileShader(
      gl,
      definition.vertexShader || DEFAULT_VERTEX_SHADER,
      gl.VERTEX_SHADER
    );

    const fragmentShader = compileShader(
      gl,
      definition.fragmentShader,
      gl.FRAGMENT_SHADER
    );

    const program = createProgram(gl, vertexShader, fragmentShader);
    this.programs.set(id, program);
  }

  /**
   * Get all registered effect definitions
   */
  getEffectDefinitions(): EffectDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get effect definition by ID
   */
  getEffectDefinition(id: string): EffectDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Apply effects to a texture
   */
  applyEffects(
    sourceTexture: WebGLTexture,
    effects: EffectInstance[],
    uniforms: { time: number; resolution: [number, number] }
  ): WebGLTexture {
    if (!this.gl) return sourceTexture;
    const gl = this.gl;

    const enabledEffects = effects
      .filter((e) => e.enabled)
      .sort((a, b) => a.order - b.order);

    if (enabledEffects.length === 0) {
      return sourceTexture;
    }

    let inputTexture = sourceTexture;
    let outputIndex = 0;

    for (const effect of enabledEffects) {
      const program = this.programs.get(effect.effectId);
      const definition = this.definitions.get(effect.effectId);

      if (!program || !definition) continue;

      // Bind output framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[outputIndex]);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.textures[outputIndex],
        0
      );

      // Use program
      gl.useProgram(program);

      // Bind input texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);

      // Set common uniforms
      const uTexture = gl.getUniformLocation(program, 'u_texture');
      const uTime = gl.getUniformLocation(program, 'u_time');
      const uResolution = gl.getUniformLocation(program, 'u_resolution');

      gl.uniform1i(uTexture, 0);
      gl.uniform1f(uTime, uniforms.time);
      gl.uniform2fv(uResolution, uniforms.resolution);

      // Set effect-specific uniforms
      for (const param of definition.parameters) {
        const value = effect.parameters[param.name] ?? param.default;
        const location = gl.getUniformLocation(program, `u_${param.name}`);

        if (location) {
          switch (param.type) {
            case 'number':
              gl.uniform1f(location, value as number);
              break;
            case 'boolean':
              gl.uniform1i(location, (value as boolean) ? 1 : 0);
              break;
            case 'vector2':
              gl.uniform2fv(location, value as [number, number]);
              break;
            case 'color':
              const color = this.parseColor(value as string);
              gl.uniform3fv(location, color);
              break;
          }
        }
      }

      // Set up vertex attributes
      const aPosition = gl.getAttribLocation(program, 'a_position');
      const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(aTexCoord);
      gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

      // Draw
      gl.viewport(0, 0, uniforms.resolution[0], uniforms.resolution[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Swap buffers
      inputTexture = this.textures[outputIndex];
      outputIndex = 1 - outputIndex;
    }

    return inputTexture;
  }

  /**
   * Parse color string to RGB array
   */
  private parseColor(color: string): [number, number, number] {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  /**
   * Register built-in effects
   */
  private registerBuiltinEffects(): void {
    // Effects are registered separately in individual filter files
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (!this.gl) return;
    const gl = this.gl;

    for (const program of this.programs.values()) {
      gl.deleteProgram(program);
    }

    for (const framebuffer of this.framebuffers) {
      gl.deleteFramebuffer(framebuffer);
    }

    for (const texture of this.textures) {
      gl.deleteTexture(texture);
    }

    if (this.positionBuffer) {
      gl.deleteBuffer(this.positionBuffer);
    }

    if (this.texCoordBuffer) {
      gl.deleteBuffer(this.texCoordBuffer);
    }

    this.programs.clear();
    this.framebuffers = [];
    this.textures = [];
    this.gl = null;
    this.canvas = null;
  }
}

// Singleton instance
export const effectEngine = new EffectEngine();
