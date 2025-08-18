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
  // можна додати: textureUrl?: string
}

export class SmokeRenderer extends BaseRenderer {
  private readonly MAX_PARTICLES = 60000;
  private readonly MAX_EMITTERS  = 64;

  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  // атрибути
  private aBirth!: Float32Array;
  private aEmitter!: Float32Array;
  private aSeed!: Float32Array;
  private aStart!: Float32Array;

  private head = 0;
  private clock = new THREE.Clock();

  // еміттери
  private emitterPos = new Float32Array(this.MAX_EMITTERS * 3);
  private emitterEmitRate = new Float32Array(this.MAX_EMITTERS);
  private emitterLife = new Float32Array(this.MAX_EMITTERS);
  private emitterRise = new Float32Array(this.MAX_EMITTERS);
  private emitterFlow = new Float32Array(this.MAX_EMITTERS);
  private emitterNoiseScale = new Float32Array(this.MAX_EMITTERS);
  private emitterTimeScale = new Float32Array(this.MAX_EMITTERS);
  private emitterBaseSize = new Float32Array(this.MAX_EMITTERS);
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

    // завантажуємо альфа-маску (мʼяка пляма диму)
    const tl = new THREE.TextureLoader();
    this.smokeTex = tl.load(smokeTextureUrl);
    this.smokeTex.wrapS = this.smokeTex.wrapT = THREE.ClampToEdgeWrapping;
    this.smokeTex.minFilter = THREE.LinearMipMapLinearFilter;
    this.smokeTex.magFilter = THREE.LinearFilter;

