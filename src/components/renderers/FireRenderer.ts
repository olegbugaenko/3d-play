// FireRenderer_GPU_MWE_FlameTongues_primeSpawn.ts
import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

type Vec3 = { x:number; y:number; z:number };

export class FireRenderer extends BaseRenderer {
  private readonly PARTICLES_W = 128;
  private readonly PARTICLES_H = 128;
  private readonly MAX_PARTICLES = this.PARTICLES_W * this.PARTICLES_H;
  private readonly MAX_EMITTERS = 64;
  // ліміти часу та бюджетів
  private readonly MAX_DT_SIM = 1/30;          // клем для фізики (uDelta), ~33мс
  private readonly MAX_DT_SPAWN = 1/30;        // клем для емісії
  private readonly BIG_GAP_SEC = 0.25;         // якщо розрив більший — не «надолужуємо» спавн цього кадру
  private readonly MAX_BACKLOG_SEC = 0.20;     // максимум боргу емісії в секундах
  private readonly MAX_SPAWN_PER_EMITTER = 64; // скільки частинок один еміттер може закинути за кадр
  private readonly MAX_SPAWN_PER_FRAME = 4096; // глобальний бюджет спавнів за кадр


  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  private gpu!: GPUComputationRenderer;
  private posVar!: any;
  private texPos!: THREE.Texture;

  private clock = new THREE.Clock();

  // Емітери:
  // emitPosTex:   xyz + active(=w)
  // emitColTex:   rgb + emitRate(=a)
  // emitPropTex:  spreadR(=x), spreadY(=y), sizeMul(=z), (вільно)
  // emitExtraTex: riseHeight(=x), spreadGrow(=y), tongueBoost(=z), tongueSharpness(=w)
  private emitPosData: Float32Array;
  private emitColData: Float32Array;
  private emitPropData: Float32Array;
  private emitExtraData: Float32Array;

  private emitPosTex: THREE.DataTexture;
  private emitColTex: THREE.DataTexture;
  private emitPropTex: THREE.DataTexture;
  private emitExtraTex: THREE.DataTexture;

  private emitterCount = 0;
  private emitterActive: boolean[];

  // --- OPT#2: Spawn map у RGBA8 + "touched list" ---
  // R=emitterIndex(0..255), G=seed1(0..255), B=seed2(0..255), A=flag(0/255)
  private spawnMapData8: Uint8Array;
  private spawnMapTex: THREE.DataTexture;
  private touched: number[] = []; // індекси пікселів, які змінювали минулого кадру

  // Прайм-черга (щоб не робити позачерговий compute)
  private primeQueue: Array<{ emitter: number; left: number }> = [];
  private readonly MAX_PRIME_PER_FRAME = 2048; // скільки прайм-спавнів відпрацьовуємо за один update

  private emitAcc: Float32Array;
  private spawnHead = 0;

  // Dirty-прапорці для емітерних текстур
  private emitPosDirty = false;
  private emitColDirty = false;
  private emitPropDirty = false;
  private emitExtraDirty = false;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    super(scene, renderer);

    this.group = new THREE.Group();
    this.group.name = 'FireGroup_MWE_FlameTongues';
    this.scene.add(this.group);

