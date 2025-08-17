import { SceneLogic } from '../scene/scene-logic';
import { TCameraProps } from '../../shared/camera.types';
import { TSceneObject } from '../scene/scene.types';
import { DynamicsLogic } from '../scene/dynamics-logic';
import { MAP_CONFIG } from './map-config';

export class MapLogic {

    constructor(public scene: SceneLogic, public dynamics: DynamicsLogic) {
        // Constructor implementation
    }

    initMap(cameraProps: TCameraProps) {
        this.scene.initializeViewport(cameraProps, { 
            x: MAP_CONFIG.width, 
            y: MAP_CONFIG.height, 
            z: MAP_CONFIG.depth 
        });

        let addedObjects = 0;
        let skippedObjects = 0;

        // Генеруємо каменюки на карті
        this.generateBoulders();
        console.log('Згенеровано каменюки на карті');
        
                // Генеруємо каменюки типу rock
        this.generateRocks();
        console.log('Згенеровано каменюки типу rock на карті');
        
        // Генеруємо rover об'єкти
        this.generateRovers();
        console.log('Згенеровано rover об\'єкти на карті');
        
        // Логуємо результат
        console.log(`Map initialized: ${addedObjects} objects added, ${skippedObjects} objects skipped (out of bounds)`);

        // Додаємо тестовий динамічний об'єкт (без terrain constraint)
        const dynamicCube: TSceneObject = {
            id: 'dynamic_test_cube',
            type: 'cube',
            coordinates: { x: 0, y: 2, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: { x: 0, y: 0, z: 0 },
            data: { 
                color: 0xff0000,
                maxSpeed: 1.5, // Тестова швидкість
                rotatable: false, // Куб не обертається
                rotationOffset: 0 // Без зміщення кута
            },
            tags: ['dynamic', 'test', 'floating'], // Без тегу on-ground
            bottomAnchor: -0.5 // Куб стоїть на своєму низу
        };
        
        this.scene.pushObject(dynamicCube);
        console.log('Додано тестовий динамічний куб');

        setInterval(
            this.tick.bind(this),
            100 // This will be increased for sure
        )
    }

    /**
     * Генерує процедурні каменюки на карті
     */
    private generateBoulders() {
        const boulderCount = 50; // Кількість каменюків
        const mapBounds = {
            minX: -MAP_CONFIG.width / 2,
            maxX: MAP_CONFIG.width / 2,
            minZ: -MAP_CONFIG.depth / 2,
            maxZ: MAP_CONFIG.depth / 2
        };

        for (let i = 0; i < boulderCount; i++) {
            // Випадкова позиція на карті
            const x = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
            const z = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
            
            // Випадковий розмір каменюка
            const size = 0.3 + Math.random() * 1.2; // Від 0.3 до 1.5 (менші каменюки)
            
            // Випадковий колір (відтінки сірого та коричневого)
            const colors = [0x8B7355, 0x696969, 0x808080, 0xA0522D, 0x8B4513];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Випадкова шорсткість для різноманітності
            const roughness = 0.2 + Math.random() * 0.4; // Від 0.2 до 0.6
            
            const boulder: TSceneObject = {
                id: `boulder_${i}`,
                type: 'boulder',
                coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                scale: { x: size, y: size, z: size },
                rotation: { 
                    x: Math.random() * Math.PI, 
                    y: Math.random() * Math.PI, 
                    z: Math.random() * Math.PI 
                },
                data: { 
                    color,
                    size,
                    roughness,
                    segments: 8
                },
                tags: ['on-ground', 'static', 'boulder'], // Автоматично розміститься на terrain
                bottomAnchor: -0.5, // Каменюк стоїть на своєму низу
                terrainAlign: true // Нахиляється по нормалі terrain
            };
            
            // Додаємо з terrain constraint
            const success = this.scene.pushObjectWithTerrainConstraint(boulder);
            if (success) {
                console.log(`Додано каменюк ${i} на позиції (${x.toFixed(1)}, ${z.toFixed(1)})`);
            }
        }
    }

    /**
     * Генерує процедурні каменюки типу rock на карті
     */
    private generateRocks() {
        const rockCount = 300; // Кількість каменюків типу rock
        const mapBounds = {
            minX: -MAP_CONFIG.width / 2,
            maxX: MAP_CONFIG.width / 2,
            minZ: -MAP_CONFIG.depth / 2,
            maxZ: MAP_CONFIG.depth / 2
        };

        // Створюємо кластери каменюків для більш щільного розподілу
        const clusterCount = 15; // Кількість кластерів
        const rocksPerCluster = Math.floor(rockCount / clusterCount); // Каменюки на кластер

        for (let cluster = 0; cluster < clusterCount; cluster++) {
            // Центр кластера
            const clusterCenterX = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
            const clusterCenterZ = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
            const clusterRadius = 50 + Math.random() * 100; // Радіус кластера від 50 до 150

            for (let j = 0; j < rocksPerCluster; j++) {
                // Позиція в межах кластера
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * clusterRadius;
                const x = clusterCenterX + Math.cos(angle) * distance;
                const z = clusterCenterZ + Math.sin(angle) * distance;
            
            // Випадковий розмір каменюка з більшою варіацією
            const baseSize = 0.1 + Math.random() * 0.9; // Від 0.1 до 1.0 (менші каменюки)
            const sizeVariation = 0.8 + Math.random() * 0.4; // 0.8-1.2 для різних осей
            const size = {
                x: baseSize * sizeVariation,
                y: baseSize * (1.0 + Math.random() * 0.4), // Y може бути трохи більшим
                z: baseSize * sizeVariation
            };
            
            // Випадковий колір (коричневаві відтінки)
            const colors = [0x8B4513, 0xA0522D, 0x8B7355, 0x696969, 0x6B4423, 0x8B6914, 0x654321, 0x8B7355];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Випадкова гладкість для різноманітності
            const smoothness = 0.6 + Math.random() * 0.3; // Від 0.6 до 0.9 (більш гладкі)
            
            const rock: TSceneObject = {
                id: `rock_${cluster}_${j}`,
                type: 'rock',
                coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                scale: size, // Використовуємо різні розміри по осях
                rotation: { 
                    x: Math.random() * Math.PI, 
                    y: Math.random() * Math.PI, 
                    z: Math.random() * Math.PI 
                },
                data: { 
                    color,
                    size: baseSize, // Базовий розмір для рендерера
                    smoothness, // Використовуємо smoothness замість roughness
                    segments: 12 + Math.floor(Math.random() * 8) // Від 12 до 19 сегментів
                },
                tags: ['on-ground', 'static', 'rock'], // Автоматично розміститься на terrain
                bottomAnchor: -0.5, // Каменюк стоїть на своєму низу
                terrainAlign: true // Нахиляється по нормалі terrain
            };
            
            // Додаємо з terrain constraint
            const success = this.scene.pushObjectWithTerrainConstraint(rock);
            if (success) {
                console.log(`Додано каменюк rock ${cluster}_${j} на позиції (${x.toFixed(1)}, ${z.toFixed(1)})`);
            }
            }
        }
    }

    /**
     * Перевіряє, чи зайнята позиція каменюком (rock або boulder)
     */
    private isPositionOccupiedByRock(x: number, z: number): boolean {
        // Радіус безпеки навколо позиції (трохи більший за розмір каменюка)
        const safetyRadius = 1.0;
        
        // Отримуємо всі об'єкти типу rock та boulder зі сцени
        const allObjects = Object.values(this.scene.getObjects());
        const rockObjects = allObjects.filter((obj: TSceneObject) => 
            obj.type === 'rock' || obj.type === 'boulder'
        );
        
        for (const rock of rockObjects) {
            const rockX = rock.coordinates.x;
            const rockZ = rock.coordinates.z;
            
            // Розраховуємо відстань між позицією та каменюком
            const distance = Math.sqrt(
                Math.pow(x - rockX, 2) + Math.pow(z - rockZ, 2)
            );
            
            // Якщо відстань менша за радіус безпеки, позиція зайнята
            if (distance < safetyRadius) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Генерує rover об'єкти біля центру карти
     */
    private generateRovers() {
        const roverCount = 3; // Кількість rover об'єктів
        
        // Розташовуємо rover об'єкти біля центру карти
        const centerRadius = 20; // Радіус від центру
        
        for (let i = 0; i < roverCount; i++) {
            let attempts = 0;
            const maxAttempts = 50; // Максимальна кількість спроб знайти вільну позицію
            let x, z;
            
            // Шукаємо вільну позицію без колізій з каменюками (rock та boulder)
            do {
                // Розподіляємо по колу навколо центру
                const angle = (i / roverCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5; // Додаємо випадковість
                const distance = centerRadius * (0.5 + Math.random() * 0.5); // Від 10 до 30 одиниць від центру
                
                x = Math.cos(angle) * distance;
                z = Math.sin(angle) * distance;
                
                attempts++;
            } while (this.isPositionOccupiedByRock(x, z) && attempts < maxAttempts);
            
            // Якщо не знайшли вільну позицію, використовуємо останню спробу
            if (attempts >= maxAttempts) {
                console.warn(`Не вдалося знайти вільну позицію для rover ${i}, використовуємо останню спробу`);
            }
            
            // Випадковий масштаб для різноманітності
            const scale = 0.4;
            
                         const rover: TSceneObject = {
                 id: `rover_${i}`,
                 type: 'rover',
                 coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                 scale: { x: scale, y: scale, z: scale },
                 rotation: { 
                     x: 0, 
                     y: Math.atan2(z, x) + Math.random() * 0.5 + (Math.PI / 2), // Направляємо в сторону від центру + корекція кута
                     z: 0 
                 },
                                   data: { 
                      modelPath: '/models/playtest-rover.glb', // Шлях відносно public директорії
                      scale: scale,
                      maxSpeed: 2.0, // Базова швидкість руху
                      rotatable: true, // Ровер може обертатися в напрямку руху
                      rotationOffset: -Math.PI / 2 // Корекція кута (90 градусів) - модель дивиться в сторону осі Z
                  },
                 tags: ['on-ground', 'dynamic', 'rover', 'controlled'], // Динамічний об'єкт на terrain, який можна контролювати
                 bottomAnchor: -0.1, // Rover стоїть на своєму низу
                 terrainAlign: true // Нахиляється по нормалі terrain
             };
            
            // Додаємо з terrain constraint
            const success = this.scene.pushObjectWithTerrainConstraint(rover);
            if (success) {
                console.log(`Додано rover ${i} на позиції (${x.toFixed(1)}, ${z.toFixed(1)}) після ${attempts} спроб`);
                console.log(`Rover ${i} має теги:`, rover.tags);
            }
        }
    }

    tick() {
        const dT = 0.1;
        this.processSceneTick(dT);
        this.dynamics.moveObjects(dT);
    }

    processSceneTick(_dT: number) {
        // contains custom logic, managing objects, custom structures and so on...
        const testMovingObj = this.scene.getObjectById('dynamic_test_cube');
        if(testMovingObj && !testMovingObj.data?.target) {
            // Тільки якщо немає цілі - додаємо тестову анімацію
            if(!testMovingObj.speed) {
                testMovingObj.speed = {x: 0, y: 0, z: 0}
            }
            testMovingObj.speed.x += Math.cos(testMovingObj.coordinates.x*Math.PI);
        }
        
        // Логіка руху динамічних об'єктів
        this.processDynamicObjectsMovement(_dT);
    }
    
    /**
     * Розподіляє цілі для групи динамічних об'єктів, щоб вони не злипалися
     */
    public distributeTargetsForObjects(objectIds: string[], centerPoint: { x: number; z: number }) {
        const dynamicObjects = objectIds
            .map(id => this.scene.getObjectById(id))
            .filter(obj => obj && obj.tags?.includes('dynamic')) as TSceneObject[];
        
        if (dynamicObjects.length === 0) return;
        
        // Якщо тільки один об'єкт - просто встановлюємо ціль
        if (dynamicObjects.length === 1) {
            const obj = dynamicObjects[0];
            const objData = obj.data as any;
            if (objData) {
                objData.target = { x: centerPoint.x, z: centerPoint.z };
                console.log(`${obj.type} ${obj.id} отримав ціль (${centerPoint.x.toFixed(1)}, ${centerPoint.z.toFixed(1)})`);
            }
            return;
        }
        
        // Для кількох об'єктів - розподіляємо по колу навколо центру
        const radius = Math.min(dynamicObjects.length * 0.8, 10); // Радіус залежить від кількості об'єктів
        const angleStep = (2 * Math.PI) / dynamicObjects.length;
        
        dynamicObjects.forEach((obj, index) => {
            const objData = obj.data as any;
            if (!objData) return;
            
            // Розраховуємо позицію на колі
            const angle = index * angleStep;
            const targetX = centerPoint.x + Math.cos(angle) * radius;
            const targetZ = centerPoint.z + Math.sin(angle) * radius;
            
            // Коригуємо висоту на основі terrain
            const terrainManager = this.scene.getTerrainManager();
            if (terrainManager) {
                const terrainHeight = terrainManager.getHeightAt(targetX, targetZ);
                if (terrainHeight !== undefined) {
                    // targetY = terrainHeight; // Можна використовувати для майбутнього
                }
            }
            
            objData.target = { x: targetX, z: targetZ };
            console.log(`${obj.type} ${obj.id} отримав ціль (${targetX.toFixed(1)}, ${targetZ.toFixed(1)}) на відстані ${radius.toFixed(1)} від центру`);
        });
    }

    /**
     * Обробляє рух всіх динамічних об'єктів
     */
    private processDynamicObjectsMovement(dT: number) {
        const dynamicObjects = this.scene.getObjectsByTag('dynamic');
        
        dynamicObjects.forEach(obj => {
            const objData = obj.data as any;
            if (!objData || !objData.target) return;
            
            const target = objData.target;
            const maxSpeed = objData.maxSpeed || 2.0;
            
            // Розраховуємо відстань до цілі
            const distanceToTarget = Math.sqrt(
                Math.pow(obj.coordinates.x - target.x, 2) + 
                Math.pow(obj.coordinates.z - target.z, 2)
            );
            
            // Якщо досягли цілі - зупиняємося
            if (distanceToTarget < 0.5) {
                console.log(`${obj.type} ${obj.id} досяг цілі`);
                objData.target = undefined; // Видаляємо ціль
                if (obj.speed) {
                    obj.speed.x = 0;
                    obj.speed.z = 0;
                    // Для on-ground об'єктів Y швидкість завжди 0
                    if (obj.tags?.includes('on-ground')) {
                        obj.speed.y = 0;
                    }
                }
                
                // Видаляємо індикатор цілі (якщо є SelectionManager)
                // Це буде зроблено в Scene3D при оновленні
                return;
            }
            
            // Розраховуємо напрямок до цілі
            const directionX = target.x - obj.coordinates.x;
            const directionZ = target.z - obj.coordinates.z;
            const directionLength = Math.sqrt(directionX * directionX + directionZ * directionZ);
            
            // Нормалізуємо напрямок
            const normalizedDirectionX = directionX / directionLength;
            const normalizedDirectionZ = directionZ / directionLength;
            
            // Встановлюємо швидкість
            if (!obj.speed) {
                obj.speed = { x: 0, y: 0, z: 0 };
            }
            
            obj.speed.x = normalizedDirectionX * maxSpeed;
            obj.speed.z = normalizedDirectionZ * maxSpeed;
            
            // Для on-ground об'єктів Y швидкість завжди 0 (не літають)
            if (obj.tags?.includes('on-ground')) {
                obj.speed.y = 0;
            }
            
            // Оновлюємо обертання об'єкта в напрямку руху (якщо це ровер або інший об'єкт що може обертатися)
            if (objData.rotatable !== false) {
                const baseRotation = Math.atan2(normalizedDirectionZ, normalizedDirectionX);
                const rotationOffset = objData.rotationOffset || 0;
                obj.rotation.y = -(baseRotation + rotationOffset);
            }
            
            console.log(`${obj.type} ${obj.id} рухається до цілі (${target.x.toFixed(1)}, ${target.z.toFixed(1)}) зі швидкістю ${maxSpeed}`);
        });
    }

}