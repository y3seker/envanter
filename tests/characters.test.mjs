import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { characters, matchingCharacters, characterHtml } from '../behavior-characters.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { prepareCharacter, fitCharacterCamera } from '../character-scene.js';
// Node has no bitmap renderer; validate embedded image signatures separately.
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
import { AnimationMixer, Box3, Vector3, PerspectiveCamera } from '../vendor/three.module.min.js';

test('behavior quadrants select the corresponding animal, including ties and manager overrides',()=>{
 for(const [scores,id] of [[[14,0,0,14],'panther'],[[14,0,14,0],'peacock'],[[0,14,14,0],'dolphin'],[[0,14,0,14],'owl']])assert.deepEqual(matchingCharacters(scores).map(c=>c.id),[id]);
 assert.deepEqual(matchingCharacters([7,7,7,7]).map(c=>c.id),characters.map(c=>c.id));
 assert.deepEqual(matchingCharacters([14,0,0,14],'mAVİ / YEŞİL').map(c=>c.id),['dolphin','owl']);
 assert.deepEqual(matchingCharacters([14,0,0,14],'Özel'),[]);
 assert.match(characterHtml([14,0,0,14],'Özel'),/eşleştirmesi bulunmuyor/);
 const html=characterHtml([7,7,7,7]);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.equal((html.match(/data-character=/g)||[]).length,4);
});

test('all four local GLBs load with finite geometry and working animations and a normalized scene',async()=>{
 for(const character of characters) {
  const bytes=await readFile(new URL(`../assets/characters/${character.id}.glb`,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(json.buffers.every(b=>!b.uri),'GLB must be self-contained');
  assert.ok(!json.extensionsRequired?.includes('KHR_draco_mesh_compression'));
  const binOffset=20+bytes.readUInt32LE(12)+8;
  for(const image of json.images||[]){assert.ok(!image.uri,'textures must be embedded');const view=json.bufferViews[image.bufferView],start=binOffset+(view.byteOffset||0);const raw=bytes.subarray(start,start+view.byteLength);assert.ok(raw.length>100);assert.ok(raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||raw.subarray(0,3).equals(Buffer.from([255,216,255])), 'embedded texture must be PNG or JPEG');}
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assert.ok(gltf.animations.length>0);const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());assert.ok(size.toArray().every(v=>Number.isFinite(v)&&v>0));
  let meshes=0;gltf.scene.traverse(node=>{if(!node.isMesh)return;meshes++;assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));});assert.ok(meshes>0);
  const mixer=new AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations[0]).play();
  const snapshot=()=>{gltf.scene.updateMatrixWorld(true);const values=[];gltf.scene.traverse(n=>values.push(...n.matrixWorld.elements));return values;};
  const prepared=prepareCharacter(gltf);assert.ok(Math.max(...prepared.size.toArray())<=2.551);assert.ok(prepared.size.toArray().every(Number.isFinite));prepared.dispose();
  mixer.update(0);const before=snapshot();mixer.update(.5);assert.notDeepEqual(snapshot(),before,`${character.id} must actually move`);
 }
});

// Embedded GLB textures are decoded through Blob URLs in GLTFLoader.
test('manager CSP permits local embedded model textures without third-party origins',async()=>{
 const html=await readFile(new URL('../analiz-982429.html',import.meta.url),'utf8');
 const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 assert.match(csp,/img-src 'self' data: blob:/);assert.match(csp,/connect-src 'self' blob:/);
 assert.match(csp,/script-src 'self';/);
});

test('animated model vertices remain inside desktop and mobile camera framing during rotation',async()=>{
 for(const id of characters.map(c=>c.id)){
  const bytes=await readFile(new URL(`../assets/characters/${id}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const prepared=prepareCharacter(gltf),camera=new PerspectiveCamera(34,1,.1,30);
  for(const aspect of [.6,1,1.65]){
   fitCharacterCamera(camera,prepared.radius,aspect);camera.updateMatrixWorld(true);
   for(const phase of [0,.23,.51,.79])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    prepared.mixer.setTime(prepared.clip.duration*phase);prepared.object.rotation.set(.4,yaw,0);prepared.object.updateMatrixWorld(true);
    prepared.object.traverse(mesh=>{if(!mesh.isMesh)return;
     const count=mesh.geometry.attributes.position.count,step=Math.max(1,Math.floor(count/250));
     for(let i=0;i<count;i+=step){const v=mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).project(camera);
      assert.ok(Math.abs(v.x)<.96&&Math.abs(v.y)<.96&&v.z>-1&&v.z<1,`${id} overflow: aspect ${aspect}, phase ${phase}, yaw ${yaw}: ${v.toArray()}`);
     }
    });
   }
  }
  prepared.dispose();
 }
});
