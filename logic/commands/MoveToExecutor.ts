import { CommandExecutor } from './CommandExecutor';
import { CommandResult } from './command.types';
import * as THREE from 'three';

export class MoveToExecutor extends CommandExecutor {
    private targetReached: boolean = false;
    private lastPosition: THREE.Vector3 | null = null;
    private stuckTimer: number = 0;
    private readonly stuckThreshold: number = 2.0; // секунди
    private readonly arrivalDistance: number = 0.5;

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
        if (!this.canExecute()) {
            return {
                success: false,
                message: 'Cannot execute move command'
            };
        }

        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) {
            return {
                success: false,
                message: 'Object not found'
            };
        }

        const target = this.command.position!;
        const maxSpeed = (object.data as any)?.maxSpeed || 2.0;

        // Встановлюємо target в obj.data для відображення таргета
        if (!object.data) object.data = {};
        object.data.target = { x: target.x, y: target.y, z: target.z };

        // Розраховуємо відстань до цілі
        const distanceToTarget = Math.sqrt(
            Math.pow(object.coordinates.x - target.x, 2) + 
            Math.pow(object.coordinates.z - target.z, 2)
        );

        // Перевіряємо чи досягли цілі
        if (distanceToTarget < this.arrivalDistance) {
            this.targetReached = true;
            this.stopMovement(object);
            return {
                success: true,
                message: 'Target reached'
            };
        }

        // Перевіряємо чи не застрягли
        if (this.lastPosition) {
            const currentPos = new THREE.Vector3(object.coordinates.x, 0, object.coordinates.z);
            const distanceMoved = currentPos.distanceTo(this.lastPosition);
            
            if (distanceMoved < 0.01) { // Майже не рухаємося
                this.stuckTimer += this.context.deltaTime;
                if (this.stuckTimer > this.stuckThreshold) {
                    return {
                        success: false,
                        message: 'Object is stuck'
                    };
                }
            } else {
                this.stuckTimer = 0;
            }
        }

        // Оновлюємо позицію для перевірки застрягання
        this.lastPosition = new THREE.Vector3(object.coordinates.x, 0, object.coordinates.z);

        // Розраховуємо напрямок до цілі
        const directionX = target.x - object.coordinates.x;
        const directionZ = target.z - object.coordinates.z;
        const directionLength = Math.sqrt(directionX * directionX + directionZ * directionZ);

        // Нормалізуємо напрямок
        const normalizedDirectionX = directionX / directionLength;
        const normalizedDirectionZ = directionZ / directionLength;

        // Встановлюємо швидкість
        if (!object.speed) {
            object.speed = { x: 0, y: 0, z: 0 };
        }

        object.speed.x = normalizedDirectionX * maxSpeed;
        object.speed.z = normalizedDirectionZ * maxSpeed;
        object.speed.y = 0; // Для on-ground об'єктів

        // Оновлюємо обертання об'єкта в напрямку руху
        const objData = object.data as any;
        if (objData?.rotatable !== false) {
            const baseRotation = Math.atan2(normalizedDirectionZ, normalizedDirectionX);
            const rotationOffset = objData?.rotationOffset || 0;
            object.rotation.y = -(baseRotation + rotationOffset);
        }

        return {
            success: true,
            message: 'Moving to target'
        };
    }

    completeCheck(): boolean {
        if (this.targetReached) {
            // Очищаємо target коли команда завершена
            const object = this.context.scene.getObjectById(this.context.objectId);
            if (object && object.data) {
                object.data.target = undefined;
            }
        }
        return this.targetReached;
    }

    private stopMovement(object: any): void {
        if (object.speed) {
            object.speed.x = 0;
            object.speed.y = 0;
            object.speed.z = 0;
        }
        
        // Очищаємо target коли рух зупиняється
        if (object.data) {
            object.data.target = undefined;
        }
    }
}
