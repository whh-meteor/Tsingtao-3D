/// <reference types="vite/client" />
declare module 'virtual:module-worker-url' {const url:string;export default url;}
declare module 'virtual:asset-chunks' {
 const manifest:Record<string,import('./asset-loader').ChunkedAsset>;
 export default manifest;
}
