import * as THREE from 'three';

/**
 * Превью для відображення планованих доріг у режимі будівництва
 */
export class RoadPreview {
  private scene: THREE.Scene;
  private roadGroup: THREE.Group | null = null;
  private isVisible: boolean = false;
  private currentPath: THREE.Vector3[] = [];
  private roadWidth: number = 1.0;
  private roadColor: string = '#8B4513';
  private roadTypeId: string = 'basic_road'; // тип дороги для перевірки колізій
  private terrainManager: any = null; // додаємо доступ до террейну
  private buildingsManager: any = null; // додаємо доступ до BuildingsManager для перевірки колізій

  // Матеріали для превью
  private previewMaterial: THREE.MeshBasicMaterial;
  private activeMaterial: THREE.MeshBasicMaterial; // для поточного сегмента що тягнеться
  private invalidMaterial: THREE.MeshBasicMaterial; // для невалідного розміщення

  constructor(scene: THREE.Scene, terrainManager?: any, buildingsManager?: any) {
    this.scene = scene;
    this.terrainManager = terrainManager;
    this.buildingsManager = buildingsManager;
    
    // Створюємо матеріали для превью
    this.previewMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.roadColor),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });

    this.activeMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFD700'), // золотистий для активного сегмента
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    this.invalidMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF4444'), // червоний для невалідного розміщення
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
  }

  /**
   * Показати превью дороги від стартової точки до поточної позиції миші
   */
  public showFromPoint(startPoint: THREE.Vector3, currentPoint: THREE.Vector3, roadData: any): void {
    this.updateRoadData(roadData);
    this.currentPath = [startPoint.clone(), currentPoint.clone()];
    this.updatePreview();
  }

  /**
   * Показати стартову точку дороги (коли ще немає жодних сегментів)
   */
  public showStartPoint(startPoint: THREE.Vector3, roadData: any): void {
    this.updateRoadData(roadData);
    this.currentPath = [startPoint.clone()];
    this.updatePreview();
  }

  /**
   * Показати превью всього шляху дороги
   */
  public showPath(path: THREE.Vector3[], roadData: any): void {
    this.updateRoadData(roadData);
    this.currentPath = path.map(p => p.clone());
    this.updatePreview();
  }

  /**
   * Оновити кінцеву точку поточного сегмента (при перетягуванні)
   */
  public updateEndPoint(endPoint: THREE.Vector3): void {
    if (this.currentPath.length >= 1) {
      // Оновлюємо останню точку або додаємо нову
      if (this.currentPath.length === 1) {
        this.currentPath.push(endPoint.clone());
      } else {
        this.currentPath[this.currentPath.length - 1] = endPoint.clone();
      }
      this.updatePreview();
    }
  }

  /**
   * Оновити кінцеву точку для конкретного шляху (при перетягуванні)
   */
  public updateEndPointForPath(path: THREE.Vector3[], endPoint: THREE.Vector3): void {
    if (path.length >= 1) {
      // Створюємо копію шляху з оновленою останньою точкою
      const updatedPath = [...path];
      if (updatedPath.length === 1) {
        updatedPath.push(endPoint.clone());
      } else {
        updatedPath[updatedPath.length - 1] = endPoint.clone();
      }
      
      // Оновлюємо currentPath і перерендеримо
      this.currentPath = updatedPath;
      this.updatePreview();
    }
  }

  /**
   * Приховати превью
   */
  public hide(): void {
    if (this.roadGroup) {
      this.scene.remove(this.roadGroup);
      this.roadGroup = null;
    }
    this.isVisible = false;
    this.currentPath = [];
  }

  /**
   * Чи показано превью
   */
  public isShown(): boolean {
    return this.isVisible;
  }

  /**
   * Очистити ресурси
   */
  public dispose(): void {
    this.hide();
    this.previewMaterial.dispose();
    this.activeMaterial.dispose();
  }

  // ──────────────────────────────
  //        Приватні методи
  // ──────────────────────────────

  private updateRoadData(roadData: any): void {
    if (roadData) {
      this.roadWidth = roadData.width || 1.0;
      this.roadColor = roadData.ui?.color || '#8B4513';
      this.roadTypeId = roadData.id || 'basic_road'; // встановлюємо тип дороги
      
      // Оновлюємо колір матеріалу
      this.previewMaterial.color.setStyle(this.roadColor);
    }
  }

  private updatePreview(): void {
    // Видаляємо попередній превью
    if (this.roadGroup) {
      this.scene.remove(this.roadGroup);
    }

    // Створюємо новий превью
    if (this.currentPath.length >= 1) {
      this.roadGroup = this.createRoadMesh();
      this.scene.add(this.roadGroup);
      this.isVisible = true;
    } else {
      this.isVisible = false;
    }
  }

  private createRoadMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'RoadPreview';

    // СПЕЦІАЛЬНИЙ ВИПАДОК: якщо тільки одна точка (стартова) - показуємо квадратик
    if (this.currentPath.length === 1) {
      const startPoint = this.currentPath[0];
      const startPointMesh = this.createStartPointMesh(startPoint);
      group.add(startPointMesh);
      return group;
    }

    // Використовуємо ТУ Ж САМУ логіку як в BuildingsManager!
    const adaptedSegments = this.adaptPathToTerrain(this.currentPath, this.roadWidth);

    // Перевіряємо чи можна побудувати дорогу
    const canBuild = this.canBuildRoad();

    // Створюємо меш для кожного адаптованого сегмента
    for (let i = 0; i < adaptedSegments.length; i++) {
      const segment = adaptedSegments[i];
      const isActive = i === adaptedSegments.length - 1; // останній сегмент активний
      
      const segmentMesh = this.createSegmentMesh(segment, isActive, canBuild);
      group.add(segmentMesh);
    }

    return group;
  }

  /**
   * Створює меш для стартової точки дороги (квадратик)
   */
  private createStartPointMesh(point: THREE.Vector3): THREE.Mesh {
    // Створюємо квадратну геометрію
    const geometry = new THREE.PlaneGeometry(this.roadWidth, this.roadWidth);
    
    // Отримуємо висоту з террейну
    let y = point.y;
    if (this.terrainManager) {
      y = this.terrainManager.getHeightAt(point.x, point.z) + 0.01;
    }
    
    // Створюємо меш
    const mesh = new THREE.Mesh(geometry, this.previewMaterial);
    mesh.position.set(point.x, y, point.z);
    mesh.rotation.x = -Math.PI / 2; // горизонтально
    mesh.name = 'StartPoint';
    
    return mesh;
  }

  /**
   * Перевіряє чи можна побудувати дорогу по поточному шляху
   */
  private canBuildRoad(): boolean {
    if (!this.buildingsManager || this.currentPath.length < 2) {
      return true; // якщо немає BuildingsManager, дозволяємо
    }

    // Конвертуємо THREE.Vector3 в простий формат для BuildingsManager
    const simplePath = this.currentPath.map(p => ({ x: p.x, y: p.y, z: p.z }));
    
    // Використовуємо метод з BuildingsManager
    return this.buildingsManager.canBuildRoadAt(simplePath, this.roadTypeId);
  }

  /**
   * Адаптує шлях до террейну - КОПІЯ логіки з BuildingsManager.adaptRoadToTerrain()
   */
  private adaptPathToTerrain(path: THREE.Vector3[], width: number): Array<{
    startLeft: THREE.Vector3;
    startRight: THREE.Vector3;
    endLeft: THREE.Vector3;
    endRight: THREE.Vector3;
    width: number;
  }> {
    if (path.length < 2) return [];

    // Конвертуємо THREE.Vector3 в простий формат
    const simplePath = path.map(p => ({ x: p.x, y: p.y, z: p.z }));
    
    // Дробимо на короткі сегменти
    const subdividedPath = this.subdivideRoadPath(simplePath, 1.0); // ЗБІЛЬШЕНО: 1м замість 0.5м
    
    const result = [];
    const halfWidth = width / 2;
    let prevEndLeft: THREE.Vector3 | null = null;
    let prevEndRight: THREE.Vector3 | null = null;
    
    for (let i = 1; i < subdividedPath.length; i++) {
      const start = subdividedPath[i - 1];
      const end = subdividedPath[i];
      
      // Обчислюємо направляючий вектор
      const dirX = end.x - start.x;
      const dirZ = end.z - start.z;
      const length = Math.hypot(dirX, dirZ);
      
      if (length === 0) continue;
      
      // Нормалізуємо
      const normDirX = dirX / length;
      const normDirZ = dirZ / length;
      
      // Перпендикулярний вектор (поворот на 90°)
      const rightX = -normDirZ;
      const rightZ = normDirX;
      
      let startLeft: THREE.Vector3;
      let startRight: THREE.Vector3;
      
      // КЛЮЧОВЕ: зшивання з попереднім сегментом
      if (prevEndLeft && prevEndRight) {
        startLeft = prevEndLeft;
        startRight = prevEndRight;
      } else {
        // Для першого сегменту обчислюємо початкові точки
        const startLeftX = start.x + rightX * halfWidth;
        const startLeftZ = start.z + rightZ * halfWidth;
        const startRightX = start.x - rightX * halfWidth;
        const startRightZ = start.z - rightZ * halfWidth;
        
        let startLeftY, startRightY;
        if (this.terrainManager) {
          startLeftY = this.terrainManager.getHeightAt(startLeftX, startLeftZ) + 0.01;
          startRightY = this.terrainManager.getHeightAt(startRightX, startRightZ) + 0.01;
        } else {
          const baseHeight = start.y + 0.05;
          startLeftY = startRightY = baseHeight;
        }
        
        startLeft = new THREE.Vector3(startLeftX, startLeftY, startLeftZ);
        startRight = new THREE.Vector3(startRightX, startRightY, startRightZ);
      }
      
      // Обчислюємо кінцеві точки поточного сегменту
      const endLeftX = end.x + rightX * halfWidth;
      const endLeftZ = end.z + rightZ * halfWidth;
      const endRightX = end.x - rightX * halfWidth;
      const endRightZ = end.z - rightZ * halfWidth;
      
      let endLeftY, endRightY;
      if (this.terrainManager) {
        endLeftY = this.terrainManager.getHeightAt(endLeftX, endLeftZ) + 0.01;
        endRightY = this.terrainManager.getHeightAt(endRightX, endRightZ) + 0.01;
      } else {
        const baseHeight = end.y + 0.05;
        endLeftY = endRightY = baseHeight;
      }
      
      const endLeft = new THREE.Vector3(endLeftX, endLeftY, endLeftZ);
      const endRight = new THREE.Vector3(endRightX, endRightY, endRightZ);
      
      result.push({
        startLeft,
        startRight,
        endLeft,
        endRight,
        width
      });
      
      // Зберігаємо кінцеві точки для зшивання з наступним сегментом
      prevEndLeft = endLeft;
      prevEndRight = endRight;
    }

    return result;
  }

  /**
   * Дробить шлях на короткі сегменти - КОПІЯ з BuildingsManager
   */
  private subdivideRoadPath(
    points: Array<{x: number, y: number, z: number}>, 
    maxLength: number
  ): Array<{x: number, y: number, z: number}> {
    const result = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      
      const distance = Math.hypot(end.x - start.x, end.z - start.z);
      
      if (distance <= maxLength) {
        result.push(end);
      } else {
        const numSegments = Math.ceil(distance / maxLength);
        
        for (let j = 1; j <= numSegments; j++) {
          const t = j / numSegments;
          const point = {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
            z: start.z + (end.z - start.z) * t
          };
          result.push(point);
        }
      }
    }
    
    return result;
  }

  private createSegmentMesh(segment: {
    startLeft: THREE.Vector3;
    startRight: THREE.Vector3;
    endLeft: THREE.Vector3;
    endRight: THREE.Vector3;
    width: number;
  }, isActive: boolean = false, canBuild: boolean = true): THREE.Mesh {
    // Використовуємо ТУ Ж САМУ логіку як в RoadRenderer!
    const geometry = new THREE.BufferGeometry();
    
    // 4 вершини: startLeft, startRight, endLeft, endRight
    const vertices = new Float32Array([
      segment.startLeft.x, segment.startLeft.y, segment.startLeft.z,    // 0
      segment.startRight.x, segment.startRight.y, segment.startRight.z, // 1
      segment.endLeft.x, segment.endLeft.y, segment.endLeft.z,          // 2
      segment.endRight.x, segment.endRight.y, segment.endRight.z        // 3
    ]);
    
    // Індекси для двох трикутників (0-1-2, 1-3-2)
    const indices = new Uint16Array([
      0, 1, 2,  // перший трикутник
      1, 3, 2   // другий трикутник
    ]);
    
    // UV координати
    const uvs = new Float32Array([
      0, 0,  // startLeft
      1, 0,  // startRight  
      0, 1,  // endLeft
      1, 1   // endRight
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    
    // Вибираємо матеріал залежно від стану
    let material: THREE.MeshBasicMaterial;
    if (!canBuild) {
      material = this.invalidMaterial; // червоний для невалідного розміщення
    } else if (isActive) {
      material = this.activeMaterial; // золотистий для активного сегмента
    } else {
      material = this.previewMaterial; // звичайний коричневий
    }
    
    return new THREE.Mesh(geometry, material);
  }
}
