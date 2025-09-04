import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';

export class BuildingHandler extends InteractionHandler {
  private buildingPreview: BuildingPreview;
  private selectedBuildingData: any = null;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    buildingPreview: BuildingPreview
  ) {
    super(scene, camera, mapLogic);
    this.buildingPreview = buildingPreview;
  }

  onEnter(): void {
    console.log('Entered building mode');
    // Показуємо превью будівлі в початковій позиції
    if (this.selectedBuildingData) {
      this.buildingPreview.show(
        { x: 0, y: 0, z: 0 }, // Початкова позиція, буде оновлена при руху миші
        this.selectedBuildingData
      );
    }
  }

  onExit(): void {
    console.log('Exited building mode');
    // Приховуємо превью будівлі
    this.buildingPreview.hide();
  }

  onMouseDown(event: MouseEvent): void {
    // В режимі будівництва обробляємо тільки ліву кнопку миші
    if (event.button === 0 && this.selectedBuildingData) {
      this.handleLeftClick(event);
    }
  }

  onMouseMove(event: MouseEvent): void {
    // Оновлюємо позицію превью будівлі при руху миші
    if (this.selectedBuildingData) {
      const raycaster = this.getRaycaster(event);
      const tm = this.mapLogic.scene.getTerrainManager();
      
      if (tm) {
        // Рейкастимо з камери до террейну
        const planeAtCam = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.camera.position.y);
        const intersectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(planeAtCam, intersectionPoint);

        // Знаходимо найкращу точку на террейні
        const rayPoints: THREE.Vector3[] = [];
        const maxDist = 1000;
        const step = 10;
        for (let d = 0; d <= maxDist; d += step) {
          rayPoints.push(this.camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(d)));
        }
        
        let bestPoint = intersectionPoint.clone();
        let bestError = Infinity;
        for (const point of rayPoints) {
          const height = tm.getHeightAt(point.x, point.z);
          if (height !== undefined) {
            const error = Math.abs(point.y - height);
            if (error < bestError) {
              bestError = error;
              bestPoint.set(point.x, height, point.z);
            }
          }
        }

        // Оновлюємо позицію превью
        this.buildingPreview.updatePosition({
          x: bestPoint.x,
          y: bestPoint.y,
          z: bestPoint.z
        });
      }
    }
  }

  onMouseUp(_event: MouseEvent): void {
    // В режимі будівництва не обробляємо mouseup
  }

  onContextMenu(event: MouseEvent): void {
    // В режимі будівництва правий клік скасовує режим
    console.log('Right click in building mode - canceling');
    // TODO: Повернутися до режиму вибору
  }

  setSelectedBuilding(buildingData: any): void {
    this.selectedBuildingData = buildingData;
  }

  private handleLeftClick(event: MouseEvent): void {
    const raycaster = this.getRaycaster(event);
    const tm = this.mapLogic.scene.getTerrainManager();
    
    if (tm) {
      // Рейкастимо з камери до террейну
      const planeAtCam = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.camera.position.y);
      const intersectionPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeAtCam, intersectionPoint);

      // Знаходимо найкращу точку на террейні
      const rayPoints: THREE.Vector3[] = [];
      const maxDist = 1000;
      const step = 10;
      for (let d = 0; d <= maxDist; d += step) {
        rayPoints.push(this.camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(d)));
      }
      
      let bestPoint = intersectionPoint.clone();
      let bestError = Infinity;
      for (const point of rayPoints) {
        const height = tm.getHeightAt(point.x, point.z);
        if (height !== undefined) {
          const error = Math.abs(point.y - height);
          if (error < bestError) {
            bestError = error;
            bestPoint.set(point.x, height, point.z);
          }
        }
      }

      // Розміщуємо будівлю
      this.placeBuilding(bestPoint);
    }
  }

  private placeBuilding(position: THREE.Vector3): void {
    // Тут буде логіка розміщення будівлі
    console.log(`Placing building at ${position.x}, ${position.y}, ${position.z}`);
    
    // TODO: Викликати логіку будівництва з mapLogic
    // this.mapLogic.placeBuilding(this.selectedBuildingData, position);
    
    // Скидаємо вибір будівлі після розміщення
    this.selectedBuildingData = null;
    this.buildingPreview.hide();
  }
}
