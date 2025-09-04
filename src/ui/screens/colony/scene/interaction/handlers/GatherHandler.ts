import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';

export class GatherHandler extends InteractionHandler {
  private areaSelectionRenderer: AreaSelectionRenderer;
  private selectedCommand: any = null;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    areaSelectionRenderer: AreaSelectionRenderer
  ) {
    super(scene, camera, mapLogic);
    this.areaSelectionRenderer = areaSelectionRenderer;
  }

  onEnter(): void {
    console.log('Entered gather mode');
    // Показуємо кільце зони збору
    if (this.selectedCommand?.ui?.scope === 'gather') {
      const radius = 5; // Радіус з команд
      const color = this.selectedCommand.ui?.category === 'stone' ? '#8B4513' : 
                   this.selectedCommand.ui?.category === 'ore' ? '#696969' : '#00ff88';
      
      this.areaSelectionRenderer.show(radius, color);
    }
  }

  onExit(): void {
    console.log('Exited gather mode');
    // Приховуємо кільце зони збору
    this.areaSelectionRenderer.hide();
  }

  onMouseDown(event: MouseEvent): void {
    // В режимі збору обробляємо тільки праву кнопку миші
    if (event.button === 2) {
      this.handleRightClick(event);
    }
  }

  onMouseMove(event: MouseEvent): void {
    // Оновлюємо позицію кільця при руху миші
    if (this.selectedCommand?.ui?.scope === 'gather') {
      const raycaster = this.getRaycaster(event);
      this.areaSelectionRenderer.updatePosition(event.clientX, event.clientY, this.camera, raycaster);
    }
  }

  onMouseUp(_event: MouseEvent): void {
    // В режимі збору не обробляємо mouseup
  }

  onContextMenu(event: MouseEvent): void {
    // В режимі збору обробляємо правий клік так само як onMouseDown
    this.handleRightClick(event);
  }

  setSelectedCommand(command: any): void {
    this.selectedCommand = command;
  }

  private handleRightClick(event: MouseEvent): void {
    console.log('GatherHandler: Right click detected');
    const selected = this.mapLogic.selection.getSelectedObjects();
    if (!selected.length) {
      console.log('GatherHandler: No selected units');
      return;
    }

    console.log('GatherHandler: Selected units:', selected);
    console.log('GatherHandler: Selected command:', this.selectedCommand);

    const raycaster = this.getRaycaster(event);
    
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

    console.log('GatherHandler: Target point:', p);
    console.log('GatherHandler: Calling handleRightclickCommand with command:', this.selectedCommand);

    // Використовуємо новий оркестратор замість distributeTargetsForObjects
    this.mapLogic.handleRightclickCommand(selected, { x: p.x, y: p.y, z: p.z }, this.selectedCommand);
  }
}
