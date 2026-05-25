import type {
  HeightExtractor,
  HeightOptions,
  HeightResult,
} from '../types';

/**
 * Model-free surface relief extractor.
 *
 * For each pixel inside the silhouette mask, it computes the high-pass of the
 * luminance (pixel value minus a local 5x5 blur). The result reads as the
 * surface micro-texture — bright bumps catch light and become "high", dark
 * crevices become "low". Outside the silhouette the height is neutral (0.5).
 *
 * It is fast and offline; for physically meaningful depth, swap in a
 * monocular depth model (e.g. DepthAnything via onnxruntime-web) under the
 * same `HeightExtractor` interface.
 */

const MAX_DIM = 1024;

const VERT_SRC = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uDetail;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  float center = luma(texture2D(uImage, vUv).rgb);

  // 5x5 box blur as the local low-pass.
  float sum = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 off = vec2(float(dx), float(dy)) * uTexel * 2.0;
      sum += luma(texture2D(uImage, vUv + off).rgb);
    }
  }
  float blurred = sum / 25.0;

  // High-pass detail, then map to [0..1] centered at 0.5.
  float detail = (center - blurred) * uDetail;
  float height = clamp(0.5 + detail, 0.0, 1.0);

  float coverage = texture2D(uMask, vUv).a;
  height = mix(0.5, height, coverage);

  gl_FragColor = vec4(height, height, height, coverage);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log ?? 'unknown'}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${log ?? 'unknown'}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

function fitDimensions(w: number, h: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export class WebGLLuminanceHeightExtractor implements HeightExtractor {
  async extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    options?: HeightOptions,
  ): Promise<HeightResult> {
    const detail = options?.detail ?? 2.2;
    const { width, height } = fitDimensions(image.width, image.height);

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) throw new Error('2D canvas context unavailable');
    sourceCtx.drawImage(image, 0, 0, width, height);

    const glCanvas = document.createElement('canvas');
    glCanvas.width = width;
    glCanvas.height = height;
    const gl = glCanvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL context unavailable');

    const program = createProgram(gl);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas,
    );

    const maskTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);

    gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1);
    gl.uniform2f(
      gl.getUniformLocation(program, 'uTexel'),
      1 / width,
      1 / height,
    );
    gl.uniform1f(gl.getUniformLocation(program, 'uDetail'), detail);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.deleteTexture(imageTexture);
    gl.deleteTexture(maskTexture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);

    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = width;
    heightCanvas.height = height;
    const heightCtx = heightCanvas.getContext('2d');
    if (!heightCtx) throw new Error('2D canvas context unavailable');
    heightCtx.putImageData(new ImageData(pixels, width, height), 0, 0);

    return { width, height, heightCanvas };
  }
}
