/**
 * 2.5D post-processing pipeline (issue #114).
 *
 * An `EffectComposer` chain tuned for the portrait arcade look:
 * - `RenderPass` renders the scene into a half-float buffer,
 * - `UnrealBloomPass` blooms bright/emissive pixels (HDR values above the threshold,
 *   its first mip is already at half resolution),
 * - one custom `ShaderPass` adds a cheap tilt-shift look (screen-space vertical blur
 *   that is sharp in a focus band and ramps up towards the far top and the near
 *   bottom bands), plus subtle saturation/contrast grade and a vignette,
 * - `OutputPass` converts back to the renderer's tone mapping/output colour space.
 *
 * The module is failure tolerant: without WebGL2, when a pass cannot be created or
 * when a composer render throws, it permanently falls back to `renderer.render`, so
 * a broken post-processing setup never costs the game its picture. `setEnabled(false)`
 * gives the same plain path (used by the debug/perf switch of the Lead's wiring).
 */
import { Vector2, type Camera, type IUniform, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** The post-processing surface the renderer drives each frame. */
export interface PostProcessing {
  /** Renders one frame: the composer chain, or the plain renderer when disabled/broken. */
  render(): void;
  /** Logical (CSS pixel) size, matching `renderer.setSize(width, height, false)`. */
  setSize(width: number, height: number): void;
  /** Frees the composer, its render targets and every pass. */
  dispose(): void;
  /** Toggles the effect; disabling falls back to a plain `renderer.render`. */
  setEnabled(enabled: boolean): void;
  /** Whether the effect is active (false after a failure or `setEnabled(false)`). */
  readonly enabled: boolean;
  /** Points the chain at another scene/camera (title scene <-> level scene). */
  setScene(scene: Scene, camera: Camera): void;
}

/** Tunables of the look; the defaults are the mobile-friendly values of issue #114. */
export interface PostProcessingOptions {
  readonly enabled?: boolean;
  /** Bloom strength on top of the scene. */
  readonly bloomStrength?: number;
  /** Bloom radius within the blurred mips, 0..1. */
  readonly bloomRadius?: number;
  /** Linear HDR luminance above which pixels bloom. */
  readonly bloomThreshold?: number;
  /** Screen-space y of the sharp focus band centre (0 bottom, 1 top). */
  readonly focusCenter?: number;
  /** Half height of the sharp focus band. */
  readonly focusHalfHeight?: number;
  /** Height of the ramp from sharp to fully blurred. */
  readonly focusFeather?: number;
  /** Maximum blur radius in output pixels at the top/bottom screen edges. */
  readonly blurPixels?: number;
  /** Strength of the corner vignette, 0..1. */
  readonly vignetteStrength?: number;
  /** Saturation multiplier of the colour grade. */
  readonly saturation?: number;
  /** Contrast multiplier of the colour grade. */
  readonly contrast?: number;
}

/**
 * Default look of the 2.5D arcade relaunch (issue #114), tuned on the portrait phone
 * viewport: a wide sharp focus band over the playfield with only a light blur in the
 * far top and extreme foreground bands, plus gentle bloom for emissives. The bloom
 * threshold sits at 1.0 in linear HDR so only emissive/bright VFX (>1) and the white
 * hit flash glow; the NearestFilter pixel-art sprites keep their crisp colours.
 */
export const POST_PROCESSING_DEFAULTS = {
  enabled: true,
  bloomStrength: 0.8,
  bloomRadius: 0.45,
  bloomThreshold: 1,
  focusCenter: 0.46,
  focusHalfHeight: 0.3,
  focusFeather: 0.2,
  blurPixels: 1.6,
  vignetteStrength: 0.26,
  saturation: 1.1,
  contrast: 1.03,
} as const;

/** Resolved settings: every number is clamped to a sane range. */
interface PostProcessingSettings {
  enabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  focusCenter: number;
  focusHalfHeight: number;
  focusFeather: number;
  blurPixels: number;
  vignetteStrength: number;
  saturation: number;
  contrast: number;
}

/** Clamps a value into 0..1, returning the fallback for NaN/Infinity. */
function clamp01(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

/** Clamps a value into `min`..`max`, returning the fallback for NaN/Infinity. */
function clampRange(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** Resolves the options into the concrete, clamped settings of the pipeline. */
function readSettings(options: PostProcessingOptions): PostProcessingSettings {
  return {
    enabled: options.enabled ?? POST_PROCESSING_DEFAULTS.enabled,
    bloomStrength: clampRange(options.bloomStrength, POST_PROCESSING_DEFAULTS.bloomStrength, 0, 4),
    bloomRadius: clamp01(options.bloomRadius, POST_PROCESSING_DEFAULTS.bloomRadius),
    bloomThreshold: clampRange(
      options.bloomThreshold,
      POST_PROCESSING_DEFAULTS.bloomThreshold,
      0,
      4,
    ),
    focusCenter: clamp01(options.focusCenter, POST_PROCESSING_DEFAULTS.focusCenter),
    focusHalfHeight: clamp01(options.focusHalfHeight, POST_PROCESSING_DEFAULTS.focusHalfHeight),
    focusFeather: clampRange(options.focusFeather, POST_PROCESSING_DEFAULTS.focusFeather, 0.001, 1),
    blurPixels: clampRange(options.blurPixels, POST_PROCESSING_DEFAULTS.blurPixels, 0, 8),
    vignetteStrength: clamp01(options.vignetteStrength, POST_PROCESSING_DEFAULTS.vignetteStrength),
    saturation: clampRange(options.saturation, POST_PROCESSING_DEFAULTS.saturation, 0, 2),
    contrast: clampRange(options.contrast, POST_PROCESSING_DEFAULTS.contrast, 0.5, 2),
  };
}

/**
 * Tilt-shift blur weight of a screen row: 0 inside the sharp focus band, rising
 * smoothly to 1 at the top and bottom edges. Pure and unit-tested.
 */
export function tiltShiftBlurAmount(
  uvY: number,
  focusCenter: number,
  focusHalfHeight: number,
  feather: number,
): number {
  if (!Number.isFinite(uvY)) {
    return 0;
  }
  const distance = Math.abs(Math.min(1, Math.max(0, uvY)) - focusCenter);
  const outside = Math.max(0, distance - focusHalfHeight);
  if (!(feather > 0)) {
    return outside > 0 ? 1 : 0;
  }
  const t = Math.min(1, outside / feather);
  return t * t * (3 - 2 * t);
}

/** True when the renderer/pass chain can be used (WebGL2 only, three r186). */
export function canUsePostProcessing(
  capabilities: { readonly isWebGL2?: boolean } | null | undefined,
): boolean {
  return capabilities?.isWebGL2 === true;
}

/** Applies a float uniform when the shader still has it. */
function setNumberUniform(pass: ShaderPass, name: string, value: number): void {
  const uniform: IUniform | undefined = pass.uniforms[name];
  if (uniform !== undefined) {
    uniform.value = value;
  }
}

/** Applies a Vector2 uniform when the shader still has it. */
function setVector2Uniform(pass: ShaderPass, name: string, x: number, y: number): void {
  const uniform: IUniform | undefined = pass.uniforms[name];
  const target: unknown = uniform?.value;
  if (target instanceof Vector2) {
    target.set(x, y);
  }
}

/**
 * Disposes the internal full-screen quad of a `ShaderPass`. The three.js typings
 * still expose it as `fsQuad` while r186 keeps it in `_fsQuad`, so look it up
 * defensively instead of leaking the quad geometry or crashing on dispose.
 */
function disposeShaderPassQuad(pass: ShaderPass): void {
  const quad: unknown = (pass as unknown as Record<string, unknown>)['_fsQuad'];
  if (typeof quad === 'object' && quad !== null && 'dispose' in quad) {
    (quad as { dispose(): void }).dispose();
  }
}

/** Vertex shader shared by the full-screen post-processing quads. */
const FULL_SCREEN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

/**
 * Tilt-shift + grade + vignette in one pass. Nine texture taps are only taken in
 * the blurred bands (the focus band short-circuits to a single tap), which keeps the
 * pass cheap enough for a mid-range phone on top of the bloom chain.
 */
const TILT_SHIFT_GRADE_SHADER = {
  name: 'TiltShiftGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2(1 / 1280, 1 / 720) },
    uFocusCenter: { value: POST_PROCESSING_DEFAULTS.focusCenter },
    uFocusHalfHeight: { value: POST_PROCESSING_DEFAULTS.focusHalfHeight },
    uFocusFeather: { value: POST_PROCESSING_DEFAULTS.focusFeather },
    uBlurRadius: { value: POST_PROCESSING_DEFAULTS.blurPixels },
    uVignette: { value: POST_PROCESSING_DEFAULTS.vignetteStrength },
    uSaturation: { value: POST_PROCESSING_DEFAULTS.saturation },
    uContrast: { value: POST_PROCESSING_DEFAULTS.contrast },
  },
  vertexShader: FULL_SCREEN_VERTEX_SHADER,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uFocusCenter;
uniform float uFocusHalfHeight;
uniform float uFocusFeather;
uniform float uBlurRadius;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;

varying vec2 vUv;

/** 0 inside the focus band, 1 at the near/far screen edges. */
float blurAmount( float row ) {
  float outside = max( 0.0, abs( row - uFocusCenter ) - uFocusHalfHeight );
  return smoothstep( 0.0, max( uFocusFeather, 0.0001 ), outside );
}

void main() {
  vec4 center = texture2D( tDiffuse, vUv );
  vec3 color = center.rgb;
  float amount = blurAmount( vUv.y );
  if ( amount > 0.004 ) {
    vec2 stepUv = uTexel * uBlurRadius * amount;
    vec3 blurred = center.rgb * 0.24;
    blurred += texture2D( tDiffuse, vUv + vec2( stepUv.x, 0.0 ) ).rgb * 0.12;
    blurred += texture2D( tDiffuse, vUv - vec2( stepUv.x, 0.0 ) ).rgb * 0.12;
    blurred += texture2D( tDiffuse, vUv + vec2( 0.0, stepUv.y ) ).rgb * 0.12;
    blurred += texture2D( tDiffuse, vUv - vec2( 0.0, stepUv.y ) ).rgb * 0.12;
    blurred += texture2D( tDiffuse, vUv + stepUv ).rgb * 0.07;
    blurred += texture2D( tDiffuse, vUv - stepUv ).rgb * 0.07;
    blurred += texture2D( tDiffuse, vUv + vec2( stepUv.x, -stepUv.y ) ).rgb * 0.07;
    blurred += texture2D( tDiffuse, vUv + vec2( -stepUv.x, stepUv.y ) ).rgb * 0.07;
    color = blurred;
  }
  // Subtle grade: saturation around the linear luminance and a soft contrast curve.
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( luma ), color, uSaturation );
  color = ( color - 0.18 ) * uContrast + 0.18;
  // Subtle corner vignette.
  float vignette = 1.0 - uVignette * smoothstep( 0.2, 0.78, length( vUv - 0.5 ) );
  gl_FragColor = vec4( color * vignette, center.a );
}
`,
};

/** Plain renderer fallback shared by the "disabled" and "failed" paths. */
function renderPlain(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

/** Creates the no-post-processing fallback; it still honours scene/camera changes. */
function createFallback(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  enabled: boolean,
): PostProcessing {
  let targetScene = scene;
  let targetCamera = camera;
  return {
    get enabled(): boolean {
      return enabled;
    },
    render: (): void => renderPlain(renderer, targetScene, targetCamera),
    setSize: (): void => {
      // Nothing to resize in the plain path.
    },
    dispose: (): void => {
      // Nothing owned by the fallback.
    },
    setEnabled: (next): void => {
      enabled = next;
    },
    setScene: (nextScene, nextCamera): void => {
      targetScene = nextScene;
      targetCamera = nextCamera;
    },
  };
}

/** Creates the real composer pipeline; throws when a pass cannot be constructed. */
function createComposerPipeline(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  settings: PostProcessingSettings,
): PostProcessing {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  // The bloom pass halves its input resolution internally; start it at half of the
  // drawing buffer so the constructor allocates the real mobile-sized mip chain.
  const drawingBuffer = renderer.getDrawingBufferSize(new Vector2());
  const bloomPass = new UnrealBloomPass(
    new Vector2(
      Math.max(1, Math.round(drawingBuffer.x * 0.5)),
      Math.max(1, Math.round(drawingBuffer.y * 0.5)),
    ),
    settings.bloomStrength,
    settings.bloomRadius,
    settings.bloomThreshold,
  );
  const tiltPass = new ShaderPass(TILT_SHIFT_GRADE_SHADER);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(tiltPass);
  composer.addPass(outputPass);

  let enabled = settings.enabled;
  let failed = false;

  /** Pushes the resolved settings into the pass uniforms (cheap, called on changes). */
  const applySettings = (): void => {
    bloomPass.strength = settings.bloomStrength;
    bloomPass.radius = settings.bloomRadius;
    bloomPass.threshold = settings.bloomThreshold;
    setNumberUniform(tiltPass, 'uFocusCenter', settings.focusCenter);
    setNumberUniform(tiltPass, 'uFocusHalfHeight', settings.focusHalfHeight);
    setNumberUniform(tiltPass, 'uFocusFeather', settings.focusFeather);
    setNumberUniform(tiltPass, 'uBlurRadius', settings.blurPixels);
    setNumberUniform(tiltPass, 'uVignette', settings.vignetteStrength);
    setNumberUniform(tiltPass, 'uSaturation', settings.saturation);
    setNumberUniform(tiltPass, 'uContrast', settings.contrast);
  };

  /** Resizes the composer and refreshes the pixel-space blur/lookup step. */
  const applySize = (width: number, height: number): void => {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    composer.setSize(safeWidth, safeHeight);
    const pixelRatio = renderer.getPixelRatio();
    setVector2Uniform(
      tiltPass,
      'uTexel',
      1 / Math.max(1, safeWidth * pixelRatio),
      1 / Math.max(1, safeHeight * pixelRatio),
    );
  };

  applySettings();
  const size = renderer.getSize(new Vector2());
  applySize(size.x, size.y);

  return {
    get enabled(): boolean {
      return enabled && !failed;
    },
    render: (): void => {
      if (!enabled || failed) {
        renderPlain(renderer, renderPass.scene, renderPass.camera);
        return;
      }
      try {
        composer.render();
      } catch (error) {
        failed = true;
        console.warn('postprocessing: disabled after a render error, using plain render', error);
        renderPlain(renderer, renderPass.scene, renderPass.camera);
      }
    },
    setSize: applySize,
    setEnabled: (next): void => {
      enabled = next;
    },
    dispose: (): void => {
      composer.dispose();
      bloomPass.dispose();
      tiltPass.material.dispose();
      disposeShaderPassQuad(tiltPass);
      outputPass.dispose();
    },
    setScene: (nextScene, nextCamera): void => {
      renderPass.scene = nextScene;
      renderPass.camera = nextCamera;
    },
  };
}

/**
 * Creates the post-processing chain. Always returns a usable `PostProcessing`:
 * when WebGL2 or the pass construction is unavailable it returns the plain-render
 * fallback instead of throwing.
 */
export function createPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: PostProcessingOptions = {},
): PostProcessing {
  const settings = readSettings(options);
  if (!canUsePostProcessing(renderer.capabilities)) {
    console.warn('postprocessing: WebGL2 unavailable, using plain render');
    return createFallback(renderer, scene, camera, settings.enabled);
  }
  try {
    return createComposerPipeline(renderer, scene, camera, settings);
  } catch (error) {
    console.warn('postprocessing: pass setup failed, using plain render', error);
    return createFallback(renderer, scene, camera, settings.enabled);
  }
}
