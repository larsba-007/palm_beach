precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color_navy;
uniform vec3 u_color_pool;

void main() {
    // 1. Coordinates: Normalized uv from gl_FragCoord and u_resolution
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // 2. The Math (The Shimmer): Layering sin functions for a slow organic feel
    // u_time is already speed-scaled in JS to avoid transition jumps
    float time = u_time;
    
    float w1 = sin(uv.x * 7.0 + time * 1.2) * 0.5 + 0.5;
    float w2 = sin(uv.y * 9.0 + time * 0.8) * 0.5 + 0.5;
    float w3 = sin((uv.x + uv.y) * 6.0 + time) * 0.5 + 0.5;
    
    // Normalize the layered waves
    float wave = (w1 + w2 + w3) / 3.0;

    // 3. The Output: Blend navy and pool colors using the wave value
    // We add a tiny bit of uv.y to the mix to create a subtle vertical depth
    float mixFactor = clamp(wave * 0.85 + uv.y * 0.15, 0.0, 1.0);
    vec3 finalColor = mix(u_color_navy, u_color_pool, mixFactor);

    gl_FragColor = vec4(finalColor, 1.0);
}
