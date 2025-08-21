import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

type Vec3 = { x:number; y:number; z:number };

export interface ElectricArcData {
  target: Vec3;

  // ручки
  kinks?: number;           // к-сть внутрішніх зламів
  amplitude?: number;       // макс. поперечне відхилення (world units), базова «рваність»
  thicknessPx?: number;     // товщина ядра у px
  color?: number;           // колір
  opacity?: number;         // 0..1
  glowIntensity?: number;   // яскравість glow
  glowPx?: number;          // РОЗМІР glow у px (радіус від краю ядра)
  seed?: number;            // для відтворюваності

  // нове: параметри «гойдання» навколо базового зигзагу
  wobbleAmp?: number;       // МУЛЬТИПЛІКАТОР амплітуди коливань (у world units) відносно amplitude (деф. 0.35)
  wobbleFreq?: number;      // базова частота (Гц) для коливань (деф. 6)
}

const _tmpV2 = new THREE.Vector2();
const TAU = Math.PI * 2;

function rngMulberry(seed: number) {
  let t = (seed | 0) >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export class ElectricArcRenderer extends BaseRenderer {
  private group: THREE.Group;

  private static sharedMat: THREE.ShaderMaterial | null = null;

  constructor(scene: THREE.Scene) {
    super(scene);
    this.group = new THREE.Group();
    this.group.name = 'ElectricArcShaderGroup';
    this.scene.add(this.group);
  }

  // ---------- MATERIAL ----------
  private getOrCreateMaterial(): THREE.ShaderMaterial {
    if (ElectricArcRenderer.sharedMat) return ElectricArcRenderer.sharedMat;

    const vertexShader = `
precision mediump float;

uniform float uThicknessPx;   // ядро (px)
uniform float uGlowPx;        // радіус glow у пікселях (від краю ядра)
uniform float uSizeAtten;     // px-to-view scale

attribute vec3  aPrev;
attribute vec3  aCenter;
attribute vec3  aNext;
attribute float aSide;        // -1 / +1

varying float vSide;
varying float vCoreHalfPx;    // половина товщини ядра (px)
varying float vMaxHalfPx;     // половина (ядро + glow) (px)
varying float vMiterLen;

void main() {
  // у view-space рахуємо екструзію
  vec3 P0 = (modelViewMatrix * vec4(aPrev,   1.0)).xyz;
  vec3 P1 = (modelViewMatrix * vec4(aCenter, 1.0)).xyz;
  vec3 P2 = (modelViewMatrix * vec4(aNext,   1.0)).xyz;

  vec2 d1 = normalize((P1 - P0).xy);
  vec2 d2 = normalize((P2 - P1).xy);
  vec2 n1 = vec2(-d1.y, d1.x);
  vec2 n2 = vec2(-d2.y, d2.x);

  vec2 miter = normalize(n1 + n2);
  float denom = max(dot(miter, n1), 1e-3);
  float miterLen = min(1.0 / denom, 4.0); // miter limit

  // половини у px
  float coreHalfPx = 0.5 * uThicknessPx;
  float maxHalfPx  = coreHalfPx + uGlowPx; // екструдуємо до краю glow

  // переведення px у view-space з урахуванням глибини
  float halfWidthVS = maxHalfPx * (uSizeAtten / max(1e-3, -P1.z));

  vec3 Pv = P1;
  Pv.xy += miter * aSide * halfWidthVS * miterLen;

  gl_Position = projectionMatrix * vec4(Pv, 1.0);

  vSide       = aSide;        // інтерполюватиметься через трикутник
  vCoreHalfPx = coreHalfPx;
  vMaxHalfPx  = maxHalfPx;
  vMiterLen   = miterLen;
}
    `;

    const fragmentShader = `
precision mediump float;

uniform vec3  uColor;
uniform float uOpacity;
uniform float uGlowIntensity; // яскравість glow (не розмір)

varying float vSide;
varying float vCoreHalfPx;
varying float vMaxHalfPx;
varying float vMiterLen;

void main(){
  // дистанція від осі у пікселях (0 у центрі, до vMaxHalfPx на краї):
  float distPx = abs(vSide) * vMaxHalfPx * vMiterLen;

  // ядро: до половини товщини
  float coreAlpha = 1.0 - smoothstep(0.0, vCoreHalfPx, distPx);

  // glow: від краю ядра до краю екструдованої гео
  float glowAlpha = 1.0 - smoothstep(vCoreHalfPx, vMaxHalfPx, distPx);

  // підсилення колору ядра, щоб воно не “тонула” в glow
  float rgbGain = 1.5 * coreAlpha + 0.7 * glowAlpha * uGlowIntensity;
  float alpha   = max(coreAlpha, glowAlpha * uGlowIntensity) * uOpacity;

  if (alpha < 0.002) discard;
  gl_FragColor = vec4(uColor * rgbGain, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
    `;

    ElectricArcRenderer.sharedMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader,
      uniforms: {
        uThicknessPx:   { value: 2.0 },
        uOpacity:       { value: 1.0 },
        uColor:         { value: new THREE.Color(0x9fd3ff) },
        uSizeAtten:     { value: 1.0 },
        uGlowIntensity: { value: 0.5 },
        uGlowPx:        { value: 40.0 }, // розмір glow у px
      }
    });
    (ElectricArcRenderer.sharedMat as any).toneMapped = true;
    return ElectricArcRenderer.sharedMat!;
  }

  // ---------- CENTERLINE: базовий (без часу) ----------
  private buildBaseCenterline(
    start: THREE.Vector3,
    end: THREE.Vector3,
    kinks: number,
    amplitude: number,
    seed: number,
    right: THREE.Vector3,
    up: THREE.Vector3
  ): { points: THREE.Vector3[], baseOffsetRU: number[] } {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-6) return { points: [start.clone(), end.clone()], baseOffsetRU: [] };
    dir.normalize();

    const rnd = rngMulberry((seed ?? 1) | 0);
    const pts: THREE.Vector3[] = [];
    const baseRU: number[] = []; // зберігаємо (rx, ry) для кожної внутр. точки

    pts.push(start.clone());

    for (let i = 1; i <= kinks; i++) {
      const t = i / (kinks + 1);
      const base = new THREE.Vector3().copy(start).addScaledVector(dir, t * len);

      const w   = Math.pow(Math.sin(Math.PI * t), 0.9);      // згасання до країв
      const ang = rnd() * TAU;
      const r   = (rnd() * 2.0 - 1.0) * amplitude * w;       // поперечний зсув

      const rx = Math.cos(ang) * r;
      const ry = Math.sin(ang) * r;

      base.addScaledVector(right, rx);
      base.addScaledVector(up,    ry);

      baseRU.push(rx, ry);
      pts.push(base);
    }

    pts.push(end.clone());
    return { points: pts, baseOffsetRU: baseRU };
  }

  // ---------- створення геометрії ----------
  private makePolylineMesh(points: THREE.Vector3[]): THREE.Mesh {
    const N = points.length;
    const verts = N * 2;
    const tris  = (N - 1) * 2;
    const idxCnt = tris * 3;

    const aPrev   = new Float32Array(verts * 3);
    const aCenter = new Float32Array(verts * 3);
    const aNext   = new Float32Array(verts * 3);
    const aSide   = new Float32Array(verts);
    const aT      = new Float32Array(verts);

    let v = 0;
    for (let i = 0; i < N; i++) {
      const iPrev = Math.max(i - 1, 0);
      const iNext = Math.min(i + 1, N - 1);

      const P0 = points[iPrev];
      const P1 = points[i];
      const P2 = points[iNext];

      const t = i / (N - 1);

      // side -1
      aPrev[v*3+0]=P0.x; aPrev[v*3+1]=P0.y; aPrev[v*3+2]=P0.z;
      aCenter[v*3+0]=P1.x; aCenter[v*3+1]=P1.y; aCenter[v*3+2]=P1.z;
      aNext[v*3+0]=P2.x; aNext[v*3+1]=P2.y; aNext[v*3+2]=P2.z;
      aSide[v] = -1; aT[v] = t; v++;

      // side +1
      aPrev[v*3+0]=P0.x; aPrev[v*3+1]=P0.y; aPrev[v*3+2]=P0.z;
      aCenter[v*3+0]=P1.x; aCenter[v*3+1]=P1.y; aCenter[v*3+2]=P1.z;
      aNext[v*3+0]=P2.x; aNext[v*3+1]=P2.y; aNext[v*3+2]=P2.z;
      aSide[v] = +1; aT[v] = t; v++;
    }

    const IndexArray: any = (verts > 65535) ? Uint32Array : Uint16Array;
    const indices = new IndexArray(idxCnt);
    let f = 0;
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      indices[f++] = a;     indices[f++] = a + 1; indices[f++] = a + 2;
      indices[f++] = a + 1; indices[f++] = a + 3; indices[f++] = a + 2;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('aPrev',   new THREE.BufferAttribute(aPrev,   3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aNext',   new THREE.BufferAttribute(aNext,   3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide',   new THREE.BufferAttribute(aSide,   1));
    g.setAttribute('aT',      new THREE.BufferAttribute(aT,      1));
    g.setIndex(new THREE.BufferAttribute(indices, 1));

    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = this.getOrCreateMaterial();
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 20;
    return mesh;
  }

  // ---------- PUBLIC API ----------
  render(object: SceneObject): THREE.Object3D {
    const d = (object.data || {}) as ElectricArcData;
    if (!d.target) return new THREE.Object3D();

    const startW = new THREE.Vector3(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    const endW   = new THREE.Vector3(d.target.x, d.target.y, d.target.z);

    const kinks        = d.kinks ?? 8;
    const amplitude    = d.amplitude ?? 0.3;
    const thicknessPx  = d.thicknessPx ?? 2.0;
    const color        = new THREE.Color(d.color ?? 0x9fd3ff);
    const opacity      = d.opacity ?? 1.0;
    const glowIntensity= d.glowIntensity ?? 0.6;
    const glowPx       = d.glowPx ?? 40.0;
    const seed         = d.seed ?? 12345;

    const wobbleAmpMul = d.wobbleAmp ?? 0.35;   // доля від amplitude
    const wobbleFreqHz = d.wobbleFreq ?? 6.0;   // базова частота, Гц

    // локальна база: будую систему (right, up)
    const delta = new THREE.Vector3().subVectors(endW, startW);
    const len = delta.length();
    const dir = delta.clone().normalize();
    const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
    const right = new THREE.Vector3().crossVectors(dir, tmp).normalize();
    const up    = new THREE.Vector3().crossVectors(right, dir).normalize();

    // базовий «заморожений» зигзаг
    const base = this.buildBaseCenterline(new THREE.Vector3(0,0,0), delta, kinks, amplitude, seed, right, up);
    const mesh = this.makePolylineMesh(base.points);

    // профіль джиттера для кожного зламу (незалежні фаза/частота/напрямок/масштаб)
    const rnd = rngMulberry((seed ^ 0xB01DF00D) >>> 0);
    const phases: number[] = [];
    const freqs: number[]  = [];
    const dirs: number[]   = []; // (x,y) у базисі right/up
    const amps: number[]   = []; // множник амплітуди по точці

    for (let i = 0; i < kinks; i++) {
      phases[i] = rnd() * TAU;
      // 60%..140% від базової частоти — щоб не синхронно
      freqs[i]  = (0.6 + 0.8 * rnd()) * wobbleFreqHz * TAU; // одразу ω (рад/с)
      const ang = rnd() * TAU;
      dirs.push(Math.cos(ang), Math.sin(ang));
      // 50%..100% локальної амплітуди
      amps[i] = 0.5 + 0.5 * rnd();
    }

    // Розташувати меш у світі в startW
    mesh.position.copy(startW);

    (mesh as any).userData.arc = {
      startW, endW, kinks, amplitude, thicknessPx, color, opacity,
      glowIntensity, glowPx, seed,
      // статичні дані для оновлення щокадрово
      baseOffsetRU: base.baseOffsetRU, // (rx, ry) для кожного зламу
      phases, freqs, dirs, amps, right, up, len
    };

    // ---- onBeforeRender: анімуємо центрлайн і оновлюємо атрибути ----
    (mesh as any).onBeforeRender = (
      renderer: THREE.WebGLRenderer,
      _scene: THREE.Scene,
      camera: THREE.Camera,
      _geo: THREE.BufferGeometry,
      mat: THREE.ShaderMaterial
    ) => {
      const A = (mesh as any).userData.arc;

      // px attenuation
      renderer.getDrawingBufferSize(_tmpV2);
      let atten = 1.0;
      if ((camera as any).isPerspectiveCamera) {
        const cam = camera as THREE.PerspectiveCamera;
        const invTan = 1.0 / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
        atten = 0.5 * _tmpV2.y * invTan;
      } else if ((camera as any).isOrthographicCamera) {
        const cam = camera as THREE.OrthographicCamera;
        atten = renderer.getPixelRatio() * cam.zoom;
      }

      // uniforms (glow не впливає на геометрію/гойдання)
      mat.uniforms.uSizeAtten.value     = atten;
      mat.uniforms.uThicknessPx.value   = A.thicknessPx;
      mat.uniforms.uOpacity.value       = A.opacity;
      (mat.uniforms.uColor.value as THREE.Color).copy(A.color);
      mat.uniforms.uGlowIntensity.value = A.glowIntensity;
      mat.uniforms.uGlowPx.value        = A.glowPx;

      // === динамічний центрлайн ===
      const dir = new THREE.Vector3().subVectors(A.endW, A.startW).normalize();
      const right = A.right as THREE.Vector3;
      const up    = A.up as THREE.Vector3;
      const len   = A.len as number;

      const g = mesh.geometry as THREE.BufferGeometry;
      const aPrev   = g.getAttribute('aPrev')   as THREE.BufferAttribute;
      const aCenter = g.getAttribute('aCenter') as THREE.BufferAttribute;
      const aNext   = g.getAttribute('aNext')   as THREE.BufferAttribute;
      const aT      = g.getAttribute('aT')      as THREE.BufferAttribute;

      const N = A.kinks + 2;
      const now = performance.now() * 0.001; // сек

      // заповнюємо масив точок по місцю
      const pts: THREE.Vector3[] = new Array(N);
      pts[0] = new THREE.Vector3(0,0,0);
      for (let i = 1; i <= A.kinks; i++) {
        const t = i / (A.kinks + 1);
        const base = new THREE.Vector3().addScaledVector(dir, t * len);

        // базовий seed-зсув (той самий, що під час створення)
        const rx = A.baseOffsetRU[(i-1)*2 + 0];
        const ry = A.baseOffsetRU[(i-1)*2 + 1];
        base.addScaledVector(right, rx);
        base.addScaledVector(up,    ry);

        // незалежна «тряска»
        const w      = Math.pow(Math.sin(Math.PI * t), 0.9);
        const omega  = A.freqs[i-1] as number;
        const phase  = A.phases[i-1] as number;
        const dirx   = A.dirs[(i-1)*2 + 0] as number;
        const diry   = A.dirs[(i-1)*2 + 1] as number;
        const ampMul = A.amps[i-1] as number;

        const jitterMag = (A.amplitude * (object.data?.wobbleAmp ?? 0.35)) * ampMul * w;
        const s = Math.sin(omega * now + phase) * jitterMag;

        base.addScaledVector(right, dirx * s);
        base.addScaledVector(up,    diry * s);

        pts[i] = base;
      }
      pts[N-1] = new THREE.Vector3().addScaledVector(dir, len);

      // оновити атрибути (без зміни кількості вершин)
      let v = 0;
      for (let i = 0; i < N; i++) {
        const iPrev = Math.max(i - 1, 0);
        const iNext = Math.min(i + 1, N - 1);

        const P0 = pts[iPrev];
        const P1 = pts[i];
        const P2 = pts[iNext];

        const t = i / (N - 1);

        // side -1
        aPrev.setXYZ(v, P0.x, P0.y, P0.z);
        aCenter.setXYZ(v, P1.x, P1.y, P1.z);
        aNext.setXYZ(v, P2.x, P2.y, P2.z);
        aT.setX(v, t); v++;

        // side +1
        aPrev.setXYZ(v, P0.x, P0.y, P0.z);
        aCenter.setXYZ(v, P1.x, P1.y, P1.z);
        aNext.setXYZ(v, P2.x, P2.y, P2.z);
        aT.setX(v, t); v++;
      }
      aPrev.needsUpdate = aCenter.needsUpdate = aNext.needsUpdate = aT.needsUpdate = true;

      // ---- Bounds з урахуванням glow (у world units) ----
      const centerLocal = new THREE.Vector3().addScaledVector(dir, len * 0.5);
      const centerWorld = centerLocal.clone().add(A.startW);
      const inv = (camera as any).matrixWorldInverse
        ? (camera as any).matrixWorldInverse as THREE.Matrix4
        : new THREE.Matrix4().copy((camera as THREE.Camera).matrixWorld).invert();
      const midZ = -centerWorld.clone().applyMatrix4(inv).z;
      const halfCoreWorld = 0.5 * A.thicknessPx * (atten / Math.max(1e-3, midZ));
      const halfGlowWorld = A.glowPx          * (atten / Math.max(1e-3, midZ));
      const padWorld = (halfCoreWorld + halfGlowWorld);
      const radius = 0.5 * len + A.amplitude * 1.25 + padWorld * 1.5;
      g.boundingSphere = new THREE.Sphere(centerLocal, radius);
    };

    this.group.add(mesh);
    this.addMesh(object.id, mesh);
    return mesh;
  }

  update(object: SceneObject): void {
    const mesh = this.getMeshById(object.id) as THREE.Mesh | undefined;
    if (!mesh) return;
    const A = (mesh as any).userData.arc;
    if (!A) return;

    // оновлюємо параметри (анімація йде у onBeforeRender)
    A.startW.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    if (object.data?.target) {
      const t = object.data.target as Vec3;
      A.endW.set(t.x, t.y, t.z);
    }
    if (object.data?.kinks        !== undefined && object.data.kinks !== A.kinks) {
      A.kinks = object.data.kinks;
      // перезібрати профіль джиттера під нову кількість зламів
      const rnd = rngMulberry((A.seed ^ 0xB01DF00D) >>> 0);
      A.phases = []; A.freqs = []; A.dirs = []; A.amps = [];
      for (let i = 0; i < A.kinks; i++) {
        A.phases[i] = rnd() * TAU;
        A.freqs[i]  = (0.6 + 0.8 * rnd()) * (object.data?.wobbleFreq ?? 6.0) * TAU;
        const ang = rnd() * TAU;
        A.dirs.push(Math.cos(ang), Math.sin(ang));
        A.amps[i] = 0.5 + 0.5 * rnd();
      }
      // базовий офсет теж потрібно перерахувати
      const delta = new THREE.Vector3().subVectors(A.endW, A.startW);
      const dir = delta.clone().normalize();
      const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
      A.right = new THREE.Vector3().crossVectors(dir, tmp).normalize();
      A.up    = new THREE.Vector3().crossVectors(A.right, dir).normalize();
      const base = this.buildBaseCenterline(new THREE.Vector3(0,0,0), delta, A.kinks, A.amplitude, A.seed, A.right, A.up);
      A.baseOffsetRU = base.baseOffsetRU;
      A.len = delta.length();

      // перевибудувати геометрію під нову кількість точок
      const newMesh = this.makePolylineMesh(base.points);
      newMesh.renderOrder = (mesh as any).renderOrder;
      newMesh.position.copy(A.startW);
      (newMesh as any).userData = (mesh as any).userData;
      (newMesh as any).onBeforeRender = (mesh as any).onBeforeRender;

      this.group.add(newMesh);
      this.group.remove(mesh);
      this.replaceMesh(object.id, newMesh);
      return;
    }

    if (object.data?.amplitude    !== undefined) A.amplitude    = object.data.amplitude;
    if (object.data?.thicknessPx  !== undefined) A.thicknessPx  = object.data.thicknessPx;
    if (object.data?.color        !== undefined) A.color.set(object.data.color);
    if (object.data?.opacity      !== undefined) A.opacity      = object.data.opacity;
    if (object.data?.glowIntensity!== undefined) A.glowIntensity= object.data.glowIntensity;
    if (object.data?.glowPx       !== undefined) A.glowPx       = object.data.glowPx;
    if (object.data?.seed         !== undefined) A.seed         = object.data.seed;
    if (object.data?.wobbleFreq   !== undefined) {
      for (let i = 0; i < A.kinks; i++) {
        A.freqs[i] = (0.6 + 0.8 * Math.random()) * object.data.wobbleFreq * TAU;
      }
    }

    // пересунути меш у світ на новий старт (геометрію оновить onBeforeRender)
    (mesh as THREE.Mesh).position.copy(A.startW);
  }

  remove(id: string): void {
    const mesh = this.getMeshById(id) as THREE.Mesh | undefined;
    if (mesh) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      // material спільний — не dispose
    }
    super.remove(id);
  }
}
