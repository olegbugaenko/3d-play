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
        //this.generateBoulders();
        
                // Генеруємо каменюки типу rock
        //this.generateRocks();
        
        // Логуємо загальну кількість об'єктів
        const totalObjects = Object.keys(this.scene.getObjects()).length;
        
        // Генеруємо rover об'єкти
        this.generateRovers();
        
        // Генеруємо хмари
        console.log('🗺️ MapLogic: починаємо генерувати хмари...');
        this.generateClouds();
        console.log('🗺️ MapLogic: хмари згенеровані');
        
        // Генеруємо джерела диму
        console.log('💨 MapLogic: починаємо генерувати дим...');
        this.generateSmoke();
        console.log('💨 MapLogic: дим згенеровано');

        this.generateArcs();
        
        // Логуємо результат

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

        setInterval(
            this.tick.bind(this),
            100 // This will be increased for sure
        )
    }

    /**
     * Генерує процедурні каменюки на карті
     */
    private generateBoulders() {
        const boulderCount = 100; // Збільшуємо кількість каменюків
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
                    modelPath: (() => {
                        const rand = Math.random();
                        if (rand < 0.33) return '/models/stone2.glb';
                        if (rand < 0.66) return '/models/stone3.glb';
                        return '/models/stone4.glb';
                    })() // Випадково вибираємо між трьома моделями
                },
                tags: ['on-ground', 'static', 'boulder'], // Автоматично розміститься на terrain
                bottomAnchor: -0.2, // Каменюк стоїть на своєму низу
                terrainAlign: true // Нахиляється по нормалі terrain
            };
            
            // Додаємо з terrain constraint
            const success = this.scene.pushObjectWithTerrainConstraint(boulder);
            if (success) {
                const modelUsed = (() => {
                    const rand = Math.random();
                    if (rand < 0.33) return 'stone2.glb';
                    if (rand < 0.66) return 'stone3.glb';
                    return 'stone4.glb';
                })();
                // console.log(`Додано каменюк boulder ${i} на позиції (${x.toFixed(1)}, ${z.toFixed(1)}) з моделлю ${modelUsed}`);
            }
        }
    }

    /**
     * Генерує процедурні каменюки типу rock на карті
     */
    private generateRocks() {
        const rockCount = 5000; // Збільшуємо кількість каменюків
        const mapBounds = {
            minX: -MAP_CONFIG.width / 2,
            maxX: MAP_CONFIG.width / 2,
            minZ: -MAP_CONFIG.depth / 2,
            maxZ: MAP_CONFIG.depth / 2
        };

        // Створюємо кластери каменюків для більш щільного розподілу
        const clusterCount = 25; // Збільшуємо кількість кластерів
        const rocksPerCluster = Math.floor(rockCount / clusterCount); // Каменюки на кластер

        for (let cluster = 0; cluster < clusterCount; cluster++) {
            // Центр кластера
            const clusterCenterX = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
            const clusterCenterZ = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
            const clusterRadius = 15 + Math.random() * 20; // Збільшуємо радіус кластера

            for (let j = 0; j < rocksPerCluster; j++) {
                // Позиція в межах кластера
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * clusterRadius;
                const x = clusterCenterX + Math.cos(angle) * distance;
                const z = clusterCenterZ + Math.sin(angle) * distance;
            
                // Випадковий розмір каменюка з більшою варіацією
                const baseSize = 0.15 + Math.random() * 0.25; // Від 0.15 до 0.4 (трохи більші)
                // Випадковий колір (коричневаві відтінки)
                const colors = [0x8B4513, 0xA0522D, 0x8B7355, 0x696969, 0x6B4423, 0x8B6914, 0x654321, 0x8B7355];
                const color = colors[Math.floor(Math.random() * colors.length)];
                
                // Випадкова гладкість для різноманітності
                const smoothness = 0.6 + Math.random() * 0.3; // Від 0.6 до 0.9 (більш гладкі)
                
                const rock: TSceneObject = {
                    id: `rock_${cluster}_${j}`,
                    type: 'rock',
                    coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                    scale: { x: baseSize, y: baseSize, z: baseSize }, // Використовуємо однаковий розмір для GLB моделі
                    rotation: { 
                        x: Math.random() * Math.PI, 
                        y: Math.random() * Math.PI, 
                        z: Math.random() * Math.PI 
                    },
                    data: { 
                        color,
                        size: baseSize, // Базовий розмір для рендерера
                        smoothness, // Використовуємо smoothness замість roughness
                        modelPath: (() => {
                            const rand = Math.random();
                            if (rand < 0.33) return '/models/stone2.glb';
                            if (rand < 0.66) return '/models/stone3.glb';
                            return '/models/stone4.glb';
                        })() // Випадково вибираємо між трьома моделями
                    },
                    tags: ['on-ground', 'static', 'rock'], // Автоматично розміститься на terrain
                    bottomAnchor: baseSize * 0.1, // Каменюк стоїть на своєму низу
                    terrainAlign: true // Нахиляється по нормалі terrain
                };
                
                // Додаємо з terrain constraint
                const success = this.scene.pushObjectWithTerrainConstraint(rock);
                if (success) {
                    const modelUsed = (() => {
                        const rand = Math.random();
                        if (rand < 0.33) return 'stone2.glb';
                        if (rand < 0.66) return 'stone3.glb';
                        return 'stone4.glb';
                    })();
                    // Додано каменюк rock
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

    private generateArcs() {
        const arcCount = 5;

        for(let i = 0; i < arcCount; i++) {

            const x = (Math.random() - 0.5) * 50; // X: -200 до 200
            const z = (Math.random() - 0.5) * 50; // Z: -200 до 200

            const arc: TSceneObject = {
                id: `bolt-${i}`,
                type: 'electric-arc',
                coordinates: { x, y: 100, z },     // A
                scale: { x: 1, y: 1, z: 1},
                rotation: {x: 0, y: 0, z: 0},
                tags: ['effect', 'dynamic'],
                data: {
                  target: { x, y: 0, z },       // B
                  kinks: 30,           // більше зламів = «дрібніша» блискавка
                  amplitude: 5,     // ширина кривулі у world units
                  thicknessPx: 0.03,    // ядро
                  glowPx: 0.5,         // ореол
                  color: 0xAEE6FF,
                  glowColor: 0xAEE6FF,
                  coreOpacity: 1.0,
                  glowOpacity: 0.02,
                  glowIntensity: 0.05,
                  seed: 42
                }
              }

              this.scene.pushObject(arc);
        }
    }

    /**
     * Генерує джерела диму на карті
     */
    private generateSmoke() {
        const smokeCount = 25; // Кількість джерел диму
        
        for (let i = 0; i < smokeCount; i++) {
            // Випадкова позиція на карті
            const x = (Math.random() - 0.5) * 50; // X: -200 до 200
            const z = (Math.random() - 0.5) * 50; // Z: -200 до 200
            
            const smoke: TSceneObject = {
                id: `smoke_source_${i}`,
                type: 'smoke',
                coordinates: { x, y: 0, z }, // Y буде встановлено terrain системою
                scale: { x: 1, y: 1, z: 1 },
                rotation: { x: 0, y: 0, z: 0 },
                data: { 
                    intensity: 0.5 + Math.random() * 1.5, // 0.5-2.0 інтенсивність
                    color: 0x84B4543, // темно сірий дим
                    particleCount: 150 + Math.floor(Math.random() * 100), // 150-250 частинок
                    riseSpeed: 1.0 + Math.random() * 1.5, // 1.0-2.5 швидкість підйому
                    spreadRadius: 2.0 + Math.random() * 2.0, // 2.0-4.0 радіус розсіювання
                    lifetime: 5.0 + Math.random() * 3.0 // 5.0-8.0 час життя
                },
                tags: ['on-ground', 'static', 'smoke'],
                bottomAnchor: 0,
                terrainAlign: false
            };
            
            // Додаємо джерело диму
            this.scene.pushObjectWithTerrainConstraint(smoke);
        }
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
                                 // Додано rover
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
                                 // Об'єкт отримав ціль
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
                         // Об'єкт отримав ціль
        });
    }

    /**
     * Генерує пилові хмари на землі
     */
    private generateClouds() {
        const cloudCount = 5; // ЗБІЛЬШУЄМО кількість хмар
        
        for (let i = 0; i < cloudCount; i++) {
            // ГЕНЕРУЄМО ВИПАДКОВІ КООРДИНАТИ для кожної хмари
            const x = (Math.random() - 0.5) * 400; // X: -200 до 200
            const z = (Math.random() - 0.5) * 400; // Z: -200 до 200
            
            const cloud: TSceneObject = {
                id: `dust_cloud_${i}`,
                type: 'cloud',
                coordinates: { x, y: 0, z }, // Y буде встановлено terrain системою
                scale: { x: 1, y: 1, z: 1 },
                rotation: { x: 0, y: 0, z: 0 },
                data: { 
                    size: 21 + Math.random() * 22, // 8-20 одиниць радіус (більші хмари)
                    color: 0xD2B46C, // Пісочний колір
                    particleCount: 200, //13200 + Math.floor(Math.random() * 18000), // 1200-2000 частинок на хмару (ЗБІЛЬШУЄМО!)
                    windSpeed: 0.3 + Math.random() * 0.7, // 0.3-1.0 швидкість вітру
                    height: 4 + Math.random() * 8 // 4-12 одиниць висоти
                },
                tags: ['on-ground', 'static', 'dust'], // Пилові хмари на землі
                bottomAnchor: -1, // Не важливо для хмар
                terrainAlign: false // Хмари не вирівнюються по terrain
            };
            
            // Додаємо пилову хмару
            this.scene.pushObject(cloud);
        }
    
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
                                 // Об'єкт досяг цілі
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
            
                         // Об'єкт рухається до цілі
        });
    }

}