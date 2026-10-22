import * as THREE from './vendor/three.module.min.js';
// Fit the animated envelope, not the source file's arbitrary units or origin.
export function prepareCharacter(gltf) {
 const content=new THREE.Group(),wrapper=new THREE.Group(),model=gltf.scene;
 wrapper.add(content);content.add(model);
 const clip=gltf.animations.find(c=>/idle|swim|fly/i.test(c.name))||gltf.animations[0];
 const mixer=new THREE.AnimationMixer(model),bounds=new THREE.Box3();
 if(clip){mixer.clipAction(clip).play();for(let i=0;i<=48;i++){mixer.setTime(clip.duration*i/48);model.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(model,true));}mixer.setTime(0);}
 else bounds.setFromObject(model,true);
 if(bounds.isEmpty())throw Error('Modelin görünür geometrisi bulunamadı.');
 bounds.expandByScalar(bounds.getSize(new THREE.Vector3()).length()*.015);
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const scale=2.55/Math.max(size.x,size.y,size.z,.001);
 content.scale.setScalar(scale);content.position.copy(center).multiplyScalar(-scale);
 return {object:wrapper,mixer,clip,radius:size.length()*scale/2,size:size.multiplyScalar(scale),dispose:()=>{mixer.stopAllAction();mixer.uncacheRoot(model);}};
}

// A bounding sphere stays valid while the user rotates the model. Fit against
// the narrower camera angle, including depth; a fixed Z distance can crop wings.
export function fitCharacterCamera(camera,radius,aspect) {
 camera.aspect=aspect;
 const vertical=THREE.MathUtils.degToRad(camera.fov/2);
 const horizontal=Math.atan(Math.tan(vertical)*aspect);
 const distance=radius/Math.sin(Math.min(vertical,horizontal))*1.18;
 camera.position.set(0,.065,1).normalize().multiplyScalar(distance);
 camera.near=Math.max(.01,distance-radius*1.5);
 camera.far=distance+radius*4+5;
 camera.lookAt(0,0,0);camera.updateProjectionMatrix();
}
