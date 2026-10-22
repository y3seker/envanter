"""Pack the user-supplied licensed downloads as self-contained GLB files.
Run from the repository root. Raw downloads stay in ignored glbs/.
"""
from pathlib import Path
import json,struct,zipfile,shutil,io,mimetypes
root=Path(__file__).resolve().parent.parent
source=root/'glbs'; dest=root/'assets/characters';dest.mkdir(parents=True,exist_ok=True)
def pack_zip(filename,out):
 with zipfile.ZipFile(source/filename) as archive:
  scene=json.loads(archive.read('scene.gltf'));data=bytearray(archive.read(scene['buffers'][0]['uri']))
  for image in scene.get('images',[]):
   uri=image.pop('uri');data.extend(b'\0'*(-len(data)%4));image['bufferView']=len(scene.setdefault('bufferViews',[]));image['mimeType']=mimetypes.guess_type(uri)[0] or 'application/octet-stream'
   raw=archive.read(uri);scene['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(raw)});data.extend(raw)
  scene['buffers']=[{'byteLength':len(data)}];encoded=json.dumps(scene,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*(-len(encoded)%4);data.extend(b'\0'*(-len(data)%4))
  result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data
  (dest/out).write_bytes(result)
  (dest/(out.replace('.glb','-license.txt'))).write_bytes(archive.read('license.txt'))
with zipfile.ZipFile(source/'black-panther.zip') as archive:(dest/'panther.glb').write_bytes(archive.read('source/black panther.glb'))
with zipfile.ZipFile(source/'black_panther.zip') as archive:(dest/'panther-license.txt').write_bytes(archive.read('license.txt'))
shutil.copyfile(source/'game-ready_dolphin_swimming.glb',dest/'dolphin.glb')
with zipfile.ZipFile(source/'game-ready_dolphin_swimming.zip') as archive:(dest/'dolphin-license.txt').write_bytes(archive.read('license.txt'))
shutil.copyfile(source/'owl.glb',dest/'owl.glb')
with zipfile.ZipFile(source/'owl.zip') as archive:
 with zipfile.ZipFile(io.BytesIO(archive.read('source/owl_animation_fly.zip'))) as nested:(dest/'owl-license.txt').write_bytes(nested.read('license.txt'))
pack_zip('merak_burung_poli_rendah.zip','peacock.glb')
for p in dest.glob('*.glb'):print(p.name,p.stat().st_size)
