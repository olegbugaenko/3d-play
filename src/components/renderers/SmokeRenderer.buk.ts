// SmokeRenderer_GPU.ts (WebGL2, fixed)
import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

type Vec3 = { x:number; y:number; z:number };

export interface SmokeSourceData {
  emitRate?: number;     // частинок/сек
  life?: number;         // сек
  rise?: number;         // сумарний підйом за життя (м)
  baseSize?: number;     // px
  flow?: number;         // інтенсивність завихрення
  noiseScale?: number;   // масштаб шуму
  timeScale?: number;    // швидкість "течії" шуму
  color?: number;        // hex RGB
  spreadRadius?: number; // радіус розсіювання при народженні (м)
  spreadGrow?: number;
}

export class SmokeRenderer extends BaseRenderer {
  private readonly PARTICLES_W = 256;
  private readonly PARTICLES_H = 256;
  private readonly MAX_PARTICLES = this.PARTICLES_W * this.PARTICLES_H;
  private readonly MAX_EMITTERS  = 64;

  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  private gpu!: GPUComputationRenderer;
  private posVar!: any;
  private velVar!: any;
  private auxVar!: any;

  private texPos!: THREE.Texture;
  private texAux!: THREE.Texture;

  private clock = new THREE.Clock();
  private smokeTex: THREE.Texture;

  // Емітери (спільні DataTexture для compute & render)
  private emit1Data: Float32Array;
  private emit2Data: Float32Array;
  private emit3Data: Float32Array;
  private emit4Data: Float32Array;
  private cdfData:   Float32Array;

