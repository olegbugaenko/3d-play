// ExplosionRenderer_GPU.ts (WebGL2, radial bursts + TTL + 3D flash sphere with gradient + particleSharpness)
import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

type Vec3 = { x:number; y:number; z:number };

export interface ExplosionData {
  // particles
  particleSize?: number;       // px на старті
  particleSizeEnd?: number;    // px наприкінці
  velocity?: number;           // початкова швидкість (м/с)
  particleCount?: number;      // скільки частинок випустити
  life?: number;               // життя частинки (сек)
  spreadRadius?: number;       // початковий радіус спавну (м)
  gravity?: number;            // м/с^2 (вниз; 0 = без гравітації)
  drag?: number;               // 0..1 опір повітря
  turbulence?: number;         // 0..1 сила турбулентності
  sparkFrac?: number;          // 0..1 доля «іскорок»
  hue?: number;                // відтінок (0..360)
  alpha?: number;              // базова прозорість частинок (0..1)
  particleSharpness?: number;  // 0..1 гострота краю спрайта (0 м’яко, 1 різко)

  // explosion TTL (вимикає весь вибух)
  ttl?: number;                // сек

  // flash sphere (шок-хвиля)
  flashLife?: number;          // сек (тривалість спалаху)
  flashRadius?: number;        // м (максимальний радіус сфери). Якщо не задано — ~ velocity*flashLife*0.9
  flashAlpha?: number;         // початкова прозорість сфери (0..1)
  flashIntensity?: number;     // множник яскравості (через колір у шейдері)

  // сумісність зі старими викликами (ігнорується)
  flashSizePx?: number;
}

export class ExplosionRenderer extends BaseRenderer {
  private readonly PARTICLES_W = 256;
  private readonly PARTICLES_H = 128;
  private readonly MAX_PARTICLES = this.PARTICLES_W * this.PARTICLES_H;
  private readonly MAX_EXPLOSIONS = 64;

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
  private particleTex: THREE.Texture;

  // emitter textures (RGBA32F, 1×MAX_EXPLOSIONS)
  // tex1: pos.xyz, baseSpeed
  // tex2: life, size0, size1, alpha0
  // tex3: spreadRadius, gravity, drag, turbulence
  // tex4: color.rgb, sparkFrac
  // tex5: particleSharpness, -, -, -
  private emit1Data: Float32Array;
  private emit2Data: Float32Array;
  private emit3Data: Float32Array;
  private emit4Data: Float32Array;
  private emit5Data: Float32Array;
  private emitTex1!: THREE.DataTexture;
  private emitTex2!: THREE.DataTexture;
  private emitTex3!: THREE.DataTexture;
  private emitTex4!: THREE.DataTexture;
  private emitTex5!: THREE.DataTexture;

  // alive-mask
  private aliveData: Float32Array;
  private aliveTex: THREE.DataTexture;

  private explosionCount = 0;
  private explosionActive: boolean[];

  // Spawn map (explosionIndex, s1, s2, flag)
  private spawnMapData: Float32Array;
  private spawnMapTex: THREE.DataTexture;
  private spawnHead = 0;
  private remainingToSpawn: Int32Array;

  // TTL
  private ttlSeconds: number[] = [];
  private startTime: number[] = [];

