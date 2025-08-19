import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

type Vec3 = { x:number; y:number; z:number };

export interface ElectricArcData {
  target: Vec3;

  // ручки
  kinks?: number;         // к-сть внутрішніх зламів
  amplitude?: number;     // макс. поперечне відхилення (world units)
  thicknessPx?: number;   // товщина в пікселях
  color?: number;         // колір ядра
  opacity?: number;       // 0..1
  glowIntensity?: number; // інтенсивність світіння довкола лінії
  seed?: number;          // для відтворюваності
}

const _tmpV2 = new THREE.Vector2();

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
  private clock = new THREE.Clock();

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
      // === vertexShader ===
precision mediump float;

uniform float uThicknessPx;
uniform float uSizeAtten;

attribute vec3  aPrev;
attribute vec3  aCenter;
attribute vec3  aNext;
attribute float aSide;   // -1 / +1
attribute float aT;      // 0..1 (не використовуємо у фрагменті)

varying float vSide;
// передамо допоміжні величини у фрагмент:
varying float vHalfWidthPx;  // півтовщина в px (без мітра)
varying float vMiterLen;     // коефіцієнт мітра

void main() {
  // у view-space робимо екструзію
  vec3 P0 = (modelViewMatrix * vec4(aPrev,   1.0)).xyz;
  vec3 P1 = (modelViewMatrix * vec4(aCenter, 1.0)).xyz;
  vec3 P2 = (modelViewMatrix * vec4(aNext,   1.0)).xyz;

  vec2 d1 = normalize((P1 - P0).xy);
  vec2 d2 = normalize((P2 - P1).xy);
  vec2 n1 = vec2(-d1.y, d1.x);
  vec2 n2 = vec2(-d2.y, d2.x);

  vec2 miter = normalize(n1 + n2);
  float denom = max(dot(miter, n1), 1e-3);
  float miterLen = min(1.0 / denom, 4.0);

  // halfWidth у VIEW-спейсі (але базується на px):
  float halfWidthVS = 0.5 * uThicknessPx * (uSizeAtten / max(1e-3, -P1.z));

  vec3 Pv = P1;
  Pv.xy += miter * aSide * halfWidthVS * miterLen;

  gl_Position = projectionMatrix * vec4(Pv, 1.0);

  vSide         = aSide;
  vHalfWidthPx  = 0.25 * uThicknessPx; // «піксельний» радіус смужки
  vMiterLen     = miterLen;
}

    `;

    const fragmentShader = `
     precision mediump float;

uniform vec3  uColor;
uniform float uOpacity;
uniform float uGlowIntensity; // множник яскравості glow

varying float vSide;
varying float vHalfWidthPx;
varying float vMiterLen;

