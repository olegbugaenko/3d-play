import * as THREE from "three";
import { BaseRenderer } from "../BaseRenderer";
import { TSceneObject } from "@scene/scene.types";
import { AuroraEffect } from "@environment/environment.types";
import { UiLogicBridge } from "@ui/logic/UiLogicBridge";

/**
 * AuroraRenderer (soft-add, tilted, animated, ≤18 uniforms)
 */
export class AuroraRenderer extends BaseRenderer {
  private auroraGroup: THREE.Group;
  private bridge: UiLogicBridge | null = null;

  private lastEffects: AuroraEffect[] = [];
  private lastUpdateTime = 0;

  private effectGroups = new Map<string, THREE.Group>();
  private effectMaterials: THREE.ShaderMaterial[] = [];

  // тюнінг
  private readonly CROSS_PLANES = 2;
  private readonly SEG_X = 96;
  private readonly SEG_Y = 24;
  private readonly DEFAULT_TILT_DEG = -18;
  private readonly TILT_JITTER_DEG = 2;

  constructor(scene: THREE.Scene, bridge?: UiLogicBridge) {
    super(scene);
    this.bridge = bridge || null;
    this.auroraGroup = new THREE.Group();
    this.auroraGroup.name = "AuroraEffects";
    this.scene.add(this.auroraGroup);
  }

  render(_object: TSceneObject): THREE.Object3D { return new THREE.Group(); }
  update(_object: TSceneObject): void {}
  remove(_id: string): void {}
  getMeshById(_id: string): THREE.Object3D | null { return null; }

  updateEffects(effects: AuroraEffect[]): void {
    const now = Date.now();
    if (now - this.lastUpdateTime < 100) return;
    this.lastUpdateTime = now;
    if (this.effectsEqual(effects, this.lastEffects)) return;
    this.lastEffects = effects.map(cloneEffect);
    this.rebuild(effects);
  }

  clearAll(): void { this.disposeAll(); this.lastEffects = []; }
  removeEffect(effectId: string): void {
    const remaining = this.lastEffects.filter(e => e.id !== effectId);
    this.updateEffects(remaining);
  }
  updateEnvironmentEffects(): void { if (this.bridge) this.updateEffects(this.bridge.getAuroraEffects()); }
  dispose(): void { this.disposeAll(); this.scene.remove(this.auroraGroup); }

  // ──────────────────────────────

