export const characters = [
 {id:'panther',color:'Kırmızı',name:'Panter',hex:'#bd594c',emoji:'🐆',description:'Direkt · iş odaklı',author:'kenchoo',source:'https://sketchfab.com/3d-models/black-panther-7fca11c89cca4362a525c891a8345112'},
 {id:'peacock',color:'Sarı',name:'Tavus kuşu',hex:'#b7952d',emoji:'🦚',description:'Direkt · insan odaklı',author:'Rio2',source:'https://sketchfab.com/3d-models/merak-burung-poli-rendah-5141e8f12e404638b6ee3b1c73d34446'},
 {id:'dolphin',color:'Yeşil',name:'Yunus',hex:'#448c78',emoji:'🐬',description:'İndirekt · insan odaklı',author:'Allie2k',source:'https://sketchfab.com/3d-models/game-ready-dolphin-swimming-b621ec8894734bc79c04338edff3cd0d'},
 {id:'owl',color:'Mavi',name:'Baykuş',hex:'#557ead',emoji:'🦉',description:'İndirekt · iş odaklı',author:'GremorySaiyan',source:'https://sketchfab.com/3d-models/owl-animation-fly-2d1d4cdd118b4f929c61b13a05909bd4'},
];
export function matchingCharacters([direct,indirect,people,task],override='') {
 if(override.trim()) return characters.filter(c=>override.toLocaleLowerCase('tr').includes(c.color.toLocaleLowerCase('tr')));
 const areas=[direct*task,direct*people,indirect*people,indirect*task],max=Math.max(...areas);
 return characters.filter((_,i)=>areas[i]===max);
}
export function characterHtml(scores,override='') {
 const matches=matchingCharacters(scores,override);
 if(!matches.length) return '<p class="form-hint">Girilen özel renk için karakter eşleştirmesi bulunmuyor.</p>';
 return `<section class="character-panel" aria-label="Davranış karakteri"><div class="character-top"><span class="result-kicker">DAVRANIŞ KARAKTERİ / 3D</span><button type="button" class="text-button" data-motion>Duraklat</button></div><div class="character-tabs" aria-label="Baskın davranış renkleri">${matches.map((c,i)=>`<button type="button" data-character="${c.id}" aria-pressed="${i===0}">${c.emoji} ${c.name}</button>`).join('')}</div><div class="character-stage" role="img" aria-label="${matches[0].name}: hareketli üç boyutlu karakter"><span class="character-fallback">${matches[0].emoji}</span></div><div class="character-caption"><h4 data-character-name>${matches[0].name}</h4><p data-character-description>${matches[0].color} · ${matches[0].description}</p></div><p class="character-credit"><a data-character-credit href="${matches[0].source}" target="_blank" rel="noopener noreferrer">3D model: ${matches[0].author}</a> · <a data-character-license href="./assets/characters/${matches[0].id}-license.txt" target="_blank" rel="noopener noreferrer">Lisans</a></p><p class="character-hint">Sürükleyerek döndür · Ok tuşlarıyla yön ver${matches.length>1?' · Eşit renkler arasında geçiş yap':''}</p><p class="character-note">Hayvan benzetmesi davranış tarzını anlatır; kişilik tanısı değildir.</p></section>`;
}