void main(){
  // поперечна ВІДСТАНЬ у ПІКСЕЛЯХ від осі смужки:
  float distPx = abs(vSide) * vHalfWidthPx * vMiterLen;

  // ширина «ядра» = сама смужка; 1px feather по краю:
  const float featherMult = 0.9995;
  float core = 1.0 - smoothstep(vHalfWidthPx*(1.0 - featherMult), vHalfWidthPx, distPx);

  // радіус glow у пікселях (ХАРДКОД — збільшуй для ширшого ореолу):
  float glowPx = vHalfWidthPx*100.0;        // <--- ГОЛОВНА РУЧКА РАДІУСУ
  float glow = 1.0 - smoothstep(vHalfWidthPx, vHalfWidthPx + glowPx, distPx);

  float alpha = max(core, glow * uGlowIntensity) * uOpacity;
  if (alpha < 0.002) discard;

  gl_FragColor = vec4(uColor, alpha);

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
        uThicknessPx: { value: 2.0 },
        uOpacity:     { value: 1.0 },
        uColor:       { value: new THREE.Color(0x9fd3ff) },
        uSizeAtten:   { value: 1.0 },
        uTime:        { value: 0.0 },
        uGlowIntensity: { value: 0.5 },
      }
    });
    (ElectricArcRenderer.sharedMat as any).toneMapped = true;
    return ElectricArcRenderer.sharedMat!;
  }

  // ---------- CENTERLINE BUILDER ----------
  private buildCenterline(
    start: THREE.Vector3,   // ЛОКАЛЬНИЙ старт (0,0,0)
    end: THREE.Vector3,     // ЛОКАЛЬНИЙ кінець (delta)
    kinks: number,
    amplitude: number,
    seed: number,
    time: number = 0.0
  ): THREE.Vector3[] {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-6) return [start.clone(), end.clone()];
    dir.normalize();

    const tmp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
    const right = new THREE.Vector3().crossVectors(dir, tmp).normalize();
    const up    = new THREE.Vector3().crossVectors(right, dir).normalize();

    const rnd = rngMulberry((seed ?? 1) | 0);
    const pts: THREE.Vector3[] = [];
    pts.push(start.clone());

    for (let i = 1; i <= kinks; i++) {
      const t = i / (kinks + 1);
      const base = new THREE.Vector3().copy(start).addScaledVector(dir, t * len);

      const w = Math.pow(Math.sin(Math.PI * t), 0.9);
      const ang = rnd() * Math.PI * 2.0;
      const timeOffset = time * (2.0 + rnd() * 3.0); // Різна швидкість для кожної точки
      const r   = (rnd() * 2 - 1) * amplitude * w * (0.8 + 0.4 * Math.sin(15*timeOffset));

      base.addScaledVector(right, Math.cos(ang) * r);
      base.addScaledVector(up,    Math.sin(ang) * r);

      pts.push(base);
    }
    pts.push(end.clone());
    return pts;
  }

  // ---------- GEOMETRY FROM CENTERLINE ----------
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

    // лишимо сферу, але оновлюватимемо її у onBeforeRender
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

    const kinks       = d.kinks ?? 8;
    const amplitude   = d.amplitude ?? 0.3;
    const thicknessPx = d.thicknessPx ?? 2.0;
    const color       = new THREE.Color(d.color ?? 0x9fd3ff);
    const opacity     = d.opacity ?? 1.0;
    const seed        = d.seed ?? Math.random() * 1e9;

    // ЛОКАЛЬНО: 0 -> delta
    const delta = new THREE.Vector3().subVectors(endW, startW);
    const centerlineLocal = this.buildCenterline(new THREE.Vector3(0,0,0), delta, kinks, amplitude, seed, this.clock.getElapsedTime());
    const mesh = this.makePolylineMesh(centerlineLocal);

    // Розташувати меш у світі в startW
    mesh.position.copy(startW);

         (mesh as any).userData.arc = {
       startW, endW, kinks, amplitude, thicknessPx, color, opacity, glowIntensity: d.glowIntensity ?? 0.5, seed,
       centerline: centerlineLocal
     };

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
             mat.uniforms.uSizeAtten.value   = atten;
       mat.uniforms.uThicknessPx.value = A.thicknessPx;
       mat.uniforms.uOpacity.value     = A.opacity;
       (mat.uniforms.uColor.value as THREE.Color).copy(A.color);
       mat.uniforms.uTime.value        = this.clock.getElapsedTime();
       mat.uniforms.uGlowIntensity.value = A.glowIntensity ?? 0.5;

      // bounds (локальні): центр = delta*0.5
      const delta = new THREE.Vector3().subVectors(A.endW, A.startW);
      const len = delta.length();
      const centerLocal = delta.clone().multiplyScalar(0.5);

      // оцінка world-товщини по центру
      const centerWorld = centerLocal.clone().add(A.startW);
      const inv = (camera as any).matrixWorldInverse
        ? (camera as any).matrixWorldInverse as THREE.Matrix4
        : new THREE.Matrix4().copy((camera as THREE.Camera).matrixWorld).invert();
      const midZ = -centerWorld.clone().applyMatrix4(inv).z;
      const halfWidthWorld = 0.5 * A.thicknessPx * (atten / Math.max(1e-3, midZ));

      const radius = 0.5 * len + A.amplitude * 1.25 + halfWidthWorld * 1.5;
      const g = mesh.geometry as THREE.BufferGeometry;
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

    // оновлюємо параметри
    A.startW.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    if (object.data?.target) {
      const t = object.data.target as Vec3;
      A.endW.set(t.x, t.y, t.z);
    }
    if (object.data?.kinks       !== undefined) A.kinks       = object.data.kinks;
    if (object.data?.amplitude   !== undefined) A.amplitude   = object.data.amplitude;
         if (object.data?.thicknessPx !== undefined) A.thicknessPx = object.data.thicknessPx;
     if (object.data?.color       !== undefined) A.color.set(object.data.color);
     if (object.data?.opacity     !== undefined) A.opacity     = object.data.opacity;
     if (object.data?.glowIntensity !== undefined) A.glowIntensity = object.data.glowIntensity;
     if (object.data?.seed        !== undefined) A.seed        = object.data.seed;

    // локальна ламана: 0 -> delta
    const delta = new THREE.Vector3().subVectors(A.endW, A.startW);
    A.centerline = this.buildCenterline(new THREE.Vector3(0,0,0), delta, A.kinks, A.amplitude, A.seed, this.clock.getElapsedTime());

    const N = A.centerline.length;
    const aPrev   = mesh.geometry.getAttribute('aPrev')   as THREE.BufferAttribute;
    const aCenter = mesh.geometry.getAttribute('aCenter') as THREE.BufferAttribute;
    const aNext   = mesh.geometry.getAttribute('aNext')   as THREE.BufferAttribute;
    const aT      = mesh.geometry.getAttribute('aT')      as THREE.BufferAttribute;

    // якщо змінилась кількість точок — перевибудувати геометрію
    if (aCenter.count !== N * 2) {
      const newMesh = this.makePolylineMesh(A.centerline);
      newMesh.renderOrder = mesh.renderOrder;
      newMesh.position.copy(A.startW);
      (newMesh as any).userData = (mesh as any).userData;
      (newMesh as any).onBeforeRender = (mesh as any).onBeforeRender;

      this.group.add(newMesh);
      this.group.remove(mesh);
      this.replaceMesh(object.id, newMesh);
      return;
    }

    // оновити буфери на місці
    let v = 0;
    for (let i = 0; i < N; i++) {
      const iPrev = Math.max(i - 1, 0);
      const iNext = Math.min(i + 1, N - 1);
      const P0 = A.centerline[iPrev];
      const P1 = A.centerline[i];
      const P2 = A.centerline[iNext];
      const t  = i / (N - 1);

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

    // пересунути меш у світ на новий старт
    mesh.position.copy(A.startW);
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

  updateAllArcs(): void {
    // зарезервовано під анімації/флікер
    this.clock.getElapsedTime();
  }
}
