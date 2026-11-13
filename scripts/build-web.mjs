import {build} from 'esbuild';
await build({entryPoints:['src/cloud-client.mjs'],outfile:'dist/cloud-client.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
