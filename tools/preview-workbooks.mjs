import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path=new URL('../test-output/team-11.xlsx',import.meta.url).pathname;
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const preview=await wb.render({sheetName:'Genel Data',range:'A1:R18',scale:1,format:'png'});
await fs.writeFile(new URL('../test-output/team-preview.png',import.meta.url),new Uint8Array(await preview.arrayBuffer()));
console.log('Rendered team sheet');
