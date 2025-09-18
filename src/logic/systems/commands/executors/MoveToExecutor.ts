import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, CommandFailureCode } from '../command.types';
import * as THREE from 'three';

export class MoveToExecutor extends CommandExecutor {
    private isMoving: boolean = false;
    private stuckTime: number = 0;
    private lastPosition: THREE.Vector3 = new THREE.Vector3();
    private stuckThreshold: number = 2.0; // Секунди
    private arrivalDistance: number = 0.5; // Дистанція прибуття
    
    // Маршрут та поточна точка
    private waypoints: THREE.Vector3[] = [];
    private currentWaypointIndex: number = 0;
    private pathPlanned: boolean = false;

    constructor(command: any, context: any) {
        super(command, context);
    }

    getEnergyUpkeep() {
        return 0;
    }

    /**
     * Перевіряє чи доступна цільова точка для об'єкта
     */
    private isTargetAccessible(target: THREE.Vector3, object: any): boolean {
        try {
            // Отримуємо PathfindingSystem з контексту
            const pathfindingSystem = this.context.scene.pathfinder;
            if (!pathfindingSystem) {
                console.warn('PathfindingSystem not available');
                return false;
            }

            // Перевіряємо чи можна стати в цільовій точці
            return pathfindingSystem.canStandAtWorld(target.x, target.z, object, 0.05);
        } catch (error) {
            console.warn('Target accessibility check failed:', error);
            return false;
        }
    }

    /**
     * Планує маршрут до цілі через pathfinding
     */
    private planPath(start: THREE.Vector3, target: THREE.Vector3, object: any): boolean {
        try {
            // Спочатку перевіряємо чи доступна цільова точка
            if (!this.isTargetAccessible(target, object)) {
                console.warn(`Target point (${target.x.toFixed(2)}, ${target.z.toFixed(2)}) is not accessible for object ${object.id}`);
                return false;
            }
            // Викликаємо pathfinding для пошуку оптимального шляху
            const path = this.context.scene.findOptimalPathWithTerrain(
                { x: start.x, y: start.y, z: start.z },
                { x: target.x, y: target.y, z: target.z },
                object
            );
            
            if (path.length === 0) {
                return false; // Шлях не знайдено
            }

            // Конвертуємо в THREE.Vector3 та додаємо початкову точку
            this.waypoints = [...path.map((p: any) => new THREE.Vector3(p.x, p.y, p.z))];
            this.currentWaypointIndex = 1; // Починаємо з першої проміжної точки
            this.pathPlanned = true;
            // Застосовуємо у з вейпойнту, так як він уже враховує висоту террейну
            this.command.position.y = this.waypoints[this.waypoints.length - 1].y;
            console.warn('Path planned: ', path, this.waypoints);

            return true;
        } catch (error) {
            console.warn('Path planning failed:', error);
            return false;
        }
    }
    canExecute(): boolean {
        if (!this.command.position) {
            return false;
        }

        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.tags?.includes('dynamic')) {
            return false;
        }

