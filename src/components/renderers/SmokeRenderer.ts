import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

type Vec3 = { x:number; y:number; z:number };

export interface SmokeSourceData {
  emitRate?: number;   // частинок/сек
  life?: number;       // сек
  rise?: number;       // висота підйому за життя
  baseSize?: number;   // базовий розмір спрайта (px)
  flow?: number;       // сила завихрення
  noiseScale?: number; // масштаб шуму
  timeScale?: number;  // швидкість «течії» шуму
  color?: number;      // базовий колір
  spreadRadius?: number; // радіус розсіювання частинок
}

export class SmokeRenderer extends BaseRenderer {
  private readonly MAX_PARTICLES = 6000;
  private readonly MAX_EMITTERS  = 25;

  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  // атрибути (пер-частинка)
  private aBirth!: Float32Array;
  private aEmitter!: Float32Array; // залишено, якщо треба дебаг/статистика
  private aSeed!: Float32Array;
  private aStart!: Float32Array;   // світова стартова позиція (x,y,z)

  private aLife!: Float32Array;
  private aRise!: Float32Array;
  private aFlow!: Float32Array;
  private aNoise!: Float32Array;
  private aTS!: Float32Array;
  private aSize!: Float32Array;
  private aColor!: Float32Array;   // rgb

  private head = 0;
  private clock = new THREE.Clock();

  // еміттери (звідси беремо параметри тільки під час spawn)
  private emitterPos = new Float32Array(this.MAX_EMITTERS * 3);
  private emitterEmitRate = new Float32Array(this.MAX_EMITTERS);
  private emitterLife = new Float32Array(this.MAX_EMITTERS);
  private emitterRise = new Float32Array(this.MAX_EMITTERS);
  private emitterFlow = new Float32Array(this.MAX_EMITTERS);
  private emitterNoiseScale = new Float32Array(this.MAX_EMITTERS);
  private emitterTimeScale = new Float32Array(this.MAX_EMITTERS);
  private emitterBaseSize = new Float32Array(this.MAX_EMITTERS);
  private emitterSpreadRadius = new Float32Array(this.MAX_EMITTERS);
  private emitterColor = new Float32Array(this.MAX_EMITTERS * 3);
  private emitterAcc = new Float32Array(this.MAX_EMITTERS);
  private emitterCount = 0;

  // текстура маски
  private smokeTex: THREE.Texture;

