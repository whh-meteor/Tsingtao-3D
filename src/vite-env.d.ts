/// <reference types="vite/client" />
declare module 'virtual:asset-chunks' {
 const manifest:Record<string,import('./asset-loader').ChunkedAsset>;
 export default manifest;
}
