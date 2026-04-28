import * as THREE from "three";

// ===== Vertex Shader: Handles the positions of the vertices ===== 
export const vertexShader = `
// Matrices provided by Three.js
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

precision highp float;

// Vertex position attribute
in vec3 position;

void main() {
  // Calculate final vertex position on screen
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

//  ===== Fragment Shader (sprit + blur + anaglyph) =====
export const MixFragmentShader = `
  precision highp float;

  // Input texture and parameters
  uniform sampler2D imageTexture;   // Full stereo video frame (top=Left, bottom=Right)
  uniform int halfHeight;           // Half the video height in pixels

  // Image processing mode (0: none, 1: box, 2: gaussian, 3: laplacian, 4: separable, 5: median)
  uniform int videoProcessMode;

  // Filter parameters
  // Box blur
  uniform int blurRadius;

  // Gaussian / Separable
  uniform int radius;
  uniform float sigma;

  // Laplacian
  uniform bool displayMode;

  // Separable
  uniform bool horizontal;

  // Color controls (shared by all filters)
  uniform float colorScaleR;
  uniform float colorScaleG;
  uniform float colorScaleB;
  uniform bool invertColors;

  // Anaglyph mode (0: True, 1: Gray, 2: Color, 3: Half-Color, 4: Optimized)
  uniform int anaglyphMode;

  // Output color
  out vec4 out_FragColor;

  // helper functions for image processing filters
  vec3 getPixelValue(sampler2D img, int x, int y) {
    return texelFetch(img, ivec2(x, y), 0).rgb;
  }

  float gaussian(float x, float y, float sigma) {
    return exp(-(x * x + y * y) / (2.0 * sigma * sigma));
  }

  void sort(inout float v[9]) {
    float list[16] = float[16](
      v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], // actual values
      1e10, 1e10, 1e10, 1e10, 1e10, 1e10, 1e10               // dummy values
    );
    for (int k = 2; k <= 16; k <<= 1) {
      for (int j = k >> 1; j > 0; j >>= 1) {
        for (int i = 0; i < 16; i++) {
          int ixj = i ^ j;
          if (ixj > i) {
            bool ascending = (i & k) == 0;
            float a = list[i];
            float b = list[ixj];
            if (ascending) { list[i] = min(a, b); list[ixj] = max(a, b); }
            else            { list[i] = max(a, b); list[ixj] = min(a, b); }
          }
        }
      }
    }
    for (int i = 0; i < 9; i++) v[i] = list[i];
  }

  // image processing functions
  vec3 applyImgProcessing(int px, int py) {
    if (videoProcessMode == 0) {
      // No processing — pass through
      return getPixelValue(imageTexture, px, py);

    } else if (videoProcessMode == 1) {
      // Box blur
      vec4 textureValue = vec4(0.0, 0.0, 0.0, 0.0);
      for (int i = -blurRadius; i <= blurRadius; i++) {
        for (int j = -blurRadius; j <= blurRadius; j++) {
          textureValue += texelFetch(imageTexture, ivec2(px + i, py + j), 0);
        }
      }
      float numSamples = float((blurRadius * 2 + 1) * (blurRadius * 2 + 1));
      return (textureValue / numSamples).rgb;

    } else if (videoProcessMode == 2) {
      // Gaussian blur
      int kernelSize = radius * 2 + 1; // odd kernel size for symmetry
      vec3 sum_rgb = vec3(0.0, 0.0, 0.0);
      float weightSum = 0.0;
      for (int dy = -radius; dy <= radius; dy++) {
        for (int dx = -radius; dx <= radius; dx++) {
          float w = gaussian(float(dx), float(dy), sigma);
          vec3 pixel = getPixelValue(imageTexture, px + dx, py + dy);
          sum_rgb   += w * pixel.rgb;
          weightSum += w;
        }
      }
      return sum_rgb / weightSum;

    } else if (videoProcessMode == 3) {
      // Laplacian
      int K[9] = int[](1, 1, 1, 1, -8, 1, 1, 1, 1); // 8-connected Laplacian kernel
      vec3 laplacian_rgb = vec3(0.0, 0.0, 0.0);
      int idx = 0;
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          vec3 pixel = getPixelValue(imageTexture, px + dx, py + dy);
          laplacian_rgb += float(K[idx]) * pixel.rgb;
          idx++;
        }
      }
      if (displayMode) {
        float norm = sqrt(
          laplacian_rgb.r * laplacian_rgb.r +
          laplacian_rgb.g * laplacian_rgb.g +
          laplacian_rgb.b * laplacian_rgb.b
        );
        return vec3(norm, norm, norm);
      }
      return abs(laplacian_rgb);

    } else if (videoProcessMode == 4) {
      // Separable Gaussian
      int kernelSize = radius * 2 + 1; // odd kernel size for symmetry
      vec3 sum_rgb = vec3(0.0, 0.0, 0.0);
      vec2 offset  = vec2(0.0, 0.0);
      float weightSum = 0.0;
      for (int i = -radius; i <= radius; i++) {
        float w = gaussian(float(i), 0.0, sigma);
        if (horizontal) { offset = vec2(i, 0); }
        else             { offset = vec2(0, i); }
        vec3 pixel = getPixelValue(imageTexture, px + int(offset.x), py + int(offset.y));
        sum_rgb   += w * pixel;
        weightSum += w;
      }
      return sum_rgb / weightSum;

    } else {
      // Median filter (3x3, bitonic sort)
      float values_r[9];
      float values_g[9];
      float values_b[9];
      int idx2 = 0;
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          vec3 tmp = getPixelValue(imageTexture, px + dx, py + dy);
          values_r[idx2] = tmp.r;
          values_g[idx2] = tmp.g;
          values_b[idx2] = tmp.b;
          idx2++;
        }
      }
      sort(values_r);
      sort(values_g);
      sort(values_b);
      return vec3(values_r[4], values_g[4], values_b[4]);
    }
  }


  vec3 applyColorControls(vec3 c) {
    vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
    c = vec3(colorScale) * c;
    if (invertColors) {
      c = vec3(1.0, 1.0, 1.0) - c;
    }
    return c;
  }

  // anaglyph combination functions
  vec4 TrueAnaglyph(vec4 colorLeft, vec4 colorRight) {
    mat3 m_l = mat3(
      0.299, 0.0, 0.0,
      0.587, 0.0, 0.0, 
      0.114, 0.0, 0.0
    );
    mat3 m_r = mat3(
      0.0, 0.0, 0.299, 
      0.0, 0.0, 0.587, 
      0.0, 0.0, 0.114
    );
    vec3 left  = m_l * colorLeft.rgb;
    vec3 right = m_r * colorRight.rgb;
    return vec4(left + right, 1.0);
  }

  vec4 GrayAnaglyph(vec4 colorLeft, vec4 colorRight) {
    mat3 m_l = mat3(
      0.299, 0.0, 0.0,
      0.587, 0.0, 0.0, 
      0.114, 0.0, 0.0
    );
    mat3 m_r = mat3(
      0.0, 0.299, 0.299, 
      0.0, 0.587, 0.587, 
      0.0, 0.114, 0.114
    );
    vec3 left  = m_l * colorLeft.rgb;
    vec3 right = m_r * colorRight.rgb;
    return vec4(left + right, 1.0);
  }

  vec4 ColorAnaglyph(vec4 colorLeft, vec4 colorRight) {
    mat3 m_l = mat3(
      1.0, 0.0, 0.0, 
      0.0, 0.0, 0.0, 
      0.0, 0.0, 0.0
    );
    mat3 m_r = mat3(
      0.0, 0.0, 0.0, 
      0.0, 1.0, 0.0, 
      0.0, 0.0, 1.0
    );
    vec3 left  = m_l * colorLeft.rgb;
    vec3 right = m_r * colorRight.rgb;
    return vec4(left + right, 1.0);
  }

  vec4 HalfColorAnaglyph(vec4 colorLeft, vec4 colorRight) {
    mat3 m_l = mat3(
      0.299, 0.0, 0.0, 
      0.587, 0.0, 0.0, 
      0.114, 0.0, 0.0
    );
    mat3 m_r = mat3(
      0.0, 0.0, 0.0, 
      0.0, 1.0, 0.0, 
      0.0, 0.0, 1.0
    );
    vec3 left  = m_l * colorLeft.rgb;
    vec3 right = m_r * colorRight.rgb;
    return vec4(left + right, 1.0);
  }

  vec4 OptimizedAnaglyph(vec4 colorLeft, vec4 colorRight) {
    mat3 m_l = mat3(
      0.437, -0.062, -0.048, 
      0.449, -0.062, -0.050,
      0.164, -0.024, -0.017
    );
    mat3 m_r = mat3(
      -0.011, 0.377, -0.026,
      -0.032, 0.761, -0.093,
      -0.007, 0.009,  1.234
    );
    vec3 left  = m_l * colorLeft.rgb;
    vec3 right = m_r * colorRight.rgb;
    return vec4(left + right, 1.0);
  }

  void main(void) {
    int px = int(gl_FragCoord.x);
    int py = int(gl_FragCoord.y);

    // *** Split into L/R & apply the image processing ***
    // Top half of video = Left eye; Bottom half = Right eye
    vec3 leftRaw  = applyImgProcessing(px, py + halfHeight);  // Left  eye (top half)
    vec3 rightRaw = applyImgProcessing(px, py);               // Right eye (bottom half)

    // colorScale + InvertColors
    vec3 leftColor  = applyColorControls(leftRaw);
    vec3 rightColor = applyColorControls(rightRaw);

    // Fetch pixel colors
    vec4 colorLeft  = vec4(leftColor,  1.0);
    vec4 colorRight = vec4(rightColor, 1.0);

    // ** Apply Anaglyph ***
    if (anaglyphMode == 0){
      out_FragColor = TrueAnaglyph(colorLeft, colorRight);
    } else if (anaglyphMode == 1) { 
      out_FragColor = GrayAnaglyph(colorLeft, colorRight);
    } else if (anaglyphMode == 2) {
      out_FragColor = ColorAnaglyph(colorLeft, colorRight);
    } else if (anaglyphMode == 3) {
      out_FragColor = HalfColorAnaglyph(colorLeft, colorRight);
    } else {                       
      out_FragColor = OptimizedAnaglyph(colorLeft, colorRight);
    }
  }
`;

// Helper Class for Render-To-Texture (RTT) Image Processing
export class TextureProcessor {
  constructor(width, height, processingMaterial) {
    this.width  = width;
    this.height = height;

    // Create a separate scene and orthographic camera for 2D processing
    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Setup the render target (the canvas we draw to in memory)
    const renderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType, // High precision colors
    };
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, renderTargetOptions);

    // Create a full-screen quad (rectangle) to draw the processed image onto
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0,   1, -1, 0,   1,  1, 0,
      -1, -1, 0,   1,  1, 0,  -1,  1, 0
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    // Add the quad with our custom shader material to the processing scene
    this.quadMesh = new THREE.Mesh(geometry, processingMaterial);
    this.scene.add(this.quadMesh);
  }

  // Renders the processed image into the renderTarget
  process(renderer) {
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null); // Reset back to screen
  }
}

// Helper Class for Multi-Render-Target processing
export class MultiTextureProcessor extends TextureProcessor {
  constructor(width, height, processingMaterial, count = 2) {
    super(width, height, processingMaterial);

    this.renderTarget = new THREE.WebGLMultipleRenderTargets(width, height, count);
    this.renderTarget.texture.forEach((tex) => {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.type      = THREE.FloatType;
    });
  }
}