    this.initParticles();
    this.initShaders();
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  private initParticles() {
    this.geometry = new THREE.BufferGeometry();
    const N = this.MAX_PARTICLES;

    const positions = new Float32Array(N * 3);
    this.aBirth   = new Float32Array(N);
    this.aEmitter = new Float32Array(N);
    this.aSeed    = new Float32Array(N);
    this.aStart   = new Float32Array(N * 3);

    for (let i=0;i<N;i++){
      this.aBirth[i] = -1e9;
      this.aEmitter[i] = 0;
      this.aSeed[i] = Math.random() * 1000.0;
      const i3 = i*3;
      positions[i3+0] = 0; positions[i3+1] = 0; positions[i3+2] = 0;
      this.aStart[i3+0] = 0; this.aStart[i3+1] = 0; this.aStart[i3+2] = 0;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aBirth',   new THREE.BufferAttribute(this.aBirth, 1));
    this.geometry.setAttribute('aEmitter', new THREE.BufferAttribute(this.aEmitter, 1));
    this.geometry.setAttribute('aSeed',    new THREE.BufferAttribute(this.aSeed, 1));
    this.geometry.setAttribute('aStart',   new THREE.BufferAttribute(this.aStart, 3));
  }

  private initShaders() {
    const vertexShader = `
    precision mediump float;
    uniform float uTime;
    uniform int   uEmitterCount;
    uniform float uPixelRatio;

    #define MAX_EMITTERS ${this.MAX_EMITTERS}

    uniform vec3  uEmitterPos[MAX_EMITTERS];
    uniform float uLife[MAX_EMITTERS];
    uniform float uRise[MAX_EMITTERS];
    uniform float uFlow[MAX_EMITTERS];
    uniform float uNoiseScale[MAX_EMITTERS];
    uniform float uTimeScale[MAX_EMITTERS];
    uniform float uBaseSize[MAX_EMITTERS];
    uniform vec3  uColor[MAX_EMITTERS];

    attribute float aBirth;
    attribute float aEmitter;
    attribute float aSeed;
    attribute vec3  aStart;

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
    void fetchEmitter(int idx, out vec3 ePos, out float eLife, out float eRise,
                      out float eFlow, out float eNoise, out float eTS,
                      out float eSize, out vec3 eColor) {
      ePos = vec3(0.0); eLife=6.0; eRise=3.0; eFlow=1.8;
      eNoise=0.6; eTS=0.7; eSize=18.0; eColor=vec3(0.85);
      for (int i=0;i<MAX_EMITTERS;i++){
        if (i==idx){
          ePos = uEmitterPos[i];
          eLife= uLife[i];
          eRise= uRise[i];
          eFlow= uFlow[i];
          eNoise= uNoiseScale[i];
          eTS  = uTimeScale[i];
          eSize= uBaseSize[i];
          eColor= uColor[i];
        }
      }
    }

    void main(){
      int idx = int(floor(aEmitter + 0.5));
      vec3 ePos; float eLife; float eRise; float eFlow; float eNoise; float eTS; float eSize; vec3 col;
      fetchEmitter(idx, ePos, eLife, eRise, eFlow, eNoise, eTS, eSize, col);

      float age = clamp((uTime - aBirth) / eLife, 0.0, 1.0);
      float ageWide = pow(age, 1.5);

      vec3 pos = ePos + aStart;

      float rise = eRise * (age*age*(3.0-2.0*age));
      pos.y += rise;

      float t = uTime * eTS;
      vec3 q = aStart * eNoise + vec3(aSeed);
      vec3 swirl = vec3(
        fbm(q + vec3(t, 0.0, 0.0)) - 0.5,
        fbm(q + vec3(0.0, t, 0.0)) - 0.5,
        fbm(q + vec3(0.0, 0.0, t)) - 0.5
      );
      pos += normalize(swirl + 1e-4) * eFlow * (0.4 + 1.8 * ageWide);

      float spin = (aSeed * 13.37 + uTime * 0.7) * 0.003 * age;
      float cs = cos(spin), sn = sin(spin);
      vec2 rel = pos.xz - ePos.xz;
      rel = mat2(cs, -sn, sn, cs) * rel;
      pos.xz = rel + ePos.xz;

      vColor = col;
      vAlpha = bell(age);

      float sizeJitter = 0.75 + 0.5 * hash(vec3(aSeed, 0.0, 0.0));
      float size = eSize * (0.8 + 1.2 * age) * sizeJitter;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * uPixelRatio * (24.0 / -mv.z); // БІЛЬШІ спрайти, hiDPI
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
        uTime:        { value: 0 },
        uEmitterCount:{ value: 0 },
        uPixelRatio:  { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uSmokeTex:    { value: this.smokeTex },
        uEmitterPos:  { value: Array.from({length: this.MAX_EMITTERS}, ()=> new THREE.Vector3()) },
        uLife:        { value: new Array(this.MAX_EMITTERS).fill(6.0) },   // повільніше
        uRise:        { value: new Array(this.MAX_EMITTERS).fill(10.02) },   // нижчий підйом
        uFlow:        { value: new Array(this.MAX_EMITTERS).fill(0.1) },   // ширше розносить
        uNoiseScale:  { value: new Array(this.MAX_EMITTERS).fill(0.03) },
        uTimeScale:   { value: new Array(this.MAX_EMITTERS).fill(0.07) },
        uBaseSize:    { value: new Array(this.MAX_EMITTERS).fill(48.0) },  // більші спрайти
        uColor:       { value: new Array(this.MAX_EMITTERS).fill(new THREE.Color(0x333E37)) }
      }
    });

    // важливо, якщо використовуєш тонемеппінг/сргб рендерера
    (this.material as any).toneMapped = true;
  }

  addSmokeSource(position: Vec3, opts: SmokeSourceData = {}): number {
    const i = this.emitterCount;
    if (i >= this.MAX_EMITTERS) { console.warn('SmokeRenderer: MAX_EMITTERS reached'); return -1; }

    this.emitterPos[i*3+0] = position.x;
    this.emitterPos[i*3+1] = position.y;
    this.emitterPos[i*3+2] = position.z;

    this.emitterEmitRate[i] = opts.emitRate ?? 120;
    this.emitterLife[i]     = opts.life ?? 6.0;     // було 3.8
    this.emitterRise[i]     = opts.rise ?? 3.0;     // було 6.0
    this.emitterFlow[i]     = opts.flow ?? 1.8;     // було 1.2
    this.emitterNoiseScale[i] = opts.noiseScale ?? 0.6;
    this.emitterTimeScale[i]  = opts.timeScale ?? 0.7;
    this.emitterBaseSize[i]   = opts.baseSize ?? 18.0; // було 8.0

    const c = new THREE.Color(opts.color ?? 0xD3CEC7);
    this.emitterColor[i*3+0] = c.r;
    this.emitterColor[i*3+1] = c.g;
    this.emitterColor[i*3+2] = c.b;

    this.emitterAcc[i] = 0;

    const U = this.material.uniforms;
    (U.uEmitterPos.value as THREE.Vector3[])[i].set(position.x, position.y, position.z);
    (U.uLife.value as number[])[i]       = this.emitterLife[i];
    (U.uRise.value as number[])[i]       = this.emitterRise[i];
    (U.uFlow.value as number[])[i]       = this.emitterFlow[i];
    (U.uNoiseScale.value as number[])[i] = this.emitterNoiseScale[i];
    (U.uTimeScale.value as number[])[i]  = this.emitterTimeScale[i];
    (U.uBaseSize.value as number[])[i]   = this.emitterBaseSize[i];
    (U.uColor.value as THREE.Color[])[i] = new THREE.Color(
      this.emitterColor[i*3+0],
      this.emitterColor[i*3+1],
      this.emitterColor[i*3+2]
    );
    this.material.uniforms.uEmitterCount.value = i+1;

    this.emitterCount++;
    return i;
  }

  moveSmokeSource(index: number, pos: Vec3) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emitterPos[index*3+0] = pos.x;
    this.emitterPos[index*3+1] = pos.y;
    this.emitterPos[index*3+2] = pos.z;
    (this.material.uniforms.uEmitterPos.value as THREE.Vector3[])[index].set(pos.x, pos.y, pos.z);
  }

  private spawnParticle(emitterIdx: number, now: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.MAX_PARTICLES;

    // ширше «сопло» + невеликий вертикальний джиттер
    const r = Math.pow(Math.random(), 1.5) * 0.28; // було 0.15
    const a = Math.random() * Math.PI * 2;
    const i3 = i*3;
    this.aStart[i3+0] = Math.cos(a)*r;
    this.aStart[i3+1] = Math.random() * 0.08;      // +y джиттер
    this.aStart[i3+2] = Math.sin(a)*r;

    this.aBirth[i]   = now;
    this.aEmitter[i] = emitterIdx;

    (this.geometry.getAttribute('aBirth')   as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aEmitter') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aStart')   as THREE.BufferAttribute).needsUpdate = true;
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
      emitRate: object.data?.emitRate ?? 36,
      life:     object.data?.life ?? 6.0,
      rise:     object.data?.rise ?? 5.3,
      baseSize: object.data?.baseSize ?? 38.0,
      flow:     object.data?.flow ?? 0.4,
      noiseScale: object.data?.noiseScale ?? 0.0,
      timeScale:  object.data?.timeScale ?? 0.2,
      color:      object.data?.color ?? 0x232E27
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
