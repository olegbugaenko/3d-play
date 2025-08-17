import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface RockData {
    color?: number;
    size?: number;
    smoothness?: number; // Навпаки до roughness - більше значення = більш гладкий
    segments?: number;
}

export class RockRenderer extends BaseRenderer {
    render(object: SceneObject): THREE.Mesh {
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.scene.remove(existingMesh);
        }

        const rockData: RockData = object.data || {};
        const mesh = this.createRockMesh(rockData);
        
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо до сцени та зберігаємо
        this.addMesh(object.id, mesh);
        
        return mesh;
    }

    private createRockMesh(data: RockData): THREE.Mesh {
        const {
            color = 0x4A4A4A, // Темно-сірий колір для каменю
            size = 1.0,
            smoothness = 0.6, // За замовчуванням досить гладкий
            segments = 16 // Збільшуємо кількість сегментів для більш плавної форми
        } = data;

        // Випадково вибираємо тип геометрії для різноманітності
        const geometryType = Math.random();
        let geometry: THREE.BufferGeometry;

        if (geometryType < 0.5) {
            // 50% - сфера (більш округлі)
            geometry = new THREE.SphereGeometry(size, segments, segments);
        } else if (geometryType < 0.8) {
            // 30% - еліпсоїд (яйцеподібні, але з варіаціями)
            const scaleX = 0.8 + Math.random() * 0.4; // 0.8-1.2
            const scaleY = 1.0 + Math.random() * 0.6; // 1.0-1.6
            const scaleZ = 0.8 + Math.random() * 0.4; // 0.8-1.2
            geometry = new THREE.SphereGeometry(size, segments, segments);
            geometry.scale(scaleX, scaleY, scaleZ);
        } else {
            // 20% - дуже плавна неправильна форма
            geometry = new THREE.SphereGeometry(size, segments + 4, segments + 4); // Більше сегментів
        }
        
        // Додаємо деформації для природності
        const positions = geometry.attributes.position;
        const originalPositions = positions.array.slice();
        
        for (let i = 0; i < positions.count; i++) {
            const x = originalPositions[i * 3];
            const y = originalPositions[i * 3 + 1];
            const z = originalPositions[i * 3 + 2];
            
            // Різні типи деформацій залежно від smoothness
            let amplitude: number;
            let frequency: number;
            
            if (smoothness > 0.8) {
                // Дуже гладкі - мінімальні деформації
                amplitude = size * 0.02; // Ще менше деформацій
                frequency = 0.2; // Більш плавні
            } else if (smoothness > 0.6) {
                // Гладкі - середні деформації
                amplitude = (1 - smoothness) * size * 0.15; // Зменшуємо амплітуду
                frequency = 0.4; // Більш плавні
            } else {
                // Шорсткі - але все одно плавні
                amplitude = (1 - smoothness) * size * 0.2; // Зменшуємо амплітуду
                frequency = 0.6; // Більш плавні
            }
            
            // Використовуємо більш плавні функції для різноманітності
            const noiseType = Math.random();
            let noiseX, noiseY, noiseZ;
            
            if (noiseType < 0.4) {
                // Дуже плавні синусоїдальні
                noiseX = Math.sin(x * frequency * 0.5) * Math.cos(z * frequency * 0.5) * amplitude;
                noiseY = Math.sin(y * frequency * 0.5) * Math.cos(x * frequency * 0.5) * amplitude;
                noiseZ = Math.sin(z * frequency * 0.5) * Math.cos(y * frequency * 0.5) * amplitude;
            } else if (noiseType < 0.8) {
                // Плавні косинусоїдальні
                noiseX = Math.cos(x * frequency * 0.8) * Math.sin(z * frequency * 0.8) * amplitude;
                noiseY = Math.cos(y * frequency * 0.8) * Math.sin(x * frequency * 0.8) * amplitude;
                noiseZ = Math.cos(z * frequency * 0.8) * Math.sin(y * frequency * 0.8) * amplitude;
            } else {
                // Дуже плавні комбіновані
                noiseX = (Math.sin(x * frequency * 0.3) + Math.cos(x * frequency * 0.4)) * amplitude * 0.3;
                noiseY = (Math.sin(y * frequency * 0.3) + Math.cos(y * frequency * 0.4)) * amplitude * 0.3;
                noiseZ = (Math.sin(z * frequency * 0.3) + Math.cos(z * frequency * 0.4)) * amplitude * 0.3;
            }
            
            // Додаємо дуже м'які випадкові варіації
            const randomFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2 (менше варіацій)
            positions.setXYZ(i, 
                x + noiseX * randomFactor, 
                y + noiseY * randomFactor, 
                z + noiseZ * randomFactor
            );
        }
        
        // Оновлюємо геометрію
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Створюємо матеріал з більш природним виглядом
        const material = new THREE.MeshLambertMaterial({
            color: color,
            flatShading: smoothness < 0.5, // Плоске затушування для шорстких каменюків
            transparent: false,
            opacity: 1.0
        });

        // Додаємо випадкове обертання для різноманітності
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        return mesh;
    }
}
