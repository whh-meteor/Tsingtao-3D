import { Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';

/** Photo-informed reconstruction, not a measured conservation model.
 * Published facts: yellow glazed double octagonal roofs, 24 round columns,
 * 151m² footprint and 34 spiral steps. See docs/pavilion-references.md.
 * position.y is the existing pier deck; this module adds no artificial terrace.
 */
export function buildPavilion(scene: Scene, position: Vector3, shadows: ShadowGenerator) {
  const meshes: Mesh[] = [], collisionMeshes: Mesh[] = [];
  const materials: StandardMaterial[] = [], textures: DynamicTexture[] = [];
  // Front face looks towards the OSM bridge entrance, north and slightly west.
  const front = Math.atan2(151.965 - (-223.4), -181.635 - (-81.69));
  const start = front - Math.PI / 8;
  const point = (r: number, angle: number, y: number) => new Vector3(r * Math.cos(angle), y, r * Math.sin(angle));
  const mat = (name: string, color: string, shine = .015) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(shine, shine, shine); m.specularPower = 36;
    m.useLogarithmicDepth = true; m.backFaceCulling = false; materials.push(m); return m;
  };
  const stone = mat('Huilan pale granite and plaster', '#c4c1b8');
  const red = mat('Huilan deep red lacquer round columns', '#8c2a22', .055);
  const painted = mat('Huilan polychrome bracket beams', '#ffffff');
  const gold = mat('Huilan YELLOW glazed roof tiles', '#ffffff', .19);
  const glass = mat('Huilan enclosed window lattice', '#ffffff', .065);
  const plaqueMat = mat('Huilan blue calligraphy plaque', '#ffffff');
  const procedural = (name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const t = new DynamicTexture(name, { width: w, height: h }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    draw(t.getContext() as CanvasRenderingContext2D); t.update(false); t.anisotropicFilteringLevel = 8;
    textures.push(t); return t;
  };
  gold.diffuseTexture = procedural('Original yellow glazed tile texture', 256, 256, ctx => {
    ctx.fillStyle = '#cfa64f'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, '#8e6927'); g.addColorStop(.24, '#ddbb66'); g.addColorStop(.45, '#ead086');
      g.addColorStop(.74, '#c9a14b'); g.addColorStop(1, '#94742e');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 32, 256);
      for (let y = 0; y < 256; y += 42) {
        ctx.strokeStyle = 'rgba(95,67,23,.36)'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x + 1, y + 3); ctx.quadraticCurveTo(x + 16, y + 10, x + 31, y + 3); ctx.stroke();
      }
    }
  });
  gold.diffuseTexture.wrapU = Texture.WRAP_ADDRESSMODE; gold.diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  glass.diffuseTexture = procedural('Original red lattice windows', 256, 256, ctx => {
    ctx.fillStyle = '#34494c'; ctx.fillRect(0, 0, 256, 256);
    const g = ctx.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, 'rgba(168,195,189,.23)'); g.addColorStop(1, 'rgba(20,36,40,.08)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = '#874434'; ctx.lineWidth = 7;
    for (let x = -128; x < 384; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 256, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + 256, 0); ctx.stroke();
    }
    ctx.strokeStyle = '#571e18'; ctx.lineWidth = 11; ctx.strokeRect(5, 5, 246, 246);
    ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
  });
  plaqueMat.diffuseTexture = procedural('Original Huilan plaque typography', 768, 256, ctx => {
    ctx.fillStyle = '#193c72'; ctx.fillRect(0, 0, 768, 256);
    ctx.strokeStyle = '#c7b66c'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, 744, 232);
    ctx.strokeStyle = '#436391'; ctx.lineWidth = 3; ctx.strokeRect(27, 27, 714, 202);
    // Read right-to-left on the traditional front plaque. Original typeset text, no photo texture.
    ctx.fillStyle = '#e6e0c7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 164px "KaiTi", "STKaiti", "Noto Serif SC", serif';
    ctx.fillText('閣 瀾 回', 384, 137);
  });
  class Batch {
    p: number[] = []; ix: number[] = []; uv: number[] = []; colors: number[] = [];
    tint = Color3.White();
    constructor(public name: string, public material: StandardMaterial) {}
    tri(a: Vector3, b: Vector3, c: Vector3, uv: number[][] = [[0, 0], [1, 0], [0, 1]]) {
      const n = this.p.length / 3; for (const p of [a, b, c]) this.p.push(p.x, p.y, p.z);
      this.ix.push(n, n + 2, n + 1); this.uv.push(...uv.flat());
      for (let i = 0; i < 3; i++) this.colors.push(this.tint.r, this.tint.g, this.tint.b, 1);
    }
    quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uv: number[][] = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      this.tri(a, b, c, [uv[0], uv[1], uv[2]]); this.tri(a, c, d, [uv[0], uv[2], uv[3]]);
    }
    box(center: Vector3, width: number, height: number, depth: number, angle = 0) {
      const v = (x: number, y: number, z: number) => new Vector3(center.x + x * Math.cos(angle) + z * Math.sin(angle), center.y + y, center.z - x * Math.sin(angle) + z * Math.cos(angle));
      const x = width / 2, y = height / 2, z = depth / 2;
      this.quad(v(-x,y,-z),v(-x,y,z),v(x,y,z),v(x,y,-z)); this.quad(v(-x,-y,z),v(-x,-y,-z),v(x,-y,-z),v(x,-y,z));
      this.quad(v(-x,-y,-z),v(-x,y,-z),v(x,y,-z),v(x,-y,-z));this.quad(v(x,-y,z),v(x,y,z),v(-x,y,z),v(-x,-y,z));
      this.quad(v(-x,-y,z),v(-x,y,z),v(-x,y,-z),v(-x,-y,-z));this.quad(v(x,-y,-z),v(x,y,-z),v(x,y,z),v(x,-y,z));
    }
    cylinder(center: Vector3, radius: number, height: number, sides = 16) {
      for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides, b = (i + 1) * Math.PI * 2 / sides;
        const p = (angle: number, y: number) => new Vector3(center.x + radius * Math.cos(angle), center.y + y, center.z + radius * Math.sin(angle));
        this.quad(p(a,-height/2),p(a,height/2),p(b,height/2),p(b,-height/2));
        this.tri(new Vector3(center.x,center.y+height/2,center.z),p(a,height/2),p(b,height/2));
      }
    }
    beam(a: Vector3, b: Vector3, width: number, height: number) {
      this.box(a.add(b).scale(.5), width, height, Vector3.Distance(a, b), Math.atan2(b.x-a.x,b.z-a.z));
    }
    finish(collision = false) {
      if (!this.p.length) return;
      const mesh = new Mesh(this.name, scene), vd = new VertexData(), normals: number[] = [];
      vd.positions = this.p; vd.indices = this.ix; vd.uvs = this.uv; vd.colors = this.colors;
      VertexData.ComputeNormals(this.p, this.ix, normals); vd.normals = normals; vd.applyToMesh(mesh);
      mesh.material = this.material; mesh.position.copyFrom(position); mesh.receiveShadows = true;
      mesh.metadata = { kind: 'huilan-pavilion', source: 'Photo-informed procedural reconstruction; published architectural facts; dimensions estimated', columnCount: 24, roofColor: 'yellow glazed tiles' };
      shadows.addShadowCaster(mesh); meshes.push(mesh); if (collision) collisionMeshes.push(mesh);
    }
  }
  const base = new Batch('Huilan compact granite foundation and wall plinth', stone);
  const columns = new Batch('Huilan 24 round lacquered columns', red);
  const wood = new Batch('Huilan painted brackets and beams', painted);
  const roofs = new Batch('Huilan two curved YELLOW glazed octagonal roofs', gold);
  const windows = new Batch('Huilan enclosed eight-sided windows', glass);
  const sign = new Batch('Huilan front blue plaque 回澜阁', plaqueMat);
  const interior = new Batch('Huilan 34 spiral stair treads', stone);
  const ringPoint = (r: number, i: number, y: number) => point(r, start + i * Math.PI / 4, y);
  // 151m² regular octagon circumradius = sqrt(151/(2sqrt(2))).
  const footprintRadius = Math.sqrt(151 / (2 * Math.sqrt(2)));
  for (let i = 0; i < 8; i++) {
    const a = ringPoint(footprintRadius, i, .12), b = ringPoint(footprintRadius, i + 1, .12);
    base.tri(new Vector3(0,.12,0),a,b); base.quad(a,new Vector3(a.x,-.16,a.z),new Vector3(b.x,-.16,b.z),b);
    const corner = start + i * Math.PI / 4;
    // Three eight-column rings: ground eave, ground inner hall, upper hall.
    // Published total is 24; the precise hidden structural layout remains an estimate.
    for (const [radius,y,h,r] of [[7.05,2.37,4.5,.23],[5.38,2.37,4.5,.2],[5.04,6.72,2.25,.17]]) {
      const c = point(radius,corner,y); columns.cylinder(c,r,h);
      if (y < 3) base.cylinder(new Vector3(c.x,.22,c.z),r+.07,.2);
    }
    const pa = ringPoint(6.32, i, .45), pb = ringPoint(6.32, i+1,.45);
    const tangent = pb.subtract(pa).normalize(), length = Vector3.Distance(pa,pb), middle = pa.add(pb).scale(.5);
    const angle = Math.atan2(tangent.x,tangent.z);
    // Ground front face keeps a real doorway instead of a solid featureless pavilion.
    if (i === 0) {
      const offset=length*.36;
      for(const side of [-1,1]){
        const c=middle.add(tangent.scale(offset));c.y=1.75;
        base.box(new Vector3(c.x,.58,c.z),.20,.92,length*.26,angle);
        windows.box(c,.13,1.9,length*.26,angle);
      }
    } else {
      base.box(new Vector3(middle.x,.58,middle.z),.20,.92,length,angle);
      windows.box(new Vector3(middle.x,2.31,middle.z),.13,2.5,length-.35,angle);
    }
    for (const [r,y,h] of [[6.32,3.82,.28],[5.03,5.81,.24],[5.03,7.78,.25]]) {
      const a=ringPoint(r,i,y),b=ringPoint(r,i+1,y);wood.tint=Color3.FromHexString('#245e59');wood.beam(a,b,.26,h);
    }
    const ua=ringPoint(5.03,i,6.78),ub=ringPoint(5.03,i+1,6.78);
    windows.beam(ua,ub,.13,1.68); // enclosed upper storey on all eight faces
    // Bracket tiers and cream/red/blue painted fascias beneath each roof.
    for(const [r,y,span] of [[7.05,4.31,1.0],[5.04,7.85,.76]]) {
      const c=point(r,corner,y);const rotation=-corner;
      wood.tint=Color3.FromHexString('#1c5658');wood.box(c,.65,.18,span,rotation);
      wood.tint=Color3.FromHexString('#397787');wood.box(c.add(new Vector3(0,.19,0)),.93,.15,span+.35,rotation);
      wood.tint=Color3.FromHexString('#bfa467');wood.box(c.add(new Vector3(0,.34,0)),1.1,.10,span+.58,rotation);
      wood.tint=Color3.FromHexString('#843c2d');wood.box(c.add(new Vector3(0,-.16,0)),.28,.13,.38,rotation);
    }
    for (const [radius,y] of [[7.35,4.65],[5.6,8.05]]) {
      const a=ringPoint(radius,i,y),b=ringPoint(radius,i+1,y);
      wood.tint=Color3.FromHexString('#226568');wood.beam(a,b,.34,.28);
      wood.tint=Color3.FromHexString('#304e6b');wood.beam(a.add(new Vector3(0,.16,0)),b.add(new Vector3(0,.16,0)),.36,.07);
      for(let j=1;j<9;j++){
        const c=Vector3.Lerp(a,b,j/9);wood.tint=Color3.FromHexString(j%2?'#c7ac62':'#7d3729');wood.box(c,.11,.17,.13);
      }
    }
  }
  type RoofRing={r:number;y:number;lift:number};
  const roof=(rings:RoofRing[])=>{
    const radial=(ring:RoofRing,face:number,t:number)=>{
      const p=Vector3.Lerp(ringPoint(ring.r,face,ring.y),ringPoint(ring.r,face+1,ring.y),t);
      p.y+=ring.lift*Math.pow(Math.abs(t*2-1),4);return p;
    };
    for(let face=0;face<8;face++)for(let k=0;k<rings.length-1;k++)for(let j=0;j<16;j++){
      const t=j/16,q=(j+1)/16,a=radial(rings[k],face,t),b=radial(rings[k+1],face,t),c=radial(rings[k+1],face,q),d=radial(rings[k],face,q);
      const width=Vector3.Distance(ringPoint(rings[k+1].r,face,0),ringPoint(rings[k+1].r,face+1,0));
      // This annulus runs inner→outer→next sector, whose geometric cross has -Y.
      // Babylon's default ComputeNormals plus Batch.tri's index reversal must
      // therefore receive the reversed patch winding to produce upward roof normals.
      roofs.quad(a,d,c,b,[[t*width/2,rings[k].r/2],[q*width/2,rings[k].r/2],[q*width/2,rings[k+1].r/2],[t*width/2,rings[k+1].r/2]]);
    }
    // Thick visible eave edge and corner ridge strips following the curved profile.
    const edge=rings[rings.length-1];
    for(let face=0;face<8;face++){
      for(let j=0;j<16;j++){
        const a=radial(edge,face,j/16),b=radial(edge,face,(j+1)/16);
        wood.tint=Color3.FromHexString('#255b57');wood.beam(a.add(new Vector3(0,-.1,0)),b.add(new Vector3(0,-.1,0)),.17,.18);
      }
      for(let k=0;k<rings.length-1;k++){
        const a=radial(rings[k],face,0),b=radial(rings[k+1],face,0);
        // True sloping ridge ribbon, unlike a horizontal box at each segment.
        const angle=start+face*Math.PI/4,n=new Vector3(-Math.sin(angle)*.075,0,Math.cos(angle)*.075);
        roofs.quad(a.add(n).add(new Vector3(0,.07,0)),b.add(n).add(new Vector3(0,.07,0)),b.subtract(n).add(new Vector3(0,.07,0)),a.subtract(n).add(new Vector3(0,.07,0)));
      }
    }
  };
  roof([{r:5.14,y:6.20,lift:0},{r:6.3,y:5.62,lift:.05},{r:7.45,y:5.03,lift:.12},{r:8.35,y:4.80,lift:.24},{r:9.0,y:4.89,lift:.38},{r:9.55,y:5.13,lift:.53}]);
  roof([{r:.13,y:11.13,lift:0},{r:1.8,y:10.57,lift:0},{r:3.5,y:9.69,lift:.015},{r:5.15,y:8.87,lift:.065},{r:6.25,y:8.43,lift:.15},{r:7.1,y:8.36,lift:.26},{r:7.73,y:8.56,lift:.46}]);
  roofs.cylinder(new Vector3(0,11.29,0),.23,.44,12);roofs.cylinder(new Vector3(0,11.6,0),.12,.30,12);
  // Upper floor is an annulus: leave the central staircase opening.
  for(let i=0;i<64;i++){
    const a=i*Math.PI*2/64,b=(i+1)*Math.PI*2/64;
    interior.quad(point(1.36,a,4.63),point(5.0,a,4.63),point(5.0,b,4.63),point(1.36,b,4.63));
  }
  for(let i=0;i<34;i++){
    const a=front+i*Math.PI*2/34,b=front+(i+1)*Math.PI*2/34,y=.12+(i+1)*4.51/34;
    interior.quad(point(.31,a,y),point(1.31,a,y),point(1.31,b,y),point(.31,b,y));
    interior.quad(point(.31,a,y),point(.31,a,y-4.51/34),point(1.31,a,y-4.51/34),point(1.31,a,y));
  }
  wood.tint=Color3.FromHexString('#48565d');wood.cylinder(new Vector3(0,2.36,0),.12,4.55,12);
  const center=point(6.02,front,4.13),normal=new Vector3(Math.cos(front),0,Math.sin(front)),tangent=new Vector3(-normal.z,0,normal.x);
  sign.quad(center.subtract(tangent.scale(1.68)).add(new Vector3(0,-.53,0)),center.subtract(tangent.scale(1.68)).add(new Vector3(0,.53,0)),center.add(tangent.scale(1.68)).add(new Vector3(0,.53,0)),center.add(tangent.scale(1.68)).add(new Vector3(0,-.53,0)),[[0,1],[0,0],[1,0],[1,1]]);
  base.finish(true);columns.finish(true);wood.finish();roofs.finish();windows.finish(true);sign.finish();interior.finish();
  return {meshes,collisionMeshes,dispose(){for(const mesh of meshes){shadows.removeShadowCaster(mesh);mesh.dispose();}for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
