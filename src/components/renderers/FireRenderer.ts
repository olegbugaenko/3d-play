import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

type Vec3 = { x:number; y:number; z:number };

export interface FireSourceData {
  // геометрія джерела
  spreadX?: number;        // розкид по X при спавні (еліпс), world units
  spreadZ?: number;        // розкид по Z при спавні (еліпс), world units

  // динаміка/висота
  emitRate?: number;       // частинок/сек
  life?: number;           // сек
  rise?: number;           // висота підйому за життя

  // шум/завихрення
  flow?: number;           // базова сила переносу
  swirlAmp?: number;       // амплітуда swirl
  noiseScale?: number;     // масштаб просторового шуму
  timeScale?: number;      // швидкість «течії» шуму

  // жорсткі межі розльоту (не стосується rise)
  advMaxXZ?: number;       // макс. горизонтальний дрейф від старту
  advMaxY?: number;        // макс. вертикальний дрейф від шуму

  // вигляд
  baseSize?: number;       // базовий розмір спрайта (px)
  color?: number;          // базовий колір
  intensity?: number;      // інтенсивність світіння
  flickerSpeed?: number;   // швидкість мерехтіння

  // опції
  heatDistortion?: number;
  enabled?: boolean;
}

export class FireRenderer extends BaseRenderer {
  private readonly MAX_PARTICLES = 60000;
  private readonly MAX_EMITTERS  = 50;

  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  // пер-частинка (мінімальний набір + паковані vec4)
  private aBirth!: Float32Array;
  private aStart!: Float32Array;    // vec3
  private aColor!: Float32Array;    // vec3

  // паковані атрибути:
  // aLRFN = (life, rise, flow, noiseScale)
  private aLRFN!: Float32Array;     // vec4
  // aTSIF = (timeScale, sizePx, intensity, flickerSpeed)
  private aTSIF!: Float32Array;     // vec4
  // aLimSeed = (advMaxXZ, advMaxY, swirlAmp, seed)
  private aLimSeed!: Float32Array;  // vec4

  // службові (не в шейдері)
  private aEmitter!: Float32Array;

  private head = 0;
  private clock = new THREE.Clock();

  // еміттери
  private emitterPos = new Float32Array(this.MAX_EMITTERS * 3);
  private emitterEmitRate = new Float32Array(this.MAX_EMITTERS);
  private emitterLife = new Float32Array(this.MAX_EMITTERS);
  private emitterRise = new Float32Array(this.MAX_EMITTERS);
  private emitterFlow = new Float32Array(this.MAX_EMITTERS);
  private emitterSwirlAmp = new Float32Array(this.MAX_EMITTERS);
  private emitterNoiseScale = new Float32Array(this.MAX_EMITTERS);
  private emitterTimeScale = new Float32Array(this.MAX_EMITTERS);
  private emitterBaseSize = new Float32Array(this.MAX_EMITTERS);
  private emitterColor = new Float32Array(this.MAX_EMITTERS * 3);
  private emitterIntensity = new Float32Array(this.MAX_EMITTERS);
  private emitterFlickerSpeed = new Float32Array(this.MAX_EMITTERS);
  private emitterHeatDistortion = new Float32Array(this.MAX_EMITTERS);
  private emitterSpreadX = new Float32Array(this.MAX_EMITTERS);
  private emitterSpreadZ = new Float32Array(this.MAX_EMITTERS);
  private emitterAdvMaxXZ = new Float32Array(this.MAX_EMITTERS);
  private emitterAdvMaxY  = new Float32Array(this.MAX_EMITTERS);

  private emitterAcc = new Float32Array(this.MAX_EMITTERS);
  private emitterCount = 0;

  private fireTex: THREE.Texture;

  constructor(scene: THREE.Scene) {
    super(scene);
    this.group = new THREE.Group();
    this.group.name = 'FireGroup';
    this.scene.add(this.group);

    this.fireTex = this.createFireTexture();
    this.initParticles();
    this.initShaders();

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // без фрустум-кулінгу
    this.group.add(this.points);
  }