  private rebuild(effects: AuroraEffect[]) {
    this.disposeAll();
    if (!effects.length) return;

    for (const eff of effects) {
      const g = new THREE.Group();
      g.name = `Aurora_${eff.id}`;
      g.position.set(eff.position.x, eff.position.y, eff.position.z);

      // <=18 UNIFORMS — згорнуті пакети:
      // uSize (w,h), uWind (dir.xy,strength), uNoise (scale,speed),
      // uEdge (x,top,bottom), uColorSurf (amp,speed)
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:        { value: 0.0 },                                  // 1
          uSize:        { value: new THREE.Vector2(eff.width, eff.height) }, // 2
          uIntensity:   { value: eff.intensity },                        // 3
          uPrimary:     { value: new THREE.Color(eff.primaryColor.r, eff.primaryColor.g, eff.primaryColor.b) }, // 4
          uSecondary:   { value: new THREE.Color(eff.secondaryColor.r, eff.secondaryColor.g, eff.secondaryColor.b) }, // 5
          uWind:        { value: new THREE.Vector3(1, 0.25, 4.0).normalize().multiplyScalar(1) }, // 6
          uNoise:       { value: new THREE.Vector2(0.45, 0.45) },        // 7
          uWaveFreq:    { value: 0.9 },                                  // 8
          uEdge:        { value: new THREE.Vector3(0.20, 0.08, 0.35) },  // 9
          uEdgeFeather: { value: 1.5 },                                  // 10
          uEdgeGamma:   { value: 1.25 },                                 // 11
          uColorSurf:   { value: new THREE.Vector2(0.18, 0.35) },        // 12
          uLayerFactor: { value: 1.0 },                                  // 13
          uGlobalAlpha: { value: 1.0 },                                  // 14
        },
        vertexShader: RIBBON_VERTEX,
        fragmentShader: RIBBON_FRAGMENT,

        // soft-add (premultiplied)
        blending: THREE.CustomBlending,
        premultipliedAlpha: true,
        blendEquation: THREE.AddEquation,
        blendEquationAlpha: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,

        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      // fwidth у фрагменті
      (mat as any).extensions = { derivatives: true };
      this.effectMaterials.push(mat);

      const geo = new THREE.PlaneGeometry(eff.width, eff.height, this.SEG_X, this.SEG_Y);
      geo.translate(0, eff.height * 0.5, 0); // anchor = нижній край

      const tiltDeg = (eff as any)?.tiltDeg ?? this.DEFAULT_TILT_DEG;
      const baseTilt = THREE.MathUtils.degToRad(tiltDeg);

      for (let i = 0; i < this.CROSS_PLANES; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = (i / this.CROSS_PLANES) * Math.PI;
        const jitter = THREE.MathUtils.degToRad((i - (this.CROSS_PLANES - 1) * 0.5) * this.TILT_JITTER_DEG);
        mesh.rotation.x = baseTilt + jitter;
        mesh.frustumCulled = false;
        mesh.renderOrder = 10 + i;

        const layerFactor = Math.pow(0.85, i);
        mesh.onBeforeRender = () => {
          (mat.uniforms.uTime as any).value = performance.now() * 0.001;
          (mat.uniforms.uLayerFactor as any).value = layerFactor;
        };

        g.add(mesh);
      }

      this.auroraGroup.add(g);
      this.effectGroups.set(eff.id, g);
    }
  }

  private disposeAll() {
    // dispose один раз кожен унікальний ресурс
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    for (const [_, group] of this.effectGroups) {
      group.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          if (mesh.geometry) geometries.add(mesh.geometry as THREE.BufferGeometry);
          if (mesh.material) materials.add(mesh.material as THREE.Material);
        }
      });
      this.auroraGroup.remove(group);
    }
    this.effectGroups.clear();

    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.effectMaterials = [];
  }

  private effectsEqual(a: AuroraEffect[], b: AuroraEffect[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const A = a[i], B = b[i];
      if (
        A.id !== B.id || A.intensity !== B.intensity ||
        A.width !== B.width || A.height !== B.height ||
        A.position.x !== B.position.x || A.position.y !== B.position.y || A.position.z !== B.position.z ||
        A.primaryColor.r !== B.primaryColor.r || A.primaryColor.g !== B.primaryColor.g || A.primaryColor.b !== B.primaryColor.b ||
        A.secondaryColor.r !== B.secondaryColor.r || A.secondaryColor.g !== B.secondaryColor.g || A.secondaryColor.b !== B.secondaryColor.b
      ) return false;
    }
    return true;
  }
}

/* ===================== GLSL (14 uniforms total) ===================== */

const RIBBON_VERTEX = /* glsl */`
precision mediump float;
precision mediump int;

uniform mediump float uTime;
uniform vec2  uSize;          // (width, height)
uniform vec3  uWind;          // (dir.x, dir.y, strength)
uniform vec2  uNoise;         // (scale, speed)
uniform float uWaveFreq;

varying vec2 vUv;
varying float vHeightNorm;
varying float vBand;
varying float vNoiseA;
varying float vNoiseB;

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
  p += dot(p, p.yzx + 19.19);
  return fract(p.x * p.y * p.z * 93.733);
}
float noise3(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f*f*(3.0-2.0*f);
  float n000=hash(i+vec3(0,0,0)), n100=hash(i+vec3(1,0,0));
  float n010=hash(i+vec3(0,1,0)), n110=hash(i+vec3(1,1,0));
  float n001=hash(i+vec3(0,0,1)), n101=hash(i+vec3(1,0,1));
  float n011=hash(i+vec3(0,1,1)), n111=hash(i+vec3(1,1,1));
  float nx00=mix(n000,n100,u.x), nx10=mix(n010,n110,u.x);
  float nx01=mix(n001,n101,u.x), nx11=mix(n011,n111,u.x);
  float nxy0=mix(nx00,nx10,u.y), nxy1=mix(nx01,nx11,u.y);
  return mix(nxy0,nxy1,u.z);
}
float fbm(vec3 x){
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){ v+=a*noise3(x); x*=2.0; a*=0.5; }
  return v;
}

void main(){
  vUv = uv;
  vHeightNorm = vUv.y;
  vBand = vUv.x;

  vec3 p = position;

  float amp = (0.2 + 0.8*vHeightNorm) * (0.15*uSize.y + 0.1*uSize.x);

  float t = uTime * uNoise.y;
  float nA = fbm(vec3(vBand * uNoise.x * 6.0, vHeightNorm * uNoise.x * 3.0, t));
  float nB = fbm(vec3(vBand * uNoise.x * 4.0 + 23.0, vHeightNorm * uNoise.x * 2.0 + 11.0, t*0.7));

  float wave = sin(uTime * uWaveFreq + vBand * 6.28318) * (0.5 + 0.5 * nA);

  p.x += (nA - 0.5) * amp * 0.8 + wave * amp * 0.15;
  p.z += (nB - 0.5) * amp * 0.6;
  p.y += (nA * 2.0 - 1.0) * amp * 0.25;

  // дрейф у вітрі (dir.xy, strength у z)
  p.xz += vec2(uWind.x, uWind.y) * (uWind.z * (uTime * 0.03));

  vNoiseA = nA;
  vNoiseB = nB;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RIBBON_FRAGMENT = /* glsl */`
