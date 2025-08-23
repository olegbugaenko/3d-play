// SmokeRenderer_GPU_MWE_EmitRateSpreadCone_RisePerEmitter_AlphaHeight.ts
import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

type Vec3 = { x:number; y:number; z:number };

export class SmokeRenderer extends BaseRenderer {
  private readonly PARTICLES_W = 128;
  private readonly PARTICLES_H = 128;
  private readonly MAX_PARTICLES = this.PARTICLES_W * this.PARTICLES_H;
  private readonly MAX_EMITTERS = 64;

  // --- анти-сплеск/анти-борг для спавну та симуляції ---
  private readonly MAX_DT_SIM = 1/30;          // clamp для фізики (uDelta) ~33мс
  private readonly MAX_DT_SPAWN = 1/30;        // clamp для емісії
  private readonly BIG_GAP_SEC = 0.25;         // якщо пауза > цього — не «надолужуємо» спавн цього кадру
  private readonly MAX_BACKLOG_SEC = 0.25;     // максимум боргу емісії (в секундах)
  private readonly MAX_SPAWN_PER_EMITTER = 64; // скільки частинок від одного еміттера за кадр
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
  // emitPropTex:  spreadR(=x), spreadY(=y), sizeMul(=z), alphaMul(=w)
  // emitExtraTex: riseHeight(=x), spreadGrow(=y), alphaDiminish(=z), pad(=w)
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

  // --- Dirty flags для емітерних текстур ---
  private emitPosDirty = false;
  private emitColDirty = false;
  private emitPropDirty = false;
  private emitExtraDirty = false;

  // --- OPT#2: Spawn map у RGBA8 + "touched list" ---
  // Формат: (R=emitterIndex 0..255, G=seed1 0..255, B=seed2 0..255, A=flag 0/255)
  private spawnMapData8: Uint8Array;
  private spawnMapTex: THREE.DataTexture;
  private touched: number[] = []; // індекси пікселів, які ми ставили в попередньому кадрі

  private emitAcc: Float32Array;
  private spawnHead = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    super(scene, renderer);

    this.group = new THREE.Group();
    this.group.name = 'SmokeGroup_MWE_EmitRateSpreadCone';
    this.scene.add(this.group);

    // --- Емітерні текстури ---
    this.emitPosData = new Float32Array(this.MAX_EMITTERS * 4);
    this.emitPosTex = new THREE.DataTexture(
      this.emitPosData, this.MAX_EMITTERS, 1, THREE.RGBAFormat, THREE.FloatType
    );
    this.emitPosTex.needsUpdate = true; // перший аплоад
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

    // --- OPT#2: Spawn map RGBA8 ---
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
    this.gpu = new GPUComputationRenderer(this.PARTICLES_W, this.PARTICLES_H, this.renderer);

    const pos0 = this.gpu.createTexture();
    this.fillInitialPositions(pos0.image.data as Float32Array);

