import * as THREE from 'three';

type HudSet = Set<THREE.Object3D>;

type HudUserData = {
  combinedHUD?: THREE.Object3D;
  __hudOwnerId?: string;
} & THREE.Object3D['userData'];

export class HudRegistry {
  private readonly scene: THREE.Scene;
  private readonly registry = new Map<string, HudSet>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public register(ownerId: string, anchor: THREE.Object3D, hud: THREE.Object3D): void {
    const set = this.ensureSet(ownerId);
    set.add(hud);

    if (hud.parent !== this.scene) {
      this.scene.add(hud);
    }

    const data = this.ensureUserData(anchor) as HudUserData;
    data.__hudOwnerId = ownerId;
    data.combinedHUD = hud;
  }

  public detachFromAnchor(anchor: THREE.Object3D): void {
    const data = anchor.userData as HudUserData | undefined;
    if (!data) return;

    const hud = data.combinedHUD;
    if (!hud) return;

    const ownerId = data.__hudOwnerId;
    this.detach(ownerId, hud);

    delete data.combinedHUD;
    if (ownerId) delete data.__hudOwnerId;
  }

  public detachAll(ownerId: string): void {
    const set = this.registry.get(ownerId);
    if (!set) return;

    for (const hud of Array.from(set)) {
      this.disposeHud(hud);
      set.delete(hud);
    }

    this.registry.delete(ownerId);
  }

  public detachFromObjectGraph(root: THREE.Object3D): void {
    root.traverse((node) => {
      this.detachFromAnchor(node);
    });
  }

  public dispose(): void {
    for (const ownerId of Array.from(this.registry.keys())) {
      this.detachAll(ownerId);
    }
    this.registry.clear();
  }

  private detach(ownerId: string | undefined, hud: THREE.Object3D): void {
    if (ownerId) {
      const set = this.registry.get(ownerId);
      if (set && set.delete(hud) && set.size === 0) {
        this.registry.delete(ownerId);
      }
    } else {
      this.detachBySearch(hud);
    }

    this.disposeHud(hud);
  }

  private detachBySearch(hud: THREE.Object3D): void {
    for (const [id, set] of this.registry.entries()) {
      if (set.delete(hud)) {
        if (set.size === 0) {
          this.registry.delete(id);
        }
        break;
      }
    }
  }

  private disposeHud(hud: THREE.Object3D): void {
    this.scene.remove(hud);
    hud.removeFromParent();

    hud.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        this.disposeMaterial(mesh.material);
      }
    });

    hud.clear();
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
    if (!material) return;

    if (Array.isArray(material)) {
      material.forEach((mat) => this.disposeMaterial(mat));
      return;
    }

    const mat = material as THREE.Material & { map?: THREE.Texture };
    if (mat.map) {
      mat.map.dispose?.();
    }

    mat.dispose?.();
  }

  private ensureSet(ownerId: string): HudSet {
    let set = this.registry.get(ownerId);
    if (!set) {
      set = new Set();
      this.registry.set(ownerId, set);
    }
    return set;
  }

  private ensureUserData(anchor: THREE.Object3D): THREE.Object3D['userData'] {
    if (!anchor.userData) {
      anchor.userData = {};
    }
    return anchor.userData;
  }
}
