import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';

export class CommandHandler extends InteractionHandler {
  private rendererManager: RendererManager;
  private selectedCommand: any = null;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    rendererManager: RendererManager
  ) {
    super(scene, camera, mapLogic);
    this.rendererManager = rendererManager;
  }

  onEnter(): void {
    console.log('Entered command mode');
  }

  onExit(): void {
    console.log('Exited command mode');
  }

  onMouseDown(event: MouseEvent): void {
    // В режимі команд обробляємо тільки праву кнопку миші
    if (event.button === 2) {
      this.handleRightClick(event);
    }
  }

  onMouseMove(_event: MouseEvent): void {
    // В режимі команд не обробляємо рух миші
  }

  onMouseUp(_event: MouseEvent): void {
    // В режимі команд не обробляємо mouseup
  }

  onContextMenu(event: MouseEvent): void {
    // В режимі команд обробляємо правий клік так само як onMouseDown
    this.handleRightClick(event);
  }

  setSelectedCommand(command: any): void {
    this.selectedCommand = command;
  }

  private handleRightClick(event: MouseEvent): void {
    const selected = this.mapLogic.selection.getSelectedObjects();
    if (!selected.length) return;

    const raycaster = this.getRaycaster(event);
    const all = Object.values<TSceneObject>(this.mapLogic.scene.getObjects());

    // Перевіряємо ресурси
    const clickedResource = all.find(o => {
      if (!o.tags?.includes('resource')) return false;
      const mesh = this.rendererManager.getMeshById(o.id);
      if (!mesh) return false;
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      );
      return raycaster.ray.intersectsSphere(sphere);
    });

    if (clickedResource) {
      this.mapLogic.mineResource(clickedResource.id, selected);
      return;
    }

    // Перевіряємо зарядку
    const clickedCharger = all.find(o => {
      if (!o.tags?.includes('charge')) return false;
      const mesh = this.rendererManager.getMeshById(o.id);
      if (!mesh) return false;
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      );
      return raycaster.ray.intersectsSphere(sphere);
    });

    if (clickedCharger) {
      this.mapLogic.chargeObject(selected);
      return;
    }

    // Точка на террейні
    const planeAtCam = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.camera.position.y);
    const p = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeAtCam, p);

    const tm = this.mapLogic.scene.getTerrainManager();
    if (tm) {
      const rayPoints: THREE.Vector3[] = [];
      const maxDist = 1000;
      const step = 10;
      for (let d = 0; d <= maxDist; d += step) {
        rayPoints.push(this.camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(d)));
      }
      let best = p.clone();
      let bestErr = Infinity;
      for (const v of rayPoints) {
        const th = tm.getHeightAt(v.x, v.z);
        if (th === undefined) continue;
        const err = Math.abs(v.y - th);
        if (err < bestErr) { bestErr = err; best.set(v.x, th, v.z); }
      }
      p.copy(best);
    }

    // Використовуємо новий оркестратор замість distributeTargetsForObjects
    this.mapLogic.handleRightclickCommand(selected, { x: p.x, y: p.y, z: p.z }, this.selectedCommand);
  }
}
