import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';

export class ChargeExecutor extends CommandExecutor {
    private readonly chargeDistance = 2.0; // Відстань для зарядки

    getEnergyUpkeep() {
        return 0;
    }

    execute(): CommandResult {
        const { objectId, scene, deltaTime, mapLogic } = this.context;
        
        // Отримуємо об'єкт, який виконує команду
        const object = scene.getObjectById(objectId);
        if (!object) {
            return { success: false, message: 'Object not found' };
        }

        // Шукаємо зарядну станцію поблизу
        const chargingStation = this.findChargingStation(object, scene);
        if (!chargingStation) {
            return { success: false, message: 'No charging station nearby' };
        }

        // Перевіряємо відстань до зарядної станції
        const distance = this.calculateDistance(object.coordinates, chargingStation.coordinates);
        if (distance > this.chargeDistance) {
            return { success: false, message: 'Too far from charging station' };
        }

        // Перевіряємо наявність глобального ресурсу power
        if (mapLogic && mapLogic.resources) {
            const globalPower = mapLogic.resources.getResourceAmount('energy');
            if (globalPower <= 0) {
                return { success: false, message: 'No global power available' };
            }
        }

        // Заряджаємо об'єкт зі швидкістю станції
        const chargeRate = chargingStation.data.chargeRate || 0.02; // Використовуємо chargeRate зі станції
        const chargeAmount = chargeRate * deltaTime;
        
        console.log('Charging...', chargeAmount, chargeRate, object.data, chargingStation.data);

        if (object.data.power < object.data.maxPower) {
            // Споживаємо глобальний ресурс power
            if (mapLogic && mapLogic.resources) {
                const consumedPower = Math.min(chargeAmount, mapLogic.resources.getResourceAmount('energy'));
                if (consumedPower <= 0) {
                    return { success: false, message: 'Insufficient global power' };
                }
                
                // Зменшуємо глобальний ресурс
                mapLogic.resources.spendResources([{
                    resourceId: 'energy',
                    amount: consumedPower,
                    reason: 'charging'
                }]);
                
                // Заряджаємо об'єкт на величину спожитого ресурсу
                object.data.power = Math.min(object.data.maxPower, object.data.power + consumedPower);
            } else {
                // Якщо немає доступу до ресурсів - заряджаємо без споживання
                object.data.power = Math.min(object.data.maxPower, object.data.power + chargeAmount);
            }
            
            // Якщо повністю заряджений - завершуємо команду
            if (object.data.power >= object.data.maxPower) {
                return { success: true, message: 'Fully charged' };
            }
            
            // Продовжуємо зарядку
            return { success: true, message: 'Charging...', data: { power: object.data.power } };
        }

        return { success: true, message: 'Already fully charged' };
    }

    canExecute(): boolean {
        const { objectId, scene } = this.context;
        const object = scene.getObjectById(objectId);
        
        if (!object) return false;
        
        // Можна заряджати тільки якщо є power та maxPower
        if (!object.data.power || !object.data.maxPower) return false;
        
        // Можна заряджати тільки якщо не повністю заряджений
        if (object.data.power >= object.data.maxPower) return false;
        
        return true;
    }

    completeCheck(): boolean {
        const { objectId, scene } = this.context;
        const object = scene.getObjectById(objectId);
        
        if (!object) return true; // Завершуємо якщо об'єкт не знайдено
        
        // Команда завершена якщо об'єкт повністю заряджений
        return object.data.power >= object.data.maxPower;
    }

    private findChargingStation(object: any, scene: any): any | null {
        // Використовуємо новий метод getObjectsByTagInRadius
        const nearbyChargingStations = scene.getObjectsByTagInRadius(
            'charge',
            object.coordinates,
            this.chargeDistance
        );
        
        // Знаходимо найближчу зарядну станцію типу building
        return nearbyChargingStations.find((station: any) => station.type === 'building') || null;
    }

    private calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}
