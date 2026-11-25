import waterFragmentSource from '../src/shaders/water.frag';

/**
 * Boca Raton: Dynamic Shader Background Module
 * 
 * This module initializes a WebGL context on the background canvas
 * and runs a continuous animation loop for the water shimmer effect.
 */

let gl = null;
let program = null;
let timeLocation = null;
let resolutionLocation = null;
let startTime = 0;
let lastTime = 0;
let accumulatedTime = 0;
let animationFrameId = null;
let resizeHandler = null;

let navyLocation = null;
let poolLocation = null;

// Themes configuration
const BLUE_THEME = {
    navy: [0.149, 0.220, 0.361],
    pool: [0.533, 0.788, 0.800],
    speed: 0.8
};

const RED_THEME = {
    navy: [0.231, 0.051, 0.078],
    pool: [0.961, 0.294, 0.392],
    speed: 0.8
};

const TURQUOISE_THEME = {
    navy: [0.043, 0.200, 0.188],
    pool: [0.231, 0.839, 0.776],
    speed: 0.8
};

const ORANGE_THEME = {
    navy: [0.220, 0.070, 0.020],
    pool: [0.940, 0.400, 0.060],
    speed: 0.8
};

// Start at RED_THEME (Main menu) since the game loads directly into the main hub
let currentNavy = [...RED_THEME.navy];
let currentPool = [...RED_THEME.pool];
let currentSpeed = RED_THEME.speed;

export function initBackgroundShader() {
    const canvas = document.getElementById('shader-bg');
    if (!canvas) {
        console.warn('[Shader] Background canvas not found.');
        return;
    }

    // Cancel existing loop if re-initializing
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    // Attach WebGL context loss/restoration lifecycle handlers once
    if (!canvas.dataset.hasContextListeners) {
        canvas.dataset.hasContextListeners = 'true';

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('[Shader] WebGL context lost during Alt+Tab/GPU state change.');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }, false);

        canvas.addEventListener('webglcontextrestored', () => {
            console.log('[Shader] WebGL context restored. Re-initializing background shader...');
            initBackgroundShader();
        }, false);
    }

    gl = canvas.getContext('webgl', { alpha: false, depth: false, antialias: false });
    if (!gl) {
        console.error('[Shader] WebGL not supported.');
        return;
    }

    // 1. Handle Dynamic Resolution
    function resize() {
        if (!canvas) return;
        const w = window.innerWidth || 1920;
        const h = window.innerHeight || 1080;
        canvas.width = w;
        canvas.height = h;
        if (gl && !gl.isContextLost()) {
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
    }
    resizeHandler = resize;
    window.addEventListener('resize', resizeHandler);
    resize();

    // 2. Vertex Shader (Pass-through)
    const vertexSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // 3. Compile Shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, waterFragmentSource);

    if (!vertexShader || !fragmentShader) return;

    // 4. Link Program
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[Shader] Program Link Error:', gl.getProgramInfoLog(program));
        return;
    }

    gl.useProgram(program);

    // 5. Setup Geometry (Full-screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 6. Get Uniform Locations
    timeLocation = gl.getUniformLocation(program, 'u_time');
    resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    navyLocation = gl.getUniformLocation(program, 'u_color_navy');
    poolLocation = gl.getUniformLocation(program, 'u_color_pool');

    // 7. Start Loop
    startTime = performance.now();
    lastTime = startTime;
    animationFrameId = requestAnimationFrame(renderLoop);
    
    console.log('[Shader] Water shimmer initialized.');
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[Shader] Compile Error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function renderLoop(now) {
    if (!gl || gl.isContextLost()) {
        return;
    }

    // Clamp delta time to maximum 100ms to prevent huge jumps on Alt+Tab focus restore
    const rawDt = (now - lastTime) * 0.001;
    const dt = Number.isFinite(rawDt) ? Math.min(Math.max(rawDt, 0), 0.1) : 0.016;
    lastTime = now;

    // Update Viewport & Clear
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Determine target theme based on screen/modal state
    let target = RED_THEME; // Default to main menu
    
    const compendiumModal = document.getElementById('compendium-modal');
    const isCompOpen = compendiumModal && !compendiumModal.classList.contains('hidden');

    if (isCompOpen) {
        target = TURQUOISE_THEME;
    } else if (window.state) {
        const mode = window.state.mode;
        switch (mode) {
            case 'HUB':
            case 'TITLE':
                target = RED_THEME;
                break;
            case 'SETUP':
                target = ORANGE_THEME;
                break;
            case 'GAMBITS':
                target = TURQUOISE_THEME;
                break;
            default:
                // For GAME, AUCTION, DRAFT, OPEN_DRAFT, TUTORIAL, GAME_OVER, etc.
                target = BLUE_THEME;
                break;
        }
    }

    // Smooth linear interpolation (LERP) over frames
    const lerpFactor = 0.05;
    currentSpeed += (target.speed - currentSpeed) * lerpFactor;
    for (let i = 0; i < 3; i++) {
        currentNavy[i] += (target.navy[i] - currentNavy[i]) * lerpFactor;
        currentPool[i] += (target.pool[i] - currentPool[i]) * lerpFactor;
    }

    // Accumulate time scaled by current speed
    accumulatedTime += dt * currentSpeed;

    // Update Uniforms
    gl.uniform1f(timeLocation, accumulatedTime);
    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform3fv(navyLocation, currentNavy);
    gl.uniform3fv(poolLocation, currentPool);

    // Draw Quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrameId = requestAnimationFrame(renderLoop);
}
