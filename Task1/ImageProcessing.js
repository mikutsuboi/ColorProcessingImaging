import * as THREE from "three";

// Vertex Shader: Handles the positions of the vertices
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

// Fragment Shader 0: Box blur
export const boxFragmentShader = `
precision highp float;

// Input textures and parameters from our JavaScript
uniform sampler2D imageTexture; // The video frame
uniform int blurRadius;         // How much to blur (box blur)
uniform float colorScaleR;      // Red channel multiplier
uniform float colorScaleG;      // Green channel multiplier
uniform float colorScaleB;      // Blue channel multiplier
uniform bool invertColors;      // Whether to invert the final color

// Output color of the pixel
out vec4 out_FragColor;

void main(void) {
  vec4 textureValue = vec4(0.0, 0.0, 0.0, 0.0);

  for (int i = -blurRadius; i <= blurRadius; i++) {
    for (int j = -blurRadius; j <= blurRadius; j++) {
      // Fetch pixel color using exact integer coordinates
      textureValue += texelFetch(
        imageTexture, 
        ivec2(i + int(gl_FragCoord.x), j + int(gl_FragCoord.y)), 
        0
      );
    }
  }
  
  // Divide by the total number of pixels sampled to get the average
  float numSamples = float((blurRadius * 2 + 1) * (blurRadius * 2 + 1));
  textureValue /= numSamples;

  // Apply color scaling
  vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
  out_FragColor = vec4(colorScale, 1.0) * textureValue;

  // Apply color inversion if requested
  if (invertColors) {
    out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
    out_FragColor.a = 1.0; // Ensure alpha remains opaque
  }
}
`;

// Fragment Shader 1: Gaussian Filter
export const GaussianFragmentShader = `
  precision highp float;

  // Input textures and parameters from our JavaScript
  uniform sampler2D imageTexture; // The video frame
  uniform int radius; // blur radius
  uniform float sigma; // standard deviation for Gaussian

  uniform float colorScaleR;      // Red channel multiplier
  uniform float colorScaleG;      // Green channel multiplier
  uniform float colorScaleB;      // Blue channel multiplier
  uniform bool invertColors;      // Whether to invert the final color
  
  // Output color of the pixel
  out vec4 out_FragColor;

  // Simplified Gaussian formula
  float gaussian(float x, float y, float sigma) {
    return exp(-(x * x + y * y) / (2.0 * sigma * sigma));
  }

  // Pixel access
  vec3 getPixelValue(sampler2D img, int x, int y) {
    return texelFetch(img, ivec2(x, y), 0).rgb;
  }

  // Gaussian blur
  void main(void) {
    int kernelSize = radius * 2 + 1; // odd kernel size for symmetry
    vec3 sum_rgb = vec3(0.0, 0.0, 0.0);
    float weightSum = 0.0;

    for (int dy = -radius; dy <= radius; dy++) {
      for (int dx = -radius; dx <= radius; dx++) {
        float w = gaussian(float(dx), float(dy), sigma);
        vec3 pixel = getPixelValue(imageTexture, int(gl_FragCoord.x) + dx, int(gl_FragCoord.y) + dy);
        sum_rgb += w * pixel.rgb;
        weightSum += w;
      }
    }
  
    // Normalize by the total weight to get the final color
    vec3 FragColor = sum_rgb / weightSum;
    out_FragColor = vec4(FragColor, 1.0);

    // Apply color scaling
    vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
    out_FragColor = vec4(colorScale, 1.0) * out_FragColor;

    // Apply color inversion if requested
    if (invertColors) {
      out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
      out_FragColor.a = 1.0; // Ensure alpha remains opaque
    }
  }
`;

// Fragment Shader 2: Laplacian Filter
export const LaplacianFragmentShader = `
  precision highp float;

  // Input textures and parameters from our JavaScript
  uniform sampler2D imageTexture; // The video frame
  uniform bool displayMode; // false: Color, true: Norm

  uniform float colorScaleR;      // Red channel multiplier
  uniform float colorScaleG;      // Green channel multiplier
  uniform float colorScaleB;      // Blue channel multiplier
  uniform bool invertColors;      // Whether to invert the final color

  // Output color of the pixel
  out vec4 out_FragColor;
  
  // Pixel access
  vec3 getPixelValue(sampler2D img, int x, int y) {
    return texelFetch(img, ivec2(x, y), 0).rgb;
  }

  void main(void) {
    int K[9] = int[](1, 1, 1, 1, -8, 1, 1, 1, 1); // 8-connected Laplacian kernel
    vec3 laplacian_rgb = vec3(0.0, 0.0, 0.0);
    vec3 FragColor = vec3(0.0, 0.0, 0.0);
    int idx = 0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 pixel = getPixelValue(imageTexture, int(gl_FragCoord.x) + dx, int(gl_FragCoord.y) + dy);
        laplacian_rgb += float(K[idx]) * pixel.rgb;
        idx++;
      }
    }
    
    if (displayMode) {
      float norm = sqrt(laplacian_rgb.r * laplacian_rgb.r + laplacian_rgb.g * laplacian_rgb.g + laplacian_rgb.b * laplacian_rgb.b);
      FragColor = vec3(norm, norm, norm);
    } else{
      FragColor = abs(laplacian_rgb);
    }
    out_FragColor = vec4(FragColor, 1.0);
    
    // Apply color scaling
    vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
    out_FragColor = vec4(colorScale, 1.0) * out_FragColor;

    // Apply color inversion if requested
    if (invertColors) {
        out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
        out_FragColor.a = 1.0; // Ensure alpha remains opaque
    }
  }
`

