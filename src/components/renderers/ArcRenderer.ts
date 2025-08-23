import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

type Vec3 = { x:number; y:number; z:number };

export interface ElectricArcData {
  target: Vec3;

  // ручки
  kinks?: number;           // к-сть внутрішніх зламів
  amplitude?: number;       // макс. поперечне відхилення (world units)
  thicknessPx?: number;     // товщина ядра у px
  color?: number;           // базовий колір
  opacity?: number;         // 0..1
  glowIntensity?: number;   // яскравість glow
  glowPx?: number;          // РОЗМІР glow у px (радіус від краю ядра)
  seed?: number;            // для відтворюваності

  // гойдання
  wobbleAmp?: number;       // мультиплікатор амплітуди коливань (відносно amplitude), деф. 0.35
  wobbleFreq?: number;      // базова частота, Гц (деф. 6)

  // зсув відтінку (у градусах, -360..360)
  hueShift?: number;
}

const _tmpV2 = new THREE.Vector2();
const _tmpColor = new THREE.Color();
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

  float coreHalfPx = 0.5 * uThicknessPx;
  float maxHalfPx  = coreHalfPx + uGlowPx;

  float halfWidthVS = maxHalfPx * (uSizeAtten / max(1e-3, -P1.z));

  vec3 Pv = P1;
  Pv.xy += miter * aSide * halfWidthVS * miterLen;

  gl_Position = projectionMatrix * vec4(Pv, 1.0);

  vSide       = aSide;
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
  float distPx = abs(vSide) * vMaxHalfPx * vMiterLen;

  float coreAlpha = 1.0 - smoothstep(0.0, vCoreHalfPx, distPx);
  float glowAlpha = 1.0 - smoothstep(vCoreHalfPx, vMaxHalfPx, distPx);

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
        uGlowPx:        { value: 40.0 },
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
    const baseRU: number[] = []; // (rx, ry) для кожної внутр. точки

    pts.push(start.clone());

    for (let i = 1; i <= kinks; i++) {
      const t = i / (kinks + 1);
      const base = new THREE.Vector3().copy(start).addScaledVector(dir, t * len);

      const w   = Math.pow(Math.sin(Math.PI * t), 0.9);
      const ang = rnd() * TAU;
      const r   = (rnd() * 2.0 - 1.0) * amplitude * w;

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

  // ---------- hue shift helper ----------
  private applyHueShift(base: THREE.Color, deg?: number): THREE.Color {
    if (!deg || Math.abs(deg) < 1e-6) return base;
    const { h, s, l } = base.getHSL({ h: 0, s: 0, l: 0 } as any);
    let nh = h + (deg / 360);
    nh = nh - Math.floor(nh); // wrap [0..1)
    _tmpColor.setHSL(nh, s, l);
    return _tmpColor;
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
    const wobbleAmpMul = d.wobbleAmp ?? 0.35;
    const wobbleFreqHz = d.wobbleFreq ?? 6.0;
    const hueShiftDeg  = d.hueShift ?? 0;

    // початкова ортонапрямна база (перпендикулярно до осі старт→фініш)
    const delta = new THREE.Vector3().subVectors(endW, startW);
    const len = delta.length();
    const dir = delta.clone().normalize();
    const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
    const right0 = new THREE.Vector3().crossVectors(dir, tmp).normalize();
    const up0    = new THREE.Vector3().crossVectors(right0, dir).normalize();

    // базовий «заморожений» зигзаг (у площині, перпендикулярній осі)
    const base = this.buildBaseCenterline(new THREE.Vector3(0,0,0), delta, kinks, amplitude, seed, right0, up0);
    const mesh = this.makePolylineMesh(base.points);

    // Розташувати меш у світі в startW
    mesh.position.copy(startW);

    (mesh as any).userData.arc = {
      // параметри
      startW, endW, kinks, amplitude, thicknessPx, color, opacity,
      glowIntensity, glowPx, seed,
      wobbleAmp: wobbleAmpMul,
      wobbleFreq: wobbleFreqHz,
      hueShiftDeg,

      // статичні дані для оновлення щокадрово
      baseOffsetRU: base.baseOffsetRU, // (rx, ry) для кожного зламу
      len
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

      // колір + hueShift на льоту
      const displayColor =
        (A.hueShiftDeg && Math.abs(A.hueShiftDeg) > 1e-6)
          ? this.applyHueShift(A.color.clone(), A.hueShiftDeg)
          : A.color;

      mat.uniforms.uSizeAtten.value     = atten;
      mat.uniforms.uThicknessPx.value   = A.thicknessPx;
      mat.uniforms.uOpacity.value       = A.opacity;
      (mat.uniforms.uColor.value as THREE.Color).copy(displayColor);
      mat.uniforms.uGlowIntensity.value = A.glowIntensity;
      mat.uniforms.uGlowPx.value        = A.glowPx;

      // === динамічний центрлайн у ПЕРПЕНДИКУЛЯРНІЙ площині ===
      const dir = new THREE.Vector3().subVectors(A.endW, A.startW);
      const len = dir.length();
      if (len < 1e-6) return;
      dir.normalize();

      // оновлюємо базис на кожному кадрі: right/up ⟂ dir
      const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
      const right = new THREE.Vector3().crossVectors(dir, tmp).normalize();
      const up    = new THREE.Vector3().crossVectors(right, dir).normalize();

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

        // базовий seed-зсув (той самий, що під час створення), але в НОВОМУ базисі right/up
        const rx = A.baseOffsetRU[(i-1)*2 + 0];
        const ry = A.baseOffsetRU[(i-1)*2 + 1];
        base.addScaledVector(right, rx);
        base.addScaledVector(up,    ry);

        // незалежна «тряска» у тій же перпендикулярній площині
        const w      = Math.pow(Math.sin(Math.PI * t), 0.9);
        const omega  = (A.wobbleFreq as number) * TAU * (0.6 + 0.8 * (i * 16807 % 97) / 97.0); // легка десинхронізація
        const phase  = (i * 9301 % 233) / 233.0 * TAU;

        // напрямок коливань — довільний у площині right/up
        const dirAng = ((i * 73) % 360) * (Math.PI / 180);
        const jx = Math.cos(dirAng), jy = Math.sin(dirAng);

        const jitterMag = (A.amplitude * (A.wobbleAmp ?? 0.35)) * w;
        const s = Math.sin(omega * now + phase) * jitterMag;

        base.addScaledVector(right, jx * s);
        base.addScaledVector(up,    jy * s);

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
      (mesh.geometry as THREE.BufferGeometry).boundingSphere = new THREE.Sphere(centerLocal, radius);

      // пересунути меш у світ на актуальний старт
      (mesh as THREE.Mesh).position.copy(A.startW);
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

    // оновлюємо параметри
    A.startW.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    if (object.data?.target) {
      const t = object.data.target as Vec3;
      A.endW.set(t.x, t.y, t.z);
    }

    if (object.data?.kinks !== undefined && object.data.kinks !== A.kinks) {
      // перебудувати базову лінію і геометрію під нову к-сть зламів
      A.kinks = object.data.kinks;

      const delta = new THREE.Vector3().subVectors(A.endW, A.startW);
      const dir = delta.clone().normalize();
      const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
      const right = new THREE.Vector3().crossVectors(dir, tmp).normalize();
      const up    = new THREE.Vector3().crossVectors(right, dir).normalize();

      const base = this.buildBaseCenterline(new THREE.Vector3(0,0,0), delta, A.kinks, A.amplitude, A.seed, right, up);
      A.baseOffsetRU = base.baseOffsetRU;
      A.len = delta.length();

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
    if (object.data?.wobbleAmp    !== undefined) A.wobbleAmp    = object.data.wobbleAmp;
    if (object.data?.wobbleFreq   !== undefined) A.wobbleFreq   = object.data.wobbleFreq;
    if (object.data?.hueShift     !== undefined) A.hueShiftDeg  = object.data.hueShift;

    // позиція меша (атрибути підхопляться у onBeforeRender)
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