    // --- Емітерні текстури ---
    this.emitPosData = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitPosTex = new THREE.DataTexture(
      this.emitPosData, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.emitPosTex.needsUpdate = true;
    this.emitPosTex.magFilter = THREE.NearestFilter;
    this.emitPosTex.minFilter = THREE.NearestFilter;
    this.emitPosTex.wrapS = this.emitPosTex.wrapT = THREE.ClampToEdgeWrapping;

    this.emitColData = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitColTex = new THREE.DataTexture(
      this.emitColData, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.emitColTex.needsUpdate = true;
    this.emitColTex.magFilter = THREE.NearestFilter;
    this.emitColTex.minFilter = THREE.NearestFilter;
    this.emitColTex.wrapS = this.emitColTex.wrapT = THREE.ClampToEdgeWrapping;

    this.emitPropData = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitPropTex = new THREE.DataTexture(
      this.emitPropData, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.emitPropTex.needsUpdate = true;
    this.emitPropTex.magFilter = THREE.NearestFilter;
    this.emitPropTex.minFilter = THREE.NearestFilter;
    this.emitPropTex.wrapS = this.emitPropTex.wrapT = THREE.ClampToEdgeWrapping;

    this.emitExtraData = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitExtraTex = new THREE.DataTexture(
      this.emitExtraData, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.emitExtraTex.needsUpdate = true;
    this.emitExtraTex.magFilter = THREE.NearestFilter;
    this.emitExtraTex.minFilter = THREE.NearestFilter;
    this.emitExtraTex.wrapS = this.emitExtraTex.wrapT = THREE.ClampToEdgeWrapping;

    this.emitterActive = Array(this.MAX_EMITTERS).fill(false);

    // --- Spawn map RGBA8 ---
    this.spawnMapData8 = new Uint8Array(this.MAX_PARTICLES * 4);
    this.spawnMapTex = new THREE.DataTexture(
      this.spawnMapData8, this.PARTICLES_W, this.PARTICLES_H, THREE.RGBAFormat, THREE.UnsignedByteType
    );
    this.spawnMapTex.needsUpdate = true;
    this.spawnMapTex.magFilter = THREE.NearestFilter;
    this.spawnMapTex.minFilter = THREE.NearestFilter;
    this.spawnMapTex.wrapS = this.spawnMapTex.wrapT = THREE.ClampToEdgeWrapping;

    this.emitAcc = new Float32Array(this.MAX_EMITTERS);

    this.initGPU();
    this.initRenderPoints();
  }

  // ---------- GPU (compute) ----------
  private initGPU() {
    this.gpu = new GPUComputationRenderer(this.PARTICLES_W, this.PARTICLES_H, this.renderer as any);

    // OPT#1: HalfFloat для compute якщо WebGL2
    const caps = (this.renderer as any).capabilities;
    if (caps && caps.isWebGL2) {
      this.gpu.setDataType(THREE.HalfFloatType);
    }

    const pos0 = this.gpu.createTexture();
    this.fillInitialPositions(pos0.image.data as Float32Array);

    this.posVar = this.gpu.addVariable('texturePosition', this.shaderPosFlame(), pos0);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar]);

    Object.assign(this.posVar.material.uniforms, {
      uTime:        { value: 0 },
      uDelta:       { value: 0 },
      uSpeed:       { value: 1.4 },  // вгору
      uEmitPosTex:  { value: this.emitPosTex },
      uEmitPropTex: { value: this.emitPropTex },
      uEmitExtraTex:{ value: this.emitExtraTex },
      uSpawnMapTex: { value: this.spawnMapTex }, // RGBA8
    });

    const err = this.gpu.init();
    if (err) console.error(err);

    this.texPos = this.gpu.getCurrentRenderTarget(this.posVar).texture;
  }

  private fillInitialPositions(p: Float32Array) {
    for (let i=0; i<p.length; i+=4) {
      p[i+0] = 0.0;
      p[i+1] = 0.0;
      p[i+2] = 0.0;
      p[i+3] = -1.0; // мертва/вільна клітинка
    }
  }

  private shaderPosFlame(): string {
    return `
      precision highp float;
      // uniform sampler2D texturePosition; // GPUComp
      // uniform vec2      resolution;

      uniform float uTime;
      uniform float uDelta;
      uniform float uSpeed;

      uniform sampler2D uEmitPosTex;    // (x,y,z, active)
      uniform sampler2D uEmitPropTex;   // (spreadR, spreadY, sizeMul, _)
      uniform sampler2D uEmitExtraTex;  // (riseHeight, spreadGrow, tongueBoost, tongueSharp)
      uniform sampler2D uSpawnMapTex;   // RGBA8 normalized (idx/255, s1, s2, flag)

      float rand(float x){ return fract(sin(x * 12.9898) * 43758.5453); }

      void main(){
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);

        // Decode RGBA8
        vec4 cmd = texture2D(uSpawnMapTex, uv);
        float doSpawn = step(0.5, cmd.a);
        float emitterIndex = pos.w;

        if (doSpawn > 0.5) {
          float idxU8 = floor(cmd.r * 255.0 + 0.5);
          float s1U8  = floor(cmd.g * 255.0 + 0.5);
          float s2U8  = floor(cmd.b * 255.0 + 0.5);
          float idx   = idxU8;

          // Децентруємо сіди у (0,1), центр біну: (k + 0.5)/256
          float seed1 = (s1U8 + 0.5) / 256.0;
          float seed2 = (s2U8 + 0.5) / 256.0;

          float u   = (idx + 0.5) / ${this.MAX_EMITTERS}.0;

          vec4 eposA  = texture2D(uEmitPosTex,  vec2(u, 0.5));
          vec4 epropA = texture2D(uEmitPropTex, vec2(u, 0.5));

          vec3 epos     = eposA.xyz;
          float spreadR  = epropA.x;
          float spreadY  = epropA.y;

          // Рівномірний диск: r = R*sqrt(u), мінімальний r для стабільного dir
          float r  = max(spreadR * sqrt(seed1), spreadR * (1.0/512.0));
          float a  = 6.2831853 * seed2;
          float sy = (rand(seed1 + seed2*57.3) * 2.0 - 1.0) * spreadY;

          vec3 jitter = vec3(cos(a)*r, sy, sin(a)*r);
          pos.xyz = epos + jitter;
          pos.y   = epos.y + sy;
          pos.w   = idx;

        } else {
          if (emitterIndex >= 0.0) {
            float u   = (emitterIndex + 0.5) / ${this.MAX_EMITTERS}.0;

            vec4 eposA   = texture2D(uEmitPosTex,   vec2(u, 0.5));
            vec4 epropA  = texture2D(uEmitPropTex,  vec2(u, 0.5));
            vec4 eextraA = texture2D(uEmitExtraTex, vec2(u, 0.5));

            vec3 epos       = eposA.xyz;
            float activeA    = eposA.w;
            float spreadR    = max(1e-4, epropA.x);
            float riseH      = max(0.0, eextraA.x);
            float grow       = eextraA.y;
            float tBoost     = max(0.0, eextraA.z);
            float tSharp     = max(0.001, eextraA.w);

            vec2  toC = pos.xz - epos.xz;
            float r    = length(toC);
            float r01  = clamp(r / (spreadR * 1.5), 0.0, 1.0);

            float centerBoost = 1.0 + tBoost * (1.0 - pow(r01, tSharp));

            float flick = 0.85 + 0.30 * sin( (pos.x + pos.z) * 12.0 + uTime * 28.0 );
            pos.y += (uSpeed * centerBoost) * uDelta * flick;

            float h  = (riseH > 1e-3) ? clamp((pos.y - epos.y) / riseH, 0.0, 1.0) : 1.0;
            float hs = h*h*(3.0-2.0*h);

            if (grow != 0.0) {
              vec2 dir = (r > 1e-5) ? (toC / r) : vec2(0.0, 1.0);
              pos.xz += dir * (grow * hs) * uDelta;
            }

            float topY = epos.y + riseH * centerBoost;
            if ((pos.y > topY) || (activeA < 0.5)) {
              pos.w = -1.0;
            }
          }
        }

        gl_FragColor = pos;
      }
    `;
  }

  // ---------- Render ----------
  private initRenderPoints() {
    const N = this.MAX_PARTICLES;
    const uvs = new Float32Array(N * 2);
    {
      let k = 0;
      for (let y = 0; y < this.PARTICLES_H; y++) {
        for (let x = 0; x < this.PARTICLES_W; x++) {
          uvs[k++] = (x + 0.5) / this.PARTICLES_W;
          uvs[k++] = (y + 0.5) / this.PARTICLES_H;
        }
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: this.renderVS(),
      fragmentShader: this.renderFS(),
      uniforms: {
        uPosTex:      { value: this.texPos },
        uEmitColTex:  { value: this.emitColTex },  // rgb + emitRate(a)
        uEmitPropTex: { value: this.emitPropTex }, // sizeMul у z
        uPixelRatio:  { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uPointSize:   { value: 16.0 },
      },
    });
    (this.material as any).toneMapped = false;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    (this.points as any).__emitterIndexMap = new Map<string, number>();
  }

  private renderVS(): string {
    return `
      precision highp float;

      uniform sampler2D uPosTex;
      uniform sampler2D uEmitColTex;
      uniform sampler2D uEmitPropTex;
      uniform float uPixelRatio;
      uniform float uPointSize;

      varying vec3 vTint;

      void main(){
        vec4 pos4 = texture2D(uPosTex, uv);
        float emitterIndex = pos4.w;

        // мертві за межі фрустума
        float dead = step(emitterIndex, -0.5);
        vec3 pos = mix(pos4.xyz, vec3(1e9), dead);

        float ue = (emitterIndex + 0.5) / ${this.MAX_EMITTERS}.0;
        vec3 tint = texture2D(uEmitColTex, vec2(ue, 0.5)).rgb;
        vTint = mix(tint, vec3(0.0), dead);

        float sizeMul = texture2D(uEmitPropTex, vec2(ue, 0.5)).z;
        float px = max(1.0, uPointSize * sizeMul);

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = px * uPixelRatio * (24.0 / max(1e-3, -mv.z));
        gl_PointSize = min(gl_PointSize, 1024.0);
        gl_Position  = projectionMatrix * mv;
      }
    `;
  }

  private renderFS(): string {
    return `
      precision mediump float;
      varying vec3 vTint;

      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) / 0.5;
        if (r > 1.0) discard;

        float core = pow(1.0 - clamp(r, 0.0, 1.0), 3.0);
        vec3 hot = vec3(1.0, 0.95, 0.70);
        vec3 mid = vec3(1.0, 0.55, 0.12);
        vec3 edge= vec3(0.25, 0.07, 0.02);

        vec3 col = mix(edge, mix(mid, hot, smoothstep(0.25, 0.75, core)), core);
        col *= (vTint * 0.7 + 0.3);

        float alpha = core;
        gl_FragColor = vec4(col, alpha);
      }
    `;
  }

  // ---------- Spawn helpers ----------
  private enqueueSpawn(emitterIndex: number) {
    const idx = this.spawnHead;
    this.spawnHead = (this.spawnHead + 1) % this.MAX_PARTICLES;

    const off = idx * 4;
    this.spawnMapData8[off + 0] = (emitterIndex & 0xFF);      // R: idx
    this.spawnMapData8[off + 1] = (Math.random() * 255) | 0;  // G: seed1
    this.spawnMapData8[off + 2] = (Math.random() * 255) | 0;  // B: seed2
    this.spawnMapData8[off + 3] = 255;                        // A: flag

    this.touched.push(idx);
  }

  // PRIME: додаємо багато спавнів у чергу, щоб відпрацьовувати порціями
  private primeSpawn(emitterIndex: number, count: number) {
    if (count <= 0) return;
    this.primeQueue.push({ emitter: emitterIndex, left: count });
  }

  private drainPrimeQueue(budget: number): number {
    let leftBudget = budget;
    while (leftBudget > 0 && this.primeQueue.length > 0) {
      const q = this.primeQueue[0];
      const n = Math.min(leftBudget, q.left);
      for (let k = 0; k < n; k++) this.enqueueSpawn(q.emitter);
      q.left -= n;
      leftBudget -= n;
      if (q.left <= 0) this.primeQueue.shift();
    }
    return budget - leftBudget; // скільки реально заспавнили
  }

  // ---------- Tick ----------
  updateAllFire() {
    const rawDt = this.clock.getDelta();
  
    // 1) клемимо дельти
    const bigGap = rawDt > this.BIG_GAP_SEC;
    const dtSim   = Math.min(rawDt, this.MAX_DT_SIM);
    const dtSpawn = bigGap ? 0.0 : Math.min(rawDt, this.MAX_DT_SPAWN);
  
    // час/дельта для шейдера
    const now = (this.posVar.material.uniforms.uTime.value as number) + dtSim;
    this.posVar.material.uniforms.uTime.value  = now;
    this.posVar.material.uniforms.uDelta.value = dtSim;
  
    // 2) відкладені апдейти емітерних текстур
    if (this.emitPosDirty)   { this.emitPosTex.needsUpdate   = true; this.emitPosDirty   = false; }
    if (this.emitColDirty)   { this.emitColTex.needsUpdate   = true; this.emitColDirty   = false; }
    if (this.emitPropDirty)  { this.emitPropTex.needsUpdate  = true; this.emitPropDirty  = false; }
    if (this.emitExtraDirty) { this.emitExtraTex.needsUpdate = true; this.emitExtraDirty = false; }
  
    // 3) очищаємо лише "торкані" пікселі spawnMap
    const hadTouched = this.touched.length > 0;
    for (let i = 0; i < this.touched.length; i++) {
      const off = this.touched[i] * 4;
      this.spawnMapData8[off + 0] = 0;
      this.spawnMapData8[off + 1] = 0;
      this.spawnMapData8[off + 2] = 0;
      this.spawnMapData8[off + 3] = 0;
    }
    this.touched.length = 0;
  
    let anySpawn = false;
  
    // 4) спочатку — праймова черга (щоб не було фрізів)
    const primed = this.drainPrimeQueue(this.MAX_PRIME_PER_FRAME);
    if (primed > 0) anySpawn = true;
  
    // 5) глобальний бюджет спавнів на кадр (з урахуванням уже праймованих)
    let frameBudget = Math.max(0, this.MAX_SPAWN_PER_FRAME - primed);
  
    // 6) звичайний спавн по emitRate з обмеженнями боргу та бюджету
    for (let i = 0; i < this.emitterCount && frameBudget > 0; i++) {
      if (!this.emitterActive[i]) continue;
  
      const rate = this.emitColData[i*4 + 3]; // emitRate (particles/sec)
      if (rate <= 0) continue;
  
      // ліміт боргу: не більше MAX_BACKLOG_SEC секунд емісії
      const backlogCap = rate * this.MAX_BACKLOG_SEC;
  
      // накопичуємо зі "склеєною" дельтою для емісії
      this.emitAcc[i] = Math.min(this.emitAcc[i] + rate * dtSpawn, backlogCap);
  
      // скільки частинок реально спавнимо з цього еміттера в цьому кадрі
      let n = (this.emitAcc[i] | 0);
      if (n <= 0) continue;
  
      n = Math.min(n, this.MAX_SPAWN_PER_EMITTER);
      n = Math.min(n, frameBudget);
  
      this.emitAcc[i] -= n;
      frameBudget -= n;
  
      while (n-- > 0) {
        this.enqueueSpawn(i);
        anySpawn = true;
      }
    }
  
    // 7) оновлюємо spawnMap у відеопам’ять лише якщо було що міняти
    if (anySpawn || hadTouched) {
      this.spawnMapTex.needsUpdate = true;
    }
  
    // 8) compute
    this.gpu.compute();
  
    // 9) позиції для рендера
    this.texPos = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.material.uniforms.uPosTex.value = this.texPos;
  }
  

  // ---------- Public API ----------
  private addEmitter(
    position: Vec3,
    color?: number,
    emitRate?: number,
    spreadR?: number,
    spreadY?: number,
    sizeMul?: number,
    spreadGrow?: number,
    riseHeight?: number,
    tongueBoost?: number,
    tongueSharpness?: number,
  ): number {
    let i = -1;
    for (let j = 0; j < this.emitterCount; j++) {
      if (!this.emitterActive[j]) { i = j; break; }
    }
    if (i === -1) {
      i = this.emitterCount;
      if (i >= this.MAX_EMITTERS) { console.warn('MAX_EMITTERS reached'); return -1; }
      this.emitterCount++;
    }

    const c  = new THREE.Color(color ?? 0xffa040);
    const r  = (emitRate ?? 120);
    const sr = (spreadR ?? 0.08);
    const sy = (spreadY ?? 0.02);
    const sm = (sizeMul ?? 1.2);
    const sg = (spreadGrow ?? 0.0);
    const rh = (riseHeight ?? 1.4);
    const tb = (tongueBoost ?? 0.8);
    const ts = (tongueSharpness ?? 2.0);

    const o1 = i * 4;
    this.emitPosData[o1+0] = position.x;
    this.emitPosData[o1+1] = position.y;
    this.emitPosData[o1+2] = position.z;
    this.emitPosData[o1+3] = 1.0;
    this.emitPosDirty = true;

    const o2 = i * 4;
    this.emitColData[o2+0] = c.r;
    this.emitColData[o2+1] = c.g;
    this.emitColData[o2+2] = c.b;
    this.emitColData[o2+3] = r;
    this.emitColDirty = true;

    const o3 = i * 4;
    this.emitPropData[o3+0] = sr;
    this.emitPropData[o3+1] = sy;
    this.emitPropData[o3+2] = sm;
    this.emitPropData[o3+3] = 0.0;
    this.emitPropDirty = true;

    const o4 = i * 4;
    this.emitExtraData[o4+0] = rh;
    this.emitExtraData[o4+1] = sg;
    this.emitExtraData[o4+2] = tb;
    this.emitExtraData[o4+3] = ts;
    this.emitExtraDirty = true;

    this.emitterActive[i] = true;
    this.emitAcc[i] = 0;

    // PRIME: засіваємо без фрізів (чергою)
    this.primeSpawn(i, Math.min(4096, this.MAX_PARTICLES));

    return i;
  }

  private moveEmitter(
    index: number,
    pos: Vec3,
    color?: number,
    emitRate?: number,
    spreadR?: number,
    spreadY?: number,
    sizeMul?: number,
    spreadGrow?: number,
    riseHeight?: number,
    tongueBoost?: number,
    tongueSharpness?: number,
  ) {
    if (index < 0 || index >= this.emitterCount) return;

    const o1 = index * 4;
    this.emitPosData[o1+0] = pos.x;
    this.emitPosData[o1+1] = pos.y;
    this.emitPosData[o1+2] = pos.z;
    this.emitPosDirty = true;

    if (color !== undefined || emitRate !== undefined) {
      const o2 = index * 4;
      if (color !== undefined) {
        const c = new THREE.Color(color);
        this.emitColData[o2+0] = c.r;
        this.emitColData[o2+1] = c.g;
        this.emitColData[o2+2] = c.b;
      }
      if (emitRate !== undefined) this.emitColData[o2+3] = emitRate;
      this.emitColDirty = true;
    }

    if (spreadR !== undefined || spreadY !== undefined || sizeMul !== undefined) {
      const o3 = index * 4;
      if (spreadR  !== undefined) this.emitPropData[o3+0] = spreadR;
      if (spreadY  !== undefined) this.emitPropData[o3+1] = spreadY;
      if (sizeMul  !== undefined) this.emitPropData[o3+2] = sizeMul;
      this.emitPropDirty = true;
    }

    if (spreadGrow !== undefined || riseHeight !== undefined || tongueBoost !== undefined || tongueSharpness !== undefined) {
      const o4 = index * 4;
      if (riseHeight      !== undefined) this.emitExtraData[o4+0] = riseHeight;
      if (spreadGrow      !== undefined) this.emitExtraData[o4+1] = spreadGrow;
      if (tongueBoost     !== undefined) this.emitExtraData[o4+2] = tongueBoost;
      if (tongueSharpness !== undefined) this.emitExtraData[o4+3] = tongueSharpness;
      this.emitExtraDirty = true;
    }
  }

  private setEmitterActive(index: number, active: boolean) {
    if (index < 0 || index >= this.emitterCount) return;
    this.emitterActive[index] = active;
    this.emitPosData[index*4 + 3] = active ? 1.0 : 0.0;
    this.emitPosDirty = true;
    if (!active) this.emitAcc[index] = 0;
  }

  // інтеграція з твоїм SceneObject
  render(object: SceneObject): THREE.Object3D {
            // Emitter додано
    const idx = this.addEmitter(
      object.coordinates,
      object.data?.color,
      object.data?.emitRate,
      object.data?.spreadRadius,
      object.data?.spreadY ?? 0.02,
      (object.data?.baseSize ?? 10.0) / 10.0,
      object.data?.spreadGrow ?? 0.0,
      (object.data?.riseHeight ?? object.data?.rise ?? 1.4),
      object.data?.tongueBoost ?? 0.8,
      object.data?.tongueSharpness ?? 2.0,
    );
    this.addMesh(object.id, this.points);
    (this.points as any).__emitterIndexMap = (this.points as any).__emitterIndexMap || new Map<string, number>();
    (this.points as any).__emitterIndexMap.set(object.id, idx);
    return this.points;
  }

  update(object: SceneObject): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(object.id);
    if (idx !== undefined && idx >= 0) {
      this.moveEmitter(
        idx,
        object.coordinates,
        object.data?.color,
        object.data?.emitRate,
        object.data?.spreadRadius,
        object.data?.spreadY,
        (object.data?.baseSize !== undefined) ? (object.data.baseSize / 10.0) : undefined,
        object.data?.spreadGrow,
        (object.data?.riseHeight ?? object.data?.rise),
        object.data?.tongueBoost,
        object.data?.tongueSharpness,
      );
    }
  }

  remove(id: string): void {
    const map: Map<string, number> = (this.points as any).__emitterIndexMap;
    const idx = map?.get(id);
    if (idx !== undefined && idx >= 0) {
      this.setEmitterActive(idx, false);
      map.delete(id);
    }
  }

  // «ручки»
  setSpeed(speed: number)      { (this.posVar.material.uniforms.uSpeed     as any).value = speed; }
  setBasePointSize(px: number) { (this.material.uniforms.uPointSize        as any).value = px; }
}