        return true;
    }

    execute(): CommandResult {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) {
            return { success: false, message: 'Object not found' };
        }

        object.data.animationId = 'move';

        // Автоматично розв'язуємо targetId до координат якщо position = {0,0,0}
        if (this.command.targetId && 
            this.command.position.x === 0 && 
            this.command.position.y === 0 && 
            this.command.position.z === 0) {
            
            const target = this.context.scene.getObjectById(this.command.targetId);
            if (target) {
                this.command.position = { ...target.coordinates };
            } else {
                return { success: false, message: `Target object ${this.command.targetId} not found` };
            }
        }

        const target = this.command.position!;
        
        // Встановлюємо target для візуалізації
        if (object.data) {
            object.data.target = { x: target.x, y: target.y, z: target.z };
        }

        // Перевіряємо чи об'єкт вже на місці
        const currentPos = new THREE.Vector3(
            object.coordinates.x,
            object.coordinates.y,
            object.coordinates.z
        );

        // Плануємо маршрут при першому виклику
        if (!this.pathPlanned) {
            if (!this.planPath(currentPos, new THREE.Vector3(target.x, target.y, target.z), object)) {
                return { 
                    success: false, 
                    message: `Failed to plan path to target (${target.x.toFixed(2)}, ${target.z.toFixed(2)}) - target may be inaccessible`,
                    code: CommandFailureCode.TARGET_INACCESSIBLE
                };
            }
        }

        // Отримуємо поточну цільову точку (waypoint або фінальна ціль)
        let currentTarget: THREE.Vector3 = new THREE.Vector3(0,0,0);
        if (this.currentWaypointIndex < this.waypoints.length) {
            currentTarget.copy(this.waypoints[this.currentWaypointIndex]);
        } else {
            currentTarget = new THREE.Vector3(target.x, target.y, target.z);
        }
        
        const distance = currentPos.distanceTo(currentTarget);
        // console.log('Moving: ', currentTarget, this.currentWaypointIndex, this.waypoints, distance);

        // Якщо досягли поточної точки - переходимо до наступної
        if (distance <= this.arrivalDistance) {
            if (this.currentWaypointIndex < this.waypoints.length - 1) {
                this.currentWaypointIndex++;
                return { success: true, message: 'Moving to next waypoint' };
            } else {
                // Досягли фінальної цілі
                this.stopMovement();
                return { success: true, message: 'Target reached', data: { distance, currentTarget}  };
            }
        }

        // Перевіряємо чи не застряг об'єкт (тільки якщо рухаємося)
        if (this.isMoving) {
            const currentDistance = currentPos.distanceTo(this.lastPosition);
            if (currentDistance < 0.1) { // Збільшуємо поріг застрягання
                this.stuckTime += this.context.deltaTime;
                if (this.stuckTime > this.stuckThreshold) {
                    this.stopMovement();
                    return { 
                        success: false, 
                        message: `Object stuck in ${distance.toFixed(2)} meters`,
                        code: CommandFailureCode.OBJECT_STUCK
                    };
                }
            } else {
                this.stuckTime = 0;
            }
        }

        // Починаємо рух
        if (!this.isMoving) {
            this.isMoving = true;
            this.stuckTime = 0;
        }

        // Зберігаємо поточну позицію для перевірки застрягання
        this.lastPosition.copy(currentPos);

        // Встановлюємо швидкість руху до поточної цільової точки
        const direction = currentTarget.sub(currentPos).normalize();
        let speed = object.data?.maxSpeed || 1.0;
        
        // Перевіряємо чи дрон на дорозі та застосовуємо бонус швидкості
        const pathfindingSystem = this.context.scene.pathfinder;
        if (pathfindingSystem) {
            const roadSpeedBonus = pathfindingSystem.getSpeedBonusAtWorld(currentPos.x, currentPos.z);
            if (roadSpeedBonus > 1.0) {
                speed *= roadSpeedBonus;
                console.log(`Road speed bonus: ${roadSpeedBonus}x, new speed: ${speed} at (${currentPos.x.toFixed(1)}, ${currentPos.z.toFixed(1)})`);
            }
        }
        
        // Ініціалізуємо speed якщо не існує
        if (!object.speed) {
            object.speed = { x: 0, y: 0, z: 0 };
        }
        
        object.speed.x = direction.x * speed;
        object.speed.y = direction.y * speed;
        object.speed.z = direction.z * speed;

        // Додаємо логування для дебагу
        
        // Обертаємо об'єкт в напрямку руху (якщо можна)
        if (object.data?.rotatable) {
            const targetRotation = Math.atan2(direction.x, direction.z);
            const rotationOffset = object.data.rotationOffset || 0;
            
            // Якщо об'єкт terrainAlign - зберігаємо 2D ротацію відносно нормалі
            if (object.terrainAlign) {
                object.rotation2D = targetRotation + rotationOffset;
            } else {
                // Для звичайних об'єктів - як зараз
                object.rotation.y = targetRotation + rotationOffset;
            }
            
            // 🚀 Синхронізуємо ротацію з рендерером
            this.syncRotation(object);
        }

        return { success: true, message: 'Moving to target' };
    }

    completeCheck(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) return true;

        const currentPos = new THREE.Vector3(
            object.coordinates.x,
            object.coordinates.y,
            object.coordinates.z
        );

        const target = this.command.position!;
        
        // Перевіряємо чи досягли фінальної цілі
        const distance = currentPos.distanceTo(new THREE.Vector3(
            target.x,
            target.y,
            target.z
        ));



        if (distance <= this.arrivalDistance) {
            // 🚀 Зупиняємо рух коли прибули
            this.stopMovement();
            return true;
        }

        return false;
    }

    private stopMovement(): void {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (object && object.speed) {
            object.speed.x = 0;
            object.speed.y = 0;
            object.speed.z = 0;
        }
        
        // Очищаємо target коли зупиняємося
        if (object && object.data) {
            object.data.target = undefined;
        }
        object.data.animationId = null;

        // 🚀 Синхронізуємо зміни з рендерером
        if (object) {
            this.syncRotation(object);
        }
        
        // Очищаємо маршрут
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        this.pathPlanned = false;
        
        this.isMoving = false;
    }
}
