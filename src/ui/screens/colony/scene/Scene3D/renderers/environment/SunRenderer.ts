import * as THREE from 'three';
import { BaseRenderer } from '../BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { SunLightState } from '@logic/systems/environment/environment.types';

export class SunRenderer extends BaseRenderer {
  private sunGroup: THREE.Group;
  private disc: THREE.Sprite;
  private halo: THREE.Sprite;
  private discTexture: THREE.Texture;
  private haloTexture: THREE.Texture;

  constructor(scene: THREE.Scene) {
    super(scene);

    this.discTexture = this.createRadialTexture(0.45, 0.05);
    this.haloTexture = this.createRadialTexture(0.12, 0.0);

    this.sunGroup = new THREE.Group();
    this.sunGroup.name = 'SunVisual';
    this.sunGroup.renderOrder = 9999;

    const haloMaterial = new THREE.SpriteMaterial({
      map: this.haloTexture,
      color: new THREE.Color(1, 0.9, 0.7),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.halo = new THREE.Sprite(haloMaterial);
    this.halo.renderOrder = 9998;
    this.sunGroup.add(this.halo);

    const discMaterial = new THREE.SpriteMaterial({
      map: this.discTexture,
      color: new THREE.Color(1, 1, 1),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.disc = new THREE.Sprite(discMaterial);
    this.disc.renderOrder = 10000;
    this.sunGroup.add(this.disc);

    this.scene.add(this.sunGroup);
  }

  render(_object: TSceneObject): THREE.Object3D {
    return new THREE.Group();
  }

  update(_object: TSceneObject): void {}
  remove(_id: string): void {}
  getMeshById(_id: string): THREE.Object3D | null { return null; }

  updateSunState(state: SunLightState): void {
    const position = new THREE.Vector3(state.direction.x, state.direction.y, state.direction.z);
    const renderPosition = position.clone();
    if (renderPosition.y < 0) {
      renderPosition.y = 0;
    }
    this.sunGroup.position.copy(renderPosition);

    const discMaterial = this.disc.material as THREE.SpriteMaterial;
    discMaterial.color.setRGB(state.sunColor.r, state.sunColor.g, state.sunColor.b);
    const discOpacity = THREE.MathUtils.clamp(state.discOpacity, 0, 1);
    discMaterial.opacity = discOpacity;

    const haloMaterial = this.halo.material as THREE.SpriteMaterial;
    haloMaterial.color.setRGB(state.haloColor.r, state.haloColor.g, state.haloColor.b);
    const haloOpacity = THREE.MathUtils.clamp(state.haloIntensity, 0, 1);
    haloMaterial.opacity = haloOpacity;

    this.disc.scale.setScalar(state.discSize);
    this.halo.scale.setScalar(state.haloSize);

    this.sunGroup.visible = discOpacity > 0.01 || haloOpacity > 0.01;
  }

  dispose(): void {
    super.dispose();
    this.scene.remove(this.sunGroup);
    this.discTexture.dispose();
    this.haloTexture.dispose();
    (this.disc.material as THREE.Material).dispose();
    (this.halo.material as THREE.Material).dispose();
  }

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
