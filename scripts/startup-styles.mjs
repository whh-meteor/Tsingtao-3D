// Keep the loading page independent of a separate stylesheet request.
export function startupStylesPlugin(){return{name:'qingdao-inline-styles',transformIndexHtml:{order:'post',handler(html,{bundle}){
 if(!bundle)return html;
 return html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,tag=>{const file=tag.match(/href="\/([^"]+)"/)?.[1],asset=bundle[file];return asset?.type==='asset'?'<style>'+asset.source+'</style>':tag;});
}}};}
