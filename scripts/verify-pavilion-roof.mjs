// Evaluate the actual pavilion Batch and roof function without browser textures.
// This catches Babylon's clockwise/ComputeNormals convention, not just a cross-product guess.
import fs from 'node:fs';
import ts from 'typescript';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
const source=fs.readFileSync(new URL('../src/pavilion.ts',import.meta.url),'utf8');
const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const batch=js.slice(js.indexOf('class Batch {'),js.indexOf('const base = new Batch'));
const roof=js.slice(js.indexOf('const roof = (rings)'),js.indexOf('roof([{'));
const calls=js.slice(js.indexOf('roof([{'),js.indexOf('roofs.cylinder('));
const build=new Function('Vector3','Color3','VertexData',`
  const start=1.44;
  const point=(r,a,y)=>new Vector3(r*Math.cos(a),y,r*Math.sin(a));
  const ringPoint=(r,i,y)=>point(r,start+i*Math.PI/4,y);
  ${batch}
  const roofs=new Batch('roof',null),wood={beam(){},tint:null};
  ${roof}
  ${calls}
  return roofs;
`);
const geometry=build(Vector3,Color3,VertexData),normals=[];
VertexData.ComputeNormals(geometry.p,geometry.ix,normals);
const y=normals.filter((_,i)=>i%3===1);
const nonUp=y.filter(v=>!(v>0)).length;
console.log(JSON.stringify({triangles:geometry.ix.length/3,vertices:y.length,minNormalY:Math.min(...y),maxNormalY:Math.max(...y),nonUpwardNormals:nonUp}));
if(nonUp)throw new Error('Pavilion roof/raised ridge contains non-upward surface normals');
