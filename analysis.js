import { importAnswers } from './answers.js';
import { evaluationSurvey, validateTeamTemplate, createTeamWorkbook, participantKey, teamRecord } from './analysis-core.js';
import { createWorkbook } from './excel.js';
import { resultsHtml } from './results.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let survey, evaluated, evaluationBytes, teamBytes, entries=[],busy=false, previewId=null, nextId=1;
const urls=new Set();
function download(bytes,name,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
 const url=URL.createObjectURL(new Blob([bytes],{type}));urls.add(url);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);
}
function controls() {
 $('#download-individuals').disabled=busy||!evaluated||!entries.length;
 $('#download-team').disabled=busy||!evaluated||!teamBytes||!entries.some(e=>e.role==='team');
 document.querySelectorAll('input,select,#clear-files,[data-remove],[data-preview],[data-download]').forEach(el=>el.disabled=busy||(el.hasAttribute('data-download')&&!evaluated)||(el.hasAttribute('data-preview')&&!evaluated));
}
function render() {
 $('#participants').innerHTML=entries.length?`<div class="analysis-table-wrap"><table class="analysis-table"><thead><tr><th scope="col">Katılımcı</th><th scope="col">Kapsam</th><th scope="col">Davranış rengi</th><th scope="col">İşlemler</th></tr></thead><tbody>${entries.map(e=>`<tr><td><strong>${esc(e.state.profile.name)}</strong><small>${esc(e.state.profile.title)}</small><small>${esc(e.filename)}</small>${e.state.motivationSkipped ? '<small>Motivasyon: yeni başladı, atlandı</small>' : ''}</td><td><select data-role="${e.id}" aria-label="${esc(e.state.profile.name)} kapsamı"><option value="team" ${e.role==='team'?'selected':''}>Ekip üyesi</option><option value="leader" ${e.role==='leader'?'selected':''}>Benim profilim</option></select></td><td><input data-color="${e.id}" aria-label="${esc(e.state.profile.name)} davranış rengi" maxlength="60" value="${esc(e.color)}" placeholder="${evaluated?esc(teamRecord(evaluated,e.state)[2]):'Şablon gerekli'}"></td><td><div class="table-actions"><button class="text-button" data-preview="${e.id}">Grafikler</button><button class="text-button" data-download="${e.id}">Excel</button><button class="text-button" data-remove="${e.id}">Kaldır</button></div></td></tr>`).join('')}</tbody></table></div><p class="form-hint">Renk önerisi, özgün davranış haritasında alanı en büyük olan bölgedir; eşitlikler birlikte gösterilir. Kendi değerlendirmene göre bu alanı değiştirebilirsin.</p>`:'';
 const team=entries.filter(e=>e.role==='team');
 $('#analysis-status').textContent=`${team.length} ekip üyesi${entries.some(e=>e.role==='leader')?' · 1 yönetici profili':''} hazır.`;
 $('#team-overview').innerHTML='';
 if(evaluated&&team.length) {
  const rows=team.map(e=>teamRecord(evaluated,e.state,e.color));
  const mean=i=>{const values=rows.map(r=>r[i]).filter(v=>v!==null);return values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toLocaleString('tr-TR',{maximumFractionDigits:1}) : 'Veri yok';};
  const motivationCount=rows.filter(r=>r[16]!==null).length;
  $('#team-overview').innerHTML=`<section class="profile-panel"><div class="panel-title"><h2>Ekip özeti</h2><span>${team.length} kişi</span></div><div class="team-metrics"><div><span>İletişim toplamı ort.</span><strong>${mean(11)} / 200</strong></div><div><span>Motivasyon toplamı ort. (${motivationCount}/${rows.length} kişi)</span><strong>${mean(16)}${motivationCount ? ' / 160' : ''}</strong></div><div><span>Kontrol odağı ort.</span><strong>${mean(17)} / 23</strong></div></div><h3>Davranış haritası</h3><p class="analysis-note">Her nokta bir ekip üyesidir. Yatay konum direkt–indirekt, dikey konum iş–insan puan farkını gösterir. İsim listesindeki numaralarla eşleştirebilirsin.</p><svg class="team-map" viewBox="0 0 600 420" role="img" aria-label="Ekip davranış haritası; değerler aşağıdaki listede"><rect x="100" y="45" width="200" height="160" fill="#eaf0f9"/><rect x="300" y="45" width="200" height="160" fill="#faeae5"/><rect x="100" y="205" width="200" height="160" fill="#eaf2e6"/><rect x="300" y="205" width="200" height="160" fill="#faf2d9"/><path d="M100 205H500 M300 45V365" stroke="#8b9d8d"/><text x="300" y="25" text-anchor="middle">İş odaklı</text><text x="300" y="400" text-anchor="middle">İnsan odaklı</text><text x="90" y="205" text-anchor="end">İndirekt</text><text x="510" y="205">Direkt</text>${rows.map((r,i)=>{const x=300+(r[3]-r[4])*190/14,y=205+(r[5]-r[6])*150/14;return `<g><title>${esc(r[0])}: Direkt ${r[3]}, İndirekt ${r[4]}, İnsan ${r[5]}, İş ${r[6]}</title><circle cx="${x}" cy="${y}" r="12" fill="#304d3f" opacity=".8"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="white" font-size="11">${i+1}</text></g>`;}).join('')}</svg><ol class="map-legend">${rows.map(r=>`<li>${esc(r[0])} — ${esc(r[2])}; direkt ${r[3]}, indirekt ${r[4]}, insan ${r[5]}, iş ${r[6]}</li>`).join('')}</ol></section>`;
 }
 const p=entries.find(e=>e.id===previewId);
 $('#person-preview').innerHTML=p&&evaluated?`<section class="profile-panel"><h2>${esc(p.state.profile.name)}</h2>${resultsHtml(evaluated,p.state)}</section>`:'';
 controls();
}
async function run(fn) {
 busy=true;controls();$('#export-error').textContent='';
 try {await fn();}catch(e){$('#export-error').textContent=e.message||'İşlem tamamlanamadı.';}
 finally{busy=false;render();}
}
async function bytes(file) {
 if(!file||!file.name.toLowerCase().endsWith('.xlsx')) throw Error('Bir .xlsx dosyası seç.');
 if(file.size>8*1024*1024) throw Error('Dosya 8 MB sınırını aşıyor.');
 return new Uint8Array(await file.arrayBuffer());
}
$('#evaluation-template').addEventListener('change',e=>run(async()=>{
 evaluated=null;evaluationBytes=null;$('#evaluation-status').textContent='Şablon kontrol ediliyor…';
 try {const data=await bytes(e.target.files[0]);evaluated=await evaluationSurvey(survey,data);evaluationBytes=data;$('#evaluation-status').textContent='9 sayfa ve 143 formül doğrulandı.';}
 catch(error){$('#evaluation-status').textContent='Şablon yüklenemedi.';throw error;}
}));
$('#team-template').addEventListener('change',e=>run(async()=>{
 teamBytes=null;$('#team-status').textContent='Şablon kontrol ediliyor…';
 try {const data=await bytes(e.target.files[0]);await validateTeamTemplate(data);teamBytes=data;$('#team-status').textContent='Ekip şablonu hazır; satırlar kişi sayısına göre genişler.';}
 catch(error){$('#team-status').textContent='Şablon yüklenemedi.';throw error;}
}));
$('#answer-files').addEventListener('change',e=>run(async()=>{
 const files=[...e.target.files],errors=[];
 if(files.length+entries.length>200) throw Error('En fazla 200 dosya yükleyebilirsin.');
 for(const file of files) {
  try {
   const state=await importAnswers(survey,await bytes(file)),key=participantKey(state);
   if(entries.some(e=>participantKey(e.state)===key)) throw Error('Aynı ad ve unvan zaten listede. Değiştirmek için eski kaydı kaldır.');
   entries.push({id:nextId++,state,filename:file.name,role:'team',color:''});
  }catch(error){errors.push(`${file.name}: ${error.message}`);}
 }
 $('#import-errors').textContent=errors.join('\n');e.target.value='';
}));
$('#participants').addEventListener('change',e=>{
 const role=e.target.dataset.role,color=e.target.dataset.color;
 const entry=entries.find(p=>p.id===Number(role||color));if(!entry)return;
 if(role) {if(e.target.value==='leader') entries.forEach(p=>p.role='team');entry.role=e.target.value;}
 if(color)entry.color=e.target.value;
 render();
});
$('#participants').addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button)return;
 const id=Number(button.dataset.remove||button.dataset.preview||button.dataset.download),entry=entries.find(p=>p.id===id);
 if(button.dataset.remove){entries=entries.filter(p=>p.id!==id);render();}
 if(button.dataset.preview){previewId=previewId===id?null:id;render();$('#person-preview').scrollIntoView({behavior:'auto'});}
 if(button.dataset.download)run(async()=>{const file=await createWorkbook(evaluated,entry.state,evaluationBytes);download(file.bytes,file.filename);});
});
$('#download-individuals').addEventListener('click',()=>run(async()=>{
 const zip=new globalThis.JSZip();
 for(const [i,e] of entries.entries()) {const file=await createWorkbook(evaluated,e.state,evaluationBytes);zip.file(`${String(i+1).padStart(3,'0')}-${file.filename}`,file.bytes);}
 download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'Bireysel-Degerlendirmeler.zip','application/zip');
}));
$('#download-team').addEventListener('click',()=>run(async()=>{
 const file=await createTeamWorkbook(evaluated,entries.filter(e=>e.role==='team'),teamBytes,entries.find(e=>e.role==='leader'));
 download(file.bytes,file.filename);
}));
$('#clear-files').addEventListener('click',()=>{
 entries=[];previewId=null;evaluated=null;evaluationBytes=null;teamBytes=null;
 document.querySelectorAll('input[type=file]').forEach(i=>i.value='');
 $('#evaluation-status').textContent='Bireysel değerlendirmeler için gerekli.';$('#team-status').textContent='Ekip çıktısının özgün düzeni korunur.';
 $('#import-errors').textContent='';$('#export-error').textContent='';urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();render();
});
try {busy=true;controls();const response=await fetch('./data/survey.json',{cache:'no-store'});if(!response.ok)throw Error('Sorular yüklenemedi.');survey=await response.json();busy=false;render();}
catch(e){$('#export-error').textContent=`${e.message} Sayfayı yenileyip tekrar dene.`;}
