import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    base: '/phort/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // onnxruntime-web's wasm backend does its own dynamic import() of a .mjs
    // loader at runtime (see src/lib/vision/yolo.ts) — excluding it from
    // dep pre-bundling keeps Vite from mangling that at dev time.
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    build: {
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('onnxruntime-web')) return 'vendor-onnx';
            if (id.includes('@vladmandic/human')) return 'vendor-human';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
