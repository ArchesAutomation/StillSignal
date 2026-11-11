import {readFile,writeFile} from 'node:fs/promises';
const css=await readFile(new URL('./style.css',import.meta.url),'utf8');
const js=await readFile(new URL('./app.js',import.meta.url),'utf8');
for(const [file,theme,title] of [['01-reading-room.html','room','The reading room'],['02-quiet-hours.html','sanctuary','The quiet hours'],['03-daily-space.html','studio','Your daily space']]){
 await writeFile(new URL(file,import.meta.url),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="StillSignal desktop design prototype. Local sample data only."><title>StillSignal · ${title}</title><style>${css}</style></head><body data-theme="${theme}"><div id="app"></div><script>${js}</script></body></html>`);
}
console.log('Built three standalone HTML prototypes.');
