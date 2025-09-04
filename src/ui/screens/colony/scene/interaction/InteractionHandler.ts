import * as THREE from 'three';

export type InteractionMode = 'selection' | 'command' | 'building' | 'gather';

export abstract class InteractionHandler {
  protected scene: THREE.Scene;
  protected camera: THREE.Camera;
  protected mapLogic: any;
  protected emit?: (event: string, data?: any) => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera, mapLogic: any, emit?: (event: string, data?: any) => void) {
    this.scene = scene;
    this.camera = camera;
    this.mapLogic = mapLogic;
    this.emit = emit;
  }

  abstract onMouseDown(event: MouseEvent): void;
  abstract onMouseMove(event: MouseEvent): void;
  abstract onMouseUp(event: MouseEvent): void;
  abstract onContextMenu(event: MouseEvent): void;
  abstract onEnter(): void;
  abstract onExit(): void;

  protected getRaycaster(event: MouseEvent): THREE.Raycaster {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    return raycaster;
  }

  dispose(): void {
    // Override if needed
  }
}
