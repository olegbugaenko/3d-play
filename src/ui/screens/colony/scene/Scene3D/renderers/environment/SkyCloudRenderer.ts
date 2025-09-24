import * as THREE from 'three';
import { BaseRenderer } from '../BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import {
  SkyCloudInstance,
  SkyCloudObjectData,
  SkyCloudRenderState,
} from '@logic/systems/environment/environment.types';

interface InternalCloudData {
  data: SkyCloudObjectData;
  basePosition: THREE.Vector3;
}

type SkyCloudGlobalState = SkyCloudRenderState & {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
};

const WHITE = new THREE.Color(0xffffff);
const BLACK = new THREE.Color(0x000000);
const DEFAULT_SUN = new THREE.Color(1, 0.95, 0.82);
const DEFAULT_AMBIENT = new THREE.Color(0.58, 0.61, 0.66);

export class SkyCloudRenderer extends BaseRenderer {
  private static sharedMaterial: THREE.ShaderMaterial | null = null;

  private cloudGroup: THREE.Group;
  private clouds: Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>> = new Map();
  private clock = new THREE.Clock();
  private billboardTarget = new THREE.Vector3();
  private tmpColor = new THREE.Color();

  private globalState: SkyCloudGlobalState = {
    cloudyFactor: 0.35,
    speedMultiplier: 0.8,
    wispyMultiplier: 1.0,
    opacityMultiplier: 1.0,
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: DEFAULT_SUN.clone(),
    ambientColor: DEFAULT_AMBIENT.clone(),
  };

  constructor(scene: THREE.Scene) {
    super(scene);
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = 'SkyCloudLayer';
    this.scene.add(this.cloudGroup);
  }

