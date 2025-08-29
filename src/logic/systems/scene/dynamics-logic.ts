import { vLen } from "@utils/vector-math";
import { ISceneLogic } from "@interfaces/index";

export class DynamicsLogic {

    private isEnabled = false;
    
    constructor(public scene: ISceneLogic) {

    }

    setEnabled(isEnable: boolean) {
        this.isEnabled = isEnable;
    }

    getEnabled() {
        return this.isEnabled;
    }

    moveObjects(delta: number) {
        if(!this.getEnabled()) {
            return;
        }

        const dynamicList = this.scene.getObjectsByTag('dynamic').filter(one => !!one.speed && vLen(one.speed) > 1.e-8);

        dynamicList.forEach(item => {
            // Розраховуємо нову позицію на основі швидкості та часу
            if (item.speed) {
                const newPosition = {
                    x: item.coordinates.x + (item.speed.x * delta),
                    y: item.coordinates.y + (item.speed.y * delta),
                    z: item.coordinates.z + (item.speed.z * delta)
                };

                // Переміщуємо об'єкт через SceneLogic API
                this.scene.moveObjectWithTerrainConstraint(item.id, newPosition);
            }
        });
    }
    
}