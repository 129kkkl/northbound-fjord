import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('E:/Aclaw文件/voxel-guangzhou/node_modules/playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:900,height:600}});
await page.goto('file:///E:/Aclaw%E6%96%87%E4%BB%B6/%E4%BA%A4%E4%BA%92%E4%BD%9C%E5%93%81_%E7%A6%BB%E7%BA%BFHTML/%E5%8C%97%E8%A1%8C_Northbound_%E5%B3%A1%E6%B9%BE%E8%88%AA%E8%AE%B0.html');
await page.waitForFunction(()=>window.__northbound?.state?.drawCalls>0);
await page.screenshot({path:'E:/Aclaw文件/Northbound_源码/qa/debug-scene.png'});
for(const kind of ['reflectionTarget','refractionTarget']){
  const data=await page.evaluate(kind=>{
    const {renderer,[kind]:target}=window.__northbound.inspect,w=target.width,h=target.height,pixels=new Uint8Array(w*h*4);
    renderer.readRenderTargetPixels(target,0,0,w,h,pixels);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),im=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=((h-1-y)*w+x)*4,b=(y*w+x)*4;im.data[b]=pixels[a];im.data[b+1]=pixels[a+1];im.data[b+2]=pixels[a+2];im.data[b+3]=255;}
    ctx.putImageData(im,0,0);return canvas.toDataURL('image/png');
  },kind);
  fs.writeFileSync(`E:/Aclaw文件/Northbound_源码/qa/${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
}
await browser.close();
