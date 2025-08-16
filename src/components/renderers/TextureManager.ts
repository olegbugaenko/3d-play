import * as THREE from 'three';
import { MAP_CONFIG } from '../../../logic/map/map-config';

export class TextureManager {
    private textures: Map<string, THREE.Texture> = new Map();
    private textureLoader: THREE.TextureLoader;
    
    constructor() {
        console.log('TextureManager: Initializing...');
        this.textureLoader = new THREE.TextureLoader();
        console.log('TextureManager: TextureLoader created', this.textureLoader);
        this.loadTextures();
    }
    
    /**
     * Завантажує всі текстури з конфігурації
     */
    private async loadTextures(): Promise<void> {
        const { textures } = MAP_CONFIG.terrain;
        if (!textures) {
            console.log('TextureManager: No textures config found');
            return;
        }
        
        console.log('TextureManager: Loading textures config:', textures);
        
        for (const [textureName, textureData] of Object.entries(textures)) {
            console.log(`TextureManager: Attempting to load: ${textureName} from ${textureData.texturePath}`);
            try {
                const texture = await this.loadTexture(textureData.texturePath);
                
                // Налаштовуємо повторення текстури
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(textureData.tiling.x, textureData.tiling.y);
                
                this.textures.set(textureName, texture);
                console.log(`TextureManager: Successfully loaded and configured: ${textureName}`, {
                    texture,
                    tiling: textureData.tiling,
                    repeat: texture.repeat
                });
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
        
        console.log(`TextureManager: Finished loading. Total textures: ${this.textures.size}`);
        console.log('TextureManager: Available textures:', Array.from(this.textures.keys()));
    }
    
    /**
     * Завантажує одну текстуру
     */
    private loadTexture(path: string): Promise<THREE.Texture> {
        console.log(`TextureManager: Starting to load texture from ${path}`);
        
        // Перевіряємо чи файл існує та доступний
        return fetch(path, { method: 'HEAD' })
            .then(response => {
                console.log(`TextureManager: File check for ${path}:`, {
                    status: response.status,
                    contentType: response.headers.get('content-type'),
                    contentLength: response.headers.get('content-length'),
                    headers: Object.fromEntries(response.headers.entries())
                });
                
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
                            console.log(`TextureManager: Successfully loaded texture from ${path}`, texture);
                            resolve(texture);
                        },
                        (progress) => {
                            console.log(`TextureManager: Loading progress for ${path}:`, progress);
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
        return this.textures.size > 0;
    }
}
