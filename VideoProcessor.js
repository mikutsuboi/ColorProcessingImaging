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

// Fragment Shader: Handles the per-pixel image processing
export const fragmentShader = `
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
  
  // Box blur: Average the colors of surrounding pixels
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
