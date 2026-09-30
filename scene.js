(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const canvas = $('#scene');
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const quality = { pixelRatio: Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.6), reflection: mobile ? 384 : 640, shadow: mobile ? 1024 : 2048 };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    $('#error-detail').textContent = String(e.message || e);
    $('#error').classList.add('show');
    $('#loading').classList.add('done');
    return;
  }
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91a4a6);
  scene.fog = new THREE.FogExp2(0x91a4a6, .0065);
  const camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, .08, 1000);
  camera.position.set(-17, 8, 15);
  const reflectionCamera = camera.clone();
  const reflectionTarget = new THREE.WebGLRenderTarget(quality.reflection, Math.round(quality.reflection * innerHeight / innerWidth), { depthBuffer: true, stencilBuffer: false });
  reflectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const refractionTarget = new THREE.WebGLRenderTarget(Math.max(320, Math.round(innerWidth * (mobile ? .45 : .58))), Math.max(220, Math.round(innerHeight * (mobile ? .45 : .58))), { depthBuffer: true, stencilBuffer: false });
  refractionTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Clock();
  const temp = new THREE.Vector3(), temp2 = new THREE.Vector3(), temp3 = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const shipRoot = new THREE.Group();
  scene.add(shipRoot);
  let elapsed = 0, paused = false, frame = 0, errorCount = 0;
  addEventListener('error',()=>errorCount++);addEventListener('unhandledrejection',()=>errorCount++);
  let cameraMode = 0, orbitYaw = .45, orbitPitch = .20, cameraDistance = 21, cameraDrag = false;
  const keys = new Set(), holds = new Set();
  const state = { x: 0, z: 0, yaw: 0, speed: 3.5, targetSpeed: 3.5, rudder: 0, auto: true, lighting: 'dawn', chapter: 0, travelled: 0 };
  const seeded = (() => { let s = 0x2ee71c43; return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296; })();
  const clamp = THREE.MathUtils.clamp;
  const mix = THREE.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash2 = (x, z) => { const a = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return a - Math.floor(a); };
  function noise2(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return mix(mix(hash2(ix, iz), hash2(ix + 1, iz), u), mix(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
  }
  function centerline(x) { return 8 * Math.sin(x * .012) + 4 * Math.sin(x * .037); }
  function centerSlope(x) { return .096 * Math.cos(x * .012) + .148 * Math.cos(x * .037); }
  function groundHeight(x, z) {
    const side = z >= centerline(x) ? 1 : -1;
    const d = Math.abs(z - centerline(x));
    const n = (noise2(x * .038, z * .042) - .5) * 1.25 + (noise2(x * .116, z * .105) - .5) * .40;
    if (d < 24) return -5 + .008 * d * d + n * .12;
    let h;
    if (d < 34) h = -.392 + .19 * (d - 24);
    else if (d < 49) h = 1.508 + (d - 34) * 1.98;
    else h = 31.2 + (d - 49) * .18 + 5 * Math.sin(x * .018 + side) * smooth(50, 90, d) + 4 * noise2(x * .012, z * .013);
    const village = Math.exp(-Math.pow((x - (side < 0 ? 135 : 455)) / 42, 2));
    const terrace = 1.25 + Math.max(0, d - 34) * .068 + Math.max(0, d - 65) * .95;
    h = mix(h, terrace, village * .97 * smooth(30, 36, d) * (1 - smooth(82, 105, d)));
    return h + n * (d < 34 ? .35 : 2.8);
  }
  function material(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: 0, ...opts }); }
  function mesh(geometry, mat, parent = scene, cast = false, receive = true) {
    const m = new THREE.Mesh(geometry, mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  }
  function tube(points, radius, mat, parent, segments = 24) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), mat, parent, true, true);
  }
  function segment(a, b, radius, mat, parent, radial = 8) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const o = mesh(new THREE.CylinderGeometry(radius * .82, radius, av.distanceTo(bv), radial), mat, parent, true, true);
    o.position.copy(av).add(bv).multiplyScalar(.5);
    o.quaternion.setFromUnitVectors(up, bv.sub(av).normalize());
    return o;
  }
  function textureSet(kind, size = 256) {
    const color = document.createElement('canvas'), normal = document.createElement('canvas'), rough = document.createElement('canvas');
    color.width = normal.width = rough.width = color.height = normal.height = rough.height = size;
    const c = color.getContext('2d'), n = normal.getContext('2d'), r = rough.getContext('2d');
    const ci = c.createImageData(size, size), ni = n.createImageData(size, size), ri = r.createImageData(size, size);
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let f;
      if (kind === 'wood') f = .42 * Math.sin(v * 77 + 2 * Math.sin(u * 10 + v * 26)) + .23 * Math.sin(v * 241 + Math.sin(u * 18)) + (noise2(u * 23, v * 23) - .5) * .22;
      else if (kind === 'sail') f = .18 * Math.sin(u * 320) + .12 * Math.sin(v * 370) + (noise2(u * 40, v * 40) - .5) * .30;
      else f = (noise2(u * 12, v * 12) - .5) * .7 + (noise2(u * 45, v * 45) - .5) * .37 + (noise2(u * 110, v * 110) - .5) * .15;
      h[y * size + x] = f;
      const i = (y * size + x) * 4;
      if (kind === 'wood') {
        ci.data[i] = 112 + f * 29; ci.data[i + 1] = 75 + f * 23; ci.data[i + 2] = 48 + f * 18;
      } else if (kind === 'sail') {
        const stripe = Math.floor(u * 10) % 2 === 0;
        ci.data[i] = (stripe ? 193 : 127) + f * 15; ci.data[i + 1] = (stripe ? 179 : 79) + f * 13; ci.data[i + 2] = (stripe ? 147 : 62) + f * 12;
      } else if (kind === 'rock') {
        ci.data[i] = 91 + f * 27; ci.data[i + 1] = 102 + f * 29; ci.data[i + 2] = 101 + f * 27;
      } else {
        ci.data[i] = 91 + f * 26; ci.data[i + 1] = 99 + f * 30; ci.data[i + 2] = 72 + f * 21;
      }
      ci.data[i + 3] = ni.data[i + 3] = ri.data[i + 3] = 255;
      const rv = kind === 'sail' ? 224 : kind === 'wood' ? 192 : 217;
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = clamp(rv + f * 23, 0, 255);
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const L = h[y * size + ((x - 1 + size) % size)], R = h[y * size + ((x + 1) % size)], U = h[((y - 1 + size) % size) * size + x], D = h[((y + 1) % size) * size + x];
      const scale = kind === 'wood' ? 1.4 : kind === 'sail' ? .6 : 2.2;
      const nx = (L - R) * scale, ny = (U - D) * scale, nz = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * size + x) * 4;
      ni.data[i] = 128 + nx * nz * 127; ni.data[i + 1] = 128 + ny * nz * 127; ni.data[i + 2] = 128 + nz * 127;
    }
    c.putImageData(ci, 0, 0); n.putImageData(ni, 0, 0); r.putImageData(ri, 0, 0);
    function tex(cv, srgb = false) { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
    return { map: tex(color, true), normalMap: tex(normal), roughnessMap: tex(rough) };
  }
  const woodTex = textureSet('wood'), rockTex = textureSet('rock'), groundTex = textureSet('ground'), sailTex = textureSet('sail');
  const wood = material(0xffffff, { ...woodTex, side: THREE.DoubleSide, roughness: .87 });
  const woodDark = material(0x88715a, { ...woodTex, side: THREE.DoubleSide, roughness: .9 });
  const woodBright = material(0xc4aa80, { ...woodTex, side: THREE.DoubleSide, roughness: .83 });
  const stone = material(0xffffff, { ...rockTex, roughness: .94 });
  const moss = material(0xffffff, { ...groundTex, roughness: .98 });
  const ropeMat = material(0x9b8a69, { roughness: 1 });
  const iron = material(0x394348, { metalness: .46, roughness: .63 });
  const bronze = material(0x8c7149, { metalness: .65, roughness: .46 });

  const presets = {
    dawn: { zenith: 0x426782, horizon: 0x9eafad, fog: 0x829b9b, sun: 0xffd5aa, ambient: 0xb9d0c7, intensity: 1.03, hemi: .95, exposure: 1.18, fogDensity: .0055, water: 0x164850, sunDir: [-.55, .38, -.26] },
    overcast: { zenith: 0x748e9e, horizon: 0x9fadaf, fog: 0x829697, sun: 0xd8e5e2, ambient: 0xc3d3d0, intensity: .73, hemi: .94, exposure: 1.14, fogDensity: .0071, water: 0x1a4551, sunDir: [-.35, .66, -.2] },
    moon: { zenith: 0x1b344d, horizon: 0x49647a, fog: 0x304653, sun: 0xaccfe8, ambient: 0x65899f, intensity: .43, hemi: .36, exposure: 1.05, fogDensity: .0064, water: 0x102e42, sunDir: [-.32, .63, .42] }
  };
  let currentLight = 'dawn';
  const hemi = new THREE.HemisphereLight(0xd6e9dc, 0x2b3634, 1.35); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x98aaa0, .35); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd5aa, 2);
  sun.position.set(-80, 65, -45); sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 240; sun.shadow.bias = -.00025; sun.shadow.normalBias = .025;
  sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  const sky = mesh(new THREE.SphereGeometry(750, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uZenith: { value: new THREE.Color(0x6e94ad) }, uHorizon: { value: new THREE.Color(0xc6c9bc) }, uSun: { value: new THREE.Color(0xffdec0) }, uSunDir: { value: new THREE.Vector3(-.5, .3, -.3).normalize() }, uCloud: { value: .18 } },
    vertexShader: `varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vDir;uniform vec3 uZenith,uHorizon,uSun,uSunDir;uniform float uCloud;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(vDir);d.y=abs(d.y);float h=clamp(d.y,0.,1.);vec3 col=mix(uHorizon,uZenith,smoothstep(.0,.87,h));
      float glow=pow(max(dot(d,uSunDir),0.),17.);float disc=pow(max(dot(d,uSunDir),0.),1100.);col=mix(col,uSun,glow*.18+disc*.38);
      col=mix(col,vec3(1.0,.88,.72),glow*.055);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  }), scene, false, false);
  sky.frustumCulled = false;

  function buildTerrain() {
    const nx = 330, nz = 150, x0 = -300, x1 = 850, z0 = -170, z1 = 170;
    const verts = [], uvs = [], cols = [], idx = [];
    const low = new THREE.Color(0x536b5d), rock = new THREE.Color(0x65726e), grass = new THREE.Color(0x6f7e65), dark = new THREE.Color(0x43534b), snow = new THREE.Color(0x96a19c);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), d = Math.abs(z - centerline(x)), y = groundHeight(x, z);
      verts.push(x, y, z); uvs.push(x * .062, z * .062);
      const n = noise2(x * .071, z * .073);
      const base = d < 32 ? low.clone().lerp(grass, smooth(26, 32, d)) : d < 49 ? grass.clone().lerp(rock, smooth(36, 45, d)) : rock.clone().lerp(dark, smooth(60, 100, d) * .54);
      if (y > 47) base.lerp(snow, smooth(47, 67, y) * .38);
      base.multiplyScalar(.86 + n * .25); cols.push(base.r, base.g, base.b);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = i * (nz + 1) + j, b = a + nz + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = material(0xffffff, { vertexColors: true, normalMap: groundTex.normalMap, roughnessMap: groundTex.roughnessMap, roughness: 1, side: THREE.DoubleSide });
    const land = mesh(g, m, scene, false, true); land.name = 'continuous underwater terrain';
  }
  buildTerrain();

  function makeRockGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 3), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const f = .83 + .18 * Math.sin(x * 7 + z * 11) + .12 * Math.sin(y * 17 + x * 13);
      a.setXYZ(i, x * f, y * f, z * f);
    }
    g.computeVertexNormals(); return g;
  }
  const rockGeo = makeRockGeometry();
  const rocks = [];
  for (let i = 0; i < 400; i++) {
    const x = -255 + seeded() * 1070, side = seeded() < .5 ? -1 : 1, d = 29 + seeded() * 67;
    const z = centerline(x) + side * d, y = groundHeight(x, z), s = .6 + Math.pow(seeded(), 2) * 5.0;
    rocks.push({ x, y: y - s * .35, z, sx: s * (1.1 + seeded()), sy: s * (.5 + seeded()), sz: s * (.6 + seeded() * .8), rot: seeded() * 6.28 });
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, stone, rocks.length);
  rockMesh.castShadow = false; rockMesh.receiveShadow = true; rockMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  rocks.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.set(p.sx, p.sy, p.sz); dummy.updateMatrix(); rockMesh.setMatrixAt(i, dummy.matrix); });
  rockMesh.instanceMatrix.needsUpdate = true; scene.add(rockMesh);

  const treeChunks = [];
  const trunkGeo = new THREE.CylinderGeometry(.08, .17, 1, 9, 3), branchGeo = new THREE.CylinderGeometry(.026, .050, 1, 7);
  function makeNeedleTexture(){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    ctx.clearRect(0,0,128,128);ctx.lineCap='round';
    ctx.strokeStyle='rgba(30,48,38,.95)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(64,126);ctx.quadraticCurveTo(59,64,66,4);ctx.stroke();
    for(let y=12;y<123;y+=3.0){
      const spread=(y/128)*49*(.78+.22*Math.sin(y*.17));
      for(const side of [-1,1]){
        const tipX=64+side*spread*(.62+seeded()*.45),tipY=y+1+seeded()*6;
        ctx.strokeStyle=seeded()<.5?'rgba(34,63,46,.92)':'rgba(66,91,65,.92)';ctx.lineWidth=1.4+seeded()*.8;
        ctx.beginPath();ctx.moveTo(64+(seeded()-.5)*3,y);ctx.quadraticCurveTo(64+side*spread*.52,y-4,tipX,tipY);ctx.stroke();
        for(let k=1;k<=5;k++){
          const t=k/6,px=64+(tipX-64)*t,py=y+(tipY-y)*t;
          for(const s of [-1,1]){
            const len=(2.5+seeded()*5.5)*(1-t*.45);
            ctx.strokeStyle=seeded()<.35?'rgba(97,119,79,.79)':'rgba(37,73,49,.90)';ctx.lineWidth=.9+seeded()*.6;
            ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+side*len*.35,py+s*len);ctx.stroke();
          }
        }
      }
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
  }
  const needleTex=makeNeedleTexture();
  function makeNeedleGeometry(){
    const g=new THREE.BufferGeometry(),p=[],uv=[],idx=[];
    for(let plane=0;plane<2;plane++){
      const b=p.length/3;
      for(const [x,y,u,v] of [[-.5,-.5,0,0],[.5,-.5,1,0],[-.5,.5,0,1],[.5,.5,1,1]]){
        p.push(plane===0?x:0,y,plane===0?0:x);uv.push(u,v);
      }
      idx.push(b,b+1,b+2,b+1,b+3,b+2);
    }
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  const needleGeo=makeNeedleGeometry();
  const bark = material(0x635b49, { ...woodTex, roughness: 1 });
  const needles = material(0xffffff, { map:needleTex,side:THREE.DoubleSide,alphaTest:.09,roughness:1 });
  function makeInstances(geo, mat, matrices, colors = null) {
    const im = new THREE.InstancedMesh(geo, mat, matrices.length); im.castShadow = false; im.receiveShadow = true;
    matrices.forEach((m, i) => { im.setMatrixAt(i, m); if (colors) im.setColorAt(i, colors[i]); });
    im.instanceMatrix.needsUpdate = true; if (colors) im.instanceColor.needsUpdate = true; return im;
  }
  function matrixAt(x, y, z, sx, sy, sz, rot = 0) { dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); return dummy.matrix.clone(); }
  for (let chunk = -3; chunk <= 8; chunk++) {
    const trunks = [], branches = [], crowns = [], leafColors = [];
    const chunkX = chunk * 100;
    for (let k = 0; k < 126; k++) {
      const x = chunkX + seeded() * 100, side = seeded() < .5 ? -1 : 1;
      const d = seeded() < .34 ? 33 + seeded() * 18 : 48 + seeded() * 76;
      const z = centerline(x) + side * d, y = groundHeight(x, z);
      if (y < 1 || Math.abs(x - 245) < 11 && side > 0 && d < 67) continue;
      if (Math.abs(x - 135) < 28 && side < 0 && d < 72 || Math.abs(x - 455) < 28 && side > 0 && d < 72) continue;
      const h = 4.8 + seeded() * 8.5, width = .82 + seeded() * .75, a = seeded() * Math.PI * 2;
      trunks.push(matrixAt(x, y + h * .46, z, 1.0 + h * .07, h, 1.0 + h * .07, a));
      for (let b = 0; b < 5; b++) {
        const angle = a + b * 2.2, by = y + h * (.43 + b * .105), bx = x + Math.cos(angle) * h * (.16-b*.012), bz = z + Math.sin(angle) * h * (.16-b*.012);
        const av = new THREE.Vector3(x, by + .22, z), bv = new THREE.Vector3(bx, by - .1, bz), q = new THREE.Quaternion().setFromUnitVectors(up, bv.clone().sub(av).normalize());
        dummy.position.copy(av).add(bv).multiplyScalar(.5); dummy.quaternion.copy(q); dummy.scale.set(h * .28, av.distanceTo(bv), h * .28); dummy.updateMatrix(); branches.push(dummy.matrix.clone());
      }
      for (let j = 0; j < 6; j++) {
        const rad=width*h*(.20-j*.025),cy=y+h*(.39+j*.108),count=j>=4?4:5;
        for(let q=0;q<count;q++){
          const angle=a+q*Math.PI*2/count+j*.72,spread=rad*(.68+.15*seeded());
          const px=x+Math.cos(angle)*spread,pz=z+Math.sin(angle)*spread;
          const cw=rad*(.82+.12*seeded()),ch=h*(.26+.035*seeded());
          crowns.push(matrixAt(px,cy+(seeded()-.5)*h*.025,pz,cw,ch,cw*.52,angle));
          const shade=.82+seeded()*.22;
          leafColors.push(new THREE.Color(0xe3e7d4).multiplyScalar(shade));
        }
      }
      crowns.push(matrixAt(x,y+h*.90,z,h*.20,h*.26,h*.20,a));leafColors.push(new THREE.Color(0xd4dfcf));
    }
    const group = new THREE.Group();
    const t = makeInstances(trunkGeo, bark, trunks), b = makeInstances(branchGeo, bark, branches), c = makeInstances(needleGeo, needles, crowns, leafColors);
    group.add(t, b, c); scene.add(group); treeChunks.push({ x: chunkX + 50, group, branch: b });
  }

  function buildHut(x, side, offset, size = 1) {
    x += offset * 7;
    const d = 45 + (offset % 2) * 4, z = centerline(x) + side * d, y = groundHeight(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = side < 0 ? -.18 : .20; scene.add(g);
    const w = 4.4 * size, l = 6.6 * size, h = 3.2 * size;
    const foundation = mesh(new THREE.BoxGeometry(l + .5, .55, w + .5), stone, g, true); foundation.position.y = .08;
    const wall = mesh(new THREE.BoxGeometry(l, h, w), woodBright, g, true); wall.position.y = h * .52 + .3;
    for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
      segment([a * l * .49, .3, b * w * .49], [a * l * .49, h + .3, b * w * .49], .14 * size, woodBright, g);
    }
    for (let j = -2; j <= 2; j++) {
      const log = mesh(new THREE.BoxGeometry(l + .15, .13, .12), woodBright, g, true); log.position.set(0, .66 + j * .56 + h * .48, side * w * .51);
    }
    const roofShape = new THREE.BufferGeometry();
    const roofVerts = [-l*.57,h*.98+.3,-w*.6, l*.57,h*.98+.3,-w*.6, -l*.57,h*1.68+.3,0, l*.57,h*1.68+.3,0, -l*.57,h*.98+.3,w*.6, l*.57,h*.98+.3,w*.6];
    roofShape.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts,3)); roofShape.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]); roofShape.computeVertexNormals();
    mesh(roofShape, material(0x777468, { ...rockTex, side: THREE.DoubleSide, roughness: 1 }), g, true);
    for (let k = -2; k <= 2; k++) {
      segment([k * l * .19, h * .98 + .33, -w * .61], [k * l * .19, h * 1.68 + .34, 0], .05, woodDark, g);
      segment([k * l * .19, h * 1.68 + .34, 0], [k * l * .19, h * .98 + .33, w * .61], .05, woodDark, g);
    }
    const door = mesh(new THREE.BoxGeometry(1.05 * size, 1.8 * size, .06), material(0x352f29), g); door.position.set(l * .502, 1.21 * size, 0);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xeab978 });
    for (const zz of [-w * .34, w * .34]) { const win = mesh(new THREE.BoxGeometry(.05, .51, .50), windowMat, g); win.position.set(l * .504, 1.9 * size, zz); }
    for(const facing of [-1,1])for(const xx of [-l*.25,l*.25]){
      const win=mesh(new THREE.BoxGeometry(.62,.62,.045),windowMat,g);win.position.set(xx,1.65*size,facing*(w*.507));
      const lintel=mesh(new THREE.BoxGeometry(.81,.07,.09),woodDark,g,true);lintel.position.set(xx,2.02*size,facing*(w*.516));
      for(const s of [-1,1]){const shutter=mesh(new THREE.BoxGeometry(.12,.68,.07),woodDark,g,true);shutter.position.set(xx+s*.39,1.65*size,facing*(w*.521));}
    }
    const chimney = mesh(new THREE.BoxGeometry(.62, 1.65, .62), stone, g, true); chimney.position.set(-l * .22, h * 1.43, 0);
    return g;
  }
  for (let i = -2; i <= 2; i++) buildHut(135, -1, i, .85 + seeded() * .22);
  for (let i = -1; i <= 2; i++) buildHut(455, 1, i, .76 + seeded() * .18);
  function buildDock(x, side) {
    const z0 = centerline(x) + side * 25.5, z1 = centerline(x) + side * 39.5;
    for (let i = 0; i <= 16; i++) {
      const z = mix(z0, z1, i / 16), y = Math.max(.33, groundHeight(x, z) + .14);
      const plank = mesh(new THREE.BoxGeometry(3.5, .13, .9), woodBright, scene, true); plank.position.set(x, y, z);
      if (i % 4 === 0) for (const sx of [-1, 1]) segment([x + sx * 1.35, groundHeight(x + sx * 1.35, z) - .25, z], [x + sx * 1.35, y + .1, z], .1, woodDark, scene);
    }
  }
  buildDock(135, -1); buildDock(455, 1);
  const waterfallMats=[];
  function buildWaterfall(x, side) {
    const strands = 4, strips = 30, flowMat = new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,
      uniforms:{uTime:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform float uTime;void main(){float streak=.5+.5*sin(vUv.x*31.+vUv.y*44.-uTime*4.);float veil=.48+.19*streak;float edge=smoothstep(.0,.15,vUv.x)*smoothstep(.0,.15,1.-vUv.x);float foam=.25+.32*pow(max(streak,0.),5.);vec3 c=mix(vec3(.11,.34,.40),vec3(.43,.66,.67),foam);gl_FragColor=vec4(c,veil*edge);
      #include <colorspace_fragment>
      }`});
    waterfallMats.push(flowMat);
    for (let s = 0; s < strands; s++) {
      const verts = [], uvs = [], idx = [], dx = (s - 1.5) * 1.15;
      for (let i = 0; i <= strips; i++) {
        const t = i / strips, drift=.35*Math.sin(t*5.8+s*1.4), d = 49 - 21 * t, zz = centerline(x + dx + drift) + side * d, yy = Math.max(.10, groundHeight(x + dx + drift, zz) + .36 + .14 * Math.sin(t * 28 + s));
        const ww = (.32 + t * .34)*(1+.18*Math.sin(t*23+s*3));
        verts.push(x + dx + drift - ww, yy, zz - side * .12, x + dx + drift + ww, yy, zz - side * .12);
        uvs.push(0,t,1,t);
        if (i < strips) { const k = i * 2; idx.push(k,k+1,k+2,k+1,k+3,k+2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); g.setIndex(idx);g.computeVertexNormals();
      const m = mesh(g, flowMat, scene, false, false); m.userData.waterfall = true;
    }
    const splashMat = new THREE.MeshBasicMaterial({ color: 0xcce0da, transparent: true, opacity: .55, depthWrite: false });
    for (let i = 0; i < 18; i++) {
      const d = 29 + seeded() * 4, z = centerline(x) + side * d;
      const p = mesh(new THREE.SphereGeometry(.10 + seeded() * .16, 5, 4), splashMat, scene, false, false);
      p.position.set(x + (seeded() - .5) * 6, groundHeight(x, z) + seeded() * .75, z); p.scale.y = .35;
    }
  }
  buildWaterfall(245, 1); buildWaterfall(345, -1);

  const vessel = new THREE.Group(); shipRoot.add(vessel);
  const oars = [], rowers = [], lanterns = [];
  const hullColors = [0xe0c9a5,0xd2b28c,0xbfa27e,0xe3c29b,0xd5b18a,0xc4a07c,0xe2c4a0,0xd1b38e];
  const hullMats = hullColors.map(c => material(c, { ...woodTex, side: THREE.DoubleSide, roughness: .86 }));
  function halfWidth(x) { return .075 + 1.67 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / 9.2, 2)), .53); }
  function keelY(x) { return -.83 + 1.28 * Math.pow(Math.abs(x) / 9.2, 4); }
  function rimY(x) { return .86 + .90 * Math.pow(Math.abs(x) / 9.2, 3.1); }
  function hullPoint(x, t, side, inset = 0) {
    const w = halfWidth(x), y = mix(keelY(x), rimY(x), t);
    return [x, y, side * Math.max(.015, w * Math.pow(t, .60) - inset)];
  }
  function hullBand(t0, t1, side, inset = 0, outward = 0) {
    const verts = [], uv = [], idx = [], steps = 72;
    for (let i = 0; i <= steps; i++) {
      const x = mix(-9.2, 9.2, i / steps);
      for (const t of [t0, t1]) {
        const p = hullPoint(x, clamp(t, 0, 1), side, inset);
        p[2] += side * outward; verts.push(...p); uv.push(i / steps * 7.4, t * 1.45);
      }
      if (i < steps) { const k = i * 2; idx.push(k,k+1,k+2,k+1,k+3,k+2); }
    }
    const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8 - (i ? .013 : 0), t1 = (i + 1) / 8 + .011;
      const band = mesh(hullBand(t0, t1, side, 0, i * .006), hullMats[i], vessel, true, true);
      band.name = 'clinker hull plank';
      const lowerPts = [];
      for (let k = 0; k <= 24; k++) {
        const x = mix(-8.98, 8.98, k / 24), p = hullPoint(x, clamp(t0, 0, 1), side, 0);
        lowerPts.push([p[0], p[1] + .007, p[2] + side * (i * .006 + .022)]);
      }
      if (i > 0) tube(lowerPts, .016, woodDark, vessel, 72);
    }
    mesh(hullBand(.10, 1.0, side, .115, 0), woodDark, vessel, false, true);
    const rail = [];
    for (let k = 0; k <= 36; k++) { const x = mix(-9.1, 9.1, k / 36); rail.push([x, rimY(x) + .045, side * halfWidth(x)]); }
    tube(rail, .095, woodBright, vessel, 72);
    for (let x = -7.6; x < 8.1; x += 1.05) {
      const p = hullPoint(x, .17, side, .12), q = hullPoint(x, .96, side, .12);
      tube([p, hullPoint(x, .48, side, .12), hullPoint(x, .75, side, .12), q], .064, woodBright, vessel, 12);
    }
  }
  const bottom = mesh(new THREE.BoxGeometry(15.9, .12, 1.96), woodDark, vessel, true); bottom.position.y = -.23;
  for (let i = -5; i <= 5; i++) {
    const board = mesh(new THREE.BoxGeometry(15.8, .055, .175), i % 2 ? wood : woodBright, vessel, false);
    board.position.set(0, -.148, i * .178);
  }
  tube([[-9.22,.45,0],[-7.4,-.48,0],[0,-.92,0],[7.4,-.48,0],[9.22,.45,0]], .13, woodDark, vessel, 52);
  const beamGeo = new THREE.BoxGeometry(.18, .17, 3.25);
  for (let x = -7.1; x <= 7.2; x += 1.2) {
    const bench = mesh(new THREE.BoxGeometry(.32,.14,halfWidth(x)*1.84), woodBright, vessel, true);
    bench.position.set(x, .24 + Math.pow(Math.abs(x)/9, 4)*.23, 0);
    for (const side of [-1,1]) {
      const post = mesh(new THREE.BoxGeometry(.11,.38,.12), woodDark, vessel, true);
      post.position.set(x, -.02, side * halfWidth(x) * .75);
    }
  }
  for (const x of [-8.0, 7.9]) {
    const deck = mesh(new THREE.BoxGeometry(1.55,.10,halfWidth(x)*1.72), woodBright, vessel, true);deck.position.set(x,.58,0);
  }
  for (let x = -7.7; x < 8; x += 1.15) for (const side of [-1,1]) {
    const w = halfWidth(x);
    const nail = mesh(new THREE.SphereGeometry(.028,6,4), iron, vessel);nail.position.set(x,rimY(x)+.112,side*(w-.025));
  }

  // Carved stems share the keel and gunwale rather than floating above them.
  tube([[8.6,.43,0],[9.20,1.43,0],[9.50,2.45,0],[9.96,3.25,0],[10.52,3.40,0]], .24, woodDark, vessel, 28);
  const dragonHead = mesh(new THREE.SphereGeometry(1,16,10), woodBright, vessel, true);
  dragonHead.position.set(10.76,3.35,0);dragonHead.scale.set(.90,.42,.45);dragonHead.rotation.z = -.12;
  const jaw = mesh(new THREE.SphereGeometry(1,12,8), woodDark, vessel, true);jaw.position.set(10.95,3.05,0);jaw.scale.set(.73,.18,.35);
  for (const side of [-1,1]) {
    const eye = mesh(new THREE.SphereGeometry(.09,10,6), bronze, vessel);eye.position.set(10.82,3.50,side*.398);
    tube([[10.35,3.64,side*.19],[10.16,3.95,side*.23],[10.37,4.18,side*.18]],.075,woodDark,vessel,14);
    for (let i = 0; i < 4; i++) {
      const fang = mesh(new THREE.ConeGeometry(.052,.17,5), woodBright, vessel);
      fang.position.set(10.78+i*.17,3.10,side*.25);fang.rotation.z = Math.PI;
    }
    tube([[9.28,1.45,side*.11],[9.60,2.08,side*.21],[9.74,2.71,side*.24],[10.08,3.21,side*.22]],.032,bronze,vessel,22);
  }
  tube([[-8.6,.5,0],[-9.25,1.35,0],[-9.64,2.42,0],[-9.49,3.07,0],[-9.13,3.20,0]],.19,woodDark,vessel,28);
  tube([[-9.16,3.20,0],[-8.91,3.10,0],[-8.97,2.83,0],[-9.20,2.85,0]],.07,woodBright,vessel,16);

  const shieldColors = [0x7f3c2d,0x426069,0x907c57,0x5c513e,0x7a594b,0x45605a,0x9d7662,0x384e53];
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
    const x = -6.85 + i * 1.90, w = halfWidth(x);
    const sh = new THREE.Group(); sh.position.set(x,.90,side*(w+.07));sh.rotation.x = Math.PI/2;vessel.add(sh);
    const face = mesh(new THREE.CylinderGeometry(.48,.48,.055,24), material(shieldColors[(i + (side+1)*2)%shieldColors.length],{roughness:.91,side:THREE.DoubleSide}),sh,true);
    const rim = mesh(new THREE.TorusGeometry(.46,.037,7,24), bronze, sh, true);rim.rotation.x = Math.PI/2;
    const boss = mesh(new THREE.SphereGeometry(.14,12,8), iron, sh, true);boss.scale.y=.47;boss.position.y=side*.065;
    for (let k = 0; k < 2; k++) {
      const stripe = mesh(new THREE.BoxGeometry(.052,.011,.85), woodBright, sh);stripe.rotation.y = k * Math.PI / 2;stripe.position.y = side*.04;
    }
    for (const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
      const rivet = mesh(new THREE.SphereGeometry(.032,6,4), bronze, sh);rivet.position.set(Math.cos(a)*.4,side*.075,Math.sin(a)*.4);
    }
  }

  const mast = mesh(new THREE.CylinderGeometry(.13,.22,10.2,12), woodBright, vessel, true);mast.position.set(.2,5.15,0);
  const mastFoot = mesh(new THREE.CylinderGeometry(.35,.40,.55,12), woodDark, vessel, true);mastFoot.position.set(.2,.38,0);
  segment([.2,8.35,-3.38],[.2,8.35,3.38],.105,woodDark,vessel,12);
  segment([.18,3.53,-3.22],[.18,3.53,3.22],.07,woodDark,vessel,10);
  const sailVerts = [], sailUV = [], sailIdx = [], sailBase = [], su = 24, sv = 18;
  for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++) {
    const u = i / su, v = j / sv, z = mix(-3.24,3.24,u), y = mix(8.32,3.55,v);
    const x = .17 - .57 * Math.sin(Math.PI*u) * Math.sin(Math.PI*v) + .05 * Math.cos(u*3.14);
    sailVerts.push(x,y,z);sailBase.push(x,y,z);sailUV.push(u,1-v);
    if (i < su && j < sv) { const a = j*(su+1)+i,b=a+su+1;sailIdx.push(a,b,a+1,b,b+1,a+1); }
  }
  const sailGeo = new THREE.BufferGeometry();sailGeo.setAttribute('position',new THREE.Float32BufferAttribute(sailVerts,3));sailGeo.setAttribute('uv',new THREE.Float32BufferAttribute(sailUV,2));sailGeo.setIndex(sailIdx);sailGeo.computeVertexNormals();
  const sailMat = material(0xffffff,{...sailTex,side:THREE.DoubleSide,roughness:.93,normalScale:new THREE.Vector2(.23,.23)});
  const sail = mesh(sailGeo,sailMat,vessel,true,true);sail.name='moving striped woven sail';
  for (const z of [-3.23,3.23]) {
    tube([[.18,8.33,z],[.07,6.0,z],[-.01,3.55,z]],.018,ropeMat,vessel,12);
    tube([[.2,8.35,z],[5.95,.77,z>0?1.4:-1.4]],.024,ropeMat,vessel,20);
  }
  for (const end of [-1,1]) {
    tube([[.2,10.20,0],[end*7.85,rimY(end*7.85)+.15,0]],.028,ropeMat,vessel,20);
    tube([[.2,8.42,end*3.35],[end*2.2,.95,end*1.48]],.017,ropeMat,vessel,20);
  }
  for (const side of [-1,1]) tube([[.2,10.18,0],[-2.8,.95,side*halfWidth(-2.8)]],.021,ropeMat,vessel,18);
  const flagMat = material(0x884638,{side:THREE.DoubleSide,roughness:1});
  const flag = mesh(new THREE.PlaneGeometry(.85,.34),flagMat,vessel);flag.position.set(.68,10.04,0);flag.rotation.y=Math.PI/2;

  const clothPalette = [0x5a6462,0x766751,0x72564b,0x4b6260,0x806b57,0x62616b];
  const skin = material(0xb89676,{roughness:.95}), skin2 = material(0x9f785b,{roughness:.95});
  const fur = material(0x7c7467,{...groundTex,roughness:1}), leather=material(0x473a32,{roughness:.94});
  const limbGeo = new THREE.CylinderGeometry(.085,.11,1,7);
  function setLimb(m,a,b) {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);
    m.position.copy(av).add(bv).multiplyScalar(.5);m.scale.y=av.distanceTo(bv);
    m.quaternion.setFromUnitVectors(up,bv.sub(av).normalize());
  }
  function makeFigure(x,side,index) {
    const z = side * .70, g = new THREE.Group();g.position.set(x,0,z);vessel.add(g);
    const cloth = material(clothPalette[index%clothPalette.length],{roughness:1}), accent=material(clothPalette[(index+2)%clothPalette.length],{roughness:.97});
    const hips = mesh(new THREE.SphereGeometry(.29,12,8),cloth,g,true);hips.position.y=.43;hips.scale.set(1.15,.62,1);
    const torso = mesh(new THREE.CylinderGeometry(.24,.31,.80,10),cloth,g,true);torso.position.y=.93;torso.rotation.z=-.10;
    const tunic = mesh(new THREE.CylinderGeometry(.29,.39,.47,10),cloth,g,true);tunic.position.y=.57;
    const belt = mesh(new THREE.TorusGeometry(.31,.042,7,16),leather,g,true);belt.rotation.x=Math.PI/2;belt.position.y=.69;
    const neck = mesh(new THREE.CylinderGeometry(.105,.12,.21,8),skin,g,true);neck.position.set(.04,1.40,0);
    const head = mesh(new THREE.SphereGeometry(.20,14,10),index%3?skin:skin2,g,true);head.position.set(.05,1.61,0);head.scale.set(.94,1.10,.89);
    const hair = mesh(new THREE.SphereGeometry(.205,12,8),material(index%2?0x49382c:0x695644,{roughness:1}),g,true);hair.position.set(.025,1.72,-.025);hair.scale.set(.98,.62,.98);
    if (index%2===0) { const beard=mesh(new THREE.ConeGeometry(.15,.31,9),material(index%3?0x584333:0x765d42,{roughness:1}),g,true);beard.position.set(.19,1.43,0);beard.rotation.z=-.20; }
    const cloak=mesh(new THREE.ConeGeometry(.33,.55,10),accent,g,true);cloak.position.set(-.11,1.13,-side*.09);cloak.rotation.z=.15;
    const shoulder=mesh(new THREE.SphereGeometry(.21,10,8),fur,g,true);shoulder.position.set(-.07,1.29,side*.16);shoulder.scale.set(1.65,.35,1.45);
    for (const legSide of [-1,1]) {
      segment([.02,.36,legSide*.16],[.42,.27,legSide*.18],.12,cloth,g);
      segment([.42,.27,legSide*.18],[.56,-.13,legSide*.20],.09,leather,g);
      const boot=mesh(new THREE.SphereGeometry(.14,8,6),leather,g,true);boot.position.set(.64,-.14,legSide*.20);boot.scale.set(1.5,.65,1);
    }
    const arms=[];
    for (const handSide of [-1,1]) {
      const upper=mesh(limbGeo,cloth,g,true),fore=mesh(limbGeo,skin,g,true),hand=mesh(new THREE.SphereGeometry(.10,8,6),skin,g,true);
      arms.push({upper,fore,hand,handSide});
    }
    return {g,arms,x,z,side,index};
  }

  const rowX = [-5.8,-3.7,-1.6,2.7,4.8,6.8];
  const shaftMat=material(0xc8ab7f,{...woodTex,roughness:.88});
  const bladeMat=material(0xb18d65,{...woodTex,side:THREE.DoubleSide,roughness:.89});
  for (const side of [-1,1]) for (let i=0;i<rowX.length;i++) {
    const x=rowX[i], w=halfWidth(x), pivot=new THREE.Group();pivot.position.set(x,rimY(x)+.13,side*(w-.02));vessel.add(pivot);
    const shaft=mesh(new THREE.CylinderGeometry(.047,.066,4.32,9),shaftMat,pivot,true);shaft.rotation.x=Math.PI/2;shaft.position.z=side*1.31;
    const blade=mesh(new THREE.SphereGeometry(1,13,8),bladeMat,pivot,true);blade.position.set(0,0,side*3.20);blade.scale.set(.30,.055,.60);
    segment([0,0,-side*.78],[0,0,-side*.62],.067,leather,pivot);
    const oar={pivot,blade,side,x,index:i,phase:(i%2)*.08+(side>0?.02:0),wet:false};oars.push(oar);
    const rower=makeFigure(x-.15,side,i+(side>0?1:0));rower.oar=oar;rowers.push(rower);
  }
  // Helmsman, his tiller and a lookout occupy the otherwise empty ends.
  const tiller=segment([-7.7,.56,0],[-5.9,.62,.46],.09,woodDark,vessel);
  const helm=makeFigure(-7.2,-1,9);helm.g.position.z=-.27;helm.g.position.y=.30;helm.g.rotation.y=-.5;
  const lookout=makeFigure(7.55,1,5);lookout.g.position.z=.05;lookout.g.position.y=.36;lookout.g.rotation.y=.55;
  for (const [x,z] of [[-7.65,.83],[7.52,-.76]]) {
    segment([x,.75,z],[x,1.77,z],.055,iron,vessel);
    segment([x,1.77,z],[x+.34,1.77,z],.04,iron,vessel);
    const housing=mesh(new THREE.CylinderGeometry(.19,.18,.42,8),bronze,vessel,true);housing.position.set(x+.34,1.45,z);
    const glow=mesh(new THREE.CylinderGeometry(.135,.135,.26,8),new THREE.MeshBasicMaterial({color:0xffc77d}),vessel,false,false);glow.position.set(x+.34,1.46,z);
    const light=new THREE.PointLight(0xffbd73,1.6,8,2);light.position.set(x+.34,1.46,z);vessel.add(light);lanterns.push({glow,light});
  }
  for (const p of [[-6.7,.15,.2],[-6.4,.15,-.3],[6.95,.18,.25]]) {
    const crate=mesh(new THREE.BoxGeometry(.68,.45,.55),woodDark,vessel,true);crate.position.set(...p);
    for (const dz of [-.22,.22]) { const strap=mesh(new THREE.BoxGeometry(.70,.045,.035),iron,vessel);strap.position.set(p[0],p[1]+.23,p[2]+dz); }
  }
  for (let i=0;i<3;i++) {
    const barrel=mesh(new THREE.CylinderGeometry(.25,.25,.56,12),woodBright,vessel,true);barrel.rotation.x=Math.PI/2;barrel.position.set(-6.2+i*.60,.16,.44);
    for(const dz of [-.19,.19]){const band=mesh(new THREE.TorusGeometry(.25,.028,6,12),iron,vessel);band.position.set(-6.2+i*.60,.16,.44+dz);}
  }

  const waterUniforms = {
    uTime: { value: 0 }, uReflection: { value: reflectionTarget.texture }, uRefraction: { value: refractionTarget.texture },
    uReflectionMatrix: { value: new THREE.Matrix4() }, uRefractionMatrix: { value: new THREE.Matrix4() },
    uCamera: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(-.5,.38,-.26).normalize() },
    uSunColor: { value: new THREE.Color(0xffd5aa) }, uDeep: { value: new THREE.Color(0x174e50) },
    uFogColor: { value: new THREE.Color(0x98aaa7) }, uFogDensity: { value: .0065 }, uLight: { value: 1 }
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: false, depthWrite: true,
    vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `precision highp float;
      varying vec3 vWorld;
      uniform float uTime,uFogDensity,uLight;
      uniform sampler2D uReflection,uRefraction;
      uniform mat4 uReflectionMatrix,uRefractionMatrix;
      uniform vec3 uCamera,uSunDir,uSunColor,uDeep,uFogColor;
      float wave(vec2 p,float detail){return .037*sin(p.x*.45+p.y*.19+uTime*1.27)+.025*sin(p.y*.87-p.x*.21-uTime*1.63)+detail*(.010*sin(p.x*2.17+p.y*1.54+uTime*2.4)+.004*sin(p.y*3.8-p.x*3.0-uTime*2.9));}
      void main(){
        vec2 p=vWorld.xz;
        float dist=distance(uCamera,vWorld);
        float detail=1.-smoothstep(18.,72.,dist);
        float e=.13;
        vec3 N=normalize(vec3((wave(p-vec2(e,0.),detail)-wave(p+vec2(e,0.),detail))/(2.*e),1.,(wave(p-vec2(0.,e),detail)-wave(p+vec2(0.,e),detail))/(2.*e)));
        vec3 V=normalize(uCamera-vWorld);
        vec2 distortion=N.xz*(.006+.004*(1.-max(N.y,0.)));
        vec4 rp=uReflectionMatrix*vec4(vWorld,1.);vec2 ruv=clamp(rp.xy/rp.w*.5+.5+distortion,vec2(.002),vec2(.998));
        vec4 tp=uRefractionMatrix*vec4(vWorld,1.);vec2 tuv=clamp(tp.xy/tp.w*.5+.5+distortion*.55,vec2(.002),vec2(.998));
        vec3 reflectCol=texture2D(uReflection,ruv).rgb*vec3(.67,.82,.82);
        vec3 refractCol=texture2D(uRefraction,tuv).rgb;
        float shore=abs(p.y-(8.*sin(p.x*.012)+4.*sin(p.x*.037)));
        float depth=max(.0,5.-.008*shore*shore);
        float absorption=1.-exp(-depth*.49);
        vec3 shallow=vec3(.10,.27,.26);
        vec3 refracted=mix(refractCol*.52+shallow*.16,uDeep,absorption*.93);
        refracted=mix(shallow*.72+refractCol*.28,refracted,smoothstep(.25,2.7,depth));
        float fresnel=.035+.82*pow(1.-max(dot(N,V),0.),5.);
        float facing=clamp(1.-dot(N,V),0.,1.);
        float reflectWeight=clamp(.12+fresnel*.88+.04*facing,0.,.83)*mix(.15,1.,smoothstep(.25,2.5,depth));
        vec3 col=mix(refracted,reflectCol,reflectWeight);
        float glint=pow(max(dot(reflect(-uSunDir,N),V),0.),145.);
        glint*=.30+.32*sin(p.x*1.2+p.y*.8+uTime*1.8)*sin(p.y*1.8-uTime*2.1);
        col+=uSunColor*glint*.55*uLight;
        float fog=1.-exp(-pow(dist*uFogDensity,1.55));
        col=mix(col,uFogColor,clamp(fog,0.,.86));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = mesh(new THREE.PlaneGeometry(1200,360,1,1),waterMat,scene,false,false);
  water.rotation.x = -Math.PI/2; water.position.x = 270; water.name='live planar reflection and refraction water';

  // A restrained focus falloff keeps the longship crisp while the distant banks soften.
  const useDOF=!mobile&&renderer.capabilities.isWebGL2;
  let dofActive=useDOF;
  let finalTarget=null,postScene=null,postCamera=null,postMat=null,lastSceneCalls=0;
  if(useDOF){
    const depthTexture=new THREE.DepthTexture(2,2,THREE.UnsignedIntType);depthTexture.format=THREE.DepthFormat;
    finalTarget=new THREE.WebGLRenderTarget(2,2,{depthBuffer:true,depthTexture,stencilBuffer:false});
    finalTarget.texture.colorSpace=THREE.SRGBColorSpace;
    postMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,uniforms:{tColor:{value:finalTarget.texture},tDepth:{value:depthTexture},uResolution:{value:new THREE.Vector2(1,1)},uNear:{value:camera.near},uFar:{value:camera.far},uFocus:{value:22}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`precision highp float;varying vec2 vUv;uniform sampler2D tColor,tDepth;uniform vec2 uResolution;uniform float uNear,uFar,uFocus;
        float linearDepth(float d){float z=d*2.-1.;return (2.*uNear*uFar)/(uFar+uNear-z*(uFar-uNear));}
        void main(){vec3 base=texture2D(tColor,vUv).rgb;float depth=linearDepth(texture2D(tDepth,vUv).r);
          float coc=clamp((abs(depth-uFocus)-uFocus*.17)/(uFocus*3.6),0.,.72);
          vec2 r=vec2(1.15*coc)/uResolution;
          vec3 blur=texture2D(tColor,vUv+vec2(r.x,0.)).rgb+texture2D(tColor,vUv-vec2(r.x,0.)).rgb+
            texture2D(tColor,vUv+vec2(0.,r.y)).rgb+texture2D(tColor,vUv-vec2(0.,r.y)).rgb+
            texture2D(tColor,vUv+vec2(r.x*.70,r.y*.70)).rgb+texture2D(tColor,vUv-vec2(r.x*.70,r.y*.70)).rgb+
            texture2D(tColor,vUv+vec2(-r.x*.70,r.y*.70)).rgb+texture2D(tColor,vUv+vec2(r.x*.70,-r.y*.70)).rgb;
          gl_FragColor=vec4(mix(base,blur*.125,coc*.48),1.);
          #include <colorspace_fragment>
        }`});
    postScene=new THREE.Scene();postCamera=new THREE.Camera();postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMat));
  }

  function makeFoamTexture() {
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    const im=ctx.createImageData(128,128);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const dx=(x-64)/64,dy=(y-64)/64,r=Math.sqrt(dx*dx+dy*dy),a=Math.atan2(dy,dx);
      const ring=Math.exp(-Math.pow((r-.58-.055*Math.sin(a*11)-.035*Math.sin(a*19))/.15,2));
      const grains=(noise2(x*.37,y*.41)-.5)*.55;
      const i=(y*128+x)*4;im.data[i]=223;im.data[i+1]=238;im.data[i+2]=229;im.data[i+3]=clamp((ring+grains*ring)*205,0,255);
    }
    ctx.putImageData(im,0,0);return new THREE.CanvasTexture(c);
  }
  const foamTex=makeFoamTexture(), surfaceEffects=new THREE.Group();scene.add(surfaceEffects);
  const marks=[];
  for(let i=0;i<126;i++){
    const mat=new THREE.MeshBasicMaterial({map:foamTex,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,color:0xe1eee9});
    const m=mesh(new THREE.PlaneGeometry(1,1),mat,surfaceEffects,false,false);m.rotation.x=-Math.PI/2;m.visible=false;
    marks.push({m,life:0,age:0,base:1,kind:'oar'});
  }
  let nextMark=0;
  function spawnMark(x,z,kind='oar',strength=1) {
    const p=marks[nextMark++%marks.length];p.kind=kind;p.age=0;p.life=kind==='wake'?4.8:1.75;
    p.base=(kind==='wake'?.55:.68)*(0.8+seeded()*.45)*strength;
    p.m.position.set(x,.046+seeded()*.012,z);p.m.rotation.z=seeded()*Math.PI*2;p.m.scale.setScalar(p.base);
    p.m.material.opacity=kind==='wake'?.30:.50;p.m.visible=true;
  }
  const drops=[], dropMat=new THREE.MeshBasicMaterial({color:0xd8e9df,transparent:true,opacity:.74,depthWrite:false});
  for(let i=0;i<80;i++){
    const m=mesh(new THREE.SphereGeometry(.035,5,4),dropMat,surfaceEffects,false,false);m.visible=false;
    drops.push({m,life:0,v:new THREE.Vector3()});
  }
  let nextDrop=0;
  function spawnDrops(x,y,z,n=3){
    for(let i=0;i<n;i++){
      const d=drops[nextDrop++%drops.length];d.life=.35+seeded()*.30;d.m.visible=true;d.m.position.set(x+(seeded()-.5)*.18,Math.max(.04,y),z+(seeded()-.5)*.18);
      d.m.scale.setScalar(.65+seeded()*.7);
      d.v.set((seeded()-.5)*1.3,.65+seeded()*1.25,(seeded()-.5)*1.3);
    }
  }

  function updateSail(time) {
    const attr=sailGeo.attributes.position;
    for(let j=0;j<=sv;j++)for(let i=0;i<=su;i++){
      const k=j*(su+1)+i,u=i/su,v=j/sv,q=k*3;
      const freedom=Math.sin(Math.PI*u)*(v*.68+.08);
      attr.setXYZ(k,sailBase[q]+Math.sin(time*1.35+u*4.4+v*2.3)*.12*freedom,
        sailBase[q+1]+Math.sin(time*.86+u*5.3)*.025*v,
        sailBase[q+2]+Math.sin(time*1.12+v*3.4)*.045*freedom);
    }
    attr.needsUpdate=true;
    if(frame%3===0)sailGeo.computeVertexNormals();
    flag.rotation.z=Math.sin(time*1.8)*.11;
  }
  function animateOars(dt,time) {
    for(const o of oars){
      const q=(time*.235+o.phase)%1;
      let sweep,dip,contact=false;
      if(q<.15){ const t=smooth(0,.15,q);sweep=mix(.26,.19,t);dip=mix(-.13,.32,t);contact=q>.105; }
      else if(q<.57){const t=smooth(.15,.57,q);sweep=mix(.19,-.29,t);dip=.32+Math.sin(t*Math.PI)*.025;contact=true;}
      else if(q<.70){const t=smooth(.57,.70,q);sweep=-.29;dip=mix(.32,-.18,t);contact=q<.625;}
      else {const t=smooth(.70,1,q);sweep=mix(-.29,.26,t);dip=-.18;}
      o.pivot.rotation.set(dip*o.side,sweep*o.side,0,'YXZ');
      o.pivot.updateWorldMatrix(true,true);
      const blade=o.blade.getWorldPosition(temp.clone());
      const waveY=.037*Math.sin(blade.x*.45+blade.z*.19+time*1.27)+.025*Math.sin(blade.z*.87-blade.x*.21-time*1.63);
      const actuallyWet=contact&&blade.y<waveY+.09;
      if(actuallyWet){
        o.splashClock=(o.splashClock||0)+dt;
        if(o.splashClock>.11){spawnMark(blade.x,blade.z,'oar');if(q<.18||q>.55)spawnDrops(blade.x,blade.y,blade.z,4);o.splashClock=0;}
      } else o.splashClock=0;
      o.wet=actuallyWet;
    }
    for(const r of rowers){
      const o=r.oar, handle=new THREE.Vector3(0,0,-o.side*.72);
      handle.applyEuler(o.pivot.rotation).add(o.pivot.position);
      const h=[handle.x-r.x,handle.y,handle.z-r.z];
      for(const a of r.arms){
        const sx=.03, sy=1.25, sz=a.handSide*.18;
        const tx=h[0]+a.handSide*.13,ty=h[1]+.025,tz=h[2]+a.handSide*.04;
        const elbow=[mix(sx,tx,.51)-.10,mix(sy,ty,.52)+.02,mix(sz,tz,.52)+a.handSide*.15];
        setLimb(a.upper,[sx,sy,sz],elbow);setLimb(a.fore,elbow,[tx,ty,tz]);a.hand.position.set(tx,ty,tz);
      }
      r.g.rotation.z=.055*Math.sin(time*1.48+o.phase*6.28);
    }
    for(const r of [helm,lookout])for(const a of r.arms){
      const s=a.handSide,from=[.03,1.22,s*.18],el=[.23,.99,s*.32],to=[.36,.77,s*.30];
      setLimb(a.upper,from,el);setLimb(a.fore,el,to);a.hand.position.set(...to);
    }
  }
  let wakeAccumulator=0;
  function updateSurface(dt) {
    if(state.speed>.25){
      wakeAccumulator+=dt;
      if(wakeAccumulator>.16){
        wakeAccumulator=0;
        for(const side of [-1,1]){
          const p=vessel.localToWorld(new THREE.Vector3(-8.55,0,side*.48));
          spawnMark(p.x,p.z,'wake',.9+state.speed*.10);
        }
      }
    }
    for(const p of marks){if(p.life<=0)continue;p.age+=dt;const t=p.age/p.life;
      if(t>=1){p.life=0;p.m.visible=false;continue;}
      const spread=p.kind==='wake'?1.5:1.6;p.m.scale.setScalar(p.base*(1+t*spread));
      p.m.material.opacity=(p.kind==='wake'?.35:.48)*Math.pow(1-t,1.45);
    }
    for(const d of drops){if(d.life<=0)continue;d.life-=dt;if(d.life<=0||d.m.position.y<.015){d.m.visible=false;d.life=0;continue;}
      d.v.y-=5.4*dt;d.m.position.addScaledVector(d.v,dt);
    }
  }

  function resize() {
    const w=innerWidth,h=innerHeight;
    renderer.setPixelRatio(quality.pixelRatio);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    reflectionTarget.setSize(quality.reflection,Math.max(192,Math.round(quality.reflection*h/w)));
    const r=mobile?.45:.58;refractionTarget.setSize(Math.max(320,Math.round(w*r)),Math.max(220,Math.round(h*r)));
    if(finalTarget){finalTarget.setSize(Math.max(1,Math.round(w*quality.pixelRatio)),Math.max(1,Math.round(h*quality.pixelRatio)));postMat.uniforms.uResolution.value.set(finalTarget.width,finalTarget.height);}
  }
  addEventListener('resize',resize,{passive:true});
  function renderWaterPasses() {
    water.visible=false;surfaceEffects.visible=false;
    // Reflect the active camera about the horizontal water plane.
    reflectionCamera.copy(camera,false);
    reflectionCamera.position.copy(camera.position);reflectionCamera.position.y*=-1;
    const target=temp.copy(camera.position).add(camera.getWorldDirection(temp2).multiplyScalar(10));target.y*=-1;
    reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(target);reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflectionCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    const oldClip=renderer.clippingPlanes;
    renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),-.025)];
    renderer.setRenderTarget(reflectionTarget);renderer.clear();renderer.render(scene,reflectionCamera);
    renderer.clippingPlanes=oldClip;
    renderer.setRenderTarget(refractionTarget);renderer.clear();renderer.render(scene,camera);
    renderer.setRenderTarget(null);
    water.visible=true;surfaceEffects.visible=true;
    waterUniforms.uReflectionMatrix.value.multiplyMatrices(reflectionCamera.projectionMatrix,reflectionCamera.matrixWorldInverse);
    waterUniforms.uRefractionMatrix.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    waterUniforms.uCamera.value.copy(camera.position);
  }

  const lightButtons=[...document.querySelectorAll('[data-light]')];
  const cameraNames=['跟随镜头','环绕镜头','电影镜头'];
  function selectLight(name){if(!presets[name])return;state.lighting=name;lightButtons.forEach(b=>b.classList.toggle('active',b.dataset.light===name));}
  lightButtons.forEach(b=>b.addEventListener('click',()=>selectLight(b.dataset.light)));
  function setAuto(v){state.auto=v;$('#auto-btn').classList.toggle('active',v);$('#auto-btn').textContent=v?'自动航行':'手动航行';}
  $('#auto-btn').addEventListener('click',()=>setAuto(!state.auto));
  function cycleCamera(){cameraMode=(cameraMode+1)%3;$('#camera-btn').textContent=cameraNames[cameraMode];if(cameraMode===0){orbitYaw=.50;orbitPitch=.24;cameraDistance=21;}if(cameraMode===1){cameraDistance=25;}}
  $('#camera-btn').addEventListener('click',cycleCamera);
  function setPause(v){paused=v;$('#pause-btn').textContent=v?'▶':'Ⅱ';$('#pause-btn').title=v?'继续':'暂停';if(audioMaster&&audioContext)audioMaster.gain.setTargetAtTime(v?0:(soundEnabled?.28:0),audioContext.currentTime,.08);}
  $('#pause-btn').addEventListener('click',()=>setPause(!paused));
  function reset(){state.x=0;state.z=centerline(0);state.yaw=-Math.atan(centerSlope(0));state.speed=3.5;state.targetSpeed=3.5;state.travelled=0;elapsed=0;setAuto(true);setPause(false);for(const p of marks){p.life=0;p.m.visible=false;}for(const d of drops){d.life=0;d.m.visible=false;}updateChapter();}
  $('#reset-btn').addEventListener('click',reset);
  $('#fullscreen-btn').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();});
  function hideUI(v){$('#ui').classList.toggle('hidden',v);document.body.classList.toggle('ui-hidden',v);}
  $('#hide-btn').addEventListener('click',()=>hideUI(true));$('#restore-ui').addEventListener('click',()=>hideUI(false));
  const soundMenu=$('#sound-menu');
  $('#sound-btn').addEventListener('click',()=>{
    if(!soundEnabled){startAudio();soundMenu.classList.add('open');}
    else soundMenu.classList.toggle('open');
  });
  document.querySelectorAll('[data-sound]').forEach(box=>box.addEventListener('change',()=>updateAudioLevels()));
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k))e.preventDefault();
    keys.add(k);
    if(e.repeat)return;
    if(k==='c')cycleCamera();if(k==='r')reset();if(k==='h')hideUI(!document.body.classList.contains('ui-hidden'));
    if(k===' ')setPause(!paused);
    if('adarrowleftarrowright'.includes(k)&&['a','d','arrowleft','arrowright'].includes(k))setAuto(false);
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>{keys.clear();holds.clear();cameraDrag=false;});
  for(const b of document.querySelectorAll('[data-hold]')){
    const name=b.dataset.hold;
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);holds.add(name);if(name==='left'||name==='right')setAuto(false);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>holds.delete(name));
  }
  let dragX=0,dragY=0;
  canvas.addEventListener('pointerdown',e=>{cameraDrag=true;dragX=e.clientX;dragY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!cameraDrag)return;const dx=e.clientX-dragX,dy=e.clientY-dragY;dragX=e.clientX;dragY=e.clientY;orbitYaw=clamp(orbitYaw+dx*.006,-2.8,2.8);orbitPitch=clamp(orbitPitch+dy*.004,-.04,.85);});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{cameraDrag=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();cameraDistance=clamp(cameraDistance+e.deltaY*.018,12,58);},{passive:false});

  let audioContext=null,audioMaster=null,soundEnabled=false,audioWater=null,audioWind=null,audioOars=null,birdClock=5.0;
  function noiseLoop(context,seconds=2){
    const n=Math.floor(context.sampleRate*seconds),buffer=context.createBuffer(1,n,context.sampleRate),data=buffer.getChannelData(0);
    let brown=0;for(let i=0;i<n;i++){brown=(brown+(seeded()*2-1)*.065)*.995;data[i]=clamp(brown,-1,1);}
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;return source;
  }
  function filteredLayer(freq,gain){
    const src=noiseLoop(audioContext),filter=audioContext.createBiquadFilter(),amp=audioContext.createGain();
    filter.type='lowpass';filter.frequency.value=freq;amp.gain.value=gain;src.connect(filter).connect(amp).connect(audioMaster);src.start();return {src,filter,amp};
  }
  function startAudio(){
    try{
      if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();audioMaster=audioContext.createGain();audioMaster.gain.value=0;audioMaster.connect(audioContext.destination);
        audioWater=filteredLayer(650,.20);audioWind=filteredLayer(220,.13);audioOars=filteredLayer(1200,.0);
      }
      audioContext.resume();soundEnabled=true;$('#sound-btn').classList.add('active');$('#sound-btn').title='声音已开启';updateAudioLevels();
    }catch(e){console.warn('Audio unavailable:',e);soundEnabled=false;}
  }
  function updateAudioLevels(){
    if(!audioContext)return;const enabled=key=>document.querySelector(`[data-sound="${key}"]`).checked;
    const t=audioContext.currentTime;
    audioMaster.gain.setTargetAtTime(soundEnabled&&!paused?.28:0,t,.1);
    audioWater.amp.gain.setTargetAtTime(enabled('water')?.22:0,t,.2);
    audioWind.amp.gain.setTargetAtTime(enabled('wind')?.14:0,t,.2);
    if(!enabled('oars'))audioOars.amp.gain.setTargetAtTime(0,t,.08);
  }
  function birdsong(){
    if(!audioContext||!soundEnabled||paused||!document.querySelector('[data-sound="birds"]').checked)return;
    const t=audioContext.currentTime;
    for(let i=0;i<3;i++){
      const osc=audioContext.createOscillator(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();
      osc.type='sine';filter.type='lowpass';filter.frequency.value=3600;
      const at=t+i*.16,base=980+seeded()*470;osc.frequency.setValueAtTime(base,at);osc.frequency.exponentialRampToValueAtTime(base*1.27,at+.10);osc.frequency.exponentialRampToValueAtTime(base*.84,at+.22);
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.027,at+.035);gain.gain.exponentialRampToValueAtTime(.0001,at+.25);
      osc.connect(filter).connect(gain).connect(audioMaster);osc.start(at);osc.stop(at+.26);
    }
  }
  function updateAudio(dt){
    if(!audioContext||!soundEnabled)return;
    const enabled=key=>document.querySelector(`[data-sound="${key}"]`).checked;
    if(enabled('oars')){const wet=oars.filter(o=>o.wet).length/oars.length;audioOars.amp.gain.setTargetAtTime(wet*.12,audioContext.currentTime,.07);}
    birdClock-=dt;if(birdClock<=0){birdsong();birdClock=5+seeded()*8;}
  }

  const chapterNames=['晨雾中的峡湾','悬崖与瀑布','北方的灯火'];
  function updateChapter(){
    const c=state.x<200?0:state.x<410?1:2;if(c===state.chapter&&frame>1)return;
    state.chapter=c;$('#chapter-index').textContent=`CHAPTER 0${c+1} / 03`;$('#chapter-title').textContent=chapterNames[c];
  }
  function shortest(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
  function updateNavigation(dt,time){
    let turn=0;
    if(keys.has('a')||keys.has('arrowleft')||holds.has('left'))turn+=1;
    if(keys.has('d')||keys.has('arrowright')||holds.has('right'))turn-=1;
    if(turn)setAuto(false);
    const fast=keys.has('w')||keys.has('arrowup')||holds.has('faster');
    const slow=keys.has('s')||keys.has('arrowdown')||holds.has('slower');
    if(fast)state.targetSpeed=clamp(state.targetSpeed+dt*1.55,0,7.3);
    if(slow)state.targetSpeed=clamp(state.targetSpeed-dt*1.55,0,7.3);
    state.speed=mix(state.speed,state.targetSpeed,Math.min(1,dt*.8));
    if(state.auto){
      const desiredSlope=centerSlope(state.x+13)+(centerline(state.x+13)-state.z)*.050;
      const desired=-Math.atan(desiredSlope);
      state.yaw+=clamp(shortest(state.yaw,desired),-dt*.40,dt*.40);
    }else state.yaw+=turn*dt*(.15+.24*state.speed/7.3);
    const dx=Math.cos(state.yaw)*state.speed*dt,dz=-Math.sin(state.yaw)*state.speed*dt;
    const nx=clamp(state.x+dx,-265,800),nz=state.z+dz;
    const d=Math.abs(nz-centerline(nx));
    const bowX=nx+Math.cos(state.yaw)*8.9,bowZ=nz-Math.sin(state.yaw)*8.9;
    const bowD=Math.abs(bowZ-centerline(bowX));
    const sternX=nx-Math.cos(state.yaw)*8.9,sternZ=nz+Math.sin(state.yaw)*8.9;
    const sternD=Math.abs(sternZ-centerline(sternX));
    if(d<19.7&&bowD<20.3&&sternD<20.3){state.x=nx;state.z=nz;state.travelled+=Math.sqrt(dx*dx+dz*dz);}
    else{
      state.targetSpeed=Math.min(state.targetSpeed,2.8);state.speed=Math.min(state.speed,3.0);
      const correction=-Math.atan(centerSlope(state.x)+(centerline(state.x)-state.z)*.12);
      state.yaw+=clamp(shortest(state.yaw,correction),-dt*.65,dt*.65);
    }
    shipRoot.position.set(state.x,0,state.z);shipRoot.rotation.y=state.yaw;
    vessel.position.y=.035*Math.sin(time*1.55)+.017*Math.sin(time*2.53+1);
    vessel.rotation.set(.016*Math.sin(time*1.25)+turn*.015,0,.011*Math.sin(time*1.80+.8));
    updateChapter();
    if(frame%12===0)$('#telemetry').textContent=`航速 ${(state.speed*1.9438).toFixed(1)} kn · 航向 ${String((Math.round((-state.yaw*180/Math.PI+90+360)%360))).padStart(3,'0')}°`;
  }
  const camFocus=new THREE.Vector3(1,2,0);
  function updateCamera(dt,time){
    const focus=shipRoot.localToWorld(new THREE.Vector3(cameraMode===2?2:1.2,cameraMode===2?2.45:2.15,0));
    let yaw=orbitYaw,pitch=orbitPitch,dist=cameraDistance;
    if(cameraMode===2){yaw=.62+Math.sin(time*.13)*.42+orbitYaw*.16;pitch=.25+Math.sin(time*.11)*.09;dist=28+Math.sin(time*.16)*3;}
    const local=new THREE.Vector3(-Math.cos(yaw)*Math.cos(pitch)*dist,3.0+Math.sin(pitch)*dist,Math.sin(yaw)*Math.cos(pitch)*dist);
    const desired=shipRoot.localToWorld(local);
    const factor=1-Math.exp(-dt*(cameraMode===2?1.2:2.9));
    camera.position.lerp(desired,factor);camFocus.lerp(focus,Math.min(1,factor*1.4));camera.lookAt(camFocus);camera.updateMatrixWorld(true);
  }
  function updateLighting(dt){
    const p=presets[state.lighting],t=1-Math.exp(-dt*1.25);
    scene.fog.color.lerp(new THREE.Color(p.fog),t);scene.fog.density=mix(scene.fog.density,p.fogDensity,t);
    sun.color.lerp(new THREE.Color(p.sun),t);sun.intensity=mix(sun.intensity,p.intensity,t);
    hemi.color.lerp(new THREE.Color(p.ambient),t);hemi.intensity=mix(hemi.intensity,p.hemi,t);
    ambient.color.lerp(new THREE.Color(p.ambient),t);
    renderer.toneMappingExposure=mix(renderer.toneMappingExposure,p.exposure,t);
    const dir=waterUniforms.uSunDir.value,desired=new THREE.Vector3(...p.sunDir).normalize();dir.lerp(desired,t).normalize();
    sun.position.copy(shipRoot.position).addScaledVector(dir,110);sun.target.position.copy(shipRoot.position);sun.target.updateMatrixWorld();
    const su=sky.material.uniforms;
    su.uZenith.value.lerp(new THREE.Color(p.zenith),t);
    su.uHorizon.value.lerp(new THREE.Color(p.horizon),t);
    su.uSun.value.lerp(new THREE.Color(p.sun),t);su.uSunDir.value.copy(dir);su.uCloud.value=mix(su.uCloud.value,state.lighting==='overcast'?.75:.36,t);
    waterUniforms.uDeep.value.lerp(new THREE.Color(p.water),t);waterUniforms.uFogColor.value.copy(scene.fog.color);
    waterUniforms.uFogDensity.value=scene.fog.density;waterUniforms.uSunColor.value.copy(sun.color);
    waterUniforms.uLight.value=mix(waterUniforms.uLight.value,p.intensity/2,t);
    for(const l of lanterns){l.light.intensity=mix(l.light.intensity,state.lighting==='moon'?2.6:1.2,t);}
  }
  function updateLOD(){
    for(const c of treeChunks){const d=Math.abs(c.x-camera.position.x);c.group.visible=d<410;c.branch.visible=d<145;}
  }
  let avgDt=0,slowCount=0,adapted=false;
  function animate(){
    requestAnimationFrame(animate);
    const wallDt=Math.min(.25,clock.getDelta()),rawDt=Math.min(.05,wallDt),dt=paused?0:rawDt;
    if(!paused){elapsed+=dt;frame++;updateNavigation(dt,elapsed);updateSail(elapsed);animateOars(dt,elapsed);updateSurface(dt);updateAudio(dt);}
    updateCamera(wallDt,elapsed);updateLighting(wallDt);updateLOD();
    sky.position.copy(camera.position);sky.updateMatrixWorld(true);waterUniforms.uTime.value=elapsed;for(const m of waterfallMats)m.uniforms.uTime.value=elapsed;
    renderWaterPasses();
    if(finalTarget&&dofActive){
      postMat.uniforms.uFocus.value=camera.position.distanceTo(shipRoot.position);
      renderer.setRenderTarget(finalTarget);renderer.clear();renderer.render(scene,camera);lastSceneCalls=renderer.info.render.calls;
      renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
    }else{renderer.render(scene,camera);lastSceneCalls=renderer.info.render.calls;}
    if(!adapted&&frame>25){avgDt=avgDt*.92+wallDt*.08;if(avgDt>.038)slowCount++;else slowCount=Math.max(0,slowCount-2);
      if(slowCount>25){quality.pixelRatio=Math.max(.8,quality.pixelRatio*.78);quality.reflection=Math.max(256,Math.round(quality.reflection*.7));dofActive=false;adapted=true;resize();}}
  }
  reset();
  shipRoot.position.set(state.x,0,state.z);shipRoot.rotation.y=state.yaw;
  camera.position.copy(shipRoot.localToWorld(new THREE.Vector3(-18,8,11)));camFocus.copy(shipRoot.position).add(new THREE.Vector3(1,2,0));camera.lookAt(camFocus);
  updateLighting(1);updateSail(0);animateOars(0,0);resize();
  const loading=$('#loading');setTimeout(()=>loading.classList.add('done'),350);
  window.__northbound={
    get state(){return {...state,paused,cameraMode,cameraName:cameraNames[cameraMode],quality:{...quality,dof:dofActive},wetOars:oars.filter(o=>o.wet).length,activeMarks:marks.filter(m=>m.life>0).length,errors:errorCount,drawCalls:lastSceneCalls};},
    selectLight,cycleCamera,setAuto,setPause,reset,
    setPosition(x,z){state.x=x;state.z=z;shipRoot.position.set(x,0,z);camera.position.copy(shipRoot.localToWorld(new THREE.Vector3(-18,8,11)));camFocus.copy(shipRoot.position).add(new THREE.Vector3(1,2,0));},
    setView(mode,yaw,pitch,distance){cameraMode=mode;orbitYaw=yaw;orbitPitch=pitch;cameraDistance=distance;$('#camera-btn').textContent=cameraNames[mode];const f=shipRoot.localToWorld(new THREE.Vector3(1.2,2.15,0));const p=shipRoot.localToWorld(new THREE.Vector3(-Math.cos(yaw)*Math.cos(pitch)*distance,3+Math.sin(pitch)*distance,Math.sin(yaw)*Math.cos(pitch)*distance));camera.position.copy(p);camFocus.copy(f);camera.lookAt(f);},
    inspect:{boat:vessel,water,scene,camera,renderer,reflectionTarget,refractionTarget}
  };
  animate();
})();
