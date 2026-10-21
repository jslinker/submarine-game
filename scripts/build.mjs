import {rm,mkdir,cp,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','game.js','state.js','hall_door_01.jpg','hall_main','captains','messhall','control','inventory']) await cp(file,`dist/${file}`,{recursive:true,filter:source=>!source.endsWith('.DS_Store')});
await writeFile('dist/.nojekyll','');
console.log('Static game built in dist/');
