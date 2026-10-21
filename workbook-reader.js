// A deliberately narrow OOXML reader for these workbook formats. It never
// executes formulas, links or macros; formulas are handled by the allowlisted evaluator.
export const decodeXml = s => String(s).replace(/&#x([0-9a-f]+);|&#(\d+);|&(lt|gt|quot|apos|amp);/gi, (_, hex, dec, named) => hex ? String.fromCodePoint(parseInt(hex,16)) : dec ? String.fromCodePoint(Number(dec)) : ({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'})[named]);
export function attributes(xml) {
  return Object.fromEntries([...xml.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],decodeXml(m[2]??m[3])]));
}
export function xmlText(xml) { return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decodeXml(m[1])).join(''); }
export function parseCells(xml, strings=[]) {
  const cells={};
  for(const m of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const attr=attributes(m[1]), body=m[2]||'';
    if(!/^[A-Z]+\d+$/.test(attr.r)) throw Error('Geçersiz hücre adresi.');
    const v=/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
    const f=/<(?:\w+:)?f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?f>)/.exec(body);
    const value=attr.t==='inlineStr'?xmlText(body):attr.t==='s'?strings[Number(v)]:v===undefined?null:attr.t==='str'||attr.t==='e'?decodeXml(v):Number(v);
    if(Object.hasOwn(cells,attr.r)) throw Error('Tekrarlanan hücre adresi.');
    cells[attr.r]={value,formula:f?decodeXml(f[2]||''):null,formulaAttributes:f?attributes(f[1]):null};
  }
  return cells;
}
export async function readWorkbook(bytes, Zip=globalThis.JSZip) {
  if(bytes.byteLength>8*1024*1024) throw Error('Dosya 8 MB sınırını aşıyor.');
  const zip=await Zip.loadAsync(bytes);
  if(Object.keys(zip.files).length>1000) throw Error('Bu Excel yapısı desteklenmiyor.');
  const read=async path=>{
    const file=zip.file(path);if(!file) throw Error(`Excel bileşeni eksik: ${path}`);
    const xml=await file.async('string');
    if(xml.length>12*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Desteklenmeyen XML yapısı.');
    return xml;
  };
  const workbook=await read('xl/workbook.xml');
  const rels=await read('xl/_rels/workbook.xml.rels');
  const targets={};
  for(const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    const a=attributes(m[1]);if(a.TargetMode==='External') continue;
    targets[a.Id]=a.Target?.startsWith('/')?a.Target.slice(1):`xl/${a.Target}`;
  }
  const shared=zip.file('xl/sharedStrings.xml')?await read('xl/sharedStrings.xml'):'';
  const strings=[...shared.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>xmlText(m[1]));
  const sheets=[];
  for(const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const a=attributes(m[1]),path=targets[a['r:id']];
    if(!path||path.includes('..')) throw Error('Geçersiz Excel sayfa yolu.');
    const xml=await read(path);sheets.push({name:a.name,path,xml,cells:parseCells(xml,strings)});
  }
  if(!sheets.length) throw Error('Excel sayfası bulunamadı.');
  return {zip,read,sheets,strings};
}
export function expandedFormulas(cells) {
 const output={},shared={};
 const index=col=>[...col].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 const letters=n=>{let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
 for(const [ref,cell] of Object.entries(cells)) if(cell.formula) {
   output[ref]=cell.formula;
   if(cell.formulaAttributes.t==='shared') shared[cell.formulaAttributes.si]={ref,formula:cell.formula};
 }
 for(const [ref,cell] of Object.entries(cells)) if(cell.formula==='' && cell.formulaAttributes.t==='shared') {
   const base=shared[cell.formulaAttributes.si];if(!base) throw Error('Ortak formül kaynağı bulunamadı.');
   const [,col,row]=/^([A-Z]+)(\d+)$/.exec(ref), [,bc,br]=/^([A-Z]+)(\d+)$/.exec(base.ref);
   output[ref]=base.formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g,(_,ac,c,ar,r)=>`${ac}${ac?c:letters(index(c)+index(col)-index(bc))}${ar}${ar?r:Number(r)+Number(row)-Number(br)}`);
 }
 return output;
}
