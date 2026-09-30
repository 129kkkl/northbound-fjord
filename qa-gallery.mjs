import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('E:/Aclaw文件/voxel-guangzhou/node_modules/playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const issues=[];page.on('console',m=>{if(m.type()==='error')issues.push(m.text().slice(0,500));});page.on('pageerror',e=>issues.push(String(e).slice(0,500)));
await page.goto('file:///E:/Aclaw%E6%96%87%E4%BB%B6/%E4%BA%A4%E4%BA%92%E4%BD%9C%E5%93%81_%E7%A6%BB%E7%BA%BFHTML/%E5%8C%97%E8%A1%8C_Northbound_%E5%B3%A1%E6%B9%BE%E8%88%AA%E8%AE%B0.html');
await page.waitForFunction(()=>window.__northbound?.state?.drawCalls>0);
const out='E:/Aclaw文件/Northbound_源码/qa';fs.mkdirSync(out,{recursive:true});
const shots=[
  ['side-boat',0,1.48,.11,17,'dawn'],
  ['bow-boat',0,2.55,.16,18,'dawn'],
  ['village-low',135,1.42,-.03,25,'dawn'],
  ['waterfall-low',245,-1.50,-.03,25,'overcast'],
  ['night-boat',455,1.10,.13,19,'moon']
];
for(const [name,x,yaw,pitch,dist,light] of shots){
  await page.evaluate(({x,yaw,pitch,dist,light})=>{const a=window.__northbound;a.setPause(true);a.setPosition(x,8*Math.sin(x*.012)+4*Math.sin(x*.037));a.setView(1,yaw,pitch,dist);a.selectLight(light);},{x,yaw,pitch,dist,light});
  await page.waitForTimeout(light==='moon'?3800:1200);
  await page.screenshot({path:`${out}/${name}.png`});
}
console.log(JSON.stringify({issues,state:await page.evaluate(()=>window.__northbound.state)},null,2));
await browser.close();
