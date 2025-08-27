import * as THREE from 'three';
import { MAP_CONFIG } from '../../../logic/map/map-config';

export class TextureManager {
    private textures: Map<string, THREE.Texture> = new Map();
    private textureLoader: THREE.TextureLoader;
    
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.loadTextures();
    }
    
    /**
     * Завантажує всі текстури з конфігурації
     */
    private async loadTextures(): Promise<void> {
        const { textures } = MAP_CONFIG.terrain;
        if (!textures) {
            return;
        }
        
        for (const [textureName, textureData] of Object.entries(textures)) {
            // Завантаження текстури
            try {
                const texture = await this.loadTexture(textureData.texturePath);
                
                // Налаштовуємо повторення текстури
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(textureData.tiling.x, textureData.tiling.y);
                
                this.textures.set(textureName, texture);
                // Текстура успішно завантажена
            } catch (error) {
                console.error(`TextureManager: Failed to load texture ${textureName}:`, error);
                console.error('TextureManager: Error details:', {
                    message: error instanceof Error ? error.message : String(error),
                    type: (error as any)?.type,
                    target: (error as any)?.target,
                    stack: error instanceof Error ? error.stack : undefined
                });
            }
        }
        
        // Завантаження завершено
    }
    
    /**
     * Завантажує одну текстуру
     */
    private loadTexture(path: string): Promise<THREE.Texture> {
        // Починаємо завантаження текстури
        
        // Перевіряємо чи файл існує та доступний
        return fetch(path, { method: 'HEAD' })
            .then(response => {
                // Перевірка файлу
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Перевіряємо Content-Type
                const contentType = response.headers.get('content-type');
                if (contentType && !contentType.startsWith('image/')) {
                    console.warn(`TextureManager: Warning - ${path} has Content-Type: ${contentType}, expected image/*`);
                }
                
                // Завантажуємо текстуру
                return new Promise<THREE.Texture>((resolve, reject) => {
                    this.textureLoader.load(
                        path,
                        (texture) => {
                            resolve(texture);
                        },
                        (progress) => {
                            // Прогрес завантаження
                        },
                        (error) => {
                            console.error(`TextureManager: Failed to load texture from ${path}:`, error);
                            reject(error);
                        }
                    );
                });
            })
            .catch(error => {
                console.error(`TextureManager: File check failed for ${path}:`, error);
                throw error;
            });
    }
    
    /**
     * Отримує текстуру за назвою
     */
    getTexture(textureName: string): THREE.Texture | undefined {
        return this.textures.get(textureName);
    }
    
    /**
     * Отримує всі завантажені текстури
     */
    getAllTextures(): Map<string, THREE.Texture> {
        return this.textures;
    }
    
    /**
     * Перевіряє чи всі текстури завантажені
     */
    isReady(): boolean {
        const { textures } = MAP_CONFIG.terrain;
        if (!textures) {
            return true; // Якщо немає конфігурації текстур, вважаємо готовим
        }
        
        const expectedTextureCount = Object.keys(textures).length;
        const actualTextureCount = this.textures.size;
        
        return actualTextureCount === expectedTextureCount;
    }
}