  private emitterCount = 0;
  private emitterActive: boolean[];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, smokeTextureUrl = '/textures/smoke_soft_proper.png') {
    super(scene, renderer);

    this.group = new THREE.Group();
    this.group.name = 'SmokeGroup';
    this.scene.add(this.group);

    // якщо на девайсі немає vertex texture fetch – попереджаємо одразу
    if (!(this.renderer.capabilities as any).vertexTextures) {
      console.warn('SmokeRenderer: vertexTextures == 0. Цей варіант рендера потребує fetch текстур у вертекснику (WebGL2 + підтримка девайсом).');
    }

    // завантаження спрайта (потрібен альфа-канал!)
    const tl = new THREE.TextureLoader();
    this.smokeTex = tl.load(smokeTextureUrl, (tex) => {
      const img = tex.image as HTMLImageElement;
      const isPOT = (n:number)=> (n & (n-1)) === 0;
      const pot = img && isPOT(img.width) && isPOT(img.height);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if (pot) { tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipMapLinearFilter; }
      else { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
    });

    // буфери емітерів
    this.emit1Data = new Float32Array(this.MAX_EMITTERS * 4);
    this.emit2Data = new Float32Array(this.MAX_EMITTERS * 4);
    this.emit3Data = new Float32Array(this.MAX_EMITTERS * 4);
    this.emit4Data = new Float32Array(this.MAX_EMITTERS * 4);
    this.cdfData   = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitterActive = Array(this.MAX_EMITTERS).fill(false);

    this.initGPU();
    this.initRenderPoints();
  }

  private initGPU() {
    // @ts-ignore
    this.gpu = new GPUComputationRenderer(this.PARTICLES_W, this.PARTICLES_H, this.renderer);

    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    const aux0 = this.gpu.createTexture();

    // початкові дані
    {
      const p = pos0.image.data;
      for (let i=0; i<p.length; i+=4) { p[i+0]=0; p[i+1]=0; p[i+2]=0; p[i+3]=0; } // w = emitterIndex
      const v = vel0.image.data;
      for (let i=0; i<v.length; i+=4) { v[i+0]=0; v[i+1]=0; v[i+2]=0; v[i+3]=0; }
      const a = aux0.image.data;
      for (let i=0; i<a.length; i+=4) {
        a[i+0]=0.0;                    // age
        a[i+1]=4.0;                    // life
        a[i+2]=Math.random()*1000.0;   // seed
        a[i+3]=Math.random();          // emitPhase
      }
    }

    this.posVar = this.gpu.addVariable('texPos', this.shaderPos(), pos0);
    this.velVar = this.gpu.addVariable('texVel', this.shaderVel(), vel0);
    this.auxVar = this.gpu.addVariable('texAux', this.shaderAux(), aux0);

    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar, this.auxVar]);
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar, this.auxVar]);
    this.gpu.setVariableDependencies(this.auxVar, [this.posVar, this.velVar, this.auxVar]);

    // створюємо ЄДИНІ DataTexture для емітерів
    const uEmitTex1 = this.makeEmitterTex(this.emit1Data);
    const uEmitTex2 = this.makeEmitterTex(this.emit2Data);
    const uEmitTex3 = this.makeEmitterTex(this.emit3Data);
    const uEmitTex4 = this.makeEmitterTex(this.emit4Data);
    const uEmitCDF  = this.makeEmitterTex(this.cdfData);

    const uniBlock = {
      uTime:     { value: 0 },
      uDelta:    { value: 0 },
      uEmitTex1: { value: uEmitTex1 },
      uEmitTex2: { value: uEmitTex2 },
      uEmitTex3: { value: uEmitTex3 },
      uEmitTex4: { value: uEmitTex4 },
      uEmitCDF:  { value: uEmitCDF  },
    };
    Object.assign(this.posVar.material.uniforms, uniBlock);
    Object.assign(this.velVar.material.uniforms, uniBlock);
    Object.assign(this.auxVar.material.uniforms, uniBlock);

    const err = this.gpu.init();
    if (err) console.error(err);

    this.texPos = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.texAux = this.gpu.getCurrentRenderTarget(this.auxVar).texture;
  }

  private makeEmitterTex(data: Float32Array) {
    const tex = new THREE.DataTexture(
      data, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    tex.needsUpdate = true;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private initRenderPoints() {
    const N = this.MAX_PARTICLES;
    const uvs = new Float32Array(N * 2);
    {
      let i = 0;
      for (let y=0; y<this.PARTICLES_H; y++) {
        for (let x=0; x<this.PARTICLES_W; x++) {
          uvs[i++] = (x + 0.5) / this.PARTICLES_W;
          uvs[i++] = (y + 0.5) / this.PARTICLES_H;
        }
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N*3), 3));
    this.geometry.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));

    // ті самі DataTexture, що у compute:
    const uEmitTex3 = this.posVar.material.uniforms.uEmitTex3.value as THREE.DataTexture;
    const uEmitTex4 = this.posVar.material.uniforms.uEmitTex4.value as THREE.DataTexture;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      vertexShader: this.renderVS(),
      fragmentShader: this.renderFS(),
      uniforms: {
        uPosTex:     { value: this.texPos },
        uAuxTex:     { value: this.texAux },
        uEmitTex3:   { value: uEmitTex3 },
        uEmitTex4:   { value: uEmitTex4 },
        uSmokeTex:   { value: this.smokeTex },
        uPixelRatio: { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
      }
    });
    (this.material as any).toneMapped = true;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    (this.points as any).__emitterIndexMap = new Map<string, number>();
  }

  // ===== Compute shaders =====
  private shaderCommonNoise(): string {
    return `
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
`;
  }

  private shaderAux(): string {
    return `
uniform float uTime;
uniform float uDelta;

uniform sampler2D uEmitTex1; 
uniform sampler2D uEmitTex2; 
uniform sampler2D uEmitTex3; 
uniform sampler2D uEmitTex4; 
uniform sampler2D uEmitCDF;  

float rand(float x){ return fract(sin(x*12.9898)*43758.5453); }

float pickEmitter(float r) {
  float idx = 0.0;
  for (int i=0; i<${this.MAX_EMITTERS}; i++){
    float u = (float(i) + 0.5) / float(${this.MAX_EMITTERS});
    float c = texture2D(uEmitCDF, vec2(u, 0.5)).r;
    if (r <= c) { idx = float(i); break; }
  }
  return idx;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 aux = texture2D(texAux, uv);
  vec4 pos = texture2D(texPos, uv);

  float age   = aux.x;
  float life  = aux.y;
  float seed  = aux.z;
  float phase = aux.w;

  float emitterIndex = pos.w;

  float u = (emitterIndex + 0.5) / float(${this.MAX_EMITTERS});
  vec4 e1 = texture2D(uEmitTex1, vec2(u, 0.5));

  float emitRate = e1.w;

  age  += uDelta;
  phase += emitRate * uDelta;

  bool respawn = (age >= life) || (phase >= 1.0);

  if (respawn) {
    float rr = rand(seed + uTime);
    emitterIndex = pickEmitter(rr);

    float ue = (emitterIndex + 0.5) / float(${this.MAX_EMITTERS});
    vec4 ee2 = texture2D(uEmitTex2, vec2(ue, 0.5));
    float baseLife = ee2.x;
    life = max(0.1, baseLife * (0.8 + 0.4*rand(seed+3.17)));

    age = 0.0;
    phase = fract(phase);
    seed = rand(seed + uTime) * 1000.0;
  }

  gl_FragColor = vec4(age, life, seed, phase);
}
`;
  }

  private shaderVel(): string {
    return `
  uniform float uTime;
  uniform float uDelta;
  
  uniform sampler2D uEmitTex1; // pos.xyz, emitRate
  uniform sampler2D uEmitTex2; // life, rise, flow, timeScale
  uniform sampler2D uEmitTex3; // baseSize, noiseScale, spreadRadius, spreadGrow
  
  ${this.shaderCommonNoise()}
  
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
  
    vec4 pos = texture2D(texPos, uv);
    vec4 vel = texture2D(texVel, uv);
    vec4 aux = texture2D(texAux, uv);
  
    float age  = aux.x;
    float life = max(aux.y, 1e-3);
    float seed = aux.z;
  
    float emitterIndex = pos.w;
    float ue = (emitterIndex + 0.5) / float(${this.MAX_EMITTERS});
  
    // читаємо параметри еміттера
    vec4 e1 = texture2D(uEmitTex1, vec2(ue, 0.5)); // pos.xyz, emitRate
    vec4 e2 = texture2D(uEmitTex2, vec2(ue, 0.5)); // life, rise, flow, timeScale
    vec4 e3 = texture2D(uEmitTex3, vec2(ue, 0.5)); // baseSize, noiseScale, spreadRadius, spreadGrow
  
    float rise      = max(e2.y, 1e-3);
    float flow      = e2.z;
    float timeScale = e2.w;
    float noiseS    = e3.y;
    float spreadGrow= e3.w; // НОВЕ: сила радіального розширення (м/с на верхівці)
  
    float k = clamp(age / life, 0.0, 1.0); // вік у [0..1]
    k = k*k*(3.0-2.0*k);
  
    vec3 up = vec3(0.0, 1.0, 0.0);
    float upSpeed = rise / life; // щоб за життя набрати rise
  
    float t = uTime * timeScale;
    vec3 q = pos.xyz * noiseS + vec3(seed, seed*0.37, seed*1.91);
    vec3 swirl = vec3(
      fbm(q + vec3(t,0.0,0.0)) - 0.5,
      fbm(q + vec3(0.0,t,0.0)) - 0.5,
      fbm(q + vec3(0.0,0.0,t)) - 0.5
    );
  
    // НОРМАЛІЗОВАНА ВИСОТА над еміттером у [0..1]
    float h = clamp((pos.y - e1.y) / rise, 0.0, 1.0);
  
    // Радіальний напрямок від осі стовпа (епос → pos) у XZ
    vec3 toCenter = vec3(pos.x - e1.x, 0.0, pos.z - e1.z);
    float rl = length(toCenter);
    vec3 lateralDir = (rl > 1e-4) ? (toCenter / rl)
                                  : normalize(vec3(swirl.x, 0.0, swirl.z) + 1e-6);
  
    // Радіальне розширення, що росте з висотою
    vec3 conePush = lateralDir * (spreadGrow * h);
  
    // Базовий апдрафт + завихрення (з віком) + конус
    vec3 targetV = up * upSpeed
                 + normalize(swirl + 1e-5) * flow * (0.4 + 1.8*k)
                 + conePush;
  
    // легка інерція
    vec3 newVel = mix(vel.xyz, targetV, 0.2);
    if (age == 0.0) newVel = targetV;
  
    gl_FragColor = vec4(newVel, 0.0);
  }
    `;
  }
  

  private shaderPos(): string {
    return `
uniform float uTime;
uniform float uDelta;

uniform sampler2D uEmitTex1; // pos.xyz, emitRate
uniform sampler2D uEmitTex3; // baseSize, noiseScale, spreadRadius, pad

float rand(float x){ return fract(sin(x*12.9898)*43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 pos = texture2D(texPos, uv);
  vec4 vel = texture2D(texVel, uv);
  vec4 aux = texture2D(texAux, uv);

  float age  = aux.x;
  float seed = aux.z;

  float emitterIndex = pos.w;

  if (age == 0.0) {
    float ue = (emitterIndex + 0.5) / float(${this.MAX_EMITTERS});
    vec4 e1 = texture2D(uEmitTex1, vec2(ue, 0.5)); // pos.xyz
    vec4 e3 = texture2D(uEmitTex3, vec2(ue, 0.5)); // spreadRadius у z

    float r = pow(rand(seed+1.23), 1.5) * e3.z;
    float a = rand(seed+3.14) * 6.2831853;

    vec3 p = e1.xyz + vec3(cos(a)*r, rand(seed+2.71)*0.08, sin(a)*r);
    pos = vec4(p, emitterIndex);
  } else {
    pos.xyz += vel.xyz * uDelta;
  }

  gl_FragColor = pos;
}
`;
  }

  // ===== Render shaders =====
  private renderVS(): string {
    return `
// DEBUG toggles
#define DEBUG_FORCE_SIZE 0

precision highp float;
uniform sampler2D uPosTex;
uniform sampler2D uAuxTex;
uniform sampler2D uEmitTex3; // baseSize
uniform sampler2D uEmitTex4; // color
uniform float uPixelRatio;

varying float vAlpha;
varying vec3  vColor;

float bell(float x){
  float a = smoothstep(0.02, 0.18, x);
  float b = 1.0 - smoothstep(0.7, 1.0, x);
  return clamp(a*b, 0.0, 1.0);
}

void main() {
  vec4 pos4 = texture2D(uPosTex, uv);
  vec3 pos  = pos4.xyz;

  vec4 aux = texture2D(uAuxTex, uv);
  float age  = aux.x;
  float life = max(aux.y, 1e-3);
  float k = clamp(age / life, 0.0, 1.0);

  float emitterIndex = pos4.w;
  float ue = (emitterIndex + 0.5) / float(${this.MAX_EMITTERS});
  vec4 e3 = texture2D(uEmitTex3, vec2(ue, 0.5)); // baseSize
  vec4 e4 = texture2D(uEmitTex4, vec2(ue, 0.5)); // color

  vColor = e4.rgb;
  vAlpha = bell(k);

  float base = max(e3.x, 16.0);     // страховка, щоб не було 0
  float size = base * (0.8 + 1.2*k);
#if DEBUG_FORCE_SIZE
  size = 64.0;
#endif

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = size * uPixelRatio * (24.0 / -mv.z);
  gl_PointSize = min(gl_PointSize, 1024.0);
  gl_Position  = projectionMatrix * mv;
}
`;
  }

  private renderFS(): string {
    return `
// DEBUG toggles
#define DEBUG_SOLID_DISC 1

precision mediump float;
uniform sampler2D uSmokeTex;
varying float vAlpha;
varying vec3  vColor;

void main(){
#if DEBUG_SOLID_DISC
  // намалювати просто круг для перевірки, без текстури
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float soft = smoothstep(0.55, 0.0, r);
  vec3 col = vColor;
  float alpha = soft * vAlpha;
#else
  vec2 t = gl_PointCoord;
  float texA = texture2D(uSmokeTex, t).a;
  vec2 d = t - 0.5;
  float soft = smoothstep(0.55, 0.0, length(d));
  vec3 col = mix(vColor, vec3(0.01), 0.55);
  float alpha = texA * soft * vAlpha * 0.9;
#endif

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
  }

  // ===== Tick =====
  updateAllSmoke() {
    const dt = this.clock.getDelta();
    const now = (this.auxVar.material.uniforms.uTime.value as number) + dt;

    this.posVar.material.uniforms.uTime.value = now;
    this.velVar.material.uniforms.uTime.value = now;
    this.auxVar.material.uniforms.uTime.value = now;

    this.posVar.material.uniforms.uDelta.value = dt;
    this.velVar.material.uniforms.uDelta.value = dt;
    this.auxVar.material.uniforms.uDelta.value = dt;

    this.gpu.compute();

    this.texPos = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.texAux = this.gpu.getCurrentRenderTarget(this.auxVar).texture;

    this.material.uniforms.uPosTex.value = this.texPos;
    this.material.uniforms.uAuxTex.value = this.texAux;
  }

  // ===== Public API =====
  render(object: SceneObject): THREE.Object3D {
    const idx = this.addSmokeSource(object.coordinates, {
      emitRate:   object.data?.emitRate ?? 200,   // для видимості одразу
      life:       object.data?.life ?? 2.0,
      rise:       object.data?.riseSpeed ?? 2.0,
      baseSize:   object.data?.baseSize ?? 64.0,  // для дебагу
      flow:       object.data?.flow ?? 0.6,
      noiseScale: object.data?.noiseScale ?? 0.6,
      timeScale:  object.data?.timeScale ?? 0.7,
      color:      object.data?.color ?? 0x232E27,
      spreadRadius: object.data?.spreadRadius ?? 0.3,
      spreadGrow: object.data?.spreadGrow ?? 0.1,
    });

    this.addMesh(object.id, this.points);
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
      this.setEmitterActive(idx, false);
      map.delete(id);
    }
  }

  // ===== Emitters =====
  private addSmokeSource(position: Vec3, opts: SmokeSourceData = {}): number {
    let i = -1;
    for (let j=0; j<this.emitterCount; j++){
      if (!this.emitterActive[j]) { i = j; break; }
    }
    if (i === -1) {
      i = this.emitterCount;
      if (i >= this.MAX_EMITTERS) {
        console.warn('SmokeRenderer: MAX_EMITTERS reached');
        return -1;
      }
      this.emitterCount++;
    }

    const emitRate   = opts.emitRate   ?? 18;
    const life       = opts.life       ?? 6.0;
    const rise       = opts.rise       ?? 3.0;
    const flow       = opts.flow       ?? 0.6;
    const timeScale  = opts.timeScale  ?? 0.7;
    const baseSize   = opts.baseSize   ?? 44.0;
    const noiseScale = opts.noiseScale ?? 0.6;
    const spread     = opts.spreadRadius ?? 0.3;
    const spreadGrow = opts.spreadGrow ?? 0.1;
    const color      = new THREE.Color(opts.color ?? 0x232E27);

    // emitTex1: pos.xyz, emitRate
    this.emit1Data[i*4+0] = position.x;
    this.emit1Data[i*4+1] = position.y;
    this.emit1Data[i*4+2] = position.z;
    this.emit1Data[i*4+3] = emitRate;

    // emitTex2: life, rise, flow, timeScale
    this.emit2Data[i*4+0] = life;
    this.emit2Data[i*4+1] = rise;
    this.emit2Data[i*4+2] = flow;
    this.emit2Data[i*4+3] = timeScale;

    // emitTex3: baseSize, noiseScale, spreadRadius, pad
    this.emit3Data[i*4+0] = baseSize;
    this.emit3Data[i*4+1] = noiseScale;
    this.emit3Data[i*4+2] = spread;
    this.emit3Data[i*4+3] = spreadGrow;

    // emitTex4: color
    this.emit4Data[i*4+0] = color.r;
    this.emit4Data[i*4+1] = color.g;
    this.emit4Data[i*4+2] = color.b;
    this.emit4Data[i*4+3] = 0;

    // оновити DataTexture (ЇХ САМЕ ЧИТАЄ render & compute)
    (this.posVar.material.uniforms.uEmitTex1.value as THREE.DataTexture).needsUpdate = true;
    (this.posVar.material.uniforms.uEmitTex2.value as THREE.DataTexture).needsUpdate = true;
    (this.posVar.material.uniforms.uEmitTex3.value as THREE.DataTexture).needsUpdate = true;
    (this.posVar.material.uniforms.uEmitTex4.value as THREE.DataTexture).needsUpdate = true;

    this.emitterActive[i] = emitRate > 0;
    this.rebuildCDF();

    return i;
  }

  private moveSmokeSource(index: number, pos: Vec3) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emit1Data[index*4+0] = pos.x;
    this.emit1Data[index*4+1] = pos.y;
    this.emit1Data[index*4+2] = pos.z;
    (this.posVar.material.uniforms.uEmitTex1.value as THREE.DataTexture).needsUpdate = true;
  }

  private setEmitterActive(index: number, active: boolean) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emitterActive[index] = active;
    if (!active) {
      this.emit1Data[index*4+3] = 0;
      (this.posVar.material.uniforms.uEmitTex1.value as THREE.DataTexture).needsUpdate = true;
    }
    this.rebuildCDF();
  }

  private rebuildCDF() {
    let total = 0;
    for (let i=0;i<this.emitterCount;i++){
      total += Math.max(0, this.emit1Data[i*4+3]);
    }
    let acc = 0;
    for (let i=0;i<this.MAX_EMITTERS;i++){
      const rate = (i < this.emitterCount) ? Math.max(0, this.emit1Data[i*4+3]) : 0;
      acc += (total > 0 ? rate/total : 0);
      const off = i*4;
      this.cdfData[off+0] = Math.min(acc, 1.0);
      this.cdfData[off+1] = 0;
      this.cdfData[off+2] = 0;
      this.cdfData[off+3] = 0;
    }
    (this.posVar.material.uniforms.uEmitCDF.value as THREE.DataTexture).needsUpdate = true;
  }
}
