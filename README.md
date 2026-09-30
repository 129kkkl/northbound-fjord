# Northbound. / 北行

成品：`E:\Aclaw文件\交互作品_离线HTML\北行_Northbound_峡湾航记.html`。双击打开即可运行，不依赖网络或本目录中的任何文件。

## 构建

`node build.mjs`。脚本将工作区已有的 Three.js r160 UMD 版本与 `scene.js`、`index.template.html` 打包，执行 JavaScript 解析与外部资源检查，再写出单个 HTML 文件。需要在本机工作区构建；成品运行不需要 Node.js。

## 验收

`qa.mjs` 检查直接 `file://` 打开、转向、镜头、光照、划桨水痕、暂停、移动触控、近岸阻挡、声音启动、本地 HTTP 打开与控制台错误。`qa-gallery.mjs` 生成船侧、船首、聚落、瀑布及月光低机位截图。截图及 JSON 在 `qa/` 中。浏览器自动化使用本机 Chrome 与 Playwright 的软件 WebGL 后端；不同设备的实际帧率未作固定承诺。

## 资源

Three.js 版权属于 Three.js Authors，MIT 许可声明保留在成品的内嵌库中。木、岩、地面、布料贴图及声音由脚本程序生成；没有第三方图片、音频、字体或远程请求。
