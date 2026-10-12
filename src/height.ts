export interface Bounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface HeightGrid {file:string;width:number;height:number;bounds:Bounds;spacingX:number;spacingZ:number}
/** Source f32 grids are row-major from north to south. Coordinates are ENU metres. */
export function sampleGrid(grid:HeightGrid,values:Float32Array,x:number,z:number){
 const col=Math.max(0,Math.min(grid.width-1,(x-grid.bounds.minX)/grid.spacingX));
 const row=Math.max(0,Math.min(grid.height-1,(grid.bounds.maxZ-z)/grid.spacingZ));
 const c=Math.min(grid.width-2,Math.floor(col)),r=Math.min(grid.height-2,Math.floor(row)),u=col-c,v=row-r;
 return (values[r*grid.width+c]*(1-u)+values[r*grid.width+c+1]*u)*(1-v)+(values[(r+1)*grid.width+c]*(1-u)+values[(r+1)*grid.width+c+1]*u)*v;
}
/** Match the rendered NW/SW/NE and NE/SW/SE triangles, including the coastal floor.
 * Bilinear DEM interpolation is curved inside a cell and can bury roads beneath
 * its planar render mesh on saddle-shaped slopes. */
export function sampleSurface(grid:HeightGrid,values:Float32Array,x:number,z:number){
 const col=Math.max(0,Math.min(grid.width-1,(x-grid.bounds.minX)/grid.spacingX)),row=Math.max(0,Math.min(grid.height-1,(grid.bounds.maxZ-z)/grid.spacingZ));
 const c=Math.min(grid.width-2,Math.floor(col)),r=Math.min(grid.height-2,Math.floor(row)),u=col-c,v=row-r;
 const nw=Math.max(2.4,values[r*grid.width+c]),ne=Math.max(2.4,values[r*grid.width+c+1]),sw=Math.max(2.4,values[(r+1)*grid.width+c]),se=Math.max(2.4,values[(r+1)*grid.width+c+1]);
 return u+v<=1?nw+(ne-nw)*u+(sw-nw)*v:se+(sw-se)*(1-u)+(ne-se)*(1-v);
}
