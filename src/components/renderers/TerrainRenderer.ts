import * as THREE from 'three';
import { TerrainManager } from '../../../logic/scene/terrain-manager';
import { MAP_CONFIG } from '../../../logic/map/map-config';
import { TextureManager } from './TextureManager';

export class TerrainRenderer {
    private scene: THREE.Scene;
    private terrainMesh: THREE.Mesh | null = null;
    private terrainManager: TerrainManager;
    private textureManager: TextureManager;
    private lastRenderPosition: { x: number, z: number } | null = null;
    private rerenderThreshold = 50; // Відстань для перерендерингу (збільшуємо для кращої продуктивності)

    constructor(scene: THREE.Scene, terrainManager: TerrainManager) {
        this.scene = scene;
        this.terrainManager = terrainManager;
        this.textureManager = new TextureManager();
    }

    /**
     * Рендерить terrain для заданої позиції камери
     */
    async renderTerrain(cameraPosition?: { x: number, y: number, z: number }): Promise<THREE.Mesh> {
        console.log('renderTerrain: START'); // Додаємо логування
        
        // Перевіряємо чи потрібно перерендерювати
        if (this.terrainMesh && cameraPosition && this.lastRenderPosition) {
            const distance = Math.sqrt(
                Math.pow(cameraPosition.x - this.lastRenderPosition.x, 2) + 
                Math.pow(cameraPosition.z - this.lastRenderPosition.z, 2)
            );
            
            // Якщо камера не значно змінила позицію - використовуємо існуючий mesh
            if (distance < this.rerenderThreshold) {
                console.log('TerrainRenderer: Using cached terrain, distance:', distance);
                return this.terrainMesh;
            }
        }
        
        // Примусово видаляємо старий mesh
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh = null;
        }

        // Дочекатися завантаження текстур перед рендерингом
        if (!this.textureManager.isReady()) {
            console.log('TerrainRenderer: Waiting for textures to load...');
            await this.waitForTextures();
            console.log('TerrainRenderer: Textures loaded, proceeding with render');
        }

        const config = this.terrainManager.getConfig();
        const { width, height } = config;
        
        // Render resolution - більший для візуальної якості
        const renderResolution = MAP_CONFIG.terrain.renderResolution; // Рендеримо з конфігурації
        
        // Визначаємо область для рендерингу (навколо камери)
        const viewDistance = 200; // Зменшуємо ще більше для тестування продуктивності
        const centerX = cameraPosition?.x || 0;
        const centerZ = cameraPosition?.z || 0;
        
        // Обмежуємо область рендерингу
        const startX = Math.max(-width/2, centerX - viewDistance);
        const endX = Math.min(width/2, centerX + viewDistance);
        const startZ = Math.max(-height/2, centerZ - viewDistance);
        const endZ = Math.min(height/2, centerZ + viewDistance);
        
        // Розміри рендерованої області
        const renderWidth = endX - startX;
        const renderHeight = endZ - startZ;
        
        // Кількість сегментів для рендерингу з LOD
        let segmentsX = Math.max(1, Math.ceil(renderWidth / renderResolution));
        let segmentsY = Math.max(1, Math.ceil(renderHeight / renderResolution));
        
        // LOD: зменшуємо деталізацію для далеких областей
        const cameraDistance = cameraPosition ? Math.sqrt(cameraPosition.x * cameraPosition.x + cameraPosition.z * cameraPosition.z) : 0;
        if (cameraDistance > 50) {
            segmentsX = Math.max(1, Math.floor(segmentsX / 2));
            segmentsY = Math.max(1, Math.floor(segmentsY / 2));
        }
        
        console.log('TerrainRenderer: Rendering area:', { 
            startX, endX, startZ, endZ, 
            renderWidth, renderHeight, 
            segmentsX, segmentsY,
            centerX, centerZ, viewDistance,
            cameraPosition
        });
        
        // Створюємо geometry тільки для видимої області
        const geometry = new THREE.PlaneGeometry(renderWidth, renderHeight, segmentsX, segmentsY);
        
        // Переміщуємо geometry в правильну позицію
        // geometry.translate(startX + renderWidth/2, 0, startZ + renderHeight/2);
        geometry.rotateX(-Math.PI / 2);

        const pos = geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
            // Отримуємо координати вершини в локальній системі geometry
            const localX = pos.getX(i);
            const localZ = pos.getZ(i);
            
            // Конвертуємо в глобальні координати для getHeightAt
            // Віднімаємо зміщення geometry щоб отримати реальні координати
            const worldX = localX + (startX + renderWidth/2);
            const worldZ = localZ + (startZ + renderHeight/2);
            