  constructor(scene: THREE.Scene, smokeTextureUrl = '/textures/smoke_soft.png') {
    super(scene);
    this.group = new THREE.Group();
    this.group.name = 'SmokeGroup';
    this.scene.add(this.group);

    // завантаження текстури (NPOT-safe)
    const tl = new THREE.TextureLoader();
    this.smokeTex = tl.load(smokeTextureUrl, (tex) => {
      const img = tex.image as HTMLImageElement;
      const isPOT = (n:number)=> (n & (n-1)) === 0;
      const pot = img && isPOT(img.width) && isPOT(img.height);

      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if (pot) {
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipMapLinearFilter;
      } else {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
      }
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
    });

    this.initParticles();
    this.initShaders();

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  private initParticles() {
    const N = this.MAX_PARTICLES;
    this.geometry = new THREE.BufferGeometry();

    // dummy position (Points вимагає 'position', але ми малюємо point sprites)
    const positions = new Float32Array(N * 3);

    this.aBirth   = new Float32Array(N);
    this.aEmitter = new Float32Array(N);
    this.aSeed    = new Float32Array(N);
    this.aStart   = new Float32Array(N * 3);

    this.aLife  = new Float32Array(N);
    this.aRise  = new Float32Array(N);
    this.aFlow  = new Float32Array(N);
    this.aNoise = new Float32Array(N);
    this.aTS    = new Float32Array(N);
    this.aSize  = new Float32Array(N);
    this.aColor = new Float32Array(N * 3);

    for (let i=0;i<N;i++){
      this.aBirth[i] = -1e9;
      this.aEmitter[i] = 0;
      this.aSeed[i] = Math.random() * 1000.0;
      const i3 = i*3;
      positions[i3+0] = 0; positions[i3+1] = 0; positions[i3+2] = 0;
      this.aStart[i3+0] = 0; this.aStart[i3+1] = 0; this.aStart[i3+2] = 0;

      // дефолти (перестраховка)
      this.aLife[i] = 4.0;
      this.aRise[i] = 3.0;
      this.aFlow[i] = 0.5;
      this.aNoise[i] = 0.3;
      this.aTS[i] = 0.6;
      this.aSize[i] = 16.0;
      this.aColor[i3+0] = 0.8;
      this.aColor[i3+1] = 0.8;
      this.aColor[i3+2] = 0.8;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aBirth',   new THREE.BufferAttribute(this.aBirth, 1));
    this.geometry.setAttribute('aEmitter', new THREE.BufferAttribute(this.aEmitter, 1));
    this.geometry.setAttribute('aSeed',    new THREE.BufferAttribute(this.aSeed, 1));
    this.geometry.setAttribute('aStart',   new THREE.BufferAttribute(this.aStart, 3));

    this.geometry.setAttribute('aLife',  new THREE.BufferAttribute(this.aLife, 1));
    this.geometry.setAttribute('aRise',  new THREE.BufferAttribute(this.aRise, 1));
    this.geometry.setAttribute('aFlow',  new THREE.BufferAttribute(this.aFlow, 1));
    this.geometry.setAttribute('aNoise', new THREE.BufferAttribute(this.aNoise,1));
    this.geometry.setAttribute('aTS',    new THREE.BufferAttribute(this.aTS,   1));
    this.geometry.setAttribute('aSize',  new THREE.BufferAttribute(this.aSize, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.aColor,3));
  }

  private initShaders() {
    const vertexShader = `
    precision mediump float;
    uniform float uTime;
    uniform float uPixelRatio;

    attribute float aBirth;
    attribute float aSeed;
    attribute vec3  aStart;   // світова стартова позиція
    attribute float aLife;
    attribute float aRise;
    attribute float aFlow;
    attribute float aNoise;
    attribute float aTS;
    attribute float aSize;
    attribute vec3  aColor;

    varying float vAlpha;
    varying vec3  vColor;

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
    float bell(float x){
      float a = smoothstep(0.02, 0.18, x);
      float b = 1.0 - smoothstep(0.7, 1.0, x);
      return clamp(a*b, 0.0, 1.0);
    }

    void main(){
      float age = clamp((uTime - aBirth) / aLife, 0.0, 1.0);
      float ageWide = pow(age, 1.5);

      vec3 pos = aStart;

      float rise = aRise * (age*age*(3.0-2.0*age));
      pos.y += rise;

      float t = uTime * aTS;
      vec3 q = aStart * aNoise + vec3(aSeed);
      vec3 swirl = vec3(
        fbm(q + vec3(t, 0.0, 0.0)) - 0.5,
        fbm(q + vec3(0.0, t, 0.0)) - 0.5,
        fbm(q + vec3(0.0, 0.0, t)) - 0.5
      );
      pos += normalize(swirl + 1e-4) * aFlow * (0.4 + 1.8 * ageWide);

      vColor = aColor;
      vAlpha = bell(age);

      float sizeJitter = 0.75 + 0.5 * hash(vec3(aSeed, 0.0, 0.0));
      float size = aSize * (0.8 + 1.2 * age) * sizeJitter;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * uPixelRatio * (24.0 / -mv.z);
      // на всякий випадок обмежимо дуже великі точки
      gl_PointSize = min(gl_PointSize, 1024.0);

      gl_Position = projectionMatrix * mv;
    }`;

    const fragmentShader = `
    precision mediump float;
    varying float vAlpha;
    varying vec3  vColor;
    uniform sampler2D uSmokeTex;

    void main(){
      vec2 uv = gl_PointCoord;
      float texA = texture2D(uSmokeTex, uv).a;

      vec2 uvC = uv - 0.5;
      float r = length(uvC);
      float soft = smoothstep(0.55, 0.0, r);

      vec3 col = mix(vColor, vec3(0.01, 0.01, 0.01), 0.55);
      float alpha = texA * soft * vAlpha * 0.9;

      if (alpha < 0.01) discard;
      gl_FragColor = vec4(col, alpha);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uSmokeTex:   { value: this.smokeTex }
      }
    });

    (this.material as any).toneMapped = true;
  }

  addSmokeSource(position: Vec3, opts: SmokeSourceData = {}): number {
    const i = this.emitterCount;
    if (i >= this.MAX_EMITTERS) { console.warn('SmokeRenderer: MAX_EMITTERS reached'); return -1; }

    this.emitterPos[i*3+0] = position.x;
    this.emitterPos[i*3+1] = position.y;
    this.emitterPos[i*3+2] = position.z;

    this.emitterEmitRate[i]   = opts.emitRate ?? 18;
    this.emitterLife[i]       = opts.life ?? 6.0;
    this.emitterRise[i]       = opts.rise ?? 3.0;
    this.emitterFlow[i]       = opts.flow ?? 0.0;
    this.emitterNoiseScale[i] = opts.noiseScale ?? 0.6;
    this.emitterTimeScale[i]  = opts.timeScale ?? 0.7;
    this.emitterBaseSize[i]   = opts.baseSize ?? 18.0;
    this.emitterSpreadRadius[i] = opts.spreadRadius ?? 0.28;

    const c = new THREE.Color(opts.color ?? 0xD3CEC7);
    this.emitterColor[i*3+0] = c.r;
    this.emitterColor[i*3+1] = c.g;
    this.emitterColor[i*3+2] = c.b;

    this.emitterAcc[i] = 0;
    this.emitterCount++;
    return i;
  }

  moveSmokeSource(index: number, pos: Vec3) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emitterPos[index*3+0] = pos.x;
    this.emitterPos[index*3+1] = pos.y;
    this.emitterPos[index*3+2] = pos.z;
    // частинки, що вже народилися, НЕ рухаються — вплине лише на нові спавни
  }

  private spawnParticle(emitterIdx: number, now: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.MAX_PARTICLES;

    const ex = this.emitterPos[emitterIdx*3+0];
    const ey = this.emitterPos[emitterIdx*3+1];
    const ez = this.emitterPos[emitterIdx*3+2];

    // ширше «сопло» + невеликий вертикальний джиттер (світові координати)
    const r = Math.pow(Math.random(), 1.5) * this.emitterSpreadRadius[emitterIdx];
    const a = Math.random() * Math.PI * 2;
    const i3 = i*3;

    this.aStart[i3+0] = ex + Math.cos(a)*r;
    this.aStart[i3+1] = ey + Math.random() * 0.08;
    this.aStart[i3+2] = ez + Math.sin(a)*r;

    this.aBirth[i]   = now;
    this.aEmitter[i] = emitterIdx; // залишено для відладки/телеметрії
    this.aSeed[i]    = Math.random() * 1000.0;

    // копія параметрів емітера в атрибути частинки
    this.aLife[i]  = this.emitterLife[emitterIdx];
    this.aRise[i]  = this.emitterRise[emitterIdx];
    this.aFlow[i]  = this.emitterFlow[emitterIdx];
    this.aNoise[i] = this.emitterNoiseScale[emitterIdx];
    this.aTS[i]    = this.emitterTimeScale[emitterIdx];
    this.aSize[i]  = this.emitterBaseSize[emitterIdx];

    this.aColor[i3+0] = this.emitterColor[emitterIdx*3+0];
    this.aColor[i3+1] = this.emitterColor[emitterIdx*3+1];
    this.aColor[i3+2] = this.emitterColor[emitterIdx*3+2];

    // позначаємо оновлення буферів (мінімально необхідні)
    (this.geometry.getAttribute('aBirth')   as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aEmitter') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSeed')    as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aStart')   as THREE.BufferAttribute).needsUpdate = true;

    (this.geometry.getAttribute('aLife')  as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aRise')  as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aFlow')  as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aNoise') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aTS')    as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize')  as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  updateAllSmoke() {
    const dt = this.clock.getDelta();
    const now = (this.material.uniforms.uTime.value as number) + dt;
    this.material.uniforms.uTime.value = now;

    for (let i=0; i<this.emitterCount; i++) {
      this.emitterAcc[i] += dt * this.emitterEmitRate[i];
      let n = (this.emitterAcc[i] | 0);
      this.emitterAcc[i] -= n;
      while (n-- > 0) this.spawnParticle(i, now);
    }
  }

  render(object: SceneObject): THREE.Object3D {
    const idx = this.addSmokeSource(object.coordinates, {
      emitRate:  object.data?.emitRate ?? 18,
      life:      object.data?.life ?? 6.0,
      rise:      object.data?.riseSpeed ?? 9.3,
      baseSize:  object.data?.baseSize ?? 44.0,
      flow:      object.data?.flow ?? 0.0,
      noiseScale:object.data?.noiseScale ?? 0.0,
      timeScale: object.data?.timeScale ?? 0.2,
      color:     object.data?.color ?? 0x232E27,
      spreadRadius: object.data?.spreadRadius ?? 0.0
    });

    this.addMesh(object.id, this.points);
    (this.points as any).__emitterIndexMap = (this.points as any).__emitterIndexMap || new Map<string, number>();
    (this.points as any).__emitterIndexMap.set(object.id, idx);
    return this.points;
  }

  update(object: SceneObject): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(object.id);
    if (idx !== undefined && idx >= 0) this.moveSmokeSource(idx, object.coordinates);
  }

  remove(id: string): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(id);
    if (idx !== undefined && idx >= 0) {
      this.emitterEmitRate[idx] = 0;
      this.moveSmokeSource(idx, {x:99999,y:99999,z:99999});
      map.delete(id);
    }
    super.remove(id);
  }
}