  private getOrCreateMaterial(): THREE.ShaderMaterial {
    if (SkyCloudRenderer.sharedMaterial) {
      return SkyCloudRenderer.sharedMaterial;
    }

    const vertexShader = `
      precision mediump float;

      uniform float uTime;
      uniform float uSpeedMultiplier;
      uniform float uNoiseScale;
      uniform float uNoiseStrength;
      uniform float uWispyMultiplier;
      uniform float uSeed;
      uniform vec2 uMovement;

      varying vec2 vUv;
      varying vec2 vSampleCoord;
      varying float vHeightNoise;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p *= 2.12;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vUv = uv;
        vec2 scaled = (uv - 0.5) * uNoiseScale;
        vec2 flow = uMovement * uSpeedMultiplier * (uTime * 0.05);
        vec2 sampleCoord = scaled + flow + vec2(uSeed, uSeed * 1.37);
        vSampleCoord = sampleCoord;

        float base = fbm(sampleCoord);
        float detail = fbm(sampleCoord * 2.35);
        float blend = clamp(uWispyMultiplier, 0.0, 2.0);
        vHeightNoise = mix(base, detail, clamp(blend, 0.0, 1.0));

        vec3 displaced = position;
        displaced.z += (vHeightNoise - 0.5) * uNoiseStrength;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `;

    const fragmentShader = `
      precision mediump float;

      uniform float uGlobalCloudiness;
      uniform float uWispyMultiplier;
      uniform float uOpacityMultiplier;
      uniform float uOpacity;
      uniform float uWispy;
      uniform float uSoftness;
      uniform float uNoiseStrength;
      uniform vec3 uBaseColor;
      uniform float uColorShift;
      uniform vec2 uMovement;
      uniform float uActivation;
      uniform float uParallax;
      uniform float uAspect;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbientColor;
      uniform float uOrientation;
      uniform float uSkew;
      uniform float uDetailScale;
      uniform float uDetailContrast;
      uniform float uDensityOffset;
      uniform float uWarpStrength;
      uniform float uWarpFrequency;
      uniform float uSeed;

      varying vec2 vUv;
      varying vec2 vSampleCoord;
      varying float vHeightNoise;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p *= 2.12;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 centered = vUv - 0.5;
        vec2 ellipseCoord = centered * vec2(uAspect, 1.0);

        float cosO = cos(uOrientation);
        float sinO = sin(uOrientation);
        vec2 rotated = vec2(
          ellipseCoord.x * cosO - ellipseCoord.y * sinO,
          ellipseCoord.x * sinO + ellipseCoord.y * cosO
        );
        rotated.x += rotated.y * uSkew;

        float ellipse = 1.0 - dot(rotated, rotated);

        float detail = fbm(vSampleCoord * max(0.35, uDetailScale));
        detail = pow(clamp(detail, 0.0, 1.0), max(0.25, uDetailContrast));

        float warpFreq = max(0.5, uWarpFrequency);
        float warp = sin(rotated.x * (1.4 + warpFreq * 0.6) + uSeed * 0.73);
        warp *= cos(rotated.y * (1.1 + warpFreq * 0.45) - uSeed * 1.27);
        float warpContribution = warp * uWarpStrength;

        float wispy = mix(uWispy, uWispy * uWispyMultiplier, 0.5);
        float softness = max(0.05, uSoftness);
        float maskBase = ellipse + warpContribution + (detail - 0.5) * uNoiseStrength;
        float mask = smoothstep(wispy - softness, wispy + softness, maskBase);

        float densityFactor = clamp(1.0 + uDensityOffset, 0.2, 1.75);
        float activation = smoothstep(uActivation - 0.12, uActivation + 0.02, uGlobalCloudiness);
        float alpha = clamp(mask * activation * uOpacity * uOpacityMultiplier * densityFactor, 0.0, 1.0);

        if (alpha <= 0.01) discard;

        vec3 base = uBaseColor;
        if (uColorShift > 0.0) {
          base = mix(base, vec3(1.0), clamp(uColorShift, 0.0, 1.0));
        } else if (uColorShift < 0.0) {
          base = mix(base, vec3(0.0), clamp(-uColorShift, 0.0, 1.0));
        }

        vec3 sunDir = normalize(uSunDir);
        float sunFactor = clamp(dot(normalize(vec3(0.0, 1.0, 0.25)), sunDir), 0.0, 1.0);
        float edge = smoothstep(0.0, 0.7, ellipse);

        vec3 color = mix(uAmbientColor, base, 0.65 + edge * 0.2);
        color += (detail - 0.5) * (0.08 + uDensityOffset * 0.05);
        color = mix(color, uSunColor, sunFactor * 0.25);

        gl_FragColor = vec4(color, alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;

    SkyCloudRenderer.sharedMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.001,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uGlobalCloudiness: { value: 0.35 },
        uSpeedMultiplier: { value: 1 },
        uNoiseScale: { value: 2.2 },
        uNoiseStrength: { value: 1.1 },
        uWispyMultiplier: { value: 1 },
        uOpacityMultiplier: { value: 1 },
        uSeed: { value: 0 },
        uMovement: { value: new THREE.Vector2() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: DEFAULT_SUN.clone() },
        uAmbientColor: { value: DEFAULT_AMBIENT.clone() },
        uOpacity: { value: 0.6 },
        uWispy: { value: 0.6 },
        uSoftness: { value: 0.22 },
        uBaseColor: { value: new THREE.Color(1, 1, 1) },
        uColorShift: { value: 0 },
        uActivation: { value: 0.5 },
        uParallax: { value: 1 },
        uAspect: { value: 1 },
        uOrientation: { value: 0 },
        uSkew: { value: 0 },
        uDetailScale: { value: 1 },
        uDetailContrast: { value: 1 },
        uDensityOffset: { value: 0 },
        uWarpStrength: { value: 0 },
        uWarpFrequency: { value: 1 },
      },
    });

    (SkyCloudRenderer.sharedMaterial as any).toneMapped = true;
    return SkyCloudRenderer.sharedMaterial;
  }

  render(object: TSceneObject<SkyCloudObjectData>): THREE.Object3D {

    const data = object.data as SkyCloudObjectData;
    const instance: SkyCloudInstance = {
      id: object.id,
      layerId: data.layerId,
      position: {
        x: object.coordinates.x,
        y: object.coordinates.y,
        z: object.coordinates.z,
      },
      data: { ...data },
    };

    return this.upsertCloud(instance);
  }

  private upsertCloud(instance: SkyCloudInstance): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    let mesh = this.clouds.get(instance.id);
    if (!mesh) {
      mesh = this.createCloudMesh(instance);
      this.cloudGroup.add(mesh);
      this.clouds.set(instance.id, mesh);
      this.meshes.set(instance.id, mesh);
    } else {
      this.updateCloudMesh(mesh, instance);
    }

    return mesh;
  }

  private createCloudMesh(
    instance: SkyCloudInstance,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const material = this.getOrCreateMaterial();
    const geometry = new THREE.PlaneGeometry(1, 1, 24, 16);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `SkyCloud:${instance.id}`;
    mesh.matrixAutoUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2000;

    const info: InternalCloudData = {
      data: { ...instance.data },
      basePosition: new THREE.Vector3(instance.position.x, instance.position.y, instance.position.z),
    };

    mesh.userData.sky = info;
    mesh.scale.set(info.data.size * info.data.aspectRatio, info.data.size, 1);
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      geometry.boundingSphere.radius = Math.max(geometry.boundingSphere.radius, 1.15);
      geometry.boundingSphere.center.set(0, 0, 0);
    }

    mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, mat) => {
      const shader = mat as THREE.ShaderMaterial;
      const internal = mesh.userData.sky as InternalCloudData;
      const data = internal.data;

      this.tmpColor.setHex(data.color);
      if (data.colorShift > 0) {
        this.tmpColor.lerp(WHITE, Math.min(1, data.colorShift));
      } else if (data.colorShift < 0) {
        this.tmpColor.lerp(BLACK, Math.min(1, -data.colorShift));
      }

      shader.uniforms.uBaseColor.value.copy(this.tmpColor);
      shader.uniforms.uOpacity.value = Math.max(0, data.opacity * this.globalState.opacityMultiplier);
      shader.uniforms.uWispy.value = data.wispiness;
      shader.uniforms.uSoftness.value = data.softness;
      shader.uniforms.uNoiseScale.value = data.noiseScale;
      shader.uniforms.uNoiseStrength.value = data.noiseStrength;
      shader.uniforms.uSeed.value = data.seed;
      shader.uniforms.uMovement.value.set(
        Math.cos(data.direction) * data.speed,
        Math.sin(data.direction) * data.speed,
      );
      shader.uniforms.uActivation.value = data.activation;
      shader.uniforms.uParallax.value = data.parallax;
      shader.uniforms.uAspect.value = data.aspectRatio;
      shader.uniforms.uOrientation.value = data.orientation ?? 0;
      shader.uniforms.uSkew.value = data.skew ?? 0;
      shader.uniforms.uDetailScale.value = Math.max(0.35, data.detailScale ?? 1);
      shader.uniforms.uDetailContrast.value = Math.max(0.25, data.detailContrast ?? 1);
      shader.uniforms.uDensityOffset.value = data.densityOffset ?? 0;
      shader.uniforms.uWarpStrength.value = data.warpStrength ?? 0;
      shader.uniforms.uWarpFrequency.value = Math.max(0.5, data.warpFrequency ?? 1);
    };


    mesh.position.set(
      info.basePosition.x,
      info.basePosition.y + (info.data.heightOffset ?? 0),
      info.basePosition.z,
    );

    return mesh;
  }

  private updateCloudMesh(
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
    instance: SkyCloudInstance,
  ): void {
    const info = mesh.userData.sky as InternalCloudData;
    Object.assign(info.data, instance.data);
    info.basePosition.set(instance.position.x, instance.position.y, instance.position.z);
    mesh.scale.set(info.data.size * info.data.aspectRatio, info.data.size, 1);
    mesh.position.set(
      info.basePosition.x,
      info.basePosition.y + (info.data.heightOffset ?? 0),
      info.basePosition.z,
    );
  }

  syncFromEnvironment(instances: SkyCloudInstance[]): void {
    const desired = new Set<string>();
    for (const instance of instances) {
      desired.add(instance.id);
      this.upsertCloud(instance);
    }

    for (const id of Array.from(this.clouds.keys())) {
      if (!desired.has(id)) {
        this.remove(id);
      }
    }
  }

  update(_object: TSceneObject): void {
    // Положення та анімацію коригуємо в updateSkyClouds
  }

  remove(id: string): void {
    const mesh = this.meshes.get(id) as THREE.Mesh | undefined;
    if (mesh) {
      this.cloudGroup.remove(mesh);
      this.clouds.delete(id);
      mesh.geometry.dispose();
    }
    super.remove(id);
  }

  dispose(): void {
    for (const mesh of this.clouds.values()) {
      this.cloudGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.clouds.clear();
    this.scene.remove(this.cloudGroup);

    if (SkyCloudRenderer.sharedMaterial) {
      SkyCloudRenderer.sharedMaterial.dispose();
      SkyCloudRenderer.sharedMaterial = null;
    }

    super.dispose();
  }

  updateSkyClouds(camera?: THREE.Camera): void {
    this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    const material = SkyCloudRenderer.sharedMaterial;
    if (material) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uGlobalCloudiness.value = this.globalState.cloudyFactor;
      material.uniforms.uSpeedMultiplier.value = this.globalState.speedMultiplier;
      material.uniforms.uWispyMultiplier.value = this.globalState.wispyMultiplier;
      material.uniforms.uOpacityMultiplier.value = this.globalState.opacityMultiplier;
      material.uniforms.uSunDir.value.copy(this.globalState.sunDirection).normalize();
      material.uniforms.uSunColor.value.copy(this.globalState.sunColor);
      material.uniforms.uAmbientColor.value.copy(this.globalState.ambientColor);
    }

    if (!camera || this.clouds.size === 0) {
      return;
    }

    const cameraPosition = (camera as THREE.Camera).position as THREE.Vector3;

    for (const mesh of this.clouds.values()) {
      const internal = mesh.userData.sky as InternalCloudData | undefined;
      if (!internal) continue;
      const data = internal.data;
      const basePosition = internal.basePosition;
      const heightOffset = data.heightOffset ?? 0;

      mesh.position.set(basePosition.x, basePosition.y + heightOffset, basePosition.z);

      const parallaxValue = THREE.MathUtils.clamp(data.parallax ?? 1, 0.3, 2.0);
      const parallaxStrength = THREE.MathUtils.clamp(parallaxValue - 1, -0.75, 0.75);
      if (Math.abs(parallaxStrength) > 0.0001) {
        const followStrength = 0.25;
        const offsetX = (cameraPosition.x - basePosition.x) * parallaxStrength * followStrength;
        const offsetZ = (cameraPosition.z - basePosition.z) * parallaxStrength * followStrength;
        mesh.position.x = basePosition.x + offsetX;
        mesh.position.z = basePosition.z + offsetZ;
      }

      this.billboardTarget.copy(cameraPosition);
      this.billboardTarget.y = mesh.position.y;
      mesh.lookAt(this.billboardTarget);
      mesh.rotation.x = 0;
      mesh.rotation.z = 0;
    }
  }

  updateGlobalState(
    state: SkyCloudRenderState & {
      sunDirection: THREE.Vector3;
      sunColor: THREE.Color;
      ambientColor: THREE.Color;
    },
  ): void {
    this.globalState.cloudyFactor = THREE.MathUtils.clamp(state.cloudyFactor, 0, 1);
    this.globalState.speedMultiplier = state.speedMultiplier;
    this.globalState.wispyMultiplier = state.wispyMultiplier;
    this.globalState.opacityMultiplier = state.opacityMultiplier;
    this.globalState.sunDirection.copy(state.sunDirection).normalize();
    this.globalState.sunColor.copy(state.sunColor);
    this.globalState.ambientColor.copy(state.ambientColor);

    const material = SkyCloudRenderer.sharedMaterial;
    if (material) {
      material.uniforms.uGlobalCloudiness.value = this.globalState.cloudyFactor;
      material.uniforms.uSpeedMultiplier.value = this.globalState.speedMultiplier;
      material.uniforms.uWispyMultiplier.value = this.globalState.wispyMultiplier;
      material.uniforms.uOpacityMultiplier.value = this.globalState.opacityMultiplier;
      material.uniforms.uSunDir.value.copy(this.globalState.sunDirection);
      material.uniforms.uSunColor.value.copy(this.globalState.sunColor);
      material.uniforms.uAmbientColor.value.copy(this.globalState.ambientColor);
    }
  }
}
