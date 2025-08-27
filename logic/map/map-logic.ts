import { SceneLogic } from '../scene/scene-logic';
import { TCameraProps } from '../../shared/camera.types';
import { TSceneObject } from '../scene/scene.types';
import { DynamicsLogic } from '../scene/dynamics-logic';
import { MAP_CONFIG } from './map-config';
import { ResourceManager } from '../resources';
import { CommandSystem } from '../commands';
import { SelectionLogic } from '../selection';
import { CommandGroupSystem } from '../commands/CommandGroupSystem';
import { AutoGroupMonitor } from '../commands/AutoGroupMonitor';
import { CommandGroupContext } from '../commands/command-group.types';
import { SeededRandom } from './seeded-random';
import { MapGenerationTracker } from './map-generation-state';
import { SaveLoadManager, MapLogicSaveData } from '../save-load/save-load.types';
import { Vector3 } from '../scene/scene.types';
import { DroneManager } from '../drones';

export class MapLogic implements SaveLoadManager {
    public commandSystem: CommandSystem;
    public selection: SelectionLogic;
    public commandGroupSystem: CommandGroupSystem;
    public autoGroupMonitor: AutoGroupMonitor;
    public droneManager: DroneManager;
    private generatedSeed: number;

    private collectedRocks: Set<string>;
    
    // Система детермінованої генерації
    private generationTracker: MapGenerationTracker;
    private seededRandom: SeededRandom;

    constructor(
        public scene: SceneLogic, 
        public dynamics: DynamicsLogic,
        public resources: ResourceManager,
        seed?: number
    ) {
        this.commandSystem = new CommandSystem(this);
        this.selection = new SelectionLogic(this.scene);
        this.commandGroupSystem = new CommandGroupSystem(this.commandSystem, this);
        this.autoGroupMonitor = new AutoGroupMonitor(this);
        this.droneManager = new DroneManager(this.scene);
        
        // Ініціалізуємо систему генерації
        const generationSeed = seed || MAP_CONFIG.generation.defaultSeed || Date.now();
        this.generationTracker = new MapGenerationTracker(generationSeed);
        this.seededRandom = new SeededRandom(generationSeed);

        this.generatedSeed = generationSeed;
        this.collectedRocks = new Set();
    }

    /**
     * Додає каменюк до списку зібраних
     */
    public collectRock(rockId: string): void {
        this.collectedRocks.add(rockId);
        console.log(`[MapLogic] Added collected rock: ${rockId}`);
        this.scene.removeObject(rockId);
    }

    /**
     * Ініціалізує карту (terrain, болдери, каменюки - все що залежить від seed)
     * Будівлі тут тимчасово - згодом для них буде окремий менеджер
     */
    initializeSeeded(cameraProps?: TCameraProps): void {
        // Якщо передано cameraProps - ініціалізуємо viewport
        if (cameraProps) {
            this.scene.initializeViewport(cameraProps, { 
                x: MAP_CONFIG.width, 
                y: MAP_CONFIG.height, 
                z: MAP_CONFIG.depth 
            });
        }

        // Генеруємо карту висот (terrain) з seed
        this.generateTerrain();
        console.log('Generated terrain', this.generatedSeed);
        
        // Генеруємо болдери з seed
        this.generateBoulders();
        
        // Генеруємо каменюки з seed
        this.generateRocks();
        
        // Генеруємо будівлі
        this.generateBuildings();

        

        
    }

    /**
     * Ініціалізує тільки базову карту (viewport) без генерації об'єктів
     * Використовується при завантаженні гри
     */
    initializeBaseMap(cameraProps?: TCameraProps): void {
        // Якщо передано cameraProps - ініціалізуємо viewport
        if (cameraProps) {
            this.scene.initializeViewport(cameraProps, { 
                x: MAP_CONFIG.width, 
                y: MAP_CONFIG.height, 
                z: MAP_CONFIG.depth 
            });
        }
        
        // НЕ генеруємо terrain, boulders, rocks - це буде зроблено в load()
        console.log('Initialized base map (viewport only)');
    }

    /**
     * Створює початкових дронів для нової гри
     */
    newGame(): void {
        console.log('GENERATE ROVERS');
        this.initializeSeeded();
        // Генеруємо rover об'єкти
        this.generateRovers();

        setInterval(
            this.tick.bind(this),
            100 // This will be increased for sure
        )
    }



