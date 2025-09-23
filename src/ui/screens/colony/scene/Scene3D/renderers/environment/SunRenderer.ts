import * as THREE from 'three';
import { BaseRenderer } from '../BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { SunLightState } from '@logic/systems/environment/environment.types';

export class SunRenderer extends BaseRenderer {
  private sunGroup: THREE.Group;

  // DISC: Mesh + ShaderMaterial (фіксована товщина краю у світових одиницях)
  private disc: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  // HALO: як було — спрайт з CanvasTexture
  private halo: THREE.Sprite;
  private haloTexture: THREE.Texture;

  // юніформи диска
  private discUniforms = {
    uColor:     { value: new THREE.Color(1, 1, 1) },
    uIntensity: { value: 1.0 }, // ← ДОДАНО: множник яскравості для RGB (premultiplied)
    uOpacity:   { value: 1.0 }, // залишив для твоєї перевірки visibility
    uRadius:    { value: 0.5 }, // половина розміру (world units)
    uBlur:      { value: 8.0 }, // товщина пера (world units)
  };

  constructor(scene: THREE.Scene) {
    super(scene);

    this.haloTexture = this.createRadialTexture(0.12, 0.0);

    this.sunGroup = new THREE.Group();
    this.sunGroup.name = 'SunVisual';
    this.sunGroup.renderOrder = 9999;

    // ---------- HALO ----------
    const haloMaterial = new THREE.SpriteMaterial({
      map: this.haloTexture,
      color: new THREE.Color(1, 0.9, 0.7),
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.halo = new THREE.Sprite(haloMaterial);
    this.halo.renderOrder = 9998;
    this.sunGroup.add(this.halo);

    // ---------- DISC (ShaderMaterial на PlaneGeometry) ----------
    const discMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,                // RGB: out = Cs + Cd*(1-αs)
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,           // A:   out = As + Ad*(1-As)
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: this.discUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3  uColor;
        uniform float uIntensity;  // множник яскравості (не впливає на α композиції)
        uniform float uRadius;     // половина діаметра в world units
        uniform float uBlur;       // товщина пера в world units

        void main() {
          vec2  centered = vUv - 0.5;
          float r_world  = length(centered) * (2.0 * uRadius);

          float coreR   = max(uRadius - uBlur, 0.0);
          float feather = smoothstep(coreR, uRadius, r_world);

          float aShape = 1.0 - feather;        // 1 у центрі → 0 на краю
          if (aShape < 0.001) discard;

          // premultiplied RGB
          vec3 srcRGB = uColor * uIntensity * aShape;
          gl_FragColor = vec4(srcRGB, aShape);
        }
      `,
    });

    const discGeo = new THREE.PlaneGeometry(1, 1);
    this.disc = new THREE.Mesh(discGeo, discMat);
    this.disc.renderOrder = 10000;

    // білбординг
    this.disc.onBeforeRender = (_r, _s, camera) => {
      this.disc.quaternion.copy(camera.quaternion);
    };

    this.sunGroup.add(this.disc);

    this.scene.add(this.sunGroup);
  }

  /** Задати товщину "пірʼячка" диска у світових одиницях (наприклад, 10). */
  setDiscBlur(widthWorld: number) {
    this.discUniforms.uBlur.value = Math.max(0, widthWorld);
  }

  render(_object: TSceneObject): THREE.Object3D { return new THREE.Group(); }
  update(_object: TSceneObject): void {}
  remove(_id: string): void {}
  getMeshById(_id: string): THREE.Object3D | null { return null; }

  updateSunState(state: SunLightState): void {
    // --- позиція з клемпом по мінімальній висоті ---
    const position = new THREE.Vector3(state.direction.x, state.direction.y, state.direction.z);
    const renderPosition = position.clone();

    const radius = renderPosition.length();
    if (radius > 0) {
      const horizontal = Math.sqrt(renderPosition.x * renderPosition.x + renderPosition.z * renderPosition.z);
      const altitude = Math.atan2(renderPosition.y, horizontal);
      const minAltitude = THREE.MathUtils.degToRad(-10);
      if (altitude < minAltitude) {
        const azimuth = Math.atan2(renderPosition.z, renderPosition.x);
        const clampedHorizontal = Math.cos(minAltitude) * radius;
        renderPosition.set(
          Math.cos(azimuth) * clampedHorizontal,
          Math.sin(minAltitude) * radius,
          Math.sin(azimuth) * clampedHorizontal,
        );
      }
    }

    this.sunGroup.position.copy(renderPosition);

    // -------- DISC (колір, інтенсивність, розмір) --------
    this.discUniforms.uColor.value.setRGB(state.sunColor.r, state.sunColor.g, state.sunColor.b);

    // ВАЖЛИВО: інтенсивність повинна бути > 0, інакше отримаєш чорний диск
    this.discUniforms.uIntensity.value = 1.0; // або (state.discIntensity ?? 1.0)

    // якщо хочеш fade-in/out — тоді ще множ аутпут через visibility у фрагментнику,
    // або тут тимчасово: this.discUniforms.uIntensity.value *= state.discOpacity;

    const discSize = state.discSize;
    this.disc.scale.setScalar(discSize);
    this.discUniforms.uRadius.value = discSize * 0.5;

    // -------- HALO --------
    const haloMaterial = this.halo.material as THREE.SpriteMaterial;
    haloMaterial.color.setRGB(state.haloColor.r, state.haloColor.g, state.haloColor.b);
    haloMaterial.opacity = THREE.MathUtils.clamp(state.haloIntensity, 0, 1);
    this.halo.scale.setScalar(state.haloSize);

    // видимість групи (залишив твій прапорець)
    this.sunGroup.visible = this.discUniforms.uOpacity.value > 0.01 || haloMaterial.opacity > 0.01;
  }

  dispose(): void {
    super.dispose();
    this.scene.remove(this.sunGroup);

    // halo
    this.haloTexture.dispose();
    (this.halo.material as THREE.Material).dispose();

    // disc
    this.disc.geometry.dispose();
    (this.disc.material as THREE.Material).dispose();
  }

  /** Залишив генератор для HALO; диск більше не використовує текстуру. */
  private createRadialTexture(coreStop: number, outerOpacity: number): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('SunRenderer: cannot acquire 2D context');
    }

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(coreStop, `rgba(255,255,255,${outerOpacity})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }
}
