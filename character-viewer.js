import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { prepareCharacter, fitCharacterCamera } from './character-scene.js';
import { characters } from './behavior-characters.js';

// One WebGL context per selected person; dispose it before replacing the preview.
export function mountCharacter(panel) {
 if(!panel)return ()=>{};
 const stage=panel.querySelector('.character-stage'),motion=panel.querySelector('[data-motion]');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),abort=new AbortController(),options={signal:abort.signal};
 let renderer,model,mixer,prepared,disposed=false,request=0,frame=0,previous=0,paused=reduced.matches,visible=true,yaw=.35,pitch=.06,drag=null;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,30),pivot=new THREE.Group();
 camera.position.set(0,.35,5.8);camera.lookAt(0,0,0);scene.add(pivot);
 scene.add(new THREE.HemisphereLight(0xf6fbff,0x9da99d,2.8));
 for(const [color,intensity,x,y,z] of [[0xffffff,3,3,4,4],[0xabcaff,2,-3,2,-2]]) {const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.4,.1,64),new THREE.MeshStandardMaterial({color:0xe7e7dc,roughness:.8}));floor.position.y=-1.25;scene.add(floor);
 const free=object=>{if(!object)return;const geometries=new Set(),materials=new Set(),textures=new Set();object.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)for(const m of [n.material].flat())materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();});textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});};
 function draw(){if(disposed||!renderer)return;pivot.rotation.set(pitch,yaw,0);renderer.render(scene,camera);}
 function tick(now){frame=0;if(disposed||paused||!visible||!model)return;const dt=previous?Math.min((now-previous)/1000,.05):0;previous=now;mixer?.update(dt);draw();frame=requestAnimationFrame(tick);}
 function sync(){cancelAnimationFrame(frame);frame=0;previous=0;motion.textContent=paused?'Oynat':'Duraklat';motion.setAttribute('aria-pressed',String(!paused));if(!paused&&visible&&model)frame=requestAnimationFrame(tick);else draw();}
 function size(){if(!renderer||disposed)return;const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);fitCharacterCamera(camera,prepared?.radius||1.8,width/height);draw();}
 async function select(id){
  const character=characters.find(c=>c.id===id);if(!character)return;const token=++request;
  panel.querySelectorAll('[data-character]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.character===id)));
  panel.querySelector('[data-character-name]').textContent=character.name;panel.querySelector('[data-character-description]').textContent=`${character.color} · ${character.description}`;
  const credit=panel.querySelector('[data-character-credit]');credit.textContent=`3D model: ${character.author}`;credit.href=character.source;panel.querySelector('[data-character-license]').href=`./assets/characters/${id}-license.txt`;
  stage.setAttribute('aria-label',`${character.name}: üç boyutlu karakter. Ok tuşlarıyla döndürebilirsin.`);stage.dataset.tone=id;
  if(model){pivot.remove(model);prepared?.dispose();free(model);model=null;mixer=null;prepared=null;}sync();
  const fallback=stage.querySelector('.character-fallback');fallback.hidden=false;
  if(!renderer){fallback.textContent=`${character.emoji} Bu tarayıcıda WebGL kullanılamıyor.`;return;}
  fallback.textContent=`${character.emoji} Model yükleniyor…`;
  try {
   const gltf=await new GLTFLoader().loadAsync(`./assets/characters/${id}.glb`);
   if(disposed||token!==request){free(gltf.scene);return;}
   prepared=prepareCharacter(gltf);model=prepared.object;mixer=prepared.mixer;pivot.add(model);floor.position.y=-prepared.size.y/2-.12;
   yaw=({panther:1.05,dolphin:1.1,peacock:-Math.PI/2,owl:0})[id];pitch=.06;fallback.hidden=true;size();sync();
  }catch {if(!disposed&&token===request){fallback.hidden=false;fallback.textContent=`${character.emoji} 3D model yüklenemedi. Sayfayı yenileyerek tekrar deneyebilirsin.`;}}
 }
 panel.querySelectorAll('[data-character]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.character),options));
 let resize,intersection;
 try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  stage.append(renderer.domElement);stage.tabIndex=0;
  resize=new ResizeObserver(size);resize.observe(stage);
  intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting&&!document.hidden;sync();});intersection.observe(stage);
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden&&stage.getBoundingClientRect().bottom>0&&stage.getBoundingClientRect().top<innerHeight;sync();},options);
  motion.addEventListener('click',()=>{paused=!paused;sync();},options);
  reduced.addEventListener('change',()=>{paused=reduced.matches;sync();},options);
  stage.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;drag={x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);},options);
  stage.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.012;pitch=Math.max(-.5,Math.min(.5,pitch+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY};draw();},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>{drag=null;},options);
  stage.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=Math.max(-.5,pitch-.1);if(e.key==='ArrowDown')pitch=Math.min(.5,pitch+.1);draw();},options);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;sync();stage.querySelector('.character-fallback').hidden=false;stage.querySelector('.character-fallback').textContent='3D görüntü durdu. Yeniden yüklemek için sayfayı yenile.';},options);
  select(panel.querySelector('[data-character]').dataset.character);
 }catch {
  motion.disabled=true;motion.textContent='3D kullanılamıyor';stage.querySelector('.character-fallback').textContent='Bu tarayıcıda WebGL kullanılamıyor. Karakter bilgisi aşağıda.';
 }
 return ()=>{disposed=true;++request;abort.abort();cancelAnimationFrame(frame);resize?.disconnect();intersection?.disconnect();prepared?.dispose();free(scene);renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();};
}