    /**
     * Генерує карту висот (terrain) з seed
     */
    private generateTerrain() {
        const seed = this.generationTracker.getSeed();
        
        // Отримуємо TerrainManager з SceneLogic
        const terrainManager = this.scene.getTerrainManager();
        if (!terrainManager) {
            console.warn('[MapLogic] TerrainManager не знайдено, створюємо новий');
            return;
        }

        // Регенеруємо terrain з новим seed
        terrainManager.regenerateTerrainWithSeed(seed);
        
        console.log(`[MapLogic] Terrain згенеровано з seed: ${seed}`);
        
        // Додатково можемо логувати статистику terrain
        const config = terrainManager.getConfig();
        console.log(`[MapLogic] Terrain конфігурація:`, {
            width: config.width,
            height: config.height,
            resolution: config.resolution,
            maxHeight: config.maxHeight,
            minHeight: config.minHeight
        });
    }

    /**
     * Генерує процедурні каменюки на карті
     */
    private generateBoulders() {
        const boulderCount = MAP_CONFIG.generation.boulders.count;
        const mapBounds = {
            minX: -MAP_CONFIG.width / 2,
            maxX: MAP_CONFIG.width / 2,
            minZ: -MAP_CONFIG.depth / 2,
            maxZ: MAP_CONFIG.depth / 2
        };

        console.log('Generating rocks for seed '+this.generationTracker.getSeed(), this.generatedSeed);

        const boulderRng = new SeededRandom(this.generationTracker.getSeed() + 1000); // Різний seed для болдерів
        
        for (let i = 0; i < boulderCount; i++) {
            // Використовуємо seed для детермінованої позиції
            const x = mapBounds.minX + boulderRng.nextFloat(0, mapBounds.maxX - mapBounds.minX);
            const z = mapBounds.minZ + boulderRng.nextFloat(0, mapBounds.maxZ - mapBounds.minZ);
            
            // Перевіряємо мінімальну відстань від інших болдерів
            if (this.isPositionTooCloseToBoulders(x, z)) {
                continue; // Пропускаємо цю позицію
            }
            
            // Використовуємо seed для детермінованого розміру
            const size = MAP_CONFIG.generation.boulders.sizeRange.min + 
                        boulderRng.nextFloat(0, MAP_CONFIG.generation.boulders.sizeRange.max - MAP_CONFIG.generation.boulders.sizeRange.min);
            
            // Використовуємо seed для детермінованого кольору
            const colors = [0x8B7355, 0x696969, 0x808080, 0xA0522D, 0x8B4513];
            const color = boulderRng.nextColor(colors);
            
            // Використовуємо seed для детермінованої шорсткості
            const roughness = 0.2 + boulderRng.nextFloat(0, 0.4);
            
            const boulder: TSceneObject = {
                id: `boulder_${i}`,
                type: 'boulder',
                coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                scale: { x: size, y: size, z: size },
                rotation: { 
                    x: boulderRng.nextFloat(0, Math.PI), 
                    y: boulderRng.nextFloat(0, Math.PI), 
                    z: boulderRng.nextFloat(0, Math.PI) 
                },
                data: { 
                    color,
                    size,
                    roughness,
                    modelPath: this.getRandomModelPath(boulderRng)
                },
                tags: ['on-ground', 'static', 'boulder'], // Автоматично розміститься на terrain
                bottomAnchor: -0.2, // Каменюк стоїть на своєму низу
                terrainAlign: false // Вимкаємо terrainAlign щоб болдери стояли вертикально
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
     * Перевіряє чи позиція занадто близько до інших болдерів
     */
    private isPositionTooCloseToBoulders(x: number, z: number): boolean {
        const minDistance = MAP_CONFIG.generation.boulders.minDistance;
        const allObjects = Object.values(this.scene.getObjects());
        const boulderObjects = allObjects.filter((obj: TSceneObject) => obj.type === 'boulder');
        
        for (const boulder of boulderObjects) {
            const distance = Math.sqrt(
                Math.pow(x - boulder.coordinates.x, 2) + 
                Math.pow(z - boulder.coordinates.z, 2)
            );
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    /**
     * Отримує випадковий шлях до моделі на основі seed
     */
    private getRandomModelPath(rng: SeededRandom): string {
        const rand = rng.next();
        if (rand < 0.33) return '/models/stone2.glb';
        if (rand < 0.66) return '/models/stone3.glb';
        return '/models/stone4.glb';
    }

    /**
     * Оновлює seed для генерації мапи
     */
    public updateGenerationSeed(newSeed: number): void {
        this.generationTracker = new MapGenerationTracker(newSeed);
        this.seededRandom = new SeededRandom(newSeed);
        this.generatedSeed = newSeed;
        
        console.log(`[MapLogic] Seed оновлено на: ${newSeed}`);
    }

    /**
     * Отримує поточний seed генерації
     */
    public getGenerationSeed(): number {
        return this.generationTracker.getSeed();
    }

    /**
     * Генерує процедурні каменюки типу rock на карті
     */
    private generateRocks() {
        const rockCount = MAP_CONFIG.generation.rocks.clusterCount * MAP_CONFIG.generation.rocks.rocksPerCluster;
        const mapBounds = {
            minX: -MAP_CONFIG.width / 2,
            maxX: MAP_CONFIG.width / 2,
            minZ: -MAP_CONFIG.depth / 2,
            maxZ: MAP_CONFIG.depth / 2
        };

        // Створюємо кластери каменюків для більш щільного розподілу
        const clusterCount = MAP_CONFIG.generation.rocks.clusterCount;
        const rocksPerCluster = MAP_CONFIG.generation.rocks.rocksPerCluster;
        
        // Створюємо окремий RNG для каменюків
        const rockRng = new SeededRandom(this.generationTracker.getSeed() + 2000); // Різний seed для каменюків

        for (let cluster = 0; cluster < clusterCount; cluster++) {
            // Центр кластера з використанням seed
            const clusterCenterX = mapBounds.minX + rockRng.nextFloat(0, mapBounds.maxX - mapBounds.minX);
            const clusterCenterZ = mapBounds.minZ + rockRng.nextFloat(0, mapBounds.maxZ - mapBounds.minZ);
            const clusterRadius = MAP_CONFIG.generation.rocks.clusterRadius.min + 
                                rockRng.nextFloat(0, MAP_CONFIG.generation.rocks.clusterRadius.max - MAP_CONFIG.generation.rocks.clusterRadius.min);

            // Кожен кластер відповідає за певний тип ресурсу
            const resourceType: 'stone' | 'ore' = MAP_CONFIG.generation.rocks.resourceTypes[cluster % MAP_CONFIG.generation.rocks.resourceTypes.length];
            
            // Колір залежить від типу ресурсу
            const resourceColors = resourceType === 'stone' 
                ? [0x8B7355, 0x696969, 0x808080, 0xA0522D, 0x8B4513] // Сірі/коричневі відтінки для каменю
                : [0x8B4513, 0x654321, 0x8B6914, 0x6B4423, 0x654321]; // Темно-ржаві відтінки для руди

            for (let j = 0; j < rocksPerCluster; j++) {
                // Перевіряємо чи не зібраний цей ресурс
                if (this.generationTracker.isResourceCollected(cluster, j)) {
                    continue; // Пропускаємо зібрані ресурси
                }
                
                // Позиція в межах кластера з використанням seed
                const angle = rockRng.nextFloat(0, Math.PI * 2);
                const distance = rockRng.nextFloat(0, clusterRadius);
                const x = clusterCenterX + Math.cos(angle) * distance;
                const z = clusterCenterZ + Math.sin(angle) * distance;
            
                // Випадковий розмір каменюка з більшою варіацією
                const baseSize = 0.45 + rockRng.nextFloat(0, 0.25); // Від 0.45 до 0.7
                
                // Випадковий колір з палітри для даного типу ресурсу
                const color = rockRng.nextColor(resourceColors);
                
                // Випадкова гладкість для різноманітності
                const smoothness = 0.6 + rockRng.nextFloat(0, 0.3); // Від 0.6 до 0.9 (більш гладкі)
                
                const rock: TSceneObject = {
                    id: `rock_${cluster}_${j}`,
                    type: 'rock',
                    coordinates: { x, y: 0, z }, // Y буде автоматично встановлено terrain системою
                    scale: { x: baseSize, y: baseSize, z: baseSize }, // Використовуємо однаковий розмір для GLB моделі
                    rotation: { 
                        x: rockRng.nextFloat(0, Math.PI), 
                        y: rockRng.nextFloat(0, Math.PI), 
                        z: rockRng.nextFloat(0, Math.PI) 
                    },
                    data: { 
                        color,
                        size: baseSize, // Базовий розмір для рендерера
                        smoothness, // Використовуємо smoothness замість roughness
                        resourceId: resourceType, // Додаємо тип ресурсу
                        resourceAmount: 1 + rockRng.nextInt(0, 2), // 1-3 одиниці ресурсу
                        modelPath: this.getRandomModelPath(rockRng)
                    },
                    tags: ['on-ground', 'static', 'rock', 'resource'], // Автоматично розміститься на terrain
                    bottomAnchor: -baseSize * 0.3, // Каменюк стоїть на своєму низу
                    terrainAlign: true, // Нахиляється по нормалі terrain
                    targetType: ['collect-resource'],
                };
                
                // Додаємо з terrain constraint
                const success = this.scene.pushObjectWithTerrainConstraint(rock);
                if (success) {
                    // console.log(`Додано каменюк rock ${cluster}_${j} на позиції (${x.toFixed(1)}, ${z.toFixed(1)})`);
                }
            }
        }
        
        // Ресурси згенеровано
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

            const x = (Math.random() - 0.5) * 200; // X: -200 до 200
            const z = (Math.random() - 0.5) * 200; // Z: -200 до 200

            const arc: TSceneObject = {
                id: `bolt-${i}`,
                type: 'electric-arc',
                coordinates: { x, y: 50, z },     // A
                scale: { x: 1, y: 1, z: 1},
                rotation: {x: 0, y: 0, z: 0},
                tags: ['effect', 'dynamic'],
                data: {
                  target: { x: x + Math.random()*150, y: 0, z: z + Math.random()*150 },       // B
                  kinks: 14,           // більше зламів = «дрібніша» блискавка
                  amplitude: 5,     // ширина кривулі у world units
                  thicknessPx: 0.03,    // ядро
                  glowPx: 0.1,         // ореол
                  color: 0xAEE6FF,
                  glowColor: 0xAEE6FF,
                  coreOpacity: 1.0,
                  glowOpacity: 0.02,
                  glowIntensity: 0.5,
                  jitterAmp: 2,
                  seed: i
                }
              }

              this.scene.pushObject(arc);
        }
    }

    /**
     * Генерує джерела диму на карті
     */
    private generateSmoke() {
        const smokeCount = 20; // Кількість джерел диму
        
        for (let i = 0; i < smokeCount; i++) {
            // Випадкова позиція на карті
            const x = (Math.random() - 0.5) * 150; // X: -200 до 200
            const z = (Math.random() - 0.5) * 150; // Z: -200 до 200
            
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
                    riseSpeed: 3.3*(0.5 + Math.random() * 0.5), // 1.0-2.5 швидкість підйому
                    spreadRadius: 0.025*(1.0 + Math.random() * 1.0), // 2.0-4.0 радіус розсіювання
                    lifetime: 5.0 + Math.random() * 3.0, // 5.0-8.0 час життя
                    baseSize: 28,
                    flow: 0.2,
                    noiseScale: 0.5,
                    spreadGrow: 0.05,
                    riseHeight: 5,
                    emitRate: 20,
                    alphaMult: 0.25,
                    alphaDiminish: 0.9,
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
     * Генерує джерела вогню на карті
     */
    private generateFire() {
        const fireCount = 10; // Кількість джерел вогню
        
        for (let i = 0; i < fireCount; i++) {
            // Випадкова позиція на карті
            const x = (Math.random() - 0.5) * 120; // X: -100 до 100
            const z = (Math.random() - 0.5) * 120; // Z: -100 до 100
            
            const fire: TSceneObject = {
                id: `fire_source_${i}`,
                type: 'fire',
                coordinates: { x, y: 0, z }, // Y буде встановлено terrain системою
                scale: { x: 0.1, y: 0.1, z: 0.1 },
                rotation: { x: 0, y: 0, z: 0 },
                data: { 
                    emitRate: 30 + Math.floor(Math.random() * 26), // 20-36 частинок/сек
                    life: 2.0 + Math.random() * 1.5, // 2.0-3.5 сек
                    riseSpeed: 2.0 + Math.random() * 2.0, // 3.0-5.0 висота підйому (riseSpeed для FireRenderer)
                    baseSize: 65 + Math.random() * 48, // 5-13 розмір спрайта
                    flow: 0.8 + Math.random() * 0.8, // 0.8-1.6 сила завихрення
                    noiseScale: 0.6 + Math.random() * 0.4, // 0.6-1.0 масштаб шуму
                    timeScale: 1.0 + Math.random() * 0.4, // 1.0-1.4 швидкість течії
                    riseHeight: 1,
                    spreadRadius: 1.5 + 2.2*Math.random(),
                    color: (() => {
                        const colors = [0xFF6600, 0xFF4400, 0xFF8800, 0xFF5500]; // Відтінки помаранчевого
                        return colors[Math.floor(Math.random() * colors.length)];
                    })(),
                    spreadGrow: 0,
                    tongueBoost: 1.8,
                    tongueSharpness: 2,
                },
                tags: ['on-ground', 'static', 'fire'],
                bottomAnchor: 0,
                terrainAlign: false
            };
            
            // Додаємо джерело вогню
            this.scene.pushObjectWithTerrainConstraint(fire);
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
            
            // Тепер DroneManager сам створює TSceneObject дрона
            this.droneManager.createDrone(`rover_${i}`, { x, y: 0, z }, {
                battery: 15,
                maxBattery: 15,
                inventory: {},
                maxInventory: 5,
                efficiency: 1.5,
                speed: 2.0,
                maxSpeed: 2.0
            });
        }
    }

    /**
     * Генерує будівлі на карті
     */
    private generateBuildings() {
        // Створюємо головну будівлю (базу) у точці 0, terrainHeight, 0
        const baseBuilding: TSceneObject = {
            id: 'base_building',
            type: 'building',
            coordinates: { x: 5, y: 0, z: -5 }, // Y буде автоматично встановлено terrain системою
            scale: { x: 2, y: 2, z: 2 },
            rotation: { x: 0, y: 0, z: 0 },
            data: { 
                buildingType: 'base',
                maxStorage: {
                    stone: 1000,
                    ore: 1000,
                    power: 1000
                }
            },
            tags: ['on-ground', 'static', 'building', 'base', 'storage'],
            bottomAnchor: -1, // Будівля стоїть на своєму низу
            terrainAlign: true, // Нахиляється по нормалі terrain
            targetType: ['unload-resource', 'repair', 'upgrade'],
        };
        
        // Додаємо з terrain constraint
        const success = this.scene.pushObjectWithTerrainConstraint(baseBuilding);
        if (success) {
            // Базова будівля додана
        }

        // Створюємо будівлю для зарядки поруч з базою
        const chargingStation: TSceneObject = {
            id: 'charging_station',
            type: 'building',
            coordinates: { x: -5, y: 0, z: -5 }, // Поруч з базою, але в іншій стороні
            scale: { x: 1.5, y: 1.5, z: 1.5 },
            rotation: { x: 0, y: 0, z: 0 },
            data: { 
                buildingType: 'charging',
                chargeRate: 0.5, // Швидкість зарядки
                maxPower: 1000
            },
            tags: ['on-ground', 'static', 'building', 'charging', 'charge'],
            bottomAnchor: -0.75,
            terrainAlign: true,
            targetType: ['charge'],
        };
        
        // Додаємо зарядну станцію
        const chargingSuccess = this.scene.pushObjectWithTerrainConstraint(chargingStation);
        if (chargingSuccess) {
            // Зарядна станція додана
        }

        console.log('buildingsAdded');
    }

    private lastExplosionTime = 0;
    private explosionInterval = 3000; // 5 секунд в мілісекундах

    tick() {
        const dT = 0.1;
        this.processSceneTick(dT);
        
        // Оновлюємо систему команд
        this.commandSystem.update(dT);
        
        // Оновлюємо групи команд
        this.commandGroupSystem.update(dT);
        
        // Оновлюємо монітор автоматичних груп
        this.autoGroupMonitor.update(dT);
        
        // Переміщуємо об'єкти (швидкість встановлюється командами)
        this.dynamics.moveObjects(dT);
        
        // Генеруємо нові вибухи кожні 5 секунд
        const currentTime = performance.now();
        if (currentTime - this.lastExplosionTime >= this.explosionInterval) {
            //this.generateRandomExplosion();
            this.lastExplosionTime = currentTime;
        }
    }

    processSceneTick(_dT: number) {
        // contains custom logic, managing objects, custom structures and so on...
        const testMovingObj = this.scene.getObjectById('dynamic_test_cube');
        if(testMovingObj && !this.commandSystem.hasActiveCommands(testMovingObj.id)) {
            // Тільки якщо немає активних команд - додаємо тестову анімацію
            if(!testMovingObj.speed) {
                testMovingObj.speed = {x: 0, y: 0, z: 0}
            }
            testMovingObj.speed.x += Math.cos(testMovingObj.coordinates.x*Math.PI);
        }
    }
    
    /**
     * Розподіляє цілі для групи динамічних об'єктів, щоб вони не злипалися
     */
    public distributeTargetsForObjects(objectIds: string[], centerPoint: { x: number; y: number; z: number }) {
        const dynamicObjects = objectIds
            .map(id => this.scene.getObjectById(id))
            .filter(obj => obj && obj.tags?.includes('dynamic')) as TSceneObject[];
        
        if (dynamicObjects.length === 0) return;
        
        // Якщо тільки один об'єкт - просто додаємо команду руху
        if (dynamicObjects.length === 1) {
            const obj = dynamicObjects[0];
            this.addMoveCommand(obj.id, { x: centerPoint.x, y: centerPoint.y, z: centerPoint.z });
            return;
        }
        
        // Для кількох об'єктів - розподіляємо по колу навколо центру
        const radius = Math.min(dynamicObjects.length * 0.8, 10); // Радіус залежить від кількості об'єктів
        const angleStep = (2 * Math.PI) / dynamicObjects.length;
        
        dynamicObjects.forEach((obj, index) => {
            // Розраховуємо позицію на колі
            const angle = index * angleStep;
            const targetX = centerPoint.x + Math.cos(angle) * radius;
            const targetZ = centerPoint.z + Math.sin(angle) * radius;
            
            this.addMoveCommand(obj.id, { x: targetX, y: centerPoint.y, z: targetZ });
        });
    }

    /**
     * Оркестратор для обробки правий-клік з командою або без неї
     */
    public handleRightclickCommand(
        objectIds: string[], 
        centerPoint: { x: number; y: number; z: number },
        commandGroup?: any
    ) {
        // Якщо команда не передана - використовуємо звичайну логіку руху
        if (!commandGroup) {
            this.distributeTargetsForObjects(objectIds, centerPoint);
            return;
        }

        // Якщо передана команда - запускаємо відповідну групу тасків
        // Виконуємо групу команд
        
        // Визначаємо тип ресурсу для gather команд
        let resourceType = 'resource'; // за замовчуванням
        if (commandGroup.id === 'gather-stone-radius' || commandGroup.ui?.category === 'stone') {
            resourceType = 'stone';
        } else if (commandGroup.id === 'gather-ore-radius' || commandGroup.ui?.category === 'ore') {
            resourceType = 'ore';
        } else if (commandGroup.ui?.category === 'all') {
            resourceType = 'resource';
        }
        
        // Запускаємо команду для кожного вибраного юніта
        objectIds.forEach((unitId: string) => {
            const context = {
                objectId: unitId,
                targets: { 
                    center: centerPoint, // Для gather команд
                    resource: undefined,  // Для інших команд
                    base: undefined       // Для інших команд
                },
                parameters: {
                    resourceType: resourceType // Передаємо тип ресурсу для gather команд
                }
            };
            
            const success = this.commandGroupSystem.addCommandGroup(
                unitId,
                commandGroup.id,
                context
            );
            
            if (!success) {
                console.error(`Failed to start command ${commandGroup.id} for ${unitId}`);
            }
        });
    }

    /**
     * Додає команду руху для об'єкта
     */
    private addMoveCommand(objectId: string, target: { x: number; y: number; z: number }) {
        const command = {
            id: `move_${objectId}_${Date.now()}`,
            type: 'move-to' as const,
            position: target,
            parameters: {},
            status: 'pending' as const,
            priority: 1,
            createdAt: Date.now()
        };

        this.commandSystem.addCommand(objectId, command);
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
      * Генерує процедурні вибухи на карті
      */
     private generateExplosions() {
         const explosionCount = 8; // Кількість вибухів на карті

         for (let i = 0; i < explosionCount; i++) {
             // Випадкова позиція на карті
             const x = (Math.random() - 0.5) * 100; // X: -150 до 150
             const z = (Math.random() - 0.5) * 100; // Z: -150 до 150
             const y = 2 + Math.random() * 8; // Y: 2-10 (вибухи в повітрі)
             
             const explosion: TSceneObject = {
                 id: `explosion_${i}`,
                 type: 'explosion',
                 coordinates: { x, y, z },
                 scale: { x: 1, y: 1, z: 1 },
                 rotation: { x: 0, y: 0, z: 0 },
                 data: { 
                     particleSize: 24 + Math.random() * 32, // 24-56 px розмір частинок
                     velocity: 12 + Math.random() * 18, // 12-30 м/с швидкість розльоту
                     particleCount: 800 + Math.floor(Math.random() * 1200), // 800-2000 частинок
                     hue: 15 + Math.random() * 45, // 15-60 (відтінки оранжевого/червоного)
                     alpha: 0.7 + Math.random() * 0.3 // 0.7-1.0 прозорість
                 },
                 tags: ['static', 'explosion'],
                 bottomAnchor: 0,
                 terrainAlign: false
             };
             
             // Додаємо вибух
             this.scene.pushObject(explosion);
         }
     }

     /**
      * Генерує один випадковий вибух з TTL 3 секунди
      */
     private generateRandomExplosion() {
         // Випадкова позиція на карті
         const x = (Math.random() - 0.5) * 100; // X: -100 до 100
         const z = (Math.random() - 0.5) * 100; // Z: -100 до 100
         const y = 13 + Math.random() * 12; // Y: 3-15 (вибухи в повітрі)
         
         // Унікальний ID для динамічного вибуху
         const explosionId = `dynamic_explosion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
         
         const explosion: TSceneObject = {
             id: explosionId,
             type: 'explosion',
             coordinates: { x, y, z },
             scale: { x: 1, y: 1, z: 1 },
             rotation: { x: 0, y: 0, z: 0 },
             data: { 
                 particleSize: 28 + Math.random() * 40, // 28-68 px розмір частинок
                 velocity: 3 + Math.random() * 4, // 15-35 м/с швидкість розльоту
                 particleCount: 500 + Math.floor(Math.random() * 500), // 1000-2500 частинок
                 hue: 10 + Math.random() * 40, // 20-70 (відтінки оранжевого/червоного/жовтого)
                 alpha: 0.8 + Math.random() * 0.2, // 0.8-1.0 прозорість
                 ttl: 2.0, // TTL 3 секунди
                 life: 1.5, // Життя частинки 2.5 секунди
                 spreadRadius: 1.0 + Math.random() * 1.0, // 3-7 м радіус розльоту
                 gravity: 5.0, // Без гравітації (радіальний розліт)
                 drag: 0.3 + Math.random() * 0.3, // 0.3-0.6 опір повітря
                 turbulence: 0.4 + Math.random() * 0.4, // 0.4-0.8 турбулентність
                 sparkFrac: 0.2 + Math.random() * 0.3, // 0.2-0.5 доля іскорок
                 flashLife: 2, // 0.2-0.5 сек тривалість спалаху
                 flashSizePx: 60 + Math.random() * 40, // 120-200 px розмір спалаху
                 flashIntensity: 3.2 + Math.random() * 4.8 // 1.2-2.0 інтенсивність спалаху
             },
             tags: ['dynamic', 'explosion'],
             bottomAnchor: 0,
             terrainAlign: false
         };
         
         // Додаємо динамічний вибух
         this.scene.pushObject(explosion);
         
         // Динамічний вибух згенеровано
     }

     /**
      * Добування ресурсів з каменюки
      */
     mineResource(resourceId: string, selectedObjectIds: string[]): void {
         if (selectedObjectIds.length === 0) {
             console.warn('No objects selected for mining');
             return;
         }

         const resource = this.scene.getObjectById(resourceId);
         if (!resource) {
             console.error(`Resource ${resourceId} not found`);
             return;
         }

         // Перевіряємо чи можуть вибрані об'єкти добувати ресурси
         const miners = selectedObjectIds.filter(id => {
             const obj = this.scene.getObjectById(id);
             return obj && obj.commandType && obj.commandType.includes('collect-resource');
         });

         if (miners.length === 0) {
             console.warn('No valid miners selected');
             return;
         }

         // Починаємо операцію видобутку

         // Запускаємо групу команд для кожного майнера
         miners.forEach(minerId => {
             const context: CommandGroupContext = {
                 objectId: minerId,
                 targets: {
                     resource: resourceId,
                 },
                 parameters: {
                     amount: 100
                 }
             };

             const success = this.commandGroupSystem.addCommandGroup(
                 minerId,
                 'collect-resource',
                 context
             );

             if (success) {
                 // Група команд видобутку запущена
             } else {
                 console.error(`Failed to start mining command group for ${minerId}`);
             }
         });
     }

     /**
      * Зарядка об'єктів
      */
     chargeObject(selectedObjectIds: string[]): void {
         if (selectedObjectIds.length === 0) {
             console.warn('No objects selected for charging');
             return;
         }

         // Перевіряємо чи можуть вибрані об'єкти заряджатися
         const chargeableObjects = selectedObjectIds.filter(id => {
             const obj = this.scene.getObjectById(id);
             return obj && obj.commandType && obj.commandType.includes('charge');
         });

         if (chargeableObjects.length === 0) {
             console.warn('No valid chargeable objects selected');
             return;
         }

         // Починаємо операцію зарядки

         // Запускаємо групу команд для кожного об'єкта
         chargeableObjects.forEach(objectId => {
             const context: CommandGroupContext = {
                 objectId: objectId,
                 targets: {},
                 parameters: {}
             };

             const success = this.commandGroupSystem.addCommandGroup(
                 objectId,
                 'charge-group',
                 context
             );

             if (success) {
                 // Група команд зарядки запущена
             } else {
                 console.error(`Failed to start charging command group for ${objectId}`);
             }
         });
     }

    // ==================== SaveLoadManager Implementation ====================
    
    /**
     * Зберігає стан MapLogic
     */
    save(): MapLogicSaveData {
        // Отримуємо зібрані ресурси як масив ID каменюків
        const collectedRocks: string[] = Array.from(this.collectedRocks);
        
        return {
            seed: this.generatedSeed, // Зберігаємо seed
            collectedRocks,
            buildingPositions: this.getBuildingPositions(),
        };
    }
    
    /**
     * Завантажує стан MapLogic
     */
    load(data: MapLogicSaveData): void {
        // Завантажуємо seed та генеруємо карту
        if (data.seed) {
            // Встановлюємо seed
            this.generatedSeed = data.seed;
            this.seededRandom = new SeededRandom(data.seed);
            this.generationTracker = new MapGenerationTracker(data.seed);
            
            this.initializeSeeded();
            
            console.log('Loaded map with seed:', this.generatedSeed);
        }
        
        // Завантажуємо зібрані ресурси
        if (data.collectedRocks) {
            // Перевіряємо тип - може бути масив або Set (старі збереження)
            let rockIds: string[];
            if (Array.isArray(data.collectedRocks)) {
                rockIds = data.collectedRocks;
            } else if (data.collectedRocks && typeof data.collectedRocks === 'object' && 'add' in data.collectedRocks) {
                // Це Set - конвертуємо в масив
                rockIds = Array.from(data.collectedRocks as Set<string>);
            } else {
                // Якщо щось інше - конвертуємо в масив
                rockIds = Object.values(data.collectedRocks as Record<string, string>);
            }
            
            rockIds.forEach(rockId => {
                this.collectRock(rockId); // Використовуємо новий метод
            });
            
          
        }
        setInterval(
            this.tick.bind(this),
            100 // This will be increased for sure
        )
        
    }
    
    /**
     * Скидає стан MapLogic
     */
    reset(): void {
        // Скидаємо зібрані ресурси
        this.generationTracker.reset();
        this.collectedRocks.clear(); // Очищаємо Set при скиданні
        
        // Видаляємо всі будівлі
        this.clearBuildings();
        
        // Скидаємо дронів через DroneManager
        this.droneManager.reset();
        

    }
    
    /**
     * Отримує позиції будівель
     */
    private getBuildingPositions(): Array<Vector3> {
        const buildings = Object.values(this.scene.getObjects())
            .filter(obj => obj.tags.includes('building'))
            .map(obj => obj.coordinates);
        return buildings;
    }
    
    // Метод getRoverPositions видалено - дрони тепер керуються DroneManager
    
    /**
     * Відновлює будівлі за збереженими позиціями
     */
    private rebuildBuildings(positions: Array<Vector3>): void {
        // Видаляємо поточні будівлі
        const currentBuildings = Object.values(this.scene.getObjects())
            .filter(obj => obj.tags.includes('building'));
        
        currentBuildings.forEach(building => {
            this.scene.removeObject(building.id);
        });
        
        // Створюємо будівлі за збереженими позиціями
        positions.forEach(position => {
            this.generateBuildingAt(position);
        });
    }
    
    // Метод repositionRovers видалено - дрони тепер керуються DroneManager
    
    /**
     * Видаляє всі будівлі
     */
    private clearBuildings(): void {
        const buildings = Object.values(this.scene.getObjects())
            .filter(obj => obj.tags.includes('building'));
        
        buildings.forEach(building => {
            this.scene.removeObject(building.id);
        });
    }
    
    /**
     * Генерує будівлю в заданій позиції
     */
    private generateBuildingAt(position: Vector3): void {
        // Тут можна додати логіку генерації будівель
        // Поки що залишаємо пустим
    }
}