  // ---------- procedural texture ----------
  private createFireTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const g = ctx.createRadialGradient(size/2,size/2,0, size/2,size/2,size/2);
    g.addColorStop(0.00,'rgba(255,255,255,1.0)');
    g.addColorStop(0.30,'rgba(255,200,100,0.9)');
    g.addColorStop(0.60,'rgba(255,100,50,0.7)');
    g.addColorStop(0.80,'rgba(255,50,0,0.4)');
    g.addColorStop(1.00,'rgba(255,0,0,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);

    const image = ctx.getImageData(0,0,size,size);
    const data = image.data;
    for (let i=0;i<data.length;i+=4){
      const n = (Math.random()-0.5)*0.3;
      data[i]   = Math.min(255, data[i]   + n*255);
      data[i+1] = Math.min(255, data[i+1] + n*255);
      data[i+2] = Math.min(255, data[i+2] + n*255);
    }
    ctx.putImageData(image,0,0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------- buffers ----------
  private initParticles() {
    const N = this.MAX_PARTICLES;
    this.geometry = new THREE.BufferGeometry();

    // «позиції» для Points — dummy, в шейдері не використовуємо
    const positions = new Float32Array(N * 3);

    this.aBirth   = new Float32Array(N);
    this.aEmitter = new Float32Array(N);
    this.aStart   = new Float32Array(N * 3);
    this.aColor   = new Float32Array(N * 3);

    this.aLRFN    = new Float32Array(N * 4);
    this.aTSIF    = new Float32Array(N * 4);
    this.aLimSeed = new Float32Array(N * 4);

    for (let i=0;i<N;i++){
      this.aBirth[i] = -1e9;
      this.aEmitter[i] = 0;
      const i3 = i*3, i4 = i*4;

      positions[i3+0]=positions[i3+1]=positions[i3+2]=0;
      this.aStart[i3+0]=this.aStart[i3+1]=this.aStart[i3+2]=0;

      // дефолтний колір (оранж)
      this.aColor[i3+0]=1.0; this.aColor[i3+1]=0.6; this.aColor[i3+2]=0.2;

      // aLRFN: (life, rise, flow, noiseScale)
      this.aLRFN[i4+0]=2.5;
      this.aLRFN[i4+1]=4.0;
      this.aLRFN[i4+2]=1.2;
      this.aLRFN[i4+3]=0.8;

      // aTSIF: (timeScale, size, intensity, flicker)
      this.aTSIF[i4+0]=1.2;
      this.aTSIF[i4+1]=24.0;
      this.aTSIF[i4+2]=1.0;
      this.aTSIF[i4+3]=1.0;

      // aLimSeed: (advMaxXZ, advMaxY, swirlAmp, seed)
      this.aLimSeed[i4+0]=0.3;
      this.aLimSeed[i4+1]=0.2;
      this.aLimSeed[i4+2]=1.0;
      this.aLimSeed[i4+3]=Math.random()*1000.0;
    }

    this.geometry.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aBirth',    new THREE.BufferAttribute(this.aBirth, 1));
    this.geometry.setAttribute('aStart',    new THREE.BufferAttribute(this.aStart, 3));
    this.geometry.setAttribute('aColor',    new THREE.BufferAttribute(this.aColor, 3));

    this.geometry.setAttribute('aLRFN',     new THREE.BufferAttribute(this.aLRFN,  4));
    this.geometry.setAttribute('aTSIF',     new THREE.BufferAttribute(this.aTSIF,  4));
    this.geometry.setAttribute('aLimSeed',  new THREE.BufferAttribute(this.aLimSeed,4));
  }

  // ---------- shaders ----------
  private initShaders() {
    const vertexShader = `
    precision mediump float;
    uniform float uTime;
    uniform float uPixelRatio;

    attribute float aBirth;
    attribute vec3  aStart;
    attribute vec3  aColor;

    // паковані:
    attribute vec4  aLRFN;     // (life, rise, flow, noiseScale)
    attribute vec4  aTSIF;     // (timeScale, sizePx, intensity, flickerSpeed)
    attribute vec4  aLimSeed;  // (advMaxXZ, advMaxY, swirlAmp, seed)

    varying float vAlpha;
    varying vec3  vColor;
    varying float vIntensity;
    varying float vFlicker;

    float hash(vec3 p){
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p){
      vec3 i = floor(p);
      vec3 f = fract(p);
      vec3 u = f*f*(3.0-2.0*f);
      float n000 = hash(i + vec3(0,0,0));
      float n100 = hash(i + vec3(1,0,0));
      float n010 = hash(i + vec3(0,1,0));
      float n110 = hash(i + vec3(1,1,0));
      float n001 = hash(i + vec3(0,0,1));
      float n101 = hash(i + vec3(1,0,1));
      float n011 = hash(i + vec3(0,1,1));
      float n111 = hash(i + vec3(1,1,1));
      float nx00 = mix(n000, n100, u.x);
      float nx10 = mix(n010, n110, u.x);
      float nx01 = mix(n001, n101, u.x);
      float nx11 = mix(n011, n111, u.x);
      float nxy0 = mix(nx00, nx10, u.y);
      float nxy1 = mix(nx01, nx11, u.y);
      return mix(nxy0, nxy1, u.z);
    }

    float fbm(vec3 p){
      float a = 0.0;
      float w = 0.5;
      for(int i=0;i<3;i++){
        a += w * noise(p);
        p *= 2.0;
        w *= 0.5;
      }
      return a;
    }

    void main(){
      // розпаковка
      float lifeP     = aLRFN.x;
      float riseP     = aLRFN.y;
      float flowP     = aLRFN.z;
      float noiseP    = aLRFN.w;

      float timeScale = aTSIF.x;
      float sizePx    = aTSIF.y;
      float intensity = aTSIF.z;
      float flickerSp = aTSIF.w;

      float advMaxXZ  = aLimSeed.x;
      float advMaxY   = aLimSeed.y;
      float swirlAmp  = aLimSeed.z;
      float seedP     = aLimSeed.w;

      float age = clamp((uTime - aBirth) / lifeP, 0.0, 1.0);
      float ageWide = pow(age, 0.8);

      vec3 pos = aStart;

      // підйом
      float rise = riseP * (age*age*(2.0-age));
      pos.y += rise;

      // пер-частинкова дезсинхронізація
      float rPhase = fract(sin(seedP*12.9898)*43758.5453);
      float timeJitter = mix(0.75, 1.25, rPhase);
      float t = uTime * timeScale * timeJitter;

      // seed-зсув простору
      vec3 q = aStart * noiseP + vec3(
        seedP*0.137, seedP*1.731, seedP*2.193
      );

      // анізотропний шум
      vec3 swirl = vec3(
        fbm(q + vec3(t, 0.0, 0.0)) - 0.5,
        fbm(q + vec3(0.0, t*1.13, 0.0)) - 0.5,
        fbm(q + vec3(0.0, 0.0, t*0.87)) - 0.5
      );

      vec3 adv = swirl * swirlAmp * flowP * (0.5 + 1.5*ageWide);

      // обмеження дрейфу (відносно старту)
      vec2 advXZ = adv.xy; // ОЙ! xz -> використовуємо xz, не xy
      advXZ = vec2(adv.x, adv.z);
      float lenXZ = length(advXZ);
      if (lenXZ > advMaxXZ) advXZ *= (advMaxXZ / lenXZ);
      adv.x = advXZ.x; adv.z = advXZ.y;

      adv.y = clamp(adv.y, -advMaxY, advMaxY);

      pos += adv;

      // мерехтіння
      float flicker = 0.8 + 0.4 * sin(uTime * flickerSp + seedP);
      vColor = aColor * flicker;
      vIntensity = intensity * flicker;
      vFlicker = flicker;

      // альфа
      vAlpha = (1.0 - age) * (0.3 + 0.7 * ageWide);

      // розмір
      float sizeJitter = 0.7 + 0.6 * hash(vec3(seedP, 0.0, 0.0));
      float size = sizePx * (1.2 + 0.8 * age) * sizeJitter * flicker;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * uPixelRatio * (32.0 / -mv.z);
      gl_PointSize = min(gl_PointSize, 1024.0);

      gl_Position = projectionMatrix * mv;
    }`;

    const fragmentShader = `
    precision mediump float;
    varying float vAlpha;
    varying vec3  vColor;
    varying float vIntensity;
    varying float vFlicker;
    uniform sampler2D uFireTex;

    void main(){
      vec2 uv = gl_PointCoord;

      float texA = texture2D(uFireTex, uv).a;

      vec2 uvC = uv - 0.5;
      float r = length(uvC);
      float soft = smoothstep(0.6, 0.0, r);

      vec3 fireColor = vColor;

      float core = smoothstep(0.8, 0.0, r);
      fireColor = mix(fireColor, vec3(1.0, 0.9, 0.6), core * 0.6);

      float edge = smoothstep(0.4, 0.0, r);
      fireColor = mix(fireColor, vec3(0.2, 0.4, 1.0), edge * 0.3);

      float alpha = texA * soft * vAlpha * vIntensity;
      if (alpha < 0.02) discard;

      gl_FragColor = vec4(fireColor, alpha);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uFireTex:    { value: this.fireTex }
      }
    });
    (this.material as any).toneMapped = true;
  }

  // ---------- emitters ----------
  addFireSource(position: Vec3, opts: FireSourceData = {}): number {
    const i = this.emitterCount;
    if (i >= this.MAX_EMITTERS) { console.warn('FireRenderer: MAX_EMITTERS reached'); return -1; }

    this.emitterPos[i*3+0] = position.x;
    this.emitterPos[i*3+1] = position.y;
    this.emitterPos[i*3+2] = position.z;

    this.emitterEmitRate[i]   = opts.emitRate   ?? 48;
    this.emitterLife[i]       = opts.life       ?? 2.5;
    this.emitterRise[i]       = opts.rise       ?? 4.0;

    this.emitterFlow[i]       = opts.flow       ?? 1.2;
    this.emitterSwirlAmp[i]   = opts.swirlAmp   ?? 1.0;
    this.emitterNoiseScale[i] = opts.noiseScale ?? 0.8;
    this.emitterTimeScale[i]  = opts.timeScale  ?? 1.2;

    this.emitterAdvMaxXZ[i]   = opts.advMaxXZ   ?? 0.4;
    this.emitterAdvMaxY[i]    = opts.advMaxY    ?? 0.25;

    this.emitterSpreadX[i]    = opts.spreadX    ?? 0.2;
    this.emitterSpreadZ[i]    = opts.spreadZ    ?? 0.2;

    this.emitterBaseSize[i]   = opts.baseSize   ?? 24.0;
    this.emitterIntensity[i]  = opts.intensity  ?? 1.0;
    this.emitterFlickerSpeed[i] = opts.flickerSpeed ?? 1.0;
    this.emitterHeatDistortion[i] = opts.heatDistortion ?? 0.5;

    const c = new THREE.Color(opts.color ?? 0xFF6600);
    this.emitterColor[i*3+0] = c.r;
    this.emitterColor[i*3+1] = c.g;
    this.emitterColor[i*3+2] = c.b;

    this.emitterAcc[i] = 0;
    this.emitterCount++;
    return i;
  }

  moveFireSource(index: number, pos: Vec3) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emitterPos[index*3+0] = pos.x;
    this.emitterPos[index*3+1] = pos.y;
    this.emitterPos[index*3+2] = pos.z;
  }

  private spawnParticle(emitterIdx: number, now: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.MAX_PARTICLES;

    const ex = this.emitterPos[emitterIdx*3+0];
    const ey = this.emitterPos[emitterIdx*3+1];
    const ez = this.emitterPos[emitterIdx*3+2];

    // еліпс спавну (площа основи)
    const rx = this.emitterSpreadX[emitterIdx];
    const rz = this.emitterSpreadZ[emitterIdx];
    const theta = Math.random() * Math.PI * 2.0;
    const u = Math.random();
    const r = Math.sqrt(u);
    const dx = r * Math.cos(theta) * rx;
    const dz = r * Math.sin(theta) * rz;

    const i3 = i*3, i4 = i*4;

    // стартова позиція
    this.aStart[i3+0] = ex + dx;
    this.aStart[i3+1] = ey + (Math.random()*0.02);
    this.aStart[i3+2] = ez + dz;

    // час народження / службові
    this.aBirth[i]    = now;
    this.aEmitter[i]  = emitterIdx;

    // колір
    this.aColor[i3+0] = this.emitterColor[emitterIdx*3+0];
    this.aColor[i3+1] = this.emitterColor[emitterIdx*3+1];
    this.aColor[i3+2] = this.emitterColor[emitterIdx*3+2];

    // aLRFN
    this.aLRFN[i4+0] = this.emitterLife[emitterIdx];
    this.aLRFN[i4+1] = this.emitterRise[emitterIdx];
    this.aLRFN[i4+2] = this.emitterFlow[emitterIdx];
    this.aLRFN[i4+3] = this.emitterNoiseScale[emitterIdx];

    // aTSIF
    this.aTSIF[i4+0] = this.emitterTimeScale[emitterIdx];
    this.aTSIF[i4+1] = this.emitterBaseSize[emitterIdx];
    this.aTSIF[i4+2] = this.emitterIntensity[emitterIdx];
    this.aTSIF[i4+3] = this.emitterFlickerSpeed[emitterIdx];

    // aLimSeed
    this.aLimSeed[i4+0] = this.emitterAdvMaxXZ[emitterIdx];
    this.aLimSeed[i4+1] = this.emitterAdvMaxY[emitterIdx];
    this.aLimSeed[i4+2] = this.emitterSwirlAmp[emitterIdx];
    this.aLimSeed[i4+3] = Math.random() * 1000.0;

    // позначаємо апдейти
    (this.geometry.getAttribute('aBirth')   as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aStart')   as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor')   as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aLRFN')    as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aTSIF')    as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aLimSeed') as THREE.BufferAttribute).needsUpdate = true;
  }

  updateAllFire() {
    const dt = this.clock.getDelta();
    const now = (this.material.uniforms.uTime.value as number) + dt;
    this.material.uniforms.uTime.value = now;

    // простий LOD
    let lodMultiplier = 1.0;
    const cam = this.scene.children.find(ch => (ch as any).isCamera) as THREE.Camera | undefined;
    if (cam && (cam as any).isPerspectiveCamera) {
      const pc = cam as THREE.PerspectiveCamera;
      let minD2 = Infinity;
      for (let i=0;i<this.emitterCount;i++){
        const dx = pc.position.x - this.emitterPos[i*3+0];
        const dy = pc.position.y - this.emitterPos[i*3+1];
        const dz = pc.position.z - this.emitterPos[i*3+2];
        const d2 = dx*dx+dy*dy+dz*dz;
        if (d2 < minD2) minD2 = d2;
      }
      const d = Math.sqrt(minD2);
      if (d > 100) lodMultiplier = 0.3;
      else if (d > 50) lodMultiplier = 0.6;
      else if (d > 20) lodMultiplier = 0.8;
    }

    for (let i=0; i<this.emitterCount; i++) {
      if (this.emitterEmitRate[i] <= 0) continue;
      this.emitterAcc[i] += dt * this.emitterEmitRate[i] * lodMultiplier;
      let n = (this.emitterAcc[i] | 0);
      this.emitterAcc[i] -= n;
      while (n-- > 0) this.spawnParticle(i, now);
    }
  }

  // ---------- BaseRenderer API ----------
  render(object: SceneObject): THREE.Object3D {
    const idx = this.addFireSource(object.coordinates, {
      spreadX:      object.data?.spreadX,
      spreadZ:      object.data?.spreadZ,
      emitRate:     object.data?.emitRate,
      life:         object.data?.life,
      rise:         object.data?.rise,
      flow:         object.data?.flow,
      swirlAmp:     object.data?.swirlAmp,
      noiseScale:   object.data?.noiseScale,
      timeScale:    object.data?.timeScale,
      advMaxXZ:     object.data?.advMaxXZ,
      advMaxY:      object.data?.advMaxY,
      baseSize:     object.data?.baseSize,
      color:        object.data?.color,
      intensity:    object.data?.intensity,
      flickerSpeed: object.data?.flickerSpeed,
      heatDistortion: object.data?.heatDistortion
    });

    this.addMesh(object.id, this.points);
    (this.points as any).__emitterIndexMap = (this.points as any).__emitterIndexMap || new Map<string, number>();
    (this.points as any).__emitterIndexMap.set(object.id, idx);
    return this.points;
  }

  update(object: SceneObject): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(object.id);
    if (idx !== undefined && idx >= 0) this.moveFireSource(idx, object.coordinates);
  }

  remove(id: string): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(id);
    if (idx !== undefined && idx >= 0) {
      this.emitterEmitRate[idx] = 0;
      this.moveFireSource(idx, {x:99999,y:99999,z:99999});
      map.delete(id);
    }
    super.remove(id);
  }
}