precision mediump float;
precision mediump int;

uniform mediump float uTime;
uniform float uIntensity;
uniform vec3  uPrimary;
uniform vec3  uSecondary;
uniform vec3  uEdge;        // (x, top, bottom)
uniform float uEdgeFeather;
uniform float uEdgeGamma;
uniform vec2  uColorSurf;   // (amp, speed)
uniform float uLayerFactor;
uniform float uGlobalAlpha;

varying vec2 vUv;
varying float vHeightNorm;
varying float vBand;
varying float vNoiseA;
varying float vNoiseB;

// тонке підрізання піків (тримай тут — без нових юніформів)
const float SOFT_K = 0.85;  // 0.7..1.1 — сила компресії

void main(){
  // screen-space AA
  float px = fwidth(vUv.x) * uEdgeFeather;
  float py = fwidth(vUv.y) * uEdgeFeather;

  float edgeX_L = smoothstep(0.0, uEdge.x + px, vUv.x);
  float edgeX_R = smoothstep(0.0, uEdge.x + px, 1.0 - vUv.x);
  float edgeX   = edgeX_L * edgeX_R;

  float edgeY_B = smoothstep(0.0, uEdge.z + py, vUv.y);           // bottom
  float edgeY_T = smoothstep(0.0, uEdge.y + py, 1.0 - vUv.y);     // top
  float edgeY   = edgeY_B * edgeY_T;

  float edgeMask = pow(edgeX * edgeY, uEdgeGamma);

  float fibers = 0.55 + 0.45 * sin(vUv.x * 40.0 + vNoiseA * 6.0 + uTime * 0.8);
  fibers *= 0.85 + 0.15 * sin(vUv.x * 10.0 + vNoiseB * 4.0 + uTime * 0.3);
  fibers = mix(1.0, fibers, 0.7);

  float column = 0.65 + 0.35 * sin(vUv.y * 6.28318 + vNoiseA * 3.0 + uTime * 0.5);
  column = mix(1.0, column, 0.6);

  float mask = edgeMask * fibers * column;

  float surf = sin(uTime * uColorSurf.y + vBand * 2.2 + vHeightNorm * 1.6);
  float mixK = clamp(0.35 + 0.65 * vHeightNorm + uColorSurf.x * surf, 0.0, 1.0);
  vec3 col = mix(uPrimary, uSecondary, mixK);

  float alpha = mask * clamp(uIntensity, 0.1, 2.0) * uLayerFactor * uGlobalAlpha;
  if (alpha <= 0.001) discard;

  // premultiplied color
  vec3 premul = col * alpha;

  // 🔧 дуже м’який highlight compression (Reinhard):
  // тримає хвилі, але знімає "спайки" на перетинах полотен
  premul = premul / (1.0 + SOFT_K * premul);

  gl_FragColor = vec4(premul, alpha); // premultiplied
}
`;

/* ===================== helpers ===================== */
function cloneEffect(e: AuroraEffect): AuroraEffect {
  return {
    id: e.id,
    type: e.type,
    position: { x: e.position.x, y: e.position.y, z: e.position.z },
    width: e.width,
    height: e.height,
    intensity: e.intensity,
    duration: e.duration,
    startTime: e.startTime,
    primaryColor: { r: e.primaryColor.r, g: e.primaryColor.g, b: e.primaryColor.b },
    secondaryColor: { r: e.secondaryColor.r, g: e.secondaryColor.g, b: e.secondaryColor.b },
    waveSpeed: e.waveSpeed,
    waveAmplitude: e.waveAmplitude,
    direction: e.direction,
  };
}
