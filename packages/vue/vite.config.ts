import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The library build: one ES module, with Vue, Pinia and the engine left to the
// app's bundler (peers and a dependency, so the app gets one copy of each).
// Declarations come from vue-tsc (tsconfig.build.json); the stylesheet is
// copied as dist/style.css. Tests use vitest.config.ts.
export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rolldownOptions: {
      external: ['vue', 'pinia', /^@brass-lantern\/engine(\/.*)?$/],
    },
  },
});
