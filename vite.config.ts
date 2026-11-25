import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: '', // Empty string ensures robust relative paths for assets on Netlify/Electron
  assetsInclude: ['**/*.webp'], // Explicitly include webp files
  plugins: [
    tailwindcss(),
    glsl()
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: false,
      timeZone: 'UTC' 
    }) + ' UTC')
  }
});