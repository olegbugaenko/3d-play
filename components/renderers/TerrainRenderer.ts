import * as THREE from 'three';
import { TerrainManager } from '@scene/terrain-manager';
import { MAP_CONFIG } from '@systems/map';
import { TextureManager } from './TextureManager';

export class TerrainRenderer {
  private scene: THREE.Scene;
  private terrainMesh: THREE.Mesh | null = null;
  private terrainManager: TerrainManager;
  private textureManager: TextureManager;

  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;

  private lastRenderPosition: { x: number, z: number } | null = null;
  private rerenderThreshold = 50;

  // Фіксоване «вікно» навколо камери (можеш змінити як треба)
  private readonly viewDistance = 200;

  // Сегменти сітки (обчислюються з конфіга один раз)
  private segX = 0;
  private segY = 0;

  // Кеш списку текстур для блендів (щоб не перевизначати атрибути щоразу)
  private cachedTextureNames: string[] = [];

  constructor(scene: THREE.Scene, terrainManager: TerrainManager) {
    this.scene = scene;
    this.terrainManager = terrainManager;
    this.textureManager = new TextureManager();
  }

  /**
   * Рендер/перерендер террейну під камеру (без пересоздання геометрії).
   */
  async renderTerrain(cameraPosition?: { x: number, y: number, z: number }): Promise<THREE.Mesh> {
    // Чекаємо текстури
    if (!this.textureManager.isReady()) {
      await this.waitForTextures();
    }

    // Локальні зручності
    const config = this.terrainManager.getConfig();
    const renderResolution = MAP_CONFIG.terrain.renderResolution;

    // Вікно світу навколо камери
    const centerX = cameraPosition?.x ?? 0;
    const centerZ = cameraPosition?.z ?? 0;
    const startX  = Math.max(-config.width  / 2, centerX - this.viewDistance);
    const endX    = Math.min( config.width  / 2, centerX + this.viewDistance);
    const startZ  = Math.max(-config.height / 2, centerZ - this.viewDistance);
    const endZ    = Math.min( config.height / 2, centerZ + this.viewDistance);
    const viewW   = endX - startX;
    const viewH   = endZ - startZ;

    // Потрібна щільність сітки під це вікно (рахуємо раз — геометрія стала)
    if (!this.geometry) {
      this.segX = Math.max(1, Math.ceil((2 * this.viewDistance) / renderResolution));
      this.segY = Math.max(1, Math.ceil((2 * this.viewDistance) / renderResolution));

      // Стала площина 1×1, далі — scale під реальні розміри вікна
      this.geometry = new THREE.PlaneGeometry(1, 1, this.segX, this.segY);
      this.geometry.rotateX(-Math.PI / 2);

      // Матеріал для multi-texture blending (семпл за світовими XZ)
      this.material = this.createMultiTextureMaterial();

      this.terrainMesh = new THREE.Mesh(this.geometry, this.material);
      this.terrainMesh.matrixAutoUpdate = true;
      this.terrainMesh.castShadow = false;
      this.terrainMesh.receiveShadow = false;
      this.terrainMesh.frustumCulled = true;

      this.scene.add(this.terrainMesh);
    }

    // Пересуваємо та масштабуємо меш під актуальне вікно
    this.terrainMesh!.position.set(startX + viewW * 0.5, 0, startZ + viewH * 0.5);
    this.terrainMesh!.scale.set(viewW, 1, viewH);

    // Оновлюємо висоти вершин (семпл з карти висот у світових координатах)
    this.updateHeightsFromWorld(this.geometry!, this.terrainMesh!);

    // Оновлюємо бленди (також за світовими координатами)
    this.applyMultiTextureBlendingFromWorld(this.geometry!, this.terrainMesh!);

    // Норми (можна робити рідше або перейти на normal map у матеріалі)
    this.geometry!.computeVertexNormals();
    this.geometry!.computeBoundingBox();
    this.geometry!.computeBoundingSphere();

    // Оновлюємо "якорну" точку останнього рендеру
    if (cameraPosition) {
      this.lastRenderPosition = { x: cameraPosition.x, z: cameraPosition.z };
    }

    return this.terrainMesh!;
  }