            let y = this.terrainManager.getHeightAt(worldX, worldZ);
            if (!Number.isFinite(y)) y = 0;
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Тимчасово використовуємо простий матеріал для тестування
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x8B4513,  // Коричневий колір
            side: THREE.DoubleSide 
        });
        
        // Створюємо новий mesh з новим матеріалом
        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.frustumCulled = false;
        
        // Позиціонуємо mesh
        this.terrainMesh.position.set(
            startX + renderWidth / 2,
            0,
            startZ + renderHeight / 2
        );
        
        this.scene.add(this.terrainMesh);
        
        // Застосовуємо procedural текстури до кожної вершини
        this.applyMultiTextureBlending(geometry, startX, startZ, renderWidth, renderHeight);
        
        // Переміщуємо mesh в правильну позицію
        this.terrainMesh.position.set(startX + renderWidth/2, 0, startZ + renderHeight/2);
        
        // Відключаємо frustum culling повністю
        this.terrainMesh.frustumCulled = false;
        
        // Налаштовуємо тіні
        // TEMPORARILY DISABLED SHADOWS FOR FPS TESTING
        this.terrainMesh.castShadow = false; // Terrain не кидає тіні
        this.terrainMesh.receiveShadow = false; // Terrain не приймає тіні
        
        console.log('TerrainRenderer: Mesh positioned at:', {
            x: this.terrainMesh.position.x,
            y: this.terrainMesh.position.y,
            z: this.terrainMesh.position.z
        });
        
        console.log('TerrainRenderer: Geometry bounds:', {
            startX, endX, startZ, endZ,
            renderWidth, renderHeight,
            centerX: startX + renderWidth/2,
            centerZ: startZ + renderHeight/2
        });
        
        // Додаємо логування позиції
        console.log('TerrainRenderer: Mesh position:', this.terrainMesh.position);
        console.log('TerrainRenderer: Mesh rotation:', this.terrainMesh.rotation);
        console.log('TerrainRenderer: Mesh scale:', this.terrainMesh.scale);
        console.log('TerrainRenderer: Mesh visible:', this.terrainMesh.visible);
        console.log('TerrainRenderer: Mesh frustumCulled:', this.terrainMesh.frustumCulled);

        this.scene.add(this.terrainMesh);
        console.log('TerrainRenderer: Mesh added to scene');
        
        // Зберігаємо позицію цілі камери для подальшого порівняння
        if (cameraPosition) {
            this.lastRenderPosition = { x: cameraPosition.x, z: cameraPosition.z };
        }
        
        return this.terrainMesh;
    }

    /**
     * Перевіряє чи потрібно перерендерити terrain
     */
    shouldRerender(currentTarget: { x: number, z: number }): boolean {
        if (!this.lastRenderPosition) {
            console.warn('RERENDER TERRAIN - First render');
            return true; // Перший рендер
        }
        
        const distance = Math.sqrt(
            Math.pow(currentTarget.x - this.lastRenderPosition.x, 2) + 
            Math.pow(currentTarget.z - this.lastRenderPosition.z, 2)
        );
        
        return distance > this.rerenderThreshold;
    }

    /**
     * Оновлює terrain при зміні висот
     */
    updateTerrain(cameraPosition?: { x: number, y: number, z: number }): void {
        if (this.terrainMesh && cameraPosition) {
            // Перевіряємо чи потрібно перерендерити
            if (this.shouldRerender(cameraPosition)) {
                this.renderTerrain(cameraPosition);
            }
        }
    }

    /**
     * Видаляє terrain зі сцени
     */
    removeTerrain(): void {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh = null;
        }
    }

    /**
     * Отримує поточний terrain меш
     */
    getTerrainMesh(): THREE.Mesh | null {
        return this.terrainMesh;
    }

    /**
     * Застосовує Multi-Texture Blending до terrain
     */
    private applyMultiTextureBlending(geometry: THREE.PlaneGeometry, startX: number, startZ: number, renderWidth: number, renderHeight: number): void {
        console.log('applyMultiTextureBlending: START'); // Додаємо логування
        
        if (!this.textureManager.isReady()) {
            console.warn('Textures not ready, using fallback material');
            return;
        }
        
        // Створюємо UV координати для текстур
        const uvs = geometry.attributes.uv;
        if (!uvs) {
            console.error('UV coordinates not found in geometry');
            return;
        }
        
        // Створюємо атрибут для blend factors кожної текстури
        const textureNames = Object.keys(MAP_CONFIG.terrain.textures || {});
        const blendAttributes: { [key: string]: Float32Array } = {};
        
        for (const textureName of textureNames) {
            blendAttributes[textureName] = new Float32Array(geometry.attributes.position.count);
        }
        
        // Обчислюємо blend factors для кожної вершини
        for (let i = 0; i < geometry.attributes.position.count; i++) {
            const localX = geometry.attributes.position.getX(i);
            const localZ = geometry.attributes.position.getZ(i);
            
            // Конвертуємо в глобальні координати
            const worldX = localX + (startX + renderWidth/2);
            const worldZ = localZ + (startZ + renderHeight/2);
            
            // Отримуємо blend factors для всіх текстур
            const blends = this.terrainManager.getAllTextureBlends(worldX, worldZ);
            
            // Зберігаємо blend factors
            for (const textureName of textureNames) {
                blendAttributes[textureName][i] = blends[textureName] || 0;
            }
        }

        console.warn('blendAttributes', blendAttributes);
        
        // Додаємо blend attributes до geometry
        for (const [textureName, blendArray] of Object.entries(blendAttributes)) {
            geometry.setAttribute(`blend_${textureName}`, new THREE.BufferAttribute(blendArray, 1));
        }
        
        // Створюємо ShaderMaterial для Multi-Texture Blending
        const material = this.createMultiTextureMaterial();
        if (this.terrainMesh) {
            this.terrainMesh.material = material;
        }
    }
    
    /**
     * Очікує завантаження текстур перед рендерингом
     */
    private async waitForTextures(): Promise<void> {
        while (!this.textureManager.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Очікуємо 100мс
        }
    }
    
    /**
     * Створює ShaderMaterial для Multi-Texture Blending
     */
    private createMultiTextureMaterial(): THREE.ShaderMaterial {
        const textureNames = Object.keys(MAP_CONFIG.terrain.textures || {});
        
        // Створюємо uniforms для текстур
        const uniforms: { [key: string]: any } = {};
        for (const textureName of textureNames) {
            const texture = this.textureManager.getTexture(textureName);
            if (texture) {
                uniforms[`texture_${textureName}`] = { value: texture };
            }
            
            // Додаємо tiling як uniforms
            const tiling = (MAP_CONFIG.terrain.textures as any)[textureName]?.tiling;
            if (tiling) {
                uniforms[`tiling_${textureName}`] = { value: new THREE.Vector2(tiling.x, tiling.y) };
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
     * Створює vertex shader для передачі blend attributes
     */
    private createVertexShader(textureNames: string[]): string {
        let attributes = '';
        let varyings = '';
        
        for (const textureName of textureNames) {
            attributes += `attribute float blend_${textureName};\n`;
            varyings += `varying float v_blend_${textureName};\n`;
        }
        
        // Додаємо uniforms для tiling
        let uniforms = '';
        for (const textureName of textureNames) {
            const tiling = (MAP_CONFIG.terrain.textures as any)[textureName]?.tiling;
            if (tiling) {
                uniforms += `uniform vec2 tiling_${textureName};\n`;
            }
        }
        
        return `
            ${uniforms}
            ${attributes}
            ${varyings}
            varying vec2 vUv;
            
            void main() {
                vUv = uv;
                ${textureNames.map(name => `v_blend_${name} = blend_${name};`).join('\n                ')}
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }
    
    /**
     * Створює fragment shader для Multi-Texture Blending
     */
    private createFragmentShader(textureNames: string[]): string {
        let uniforms = '';
        let varyings = '';
        let blending = '';
        
        for (const textureName of textureNames) {
            uniforms += `uniform sampler2D texture_${textureName};\n`;
            varyings += `varying float v_blend_${textureName};\n`;
        }
        
        // Додаємо uniforms для tiling
        for (const textureName of textureNames) {
            const tiling = (MAP_CONFIG.terrain.textures as any)[textureName]?.tiling;
            if (tiling) {
                uniforms += `uniform vec2 tiling_${textureName};\n`;
            }
        }
        
        // Створюємо логіку змішування з tiling
        blending = `vec4 finalColor = vec4(0.0);\n`;
        for (const textureName of textureNames) {
            const tiling = (MAP_CONFIG.terrain.textures as any)[textureName]?.tiling;
            if (tiling) {
                blending += `finalColor += texture2D(texture_${textureName}, vUv * tiling_${textureName}) * v_blend_${textureName};\n`;
            } else {
                blending += `finalColor += texture2D(texture_${textureName}, vUv) * v_blend_${textureName};\n`;
            }
        }
        
        return `
            ${uniforms}
            ${varyings}
            varying vec2 vUv;
            
            void main() {
                ${blending}
                gl_FragColor = finalColor;
            }
        `;
    }
}