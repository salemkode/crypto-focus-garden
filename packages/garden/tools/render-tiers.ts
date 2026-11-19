/** Dependency-free CPU isometric preview renderer. Run: bun tools/render-tiers.ts */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTierModel, buildGrowthModel, buildWitheredModel, buildPedestal } from "../src/tiers";
import type { VoxelModel } from "../src/voxel";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../previews");
mkdirSync(out,{recursive:true});
const species = ["oak","cherry","pine","maple","birch","cash"] as const;
const tiers = ["sprout","tree","bigTree","house"] as const;
const range = (n: number) => Array.from({length:n},(_,i)=>i);
function crc(bytes: Uint8Array) {
 const state = { value: 0xffffffff };
 for (const b of bytes) {
  state.value ^= b;
  for (const _ of range(8)) state.value = (state.value >>> 1) ^ ((state.value & 1) ? 0xedb88320 : 0);
 }
 return (state.value ^ 0xffffffff) >>> 0;
}
function chunk(name: string, bytes: Uint8Array) {
 const data = Buffer.concat([Buffer.from(name),bytes]);
 const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
 const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(data));
 return Buffer.concat([header,data,tail]);
}
function png(path: string, pixels: Uint8Array, w: number, h: number) {
 const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h,4); header[8]=8; header[9]=6;
 const rows = range(h).map(y=>Buffer.concat([Buffer.from([0]),pixels.subarray(y*w*4,(y+1)*w*4)]));
 writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.concat(rows))),chunk("IEND",Buffer.alloc(0))]));
}
function render(model: VoxelModel, w=256, h=256, fixedScale?: number) {
 const g = model.toGeometry(0);
 const pos = g.getAttribute("position"); const colors = g.getAttribute("color"); const normals = g.getAttribute("normal");
 const ix = g.getIndex()!;
 const project = (x: number,y: number,z: number) => ({x:(x-z)*.866,y:(x+z)*.5-y,d:x+y+z});
 const vertices = range(pos.count).map(i=>project(pos.getX(i),pos.getY(i),pos.getZ(i)));
 const bounds = { x0:Math.min(...vertices.map(v=>v.x)), x1:Math.max(...vertices.map(v=>v.x)), y0:Math.min(...vertices.map(v=>v.y)), y1:Math.max(...vertices.map(v=>v.y)) };
 const scale = fixedScale ?? Math.min((w*.84)/(bounds.x1-bounds.x0),(h*.84)/(bounds.y1-bounds.y0));
 const points = vertices.map(v=>({x:w/2+(v.x-(bounds.x0+bounds.x1)/2)*scale,y:h-h*.086+(v.y-bounds.y1)*scale,d:v.d}));
 const pixels = new Uint8Array(w*h*4);
 const depth = new Float32Array(w*h).fill(-Infinity);
 for (const y of range(h)) for (const x of range(w)) {
  const shadow = Math.max(0,1-((x-w/2)/(w*.32))**2-((y-h+h*.086)/12)**2)*.12;
  const i=(y*w+x)*4; pixels[i]=244*(1-shadow);pixels[i+1]=239*(1-shadow);pixels[i+2]=225*(1-shadow);pixels[i+3]=255;
 }
 // Painter's order plus a depth buffer handles intersecting canopy/roof faces.
 const faces = range(ix.count/3).map(t=>[ix.getX(t*3),ix.getX(t*3+1),ix.getX(t*3+2)]).filter(([a])=>normals.getX(a)+normals.getY(a)+normals.getZ(a)>0).sort((a,b)=>a.reduce((s,i)=>s+points[i].d,0)-b.reduce((s,i)=>s+points[i].d,0));
 const srgb = (v: number) => 255*(v<=.0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055);
 for (const [a,b,c] of faces) {
  const A=points[a],B=points[b],C=points[c];
  const denominator=(B.y-C.y)*(A.x-C.x)+(C.x-B.x)*(A.y-C.y);
  if (Math.abs(denominator)<.0001) continue;
  const shade=normals.getY(a)>.5 ? 1 : normals.getX(a)>.5 ? .82 : .65;
  const rgb=[colors.getX(a),colors.getY(a),colors.getZ(a)].map(v=>srgb(v)*shade);
  for (const y of range(Math.max(0,Math.ceil(Math.max(A.y,B.y,C.y))-Math.floor(Math.min(A.y,B.y,C.y))+1)).map(i=>i+Math.floor(Math.min(A.y,B.y,C.y)))) {
   if (y<0 || y>=h) continue;
   for (const x of range(Math.max(0,Math.ceil(Math.max(A.x,B.x,C.x))-Math.floor(Math.min(A.x,B.x,C.x))+1)).map(i=>i+Math.floor(Math.min(A.x,B.x,C.x)))) {
    if (x<0 || x>=w) continue;
    const u=((B.y-C.y)*(x+.5-C.x)+(C.x-B.x)*(y+.5-C.y))/denominator;
    const v=((C.y-A.y)*(x+.5-C.x)+(A.x-C.x)*(y+.5-C.y))/denominator;
    if (u<0 || v<0 || u+v>1) continue;
    const d=u*A.d+v*B.d+(1-u-v)*C.d;
    if (d<depth[y*w+x]) continue;
    depth[y*w+x]=d;
    const i=(y*w+x)*4; pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];
   }
  }
 }
 g.dispose(); return pixels;
}
function sheet(name: string, models: VoxelModel[], columns: number, tile=256, scale?: number) {
 const w=columns*tile,h=Math.ceil(models.length/columns)*tile;
 const pixels=new Uint8Array(w*h*4);
 models.forEach((m,i)=>{
  const p=render(m,tile,tile,scale);
  for (const y of range(tile)) pixels.set(p.subarray(y*tile*4,(y+1)*tile*4),((Math.floor(i/columns)*tile+y)*w+(i%columns)*tile)*4);
 });
 png(resolve(out,name),pixels,w,h);
}
const models=tiers.flatMap(t=>species.map(s=>buildTierModel(t,s,42)));
sheet("all-tiers.png",models,6);
sheet("thumbnails.png",models,6,64);
for (const t of tiers) for (const s of species) png(resolve(out,`${t}-${s}.png`),render(buildTierModel(t,s,42)),256,256);
for (const t of tiers) sheet(`growth-${t}.png`,species.flatMap(s=>range(7).map(i=>buildGrowthModel(s,i/6,42,t))),7,192,t === "sprout" ? 22 : t === "tree" ? 10 : 6);
sheet("withered.png",species.map(s=>buildWitheredModel(s,42)),6);
sheet("pedestals.png",([1,2,3] as const).map(buildPedestal),3,256,16);
writeFileSync(resolve(out,"counts.json"),JSON.stringify(Object.fromEntries(tiers.map(t=>[t,Object.fromEntries(species.map(s=>[s,buildTierModel(t,s,42).size]))])),null,2));
console.log(`Rendered previews into ${out}`);
