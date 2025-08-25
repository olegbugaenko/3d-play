import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';
import * as THREE from 'three';

export class MoveToExecutor extends CommandExecutor {
    private target: THREE.Vector3;
    private isMoving: boolean = false;
    private stuckTime: number = 0;
    private lastPosition: THREE.Vector3 = new THREE.Vector3();
    private stuckThreshold: number = 2.0; // Секунди
    private arrivalDistance: number = 0.5; // Дистанція прибуття

    constructor(command: any, context: any) {
        super(command, context);
        this.target = new THREE.Vector3(
            command.position.x,
            command.position.y,
            command.position.z
        );
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
        
        const distance = currentPos.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
        
        if (distance <= this.arrivalDistance) {
            this.stopMovement();
            return { success: true, message: 'Target reached' };
        }

        // Перевіряємо чи не застряг об'єкт (тільки якщо рухаємося)
        if (this.isMoving) {
            const currentDistance = currentPos.distanceTo(this.lastPosition);
            if (currentDistance < 0.1) { // Збільшуємо поріг застрягання
                this.stuckTime += this.context.deltaTime;
                if (this.stuckTime > this.stuckThreshold) {
                    this.stopMovement();
                    return { success: false, message: `Object stuck in ${distance.toFixed(2)} meters` };
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

        // Встановлюємо швидкість руху
        const direction = new THREE.Vector3(target.x, target.y, target.z).sub(currentPos).normalize();
        const speed = object.data?.maxSpeed || 1.0;
        
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
            object.rotation.y = targetRotation + rotationOffset;
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
        
        const distance = currentPos.distanceTo(new THREE.Vector3(
            target.x,
            target.y,
            target.z
        ));

        if (distance <= this.arrivalDistance) {
            // Очищаємо target коли прибули
            if (object.data) {
                object.data.target = undefined;
            }
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
        
        this.isMoving = false;
    }
}