  // FLASH sphere
  private flashMeshes: Array<THREE.Mesh | null> = [];
  private flashLifeArr: number[] = [];
  private flashRadiusArr: number[] = [];
  private flashAlphaArr: number[] = [];
  private flashStart: number[] = [];
  private flashColorArr: THREE.Color[] = [];
  private flashSoftnessArr: number[] = [];
  private flashFadeExpArr: number[] = [];
  private flashIntensityArr: number[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, particleTextureUrl = '/textures/smoke_soft_proper.png') {
    super(scene, renderer);

    this.group = new THREE.Group();
    this.group.name = 'ExplosionGroup';
    this.scene.add(this.group);

    const tl = new THREE.TextureLoader();
    this.particleTex = tl.load(particleTextureUrl, (tex) => {
      const img = tex.image as HTMLImageElement;
      const isPOT = (n:number)=> (n & (n-1)) === 0;
      const pot = img && isPOT(img.width) && isPOT(img.height);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      if (pot) { tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipMapLinearFilter; }
      else     { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
      tex.needsUpdate = true;
    });

    this.emit1Data = new Float32Array(this.MAX_EXPLOSIONS * 4);
    this.emit2Data = new Float32Array(this.MAX_EXPLOSIONS * 4);
    this.emit3Data = new Float32Array(this.MAX_EXPLOSIONS * 4);
    this.emit4Data = new Float32Array(this.MAX_EXPLOSIONS * 4);
    this.emit5Data = new Float32Array(this.MAX_EXPLOSIONS * 4);
    this.explosionActive = Array(this.MAX_EXPLOSIONS).fill(false);
    this.remainingToSpawn = new Int32Array(this.MAX_EXPLOSIONS);

    this.spawnMapData = new Float32Array(this.MAX_PARTICLES * 4);
    this.spawnMapTex = new THREE.DataTexture(
      this.spawnMapData, this.PARTICLES_W, this.PARTICLES_H, THREE.RGBAFormat, THREE.FloatType
    );
    this.spawnMapTex.needsUpdate = true;
    this.spawnMapTex.magFilter = THREE.NearestFilter;
    this.spawnMapTex.minFilter = THREE.NearestFilter;
    this.spawnMapTex.wrapS = this.spawnMapTex.wrapT = THREE.ClampToEdgeWrapping;

    this.aliveData = new Float32Array(this.MAX_EXPLOSIONS * 4);
    for (let i=0;i<this.MAX_EXPLOSIONS;i++) this.aliveData[i*4]=1.0;
    this.aliveTex = new THREE.DataTexture(
      this.aliveData, this.MAX_EXPLOSIONS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.aliveTex.needsUpdate = true;
    this.aliveTex.magFilter = THREE.NearestFilter;
    this.aliveTex.minFilter = THREE.NearestFilter;
    this.aliveTex.wrapS = this.aliveTex.wrapT = THREE.ClampToEdgeWrapping;

    this.initGPU();
    // створюємо tex5 для рендера (обчисленням не потрібен)
    this.emitTex5 = this.makeEmitterTex(this.emit5Data);
    this.initRenderPoints();
  }

  private initGPU() {
    this.gpu = new GPUComputationRenderer(this.PARTICLES_W, this.PARTICLES_H, this.renderer);

    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    const aux0 = this.gpu.createTexture();

    {
      const p = pos0.image.data as Float32Array;
      const v = vel0.image.data as Float32Array;
      const a = aux0.image.data as Float32Array;
      for (let i=0; i<p.length; i+=4) { p[i+0]=0; p[i+1]=0; p[i+2]=0; p[i+3]=0; }
      for (let i=0; i<v.length; i+=4) { v[i+0]=0; v[i+1]=0; v[i+2]=0; v[i+3]=0; }
      for (let i=0; i<a.length; i+=4) { a[i+0]=1; a[i+1]=0; a[i+2]=Math.random()*1000.0; a[i+3]=-1; } // age=1 (dead), eIdx=-1
    }

    this.emitTex1 = this.makeEmitterTex(this.emit1Data);
    this.emitTex2 = this.makeEmitterTex(this.emit2Data);
    this.emitTex3 = this.makeEmitterTex(this.emit3Data);
    this.emitTex4 = this.makeEmitterTex(this.emit4Data);

    this.posVar = this.gpu.addVariable('texPos', this.shaderPos(), pos0);
    this.velVar = this.gpu.addVariable('texVel', this.shaderVel(), vel0);
    this.auxVar = this.gpu.addVariable('texAux', this.shaderAux(), aux0);

    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar, this.auxVar]);
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar, this.auxVar]);
    this.gpu.setVariableDependencies(this.auxVar, [this.posVar, this.velVar, this.auxVar]);

    const uniBlock = {
      uTime:        { value: 0 },
      uDelta:       { value: 0 },
      uEmitTex1:    { value: this.emitTex1 },
      uEmitTex2:    { value: this.emitTex2 },
      uEmitTex3:    { value: this.emitTex3 },
      uEmitTex4:    { value: this.emitTex4 },
      uAliveTex:    { value: this.aliveTex },
      uSpawnMapTex: { value: this.spawnMapTex },
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
      data, this.MAX_EXPLOSIONS, 1, THREE.RGBAFormat, THREE.FloatType
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
    let i = 0;
    for (let y=0; y<this.PARTICLES_H; y++) {
      for (let x=0; x<this.PARTICLES_W; x++) {
        uvs[i++] = (x + 0.5) / this.PARTICLES_W;
        uvs[i++] = (y + 0.5) / this.PARTICLES_H;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N*3), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: this.renderVS(),
      fragmentShader: this.renderFS(),
      uniforms: {
        uPosTex:       { value: this.texPos },
        uAuxTex:       { value: this.texAux },
        uEmitTex2:     { value: this.emitTex2 },
        uEmitTex4:     { value: this.emitTex4 },
        uEmitTex5:     { value: this.emitTex5 }, // <-- нова текстура (sharpness)
        uParticleTex:  { value: this.particleTex },
        uPixelRatio:   { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uTime:         { value: 0 },
      }
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    (this.points as any).__explosionIndexMap = new Map<string, number>();
  }

  // ==== compute shaders ====
  private shaderCommonNoise(): string {
    return `
float hash31(vec3 p){
  p = fract(p*0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 noiseTurb(vec3 p, float t){
  float n1 = hash31(p + vec3(t,0.0,0.0));
  float n2 = hash31(p + vec3(0.0,t,0.0));
  float n3 = hash31(p + vec3(0.0,0.0,t));
  return vec3(n1-0.5, n2-0.5, n3-0.5);
}
`; }

  private shaderPos(): string {
    return `
uniform float uDelta;
uniform sampler2D uEmitTex1;
uniform sampler2D uEmitTex3;
uniform sampler2D uEmitTex4;
uniform sampler2D uAliveTex;
uniform sampler2D uSpawnMapTex;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 pos = texture2D(texPos, uv);
  vec4 vel = texture2D(texVel, uv);
  vec4 aux = texture2D(texAux, uv);

  float age   = aux.x;
  float life  = aux.y;
  float eIdx  = aux.w;

  vec4 cmd = texture2D(uSpawnMapTex, uv);
  bool doSpawn = (cmd.a > 0.5);

  if (doSpawn) {
    float idx = cmd.r;
    float u = (idx + 0.5) / ${this.MAX_EXPLOSIONS}.0;

    float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;
    if (alive < 0.5) {
      eIdx = -1.0;
    } else {
      vec4 e1 = texture2D(uEmitTex1, vec2(u, 0.5));
      vec4 e3 = texture2D(uEmitTex3, vec2(u, 0.5));

      float r    = pow(cmd.g, 0.3333) * e3.x;
      float ang1 = cmd.b * 6.2831853;
      float z    = mix(-1.0, 1.0, fract(sin((cmd.g+cmd.b)*91.7)*43758.5453));
      float s    = sqrt(max(0.0, 1.0 - z*z));
      vec3 off   = vec3(s*cos(ang1), s*sin(ang1), z) * r;

      pos.xyz = e1.xyz + off;

      vec4 e4 = texture2D(uEmitTex4, vec2(u, 0.5));
      float isSpark = step(1.0 - e4.a, fract(sin((cmd.g+cmd.b*3.1)*123.45)*43758.5453));
      pos.w = isSpark;

      eIdx = idx;
    }
  } else if (eIdx >= 0.0 && age < life) {
    float u = (eIdx + 0.5) / ${this.MAX_EXPLOSIONS}.0;
    float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;
    if (alive >= 0.5) {
      pos.xyz += vel.xyz * uDelta;
    } else {
      eIdx = -1.0;
    }
  }

  gl_FragColor = vec4(pos.xyz, pos.w);
}
`; }

  private shaderVel(): string {
    return `
uniform float uTime;
uniform float uDelta;

uniform sampler2D uEmitTex1;
uniform sampler2D uEmitTex3;
uniform sampler2D uAliveTex;
uniform sampler2D uSpawnMapTex;

${this.shaderCommonNoise()}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 pos = texture2D(texPos, uv);
  vec4 vel = texture2D(texVel, uv);
  vec4 aux = texture2D(texAux, uv);

  float age   = aux.x;
  float life  = aux.y;
  float eIdx  = aux.w;

  vec4 cmd = texture2D(uSpawnMapTex, uv);
  bool doSpawn = (cmd.a > 0.5);

  if (doSpawn) {
    float idx = cmd.r;
    float u = (idx + 0.5) / ${this.MAX_EXPLOSIONS}.0;

    float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;
    if (alive < 0.5) {
      vel = vec4(0.0);
    } else {
      vec4 e1 = texture2D(uEmitTex1, vec2(u, 0.5));

      float ang1 = cmd.b * 6.2831853;
      float z    = mix(-1.0, 1.0, fract(sin((cmd.g+cmd.b)*91.7)*43758.5453));
      float s    = sqrt(max(0.0, 1.0 - z*z));
      vec3 dir   = normalize(vec3(s*cos(ang1), s*sin(ang1), z));

      float isSpark = texture2D(texPos, uv).w;
      float speedMul = mix(1.0, 2.2, isSpark);
      float baseSpeed = e1.w;

      vel = vec4(dir * baseSpeed * speedMul, 0.0);
    }
  } else if (eIdx >= 0.0 && age < life) {
    float u = (eIdx + 0.5) / ${this.MAX_EXPLOSIONS}.0;
    float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;

    if (alive < 0.5) {
      vel = vec4(0.0);
    } else {
      vec4 e3 = texture2D(uEmitTex3, vec2(u, 0.5));

      vec3 gravity = vec3(0.0, -e3.y, 0.0);   // <-- гравітація вниз по Y
      float drag   = clamp(e3.z, 0.0, 1.0);
      float turb   = e3.w;

      vec3 n = noiseTurb(pos.xyz*0.75 + vec3(aux.z), uTime*1.5);
      vec3 turbAcc = n * (2.0 * turb);

      vel.xyz += (gravity + turbAcc) * uDelta;
      vel.xyz *= (1.0 - drag * uDelta);
    }
  }

  gl_FragColor = vel;
}
`; }

  private shaderAux(): string {
    return `
uniform float uDelta;

uniform sampler2D uEmitTex2;
uniform sampler2D uAliveTex;
uniform sampler2D uSpawnMapTex;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 aux = texture2D(texAux, uv);
  float age   = aux.x;
  float life  = aux.y;
  float seed  = aux.z;
  float eIdx  = aux.w;

  vec4 cmd = texture2D(uSpawnMapTex, uv);
  bool doSpawn = (cmd.a > 0.5);

  if (doSpawn) {
    float idx = cmd.r;
    float u = (idx + 0.5) / ${this.MAX_EXPLOSIONS}.0;

    float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;
    if (alive < 0.5) {
      eIdx = -1.0;
    } else {
      vec4 e2 = texture2D(uEmitTex2, vec2(u, 0.5));
      float baseLife = max(0.08, e2.x);
      float j = fract(sin((cmd.g*91.7+cmd.b*13.1))*43758.5453);
      life = baseLife * mix(0.85, 1.15, j);
      age  = 0.0;
      seed = fract(sin((cmd.g*37.0+cmd.b*11.0+life)*12.9898)*43758.5453)*1000.0;
      eIdx = idx;
    }
  } else {
    if (eIdx >= 0.0 && age < life) {
      float u = (eIdx + 0.5) / ${this.MAX_EXPLOSIONS}.0;
      float alive = texture2D(uAliveTex, vec2(u, 0.5)).r;
      if (alive < 0.5) {
        eIdx = -1.0;
      } else {
        age += uDelta;
      }
    }
  }

  gl_FragColor = vec4(age, life, seed, eIdx);
}
`; }

  // ==== render shaders (points) ====
  private renderVS(): string {
    return `
precision highp float;
uniform sampler2D uPosTex;
uniform sampler2D uAuxTex;
uniform sampler2D uEmitTex2; // size0, size1, alpha0
uniform sampler2D uEmitTex4; // color.rgb, sparkFrac
uniform sampler2D uEmitTex5; // particleSharpness
uniform float uPixelRatio;

varying float vAlpha;
varying vec3  vColor;
varying float vSharp; // 0..1

void main() {
  vec4 pos4 = texture2D(uPosTex, uv);
  vec3 pos  = pos4.xyz;
  float isSpark = pos4.w;

  vec4 aux = texture2D(uAuxTex, uv);
  float age  = aux.x;
  float life = max(aux.y, 1e-3);
  float k = clamp(age / life, 0.0, 1.0);

  float eIdx = aux.w;
  if (eIdx < 0.0) {
    gl_Position = vec4(2.0,2.0,2.0,1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0; vColor = vec3(0.0); vSharp = 0.5;
    return;
  }
  float ue = (eIdx + 0.5) / ${this.MAX_EXPLOSIONS}.0;

  vec4 e2 = texture2D(uEmitTex2, vec2(ue, 0.5)); // life,size0,size1,alpha0
  vec4 e4 = texture2D(uEmitTex4, vec2(ue, 0.5)); // color.rgb
  vec4 e5 = texture2D(uEmitTex5, vec2(ue, 0.5)); // sharpness
  vSharp = clamp(e5.x, 0.0, 1.0);

  // Базовий колір з hue
  vec3 base = e4.rgb;
  
  // "Гарячий" центр - трохи світліший, але не білий
  float heat = smoothstep(0.0, 0.35, 1.0 - k);
  vec3 hot = base * 1.3; // Робимо світлішим, але зберігаємо відтінок
  
  // Міксуємо базовий з гарячим
  vColor = mix(base, hot, heat);
  
  // Іскорки - трохи світліші, але не білі
  vColor = mix(vColor, vColor * 1.2, isSpark * 0.3);

  float fade = (1.0 - k);
  vAlpha = e2.w * fade * mix(1.0, 1.3, isSpark);

  float size = mix(e2.y, e2.z, k) * mix(0.5, 1.0, 1.0 - isSpark);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = size * uPixelRatio * (24.0 / max(1e-3, -mv.z));
  gl_PointSize = min(gl_PointSize, 1024.0);
  gl_Position  = projectionMatrix * mv;
}
`; }

  private renderFS(): string {
    return `
precision mediump float;
uniform sampler2D uParticleTex;
varying float vAlpha;
varying vec3  vColor;
varying float vSharp; // 0..1

void main(){
  vec2 t = gl_PointCoord;
  float texA = texture2D(uParticleTex, t).a;

  // керуємо жорсткістю краю:
  // edge — радіус диска; feather — ширина пера (м'якого краю)
  float edge    = mix(0.62, 0.48, vSharp);
  float feather = mix(0.24, 0.06, vSharp);

  float r = length(t - 0.5);
  float rim = smoothstep(edge - feather, edge, r); // 0 в центрі, 1 на краю
  float soft = 1.0 - rim;                          // 1 в центрі, 0 на краю

  float alpha = texA * soft * vAlpha;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(vColor, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`; }

  // ==== tick ====
  updateAllExplosions() {
    const dt = this.clock.getDelta();
    const now = (this.auxVar.material.uniforms.uTime?.value ?? 0) + dt;

    this.posVar.material.uniforms.uTime.value = now;
    this.velVar.material.uniforms.uTime.value = now;
    this.auxVar.material.uniforms.uTime.value = now;
    (this.material.uniforms as any).uTime && ((this.material.uniforms.uTime as any).value = now);

    this.posVar.material.uniforms.uDelta.value = dt;
    this.velVar.material.uniforms.uDelta.value = dt;
    this.auxVar.material.uniforms.uDelta.value = dt;

    // TTL
    for (let i = 0; i < this.explosionCount; i++) {
      if (!this.explosionActive[i]) continue;
      const ttl = this.ttlSeconds[i] ?? -1;
      if (ttl > 0 && now - this.startTime[i] >= ttl) {
        this.killExplosion(i);
      }
    }

    // Spawn map — порційно
    this.spawnMapData.fill(0);
    let budget = this.MAX_PARTICLES;
    while (budget > 0) {
      let pushed = false;
      for (let i = 0; i < this.explosionCount && budget > 0; i++) {
        if (!this.explosionActive[i]) continue;
        const left = this.remainingToSpawn[i] | 0;
        if (left <= 0) continue;

        const n = Math.min(left, 256, budget);
        for (let k = 0; k < n; k++) {
          const idx = this.spawnHead;
          this.spawnHead = (this.spawnHead + 1) % this.MAX_PARTICLES;

          const x = idx % this.PARTICLES_W;
          const y = (idx / this.PARTICLES_W) | 0;
          const off = (y * this.PARTICLES_W + x) * 4;

          this.spawnMapData[off + 0] = i;
          this.spawnMapData[off + 1] = Math.random();
          this.spawnMapData[off + 2] = Math.random();
          this.spawnMapData[off + 3] = 1.0;
        }
        this.remainingToSpawn[i] -= n;
        budget -= n;
        pushed = pushed || (n > 0);
      }
      if (!pushed) break;
    }
    this.spawnMapTex.needsUpdate = true;

    this.gpu.compute();

    this.texPos = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.texAux = this.gpu.getCurrentRenderTarget(this.auxVar).texture;
    this.material.uniforms.uPosTex.value = this.texPos;
    this.material.uniforms.uAuxTex.value = this.texAux;

    // FLASH sphere
    for (let i = 0; i < this.explosionCount; i++) {
      const mesh = this.flashMeshes[i];
      if (!mesh) continue;

      const life = this.flashLifeArr[i] ?? 0;
      const t = (now - this.flashStart[i]) / Math.max(1e-6, life);
      if (t >= 1.0 || !this.explosionActive[i]) {
        this.group.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        (mesh.geometry as THREE.BufferGeometry).dispose();
        this.flashMeshes[i] = null;
        continue;
      }

      const growth = 1.0 - Math.pow(1.0 - t, 3.0); // easeOutCubic
      const R = this.flashRadiusArr[i] ?? 2.0;
      mesh.scale.setScalar(R * growth);

      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uT.value = t;
    }
  }

  // ==== API ====
  render(object: SceneObject): THREE.Object3D {
    const idx = this.addExplosion(object.coordinates, {
      particleSize:    object.data?.particleSize ?? 26.0,
      particleSizeEnd: object.data?.particleSizeEnd ?? 10.0,
      velocity:        object.data?.velocity ?? 18.0,
      particleCount:   object.data?.particleCount ?? 2400,
      hue:             object.data?.hue ?? 30.0,
      alpha:           object.data?.alpha ?? 0.9,
      life:            object.data?.life ?? 1.0,
      spreadRadius:    object.data?.spreadRadius ?? 2.0,
      gravity:         object.data?.gravity ?? 0.0,           // <-- керує падінням по Y
      drag:            object.data?.drag ?? 0.35,
      turbulence:      object.data?.turbulence ?? 0.2,
      sparkFrac:       object.data?.sparkFrac ?? 0.15,
      particleSharpness: object.data?.particleSharpness ?? 0.55, // <-- нова ручка

      ttl:             object.data?.ttl,

      // flash sphere
      flashLife:       object.data?.flashLife ?? 0.6,
      flashRadius:     object.data?.flashRadius,
      flashAlpha:      object.data?.flashAlpha ?? 0.85,
      flashIntensity:  object.data?.flashIntensity ?? 1.2,
      flashSizePx:     object.data?.flashSizePx,
    });

    this.addMesh(object.id, this.points);
    (this.points as any).__explosionIndexMap.set(object.id, idx);
    return this.points;
  }

  update(object: SceneObject): void {
    const map: Map<string, number> = (this.points as any).__explosionIndexMap;
    const idx = map?.get(object.id);
    if (idx !== undefined && idx >= 0) this.moveExplosion(idx, object.coordinates);
  }

  remove(id: string): void {
    const map: Map<string, number> = (this.points as any).__explosionIndexMap;
    const idx = map?.get(id);
    if (idx !== undefined && idx >= 0) {
      this.killExplosion(idx);
      map.delete(id);
    }
  }

  private addExplosion(position: Vec3, opts: ExplosionData = {}): number {
    let i = -1;
    for (let j=0; j<this.explosionCount; j++){
      if (!this.explosionActive[j]) { i = j; break; }
    }
    if (i === -1) {
      i = this.explosionCount;
      if (i >= this.MAX_EXPLOSIONS) { console.warn('ExplosionRenderer: MAX_EXPLOSIONS reached'); return -1; }
      this.explosionCount++;
    }

    const size0   = opts.particleSize    ?? 26.0;
    const size1   = opts.particleSizeEnd ?? 10.0;
    const speed   = opts.velocity        ?? 18.0;
    const count   = opts.particleCount   ?? 2400;
    const hue     = opts.hue             ?? 30.0;
    const alpha0  = opts.alpha           ?? 0.9;
    const life    = opts.life            ?? 1.0;
    const spreadR = opts.spreadRadius    ?? 2.0;
    const grav    = opts.gravity         ?? 0.0;         // <-- по об’єкту
    const drag    = opts.drag            ?? 0.35;
    const turbul  = opts.turbulence      ?? 0.2;
    const sparkFr = opts.sparkFrac       ?? 0.15;
    const sharp   = THREE.MathUtils.clamp(opts.particleSharpness ?? 0.55, 0, 1);

    const color = new THREE.Color().setHSL(hue/360, 0.85, 0.55);

    this.emit1Data[i*4+0] = position.x;
    this.emit1Data[i*4+1] = position.y;
    this.emit1Data[i*4+2] = position.z;
    this.emit1Data[i*4+3] = speed;

    this.emit2Data[i*4+0] = life;
    this.emit2Data[i*4+1] = size0;
    this.emit2Data[i*4+2] = size1;
    this.emit2Data[i*4+3] = alpha0;

    this.emit3Data[i*4+0] = spreadR;
    this.emit3Data[i*4+1] = grav;     // <-- гравітація вниз
    this.emit3Data[i*4+2] = drag;
    this.emit3Data[i*4+3] = turbul;

    this.emit4Data[i*4+0] = color.r;
    this.emit4Data[i*4+1] = color.g;
    this.emit4Data[i*4+2] = color.b;
    this.emit4Data[i*4+3] = sparkFr;

    this.emit5Data[i*4+0] = sharp;    // <-- гострота
    this.emit5Data[i*4+1] = 0;
    this.emit5Data[i*4+2] = 0;
    this.emit5Data[i*4+3] = 0;

    this.emitTex1.needsUpdate = true;
    this.emitTex2.needsUpdate = true;
    this.emitTex3.needsUpdate = true;
    this.emitTex4.needsUpdate = true;
    this.emitTex5.needsUpdate = true;

    // alive = 1
    this.aliveData[i*4+0] = 1.0; this.aliveTex.needsUpdate = true;

    this.explosionActive[i] = true;
    this.remainingToSpawn[i] = count;

    // TTL
    this.ttlSeconds[i] = opts.ttl ?? -1;
    this.startTime[i]  = (this.auxVar.material.uniforms.uTime.value as number) ?? performance.now()*0.001;

    // FLASH sphere
    this.makeFlashSphereFor(i, position, hue, opts, speed);

    return i;
  }

  private makeFlashSphereFor(i: number, pos: Vec3, hue: number, opts: ExplosionData, speed: number) {
    const life = opts.flashLife ?? 0.6;
    const alpha0 = (opts.flashAlpha ?? 0.85);
    const intensity = (opts.flashIntensity ?? 1.2);
    const softness = 1.6;
    const fadeExp  = 1.4;

    const R = (opts.flashRadius !== undefined)
      ? opts.flashRadius
      : Math.max(1.0, speed * life * 0.9);

    const color = new THREE.Color().setHSL((hue ?? 30)/360, 0.85, 0.55);

    const geo = new THREE.SphereGeometry(1, 32, 24);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying float vNdotV;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 N = normalize(normalMatrix * normal);
          vec3 V = normalize(-mv.xyz);
          vNdotV = clamp(dot(N, V), 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying float vNdotV;
        uniform vec3  uColor;
        uniform float uAlpha0;
        uniform float uIntensity;
        uniform float uSoftness;
        uniform float uT;          // 0..1
        uniform float uFadeExp;

        void main(){
          float radial = pow(vNdotV, uSoftness);
          float env = pow(max(0.0, 1.0 - uT), uFadeExp);

          float alpha = uAlpha0 * radial * env;
          vec3  col   = uColor * (1.0 + 1.25 * radial) * uIntensity;

          if (alpha < 0.003) discard;
          gl_FragColor = vec4(col, alpha);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      uniforms: {
        uColor:     { value: color.clone() },
        uAlpha0:    { value: alpha0 },
        uIntensity: { value: intensity },
        uSoftness:  { value: softness },
        uT:         { value: 0.0 },
        uFadeExp:   { value: fadeExp },
      }
    });
    (mat as any).toneMapped = true;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(1e-4);
    mesh.renderOrder = 11;

    this.group.add(mesh);
    this.flashMeshes[i]      = mesh;
    this.flashLifeArr[i]     = life;
    this.flashRadiusArr[i]   = R;
    this.flashAlphaArr[i]    = alpha0;
    this.flashIntensityArr[i]= intensity;
    this.flashSoftnessArr[i] = softness;
    this.flashFadeExpArr[i]  = fadeExp;
    this.flashStart[i]       = (this.auxVar.material.uniforms.uTime.value as number) ?? performance.now()*0.001;
    this.flashColorArr[i]    = color;
  }

  private moveExplosion(index: number, pos: Vec3) {
    if (index < 0 || index >= this.explosionCount) return;

    this.emit1Data[index*4+0] = pos.x;
    this.emit1Data[index*4+1] = pos.y;
    this.emit1Data[index*4+2] = pos.z;
    this.emitTex1.needsUpdate = true;

    const flash = this.flashMeshes[index];
    if (flash) flash.position.set(pos.x, pos.y, pos.z);
  }

  private killExplosion(index: number) {
    if (index < 0 || index >= this.explosionCount) return;
    if (!this.explosionActive[index]) return;

    this.explosionActive[index] = false;
    this.remainingToSpawn[index] = 0;

    this.aliveData[index*4+0] = 0.0;
    this.aliveTex.needsUpdate = true;

    const mesh = this.flashMeshes[index];
    if (mesh) {
      this.group.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      (mesh.geometry as THREE.BufferGeometry).dispose();
      this.flashMeshes[index] = null;
    }
  }
}