  /**
   * Чи потрібно перерендерити.
   */
  shouldRerender(currentTarget: { x: number, z: number }): boolean {
    if (!this.lastRenderPosition) return true;
    const dx = currentTarget.x - this.lastRenderPosition.x;
    const dz = currentTarget.z - this.lastRenderPosition.z;
    return Math.hypot(dx, dz) > this.rerenderThreshold;
  }

  updateTerrain(cameraPosition?: { x: number, y: number, z: number }): void {
    if (this.terrainMesh && cameraPosition) {
      if (this.shouldRerender(cameraPosition)) {
        // НЕ створюємо нічого нового — просто оновлюємо положення/масштаб/висоти/бленди
        this.renderTerrain(cameraPosition);
      }
    }
  }

  removeTerrain(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
      this.terrainMesh = null;
      this.geometry = null;
      this.material = null;
      this.cachedTextureNames = [];
    }
  }

  getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMesh;
  }

  // === ВНУТРІШНЄ ===================================================================

  /**
   * Семплимо висоту у світових координатах (без пересоздання геометрії).
   * Локальні X/Z у площини 1×1 → світові через position/scale меша.
   */
  private updateHeightsFromWorld(geometry: THREE.PlaneGeometry, mesh: THREE.Mesh) {
    const pos = geometry.attributes.position as THREE.BufferAttribute;

    const sx = mesh.scale.x;
    const sz = mesh.scale.z;
    const cx = mesh.position.x;
    const cz = mesh.position.z;

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i); // локальні коорд. після rotateX — [-0.5..0.5]
      const lz = pos.getZ(i);

      const worldX = cx + lx * sx;
      const worldZ = cz + lz * sz;

      let y = this.terrainManager.getHeightAt(worldX, worldZ);
      if (!Number.isFinite(y)) y = 0;
      
      // Додаткова перевірка та обмеження висоти
      const config = this.terrainManager.getConfig();
      y = Math.max(config.minHeight, Math.min(config.maxHeight, y));
      
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  /**
   * Оновлення blend-атрибутів (1 атрибут на текстуру, оновлюємо масиви, а не перевизначаємо атрибути).
   */
  private applyMultiTextureBlendingFromWorld(geometry: THREE.PlaneGeometry, mesh: THREE.Mesh): void {
    const texturesCfg = MAP_CONFIG.terrain.textures || {};
    const textureNames = Object.keys(texturesCfg);

    if (textureNames.length === 0) return;

    // Якщо набір текстур змінився — пересоздаємо атрибути 1 раз
    let needRebuildAttributes = false;
    if (this.cachedTextureNames.length !== textureNames.length) needRebuildAttributes = true;
    else {
      for (let i = 0; i < textureNames.length; i++) {
        if (textureNames[i] !== this.cachedTextureNames[i]) { needRebuildAttributes = true; break; }
      }
    }

    if (needRebuildAttributes) {
      // Прибрали старі (якщо були інші назви)
      this.cachedTextureNames.forEach(name => {
        if (geometry.getAttribute(`blend_${name}`)) {
          geometry.deleteAttribute(`blend_${name}`);
        }
      });

      // Створили нові
      const count = (geometry.attributes.position as THREE.BufferAttribute).count;
      for (const name of textureNames) {
        geometry.setAttribute(`blend_${name}`, new THREE.BufferAttribute(new Float32Array(count), 1));
      }
      this.cachedTextureNames = textureNames.slice();
    }

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const sx = mesh.scale.x;
    const sz = mesh.scale.z;
    const cx = mesh.position.x;
    const cz = mesh.position.z;

    // Масиви для швидкого доступу
    const blendAttrs: Record<string, THREE.BufferAttribute> = {};
    for (const name of textureNames) {
      blendAttrs[name] = geometry.getAttribute(`blend_${name}`) as THREE.BufferAttribute;
    }

    // Запис блендів
    for (let i = 0; i < pos.count; i++) {
      const worldX = cx + pos.getX(i) * sx;
      const worldZ = cz + pos.getZ(i) * sz;

      const blends = this.terrainManager.getAllTextureBlends(worldX, worldZ);
      for (const name of textureNames) {
        const v = blends[name] || 0;
        blendAttrs[name].setX(i, v);
      }
    }

    for (const name of textureNames) {
      blendAttrs[name].needsUpdate = true;
    }
  }

  private async waitForTextures(): Promise<void> {
    while (!this.textureManager.isReady()) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  /**
   * Створює матеріал з world-locked UV: семпл за світовими XZ, wrap = Repeat.
   */
  private createMultiTextureMaterial(): THREE.ShaderMaterial {
    const textureNames = Object.keys(MAP_CONFIG.terrain.textures || {});
    const uniforms: { [key: string]: any } = {};

    // Текстури + тайлінги (wrap → Repeat)
    for (const name of textureNames) {
      const tex = this.textureManager.getTexture(name);
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        uniforms[`texture_${name}`] = { value: tex };
      }
      const tiling = (MAP_CONFIG.terrain.textures as any)[name]?.tiling;
      if (tiling) {
        // Інтерпретується як «повторів на 1 світову одиницю»
        uniforms[`tiling_${name}`] = { value: new THREE.Vector2(tiling.x, tiling.y) };
      } else {
        uniforms[`tiling_${name}`] = { value: new THREE.Vector2(1, 1) };
      }
    }

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: this.createVertexShader(textureNames),
      fragmentShader: this.createFragmentShader(textureNames),
      side: THREE.DoubleSide,
      transparent: false,
      depthTest: true,
      depthWrite: true
    });
  }

  /**
   * VS: передаємо бленди + worldXZ для world-locked UV.
   */
  private createVertexShader(textureNames: string[]): string {
    let attributes = '';
    let varyings = '';

    for (const name of textureNames) {
      attributes += `attribute float blend_${name};\n`;
      varyings   += `varying float v_blend_${name};\n`;
    }

    return `
      ${attributes}
      ${varyings}
      varying vec2 vWorldXZ;

      void main() {
        // Світові XZ (для world-locked UV)
        vec4 wpos = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wpos.xz;

        ${textureNames.map(name => `v_blend_${name} = blend_${name};`).join('\n')}

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
  }

  /**
   * FS: семпл текстур за світовими координатами (repeat), лінійний мікс за блендами.
   * tiling_* — «повторів на 1 світову одиницю» (тобто просто множимо на vWorldXZ).
   */
  private createFragmentShader(textureNames: string[]): string {
    let uniforms = '';
    let varyings = '';
    let body = `vec4 finalColor = vec4(0.0);\nfloat sumW = 0.0;\n`;

    for (const name of textureNames) {
      uniforms += `uniform sampler2D texture_${name};\n`;
      uniforms += `uniform vec2 tiling_${name};\n`;
      varyings += `varying float v_blend_${name};\n`;
    }

    for (const name of textureNames) {
      body += `
        {
          vec2 uv = vWorldXZ * tiling_${name};
          vec4 s  = texture2D(texture_${name}, uv);
          float w = max(0.0, v_blend_${name});
          finalColor += s * w;
          sumW += w;
        }
      `;
    }

    body += `
      if (sumW > 1e-5) finalColor /= sumW;
      gl_FragColor = finalColor;
    `;

    return `
      ${uniforms}
      ${varyings}
      varying vec2 vWorldXZ;

      void main(){
        ${body}
      }
    `;
  }

  // -------------------------
  // Очищення ресурсів (важливо для HMR!)
  // -------------------------
  public dispose(): void {
    // Очищаємо геометрію
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    
    // Очищаємо матеріал
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    
    // Очищаємо меш
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh = null;
    }
    
    // TextureManager очищається автоматично
  }
}