// Fragment Shader 3: Separable Filter (Gaussian)
export const SeparatableFragmentShader = `
  precision highp float;

  // Input textures and parameters from our JavaScript
  uniform sampler2D imageTexture; // The video frame
  uniform bool horizontal; // true: horizontal pass(H), false: vertical pass(V)
  uniform int radius; // blur radius
  uniform float sigma; // standard deviation for Gaussian


  uniform float colorScaleR;      // Red channel multiplier
  uniform float colorScaleG;      // Green channel multiplier
  uniform float colorScaleB;      // Blue channel multiplier
  uniform bool invertColors;      // Whether to invert the final color  

  // Output color of the pixel
  out vec4 out_FragColor;

  // Simplified Gaussian formula
  float gaussian(float x, float y, float sigma) {
    return exp(-(x * x + y * y) / (2.0 * sigma * sigma));
  }

  // Pixel access
  vec3 getPixelValue(sampler2D img, int x, int y) {
    return texelFetch(img, ivec2(x, y), 0).rgb;
  }

  void main(void) {
    int kernelSize = radius * 2 + 1; // odd kernel size for symmetry
    vec3 sum_rgb = vec3(0.0, 0.0, 0.0);
    vec3 FragColor = vec3(0.0, 0.0, 0.0);
    vec2 offset = vec2(0.0, 0.0);
    float weightSum = 0.0;

    for (int i = -radius; i <= radius; i++) {
      float w = gaussian(float(i), 0.0, sigma);
      if (horizontal) {
        offset = vec2(i, 0);
      } else {
        offset = vec2(0, i);
      }
      vec3 pixel = getPixelValue(imageTexture, int(gl_FragCoord.x) + int(offset.x), int(gl_FragCoord.y) + int(offset.y));
      sum_rgb += w * pixel;
      weightSum += w;
    }
    FragColor = sum_rgb / weightSum;
    out_FragColor = vec4(FragColor, 1.0);
    
    // Apply color scaling
    vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
    out_FragColor = vec4(colorScale, 1.0) * out_FragColor;
    // Apply color inversion if requested
    if (invertColors) {
        out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
        out_FragColor.a = 1.0; // Ensure alpha remains opaque
    }
  }
`

// Fragment Shader 4: Median Filter
export const  MedianFragmentShader = `
  precision highp float;

  // Input textures and parameters from our JavaScript
  uniform sampler2D imageTexture; // The video frame

  uniform float colorScaleR;      // Red channel multiplier
  uniform float colorScaleG;      // Green channel multiplier
  uniform float colorScaleB;      // Blue channel multiplier
  uniform bool invertColors;      // Whether to invert the final color

  // Output color of the pixel
  out vec4 out_FragColor;
  
  // Pixel access
  vec3 getPixelValue(sampler2D img, int x, int y) {
    return texelFetch(img, ivec2(x, y), 0).rgb;
  }

  // Sorting Network (Bitonic Sort)
  void sort(inout float v[9]) {
    // put huge number at the end to able to sort 9 values
    float list[16] = float[16](
      v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], // actual values
      1e10, 1e10, 1e10, 1e10, 1e10, 1e10, 1e10 // dummy values
    );

    // Bitonic sort
    for (int k = 2; k <= 16; k <<= 1) { // k: 2, 4, 8, 16
      for (int j = k >> 1; j > 0; j >>= 1) { // j: 1, 2, 4, 8
        for (int i = 0; i < 16; i++) { // i: 0 to 15
          int ixj = i ^ j; // index to compare with
          if (ixj > i) {
            bool ascending = (i & k) == 0;
            float a = list[i];
            float b = list[ixj];
            
            if (ascending) {
              list[i]   = min(a, b);
              list[ixj] = max(a, b);
            } else {
              list[i]   = max(a, b);
              list[ixj] = min(a, b);
            }
          }
        }
      }
    }

    // Copy back the sorted values
    for (int i = 0; i < 9; i++) {
      v[i] = list[i];
    } 
  }

  // 3x3 kernel for median filter
  void main(void) {
    // Collect 9 neighbourhood values for one channel
    float values_r[9];
    float values_g[9];
    float values_b[9];
    int idx = 0;

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 tmp = getPixelValue(imageTexture, int(gl_FragCoord.x) + dx, int(gl_FragCoord.y) + dy);
        values_r[idx] = tmp.r;
        values_g[idx] = tmp.g;
        values_b[idx] = tmp.b;
        idx++;
      }
    }
    sort(values_r);
    sort(values_g);
    sort(values_b);

    vec3 FragColor = vec3(values_r[4], values_g[4], values_b[4]);
    out_FragColor = vec4(FragColor, 1.0);

    // Apply color scaling
    vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
    out_FragColor = vec4(colorScale, 1.0) * out_FragColor;

    // Apply color inversion if requested
    if (invertColors) {
        out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
        out_FragColor.a = 1.0; // Ensure alpha remains opaque
    }   
  }
`

// Helper Class for Render-To-Texture (RTT) Image Processing
export class TextureProcessor {
  constructor(width, height, processingMaterial) {
    this.width = width;
    this.height = height;

    // Create a separate scene and orthographic camera for 2D processing
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Setup the render target (the canvas we draw to in memory)
    const renderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType, // High precision colors
    };
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, renderTargetOptions);

    // Create a full-screen quad (rectangle) to draw the processed image onto
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0,   1, -1, 0,   1, 1, 0, 
      -1, -1, 0,   1,  1, 0,  -1, 1, 0
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
