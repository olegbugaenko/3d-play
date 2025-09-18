import * as THREE from 'three';
import { BaseRenderer } from './BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';

interface RoadSegment {
  startLeft: THREE.Vector3;
  startRight: THREE.Vector3;
  endLeft: THREE.Vector3;
  endRight: THREE.Vector3;
  width: number;
}

export class RoadRenderer extends BaseRenderer {
  private roadMaterial: THREE.Material;
  private roadSegments: Map<string, RoadSegment[]> = new Map();

  constructor(scene: THREE.Scene) {
    super(scene);
    this.roadMaterial = this.createRoadMaterial();
  }

  private createRoadMaterial(): THREE.Material {
    // Поки що простий матеріал з коричневим кольором
    // Пізніше замінимо на текстуру
    return new THREE.MeshLambertMaterial({
      color: 0x8B4513, // коричневий колір
      transparent: false,
      side: THREE.DoubleSide
    });
  }

  render(object: TSceneObject): THREE.Object3D {
    // console.log('RoadRender: ', object);
    // Перевіряємо чи це дорога
    if (!object.data?.roadSegments || !Array.isArray(object.data.roadSegments)) {
      console.warn(`RoadRenderer: object ${object.id} doesn't have road segments data`);
      return new THREE.Object3D();
    }

    const roadGroup = new THREE.Group();
    roadGroup.name = `road-${object.id}`;

    // Конвертуємо дані сегментів у формат RoadSegment
    const rawSegments = object.data.roadSegments;
    const segments: RoadSegment[] = rawSegments.map((seg: any) => ({
      startLeft: new THREE.Vector3(seg.startLeft.x, seg.startLeft.y, seg.startLeft.z),
      startRight: new THREE.Vector3(seg.startRight.x, seg.startRight.y, seg.startRight.z),
      endLeft: new THREE.Vector3(seg.endLeft.x, seg.endLeft.y, seg.endLeft.z),
      endRight: new THREE.Vector3(seg.endRight.x, seg.endRight.y, seg.endRight.z),
      width: seg.width
    }));
    
    this.roadSegments.set(object.id, segments);

    // Створюємо геометрію для кожного сегменту
    segments.forEach((segment, index) => {
      const segmentMesh = this.createSegmentMesh(segment, `${object.id}_segment_${index}`);
      roadGroup.add(segmentMesh);
    });

    // Позиція групи залишається 0,0,0 оскільки кожен сегмент має власні координати
    roadGroup.position.set(0, 0, 0);

    this.addMesh(object.id, roadGroup);
    return roadGroup;
  }

  private createSegmentMesh(segment: RoadSegment, name: string): THREE.Mesh {
    const { startLeft, startRight, endLeft, endRight } = segment;
    
    // Створюємо геометрію з 4 вершин
    const geometry = new THREE.BufferGeometry();
    
    // Визначаємо вершини (порядок важливий для правильних нормалей)
    const vertices = new Float32Array([
      // Трикутник 1: startLeft -> startRight -> endLeft
      startLeft.x, startLeft.y, startLeft.z,
      startRight.x, startRight.y, startRight.z,
      endLeft.x, endLeft.y, endLeft.z,
      
      // Трикутник 2: startRight -> endRight -> endLeft
      startRight.x, startRight.y, startRight.z,
      endRight.x, endRight.y, endRight.z,
      endLeft.x, endLeft.y, endLeft.z,
    ]);
    
    // Текстурні координати
    const uvs = new Float32Array([
      // Трикутник 1
      0.0, 0.0,   // startLeft
      1.0, 0.0,   // startRight
      0.0, 1.0,   // endLeft
      
      // Трикутник 2
      1.0, 0.0,   // startRight
      1.0, 1.0,   // endRight
      0.0, 1.0,   // endLeft
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    // Автоматично обчислюємо нормалі
    geometry.computeVertexNormals();
    
    // Створюємо меш
    const mesh = new THREE.Mesh(geometry, this.roadMaterial);
    mesh.name = name;
    
    return mesh;
  }


  update(object: TSceneObject): void {
    // Базове оновлення позиції від BaseRenderer
    super.update(object);
    
    // Додаткова логіка оновлення дороги якщо потрібно
    const roadGroup = this.meshes.get(object.id);
    if (roadGroup && object.data?.roadSegments) {
      // Якщо сегменти змінилися - перебудовуємо дорогу
      const currentSegments = this.roadSegments.get(object.id);
      const newSegments = object.data.roadSegments;
      
      if (!this.segmentsEqual(currentSegments, newSegments)) {
        this.remove(object.id);
        this.render(object);
      }
    }
  }

  private segmentsEqual(segments1?: RoadSegment[], segments2?: RoadSegment[]): boolean {
    if (!segments1 || !segments2) return false;
    if (segments1.length !== segments2.length) return false;
    
    return segments1.every((seg1, index) => {
      const seg2 = segments2[index];
      return seg1.startLeft.equals(seg2.startLeft) && 
             seg1.startRight.equals(seg2.startRight) &&
             seg1.endLeft.equals(seg2.endLeft) && 
             seg1.endRight.equals(seg2.endRight) && 
             seg1.width === seg2.width;
    });
  }

  /**
   * Видаляє дорогу за ID
   */
  public removeRoad(roadId: string): void {
    this.remove(roadId);
    this.roadSegments.delete(roadId);
  }

  /**
   * Очищає всі дороги
   */
  public clearAllRoads(): void {
    for (const roadId of this.roadSegments.keys()) {
      this.remove(roadId);
    }
    this.roadSegments.clear();
  }

  public dispose(): void {
    super.dispose();
    this.roadSegments.clear();
    
    // Очищаємо матеріал
    if (this.roadMaterial) {
      this.roadMaterial.dispose();
    }
  }
}
