from pathlib import Path
p=Path(__file__).resolve().parents[1]/'src/terrain.ts';s=p.read_text(encoding='utf-8')
s=s.replace('coastalBounds:Bounds[]=[])','coastalBounds:Bounds[]=[],beachMask?:{url:string;bounds:Bounds},beachContains:(x:number,z:number)=>boolean=()=>false)')
s=s.replace('const [macro,detail]=values;','const original=values.map(a=>a.slice());const [macro,detail]=values;')
s=s.replace('return sampleGrid(grids[i],values[i],x,z);','return sampleGrid(grids[i],original[i],x,z);')
pos=s.index(' function patch(')
s=s[:pos]+""" if(beachMask){for(const [mat,b]of [[material,region.bounds],[detailMaterial,region.metadata?.detailLandMask?.bounds||region.detailTerrain.bounds]]as[StandardMaterial,Bounds][]){const t=new Texture(beachMask.url,scene,false,false,Texture.BILINEAR_SAMPLINGMODE),q=beachMask.bounds;t.hasAlpha=true;t.getAlphaFromRGB=false;t.wrapU=t.wrapV=Texture.CLAMP_ADDRESSMODE;t.uRotationCenter=t.vRotationCenter=0;t.uScale=(b.maxX-b.minX)/(q.maxX-q.minX);t.vScale=(b.maxZ-b.minZ)/(q.maxZ-q.minZ);t.uOffset=(b.minX-q.minX)/(q.maxX-q.minX);t.vOffset=(q.maxZ-b.maxZ)/(q.maxZ-q.minZ);mat.opacityTexture=t;}}
"""+s[pos:]
s=s.replace('const collisionMeshes:Mesh[]=[];', 'const collisionMeshes:Mesh[]=[];')
s=s.replace('  const land=contains(lb,x,z)?','  const land=beachContains(x,z)|| (contains(lb,x,z)?')
s=s.replace(':raw(x,z)>1;', ':raw(x,z)>1);')
s=s.replace('const coastalMeshes=coastalPatches.map', 'const coastalMeshes=coastalPatches.map')
# The fine coastal replacement remains present at every radius; budget its far mesh.
pos=s.index(' // Alpha-tested sea holes')
s=s[:pos]+""" const coastalLow=coastalPatches.map((bounds,i)=>{const width=Math.round((bounds.maxX-bounds.minX)/40)+1,height=Math.round((bounds.maxZ-bounds.minZ)/40)+1,g:HeightGrid={file:'',width,height,bounds,spacingX:40,spacingZ:40},a=new Float32Array(width*height);for(let r=0;r<height;r++)for(let c=0;c<width;c++)a[r*width+c]=sample(bounds.minX+c*40,bounds.maxZ-r*40);const localTexture=contains(region.detailTerrain.bounds,bounds.minX,bounds.minZ)&&contains(region.detailTerrain.bounds,bounds.maxX,bounds.maxZ);const m=patch(g,a,1,'coastal low ground '+i,false,localTexture,true);m.setEnabled(false);return m;});
"""+s[pos:]
s=s.replace('return {sample,raw,collisionMeshes,regionalMesh,detailedMesh,landmarkMeshes,coastalMeshes,material};','return {sample,raw,collisionMeshes,regionalMesh,detailedMesh,landmarkMeshes,coastalMeshes,material,setDetail(radius:number,focus:{x:number;z:number}){for(let i=0;i<coastalPatches.length;i++){const b=coastalPatches[i],distance=Math.hypot(Math.max(b.minX-focus.x,0,focus.x-b.maxX),Math.max(b.minZ-focus.z,0,focus.z-b.maxZ)),near=radius<3500&&distance<1800;coastalMeshes[i].setEnabled(near);coastalLow[i].setEnabled(!near);}}};')
p.write_text(s,encoding='utf-8')
