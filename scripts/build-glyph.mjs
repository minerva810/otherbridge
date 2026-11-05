import {build} from 'vite';
import react from '@vitejs/plugin-react';

await build({
  configFile:false,publicDir:false,base:'/glyph/',plugins:[react()],
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  resolve:{dedupe:['react','react-dom']},
  build:{outDir:'public/glyph',emptyOutDir:true,cssCodeSplit:false,
    lib:{entry:'client/glyph-entry.tsx',formats:['es'],fileName:()=> 'glyph.js',cssFileName:'glyph'},
    rollupOptions:{output:{chunkFileNames:'chunks/[name]-[hash].js'}}
  }
});