    this.posVar = this.gpu.addVariable('texturePosition', this.shaderPosWithEmittersAndSpawnMap(), pos0);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar]);

    Object.assign(this.posVar.material.uniforms, {
      uTime:        { value: 0 },
      uDelta:       { value: 0 },
      uSpeed:       { value: 0.3 },  // м/с вгору
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
      p[i+3] = -1.0; // мертва частинка
    }
  }

  private shaderPosWithEmittersAndSpawnMap(): string {
    return `
      precision highp float;

      // uniform sampler2D texturePosition;
      // uniform vec2      resolution;

      uniform float uTime;
      uniform float uDelta;
      uniform float uSpeed;

      uniform sampler2D uEmitPosTex;    // (x,y,z, active)
      uniform sampler2D uEmitPropTex;   // (spreadR, spreadY, sizeMul, alphaMul)
      uniform sampler2D uEmitExtraTex;  // (riseHeight, spreadGrow, alphaDiminish, _)

      // OPT#2: RGBA8 normalized spawn map:
      // R: emitterIndex/255, G: seed1, B: seed2, A: flag
      uniform sampler2D uSpawnMapTex;

      float rand(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
      float rand2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

      void main(){
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);

        vec4 cmd = texture2D(uSpawnMapTex, uv);
        float doSpawn = step(0.5, cmd.a); // A ~ 0 або 1
        float emitterIndex = pos.w;

        if (doSpawn > 0.5) {
          // --- decode RGBA8 ---
          float idxU8 = floor(cmd.r * 255.0 + 0.5);
          float s1U8  = floor(cmd.g * 255.0 + 0.5);
          float s2U8  = floor(cmd.b * 255.0 + 0.5);
          float idx   = idxU8;
          // «деквантизуємо» сіди у (0,1) центруючи бін
          float seed1 = (s1U8 + 0.5) / 256.0;
          float seed2 = (s2U8 + 0.5) / 256.0;

          float u   = (idx + 0.5) / ${this.MAX_EMITTERS}.0;

          vec4 eposA  = texture2D(uEmitPosTex,  vec2(u, 0.5));
          vec4 epropA = texture2D(uEmitPropTex, vec2(u, 0.5));

          vec3 epos     = eposA.xyz;
          float spreadR  = epropA.x;
          float spreadY  = epropA.y;

          // рівномірний диск (sqrt) і мінімальний r, аби уникнути toC≈0
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
            vec4 eextraA = texture2D(uEmitExtraTex, vec2(u, 0.5));

            vec3 epos      = eposA.xyz;
            float activeA   = eposA.w;
            float riseH     = max(0.0, eextraA.x); // per-emitter rise height
            float grow      = eextraA.y;           // spreadGrow

            // Підіймаємо
            pos.y += uSpeed * uDelta;

            // Нормалізована висота [0..1] над еміттером
            float h  = (riseH > 1e-3) ? clamp((pos.y - epos.y) / riseH, 0.0, 1.0) : 1.0;
            float hs = h*h*(3.0-2.0*h); // плавна S-крива

            // Радіальний напрямок у XZ від осі стовпа
            vec2 toC = pos.xz - epos.xz;
            float rl = length(toC);
            vec2 dir = (rl > 1e-4)
              ? toC / rl
              : normalize(vec2(
                  rand2(uv) - 0.5,
                  rand2(uv.yx) - 0.5
                ) + 1e-6);

            // Конус: з висотою штовхаємо назовні
            pos.xz += dir * (grow) * uDelta;

            // «Смерть» або вимкнений еміттер
            float topY = epos.y + riseH;
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
      blending: THREE.NormalBlending,
      vertexShader: this.renderVSColored(),
      fragmentShader: this.renderFSRadialGradient(),
      uniforms: {
        uPosTex:       { value: this.texPos },
        uEmitColTex:   { value: this.emitColTex },   // rgb + emitRate(a)
        uEmitPropTex:  { value: this.emitPropTex },  // sizeMul(z), alphaMul(w)
        uEmitPosTex:   { value: this.emitPosTex },   // для heightFrac
        uEmitExtraTex: { value: this.emitExtraTex }, // для riseHeight & alphaDiminish
        uPixelRatio:   { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uPointSize:    { value: 10.0 },
      },
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    (this.points as any).__emitterIndexMap = new Map<string, number>();
  }

  private renderVSColored(): string {
    return `
      precision highp float;

      uniform sampler2D uPosTex;
      uniform sampler2D uEmitColTex;   // rgb + emitRate(a)
      uniform sampler2D uEmitPropTex;  // spreadR, spreadY, sizeMul, alphaMul
      uniform sampler2D uEmitPosTex;   // xyz + active
      uniform sampler2D uEmitExtraTex; // riseHeight, spreadGrow, alphaDiminish, _
      uniform float uPixelRatio;
      uniform float uPointSize;

      varying vec3  vColor;
      varying float vAlphaMul;
      varying float vAlphaHeight; // згасання з висотою

      void main(){
        vec4 pos4 = texture2D(uPosTex, uv);
        float emitterIndex = pos4.w;

        // мертві частинки — винесемо за фрустум
        if (emitterIndex < 0.0) {
          gl_Position = vec4(2.0,2.0,2.0,1.0);
          gl_PointSize = 0.0;
          vColor = vec3(0.0);
          vAlphaMul = 0.0;
          vAlphaHeight = 0.0;
          return;
        }

        float ue = (emitterIndex + 0.5) / ${this.MAX_EMITTERS}.0;

        // колір
        vColor = texture2D(uEmitColTex, vec2(ue, 0.5)).rgb;

        // пропси
        vec4 prop = texture2D(uEmitPropTex, vec2(ue, 0.5));
        float sizeMul = prop.z;
        vAlphaMul = prop.w;

        // позиція та параметри для альфи за висотою
        vec4 eposA   = texture2D(uEmitPosTex,   vec2(ue, 0.5));
        vec4 eextraA = texture2D(uEmitExtraTex, vec2(ue, 0.5));
        float eposY        = eposA.y;
        float riseHeight   = max(1e-5, eextraA.x);
        float alphaDim     = eextraA.z; // alphaDiminish

        float heightFrac = clamp( (pos4.y - eposY) / riseHeight, 0.0, 1.0 );
        // vAlphaHeight = 1 - alphaDiminish * heightFrac
        vAlphaHeight = pow(max(0.0, 1.0 - alphaDim * heightFrac),3.0);

        // розмір
        float px = max(1.0, uPointSize * sizeMul);

        vec3 pos = pos4.xyz;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = px * uPixelRatio * (24.0 / max(1e-3, -mv.z)) * (1.0 + alphaDim*heightFrac*1.4);
        gl_PointSize = min(gl_PointSize, 1024.0);
        gl_Position  = projectionMatrix * mv;
      }
    `;
  }

  private renderFSRadialGradient(): string {
    return `
      precision mediump float;
      varying vec3  vColor;
      varying float vAlphaMul;
      varying float vAlphaHeight;

      void main(){
        // r: 0 в центрі → 1 на краю кола (радіус 0.5)
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) / 0.5;

        if (r > 1.0) discard;

        // Радіальний градієнт: яскравий центр → темніший край
        float soft = pow(1.0 - clamp(r, 0.0, 1.0), 1.4);

        // Загальний альфа: текстурний софт * пер-еміттерний множник * згасання з висотою
        float alpha = soft * clamp(vAlphaMul, 0.0, 1.0) * clamp(vAlphaHeight, 0.0, 1.0);

        vec3 inner = vColor * 1.05;
        vec3 outer = vColor * 0.25;
        vec3 col   = mix(outer, inner, 1.0 - clamp(r, 0.0, 1.0));

        gl_FragColor = vec4(col, alpha);
      }
    `;
  }

  // ---------- Tick ----------
  updateAllSmoke() {
    const rawDt = this.clock.getDelta();
  
    // 1) клемимо дельти
    const bigGap  = rawDt > this.BIG_GAP_SEC;
    const dtSim   = Math.min(rawDt, this.MAX_DT_SIM);
    const dtSpawn = bigGap ? 0.0 : Math.min(rawDt, this.MAX_DT_SPAWN);
  
    // 2) час/дельта для шейдера (фізика диму стає стабільною)
    const now = (this.posVar.material.uniforms.uTime.value as number) + dtSim;
    this.posVar.material.uniforms.uTime.value  = now;
    this.posVar.material.uniforms.uDelta.value = dtSim;
  
    // 3) очищаємо лише «торкані» пікселі spawnMap з минулого кадру
    const hadTouched = this.touched.length > 0;
    for (let i = 0; i < this.touched.length; i++) {
      const off = this.touched[i] * 4;
      this.spawnMapData8[off + 0] = 0;
      this.spawnMapData8[off + 1] = 0;
      this.spawnMapData8[off + 2] = 0;
      this.spawnMapData8[off + 3] = 0;
    }
    this.touched.length = 0;
  
    // 4) генеруємо спавн з обмеженням боргу та бюджету
    let anySpawn = false;
    let frameBudget = this.MAX_SPAWN_PER_FRAME;
  
    for (let i = 0; i < this.emitterCount && frameBudget > 0; i++) {
      if (!this.emitterActive[i]) continue;
  
      const rate = this.emitColData[i*4 + 3]; // emitRate (particles/sec)
      if (rate <= 0) continue;
  
      // ліміт боргу: не більше MAX_BACKLOG_SEC секунд емісії
      const backlogCap = rate * this.MAX_BACKLOG_SEC;
  
      // накопичуємо «зісклеєну» дельту для емісії
      this.emitAcc[i] = Math.min(this.emitAcc[i] + rate * dtSpawn, backlogCap);
  
      // скільки реально спавнимо з цього еміттера в цьому кадрі
      let n = (this.emitAcc[i] | 0);
      if (n <= 0) continue;
  
      n = Math.min(n, this.MAX_SPAWN_PER_EMITTER, frameBudget);
      this.emitAcc[i] -= n;
      frameBudget -= n;
  
      while (n-- > 0) {
        const idx = this.spawnHead;
        this.spawnHead = (this.spawnHead + 1) % this.MAX_PARTICLES;
  
        const off = idx * 4;
        this.spawnMapData8[off + 0] = (i & 0xFF);                 // emitterIndex (0..63)
        this.spawnMapData8[off + 1] = (Math.random() * 255) | 0;  // seed1
        this.spawnMapData8[off + 2] = (Math.random() * 255) | 0;  // seed2
        this.spawnMapData8[off + 3] = 255;                        // flag
  
        this.touched.push(idx);
        anySpawn = true;
      }
    }
  
    // 5) разовий аплоад емітерних текстур (лише якщо були зміни за кадр)
    if (this.emitPosDirty)   { this.emitPosTex.needsUpdate   = true; this.emitPosDirty   = false; }
    if (this.emitColDirty)   { this.emitColTex.needsUpdate   = true; this.emitColDirty   = false; }
    if (this.emitPropDirty)  { this.emitPropTex.needsUpdate  = true; this.emitPropDirty  = false; }
    if (this.emitExtraDirty) { this.emitExtraTex.needsUpdate = true; this.emitExtraDirty = false; }
  
    // 6) оновлюємо spawn map в GPU тільки якщо щось міняли/чистили
    if (anySpawn || hadTouched) {
      this.spawnMapTex.needsUpdate = true;
    }
  
    // 7) compute pass
    this.gpu.compute();
  
    // 8) позиції для рендера
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
    alphaMul?: number,
    alphaDiminish?: number,   // NEW
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

    const c  = new THREE.Color(color ?? 0xcccccc);
    const r  = (emitRate ?? 20);
    const sr = (spreadR ?? 0.15);
    const sy = (spreadY ?? 0.03);
    const sm = (sizeMul ?? 1.0);
    const sg = (spreadGrow ?? 0.25);
    const rh = (riseHeight ?? 2.0);
    const am = (alphaMul ?? 1.0);
    const ad = (alphaDiminish ?? 0.0); // 0 => без згасання з висотою

    // pos + active
    const o1 = i * 4;
    this.emitPosData[o1+0] = position.x;
    this.emitPosData[o1+1] = position.y;
    this.emitPosData[o1+2] = position.z;
    this.emitPosData[o1+3] = 1.0; // active
    this.emitPosDirty = true;

    // color + emitRate
    const o2 = i * 4;
    this.emitColData[o2+0] = c.r;
    this.emitColData[o2+1] = c.g;
    this.emitColData[o2+2] = c.b;
    this.emitColData[o2+3] = r;
    this.emitColDirty = true;

    // props: spreadR, spreadY, sizeMul, alphaMul
    const o3 = i * 4;
    this.emitPropData[o3+0] = sr;
    this.emitPropData[o3+1] = sy;
    this.emitPropData[o3+2] = sm;
    this.emitPropData[o3+3] = am;
    this.emitPropDirty = true;

    // extra: riseHeight, spreadGrow, alphaDiminish
    const o4 = i * 4;
    this.emitExtraData[o4+0] = rh;
    this.emitExtraData[o4+1] = sg;
    this.emitExtraData[o4+2] = ad;
    this.emitExtraData[o4+3] = 0.0;
    this.emitExtraDirty = true;

    this.emitterActive[i] = true;
    this.emitAcc[i] = 0;

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
    alphaMul?: number,
    alphaDiminish?: number,  // NEW
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

    if (spreadR !== undefined || spreadY !== undefined || sizeMul !== undefined || alphaMul !== undefined) {
      const o3 = index * 4;
      if (spreadR  !== undefined) this.emitPropData[o3+0] = spreadR;
      if (spreadY  !== undefined) this.emitPropData[o3+1] = spreadY;
      if (sizeMul  !== undefined) this.emitPropData[o3+2] = sizeMul;
      if (alphaMul !== undefined) this.emitPropData[o3+3] = alphaMul;
      this.emitPropDirty = true;
    }

    if (spreadGrow !== undefined || riseHeight !== undefined || alphaDiminish !== undefined) {
      const o4 = index * 4;
      if (riseHeight     !== undefined) this.emitExtraData[o4+0] = riseHeight;
      if (spreadGrow     !== undefined) this.emitExtraData[o4+1] = spreadGrow;
      if (alphaDiminish  !== undefined) this.emitExtraData[o4+2] = alphaDiminish;
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
    const alpha = (object.data?.alphaMul ?? object.data?.opacity ?? 1.0);
    const idx = this.addEmitter(
      object.coordinates,
      object.data?.color,
      object.data?.emitRate,
      object.data?.spreadRadius,                 // spreadR
      object.data?.spreadY ?? 0.03,              // вертикальний джиттер
      (object.data?.baseSize ?? 10.0) / 10.0,    // sizeMul від uPointSize=10
      object.data?.spreadGrow ?? 0.25,           // розгін по XZ з висотою
      (object.data?.riseHeight ?? object.data?.rise ?? 2.0), // висота підйому
      alpha,
      object.data?.alphaDiminish ?? object.data?.alphaFade ?? 0.0 // NEW
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
      const alpha = (object.data?.alphaMul ?? object.data?.opacity);
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
        alpha,
        (object.data?.alphaDiminish ?? object.data?.alphaFade)
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
  setSpeed(speed: number)          { (this.posVar.material.uniforms.uSpeed as any).value = speed; }
  setBasePointSize(px: number)     { (this.material.uniforms.uPointSize    as any).value = px; }
  setRiseForAll(height: number) {
    for (let i = 0; i < this.emitterCount; i++) {
      if (!this.emitterActive[i]) continue;
      this.emitExtraData[i*4 + 0] = height;
      this.emitExtraDirty = true;
    }
  }
}
