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

       

        // Логуємо результат
        console.log(`Map initialized: ${addedObjects} objects added, ${skippedObjects} objects skipped (out of bounds)`);

        // Додаємо тестовий динамічний об'єкт (без terrain constraint)
        const dynamicCube: TSceneObject = {
            id: 'dynamic_test_cube',
            type: 'cube',
            coordinates: { x: 0, y: 2, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: { x: 0, y: 0, z: 0 },
            data: { color: 0xff0000 },
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


    tick() {
        const dT = 0.1;
        this.processSceneTick(dT);
        this.dynamics.moveObjects(dT);
    }

    processSceneTick(dT: number) {
        // contains custom logic, managing objects, custom structures and so on...
        const testMovingObj = this.scene.getObjectById('dynamic_test_cube');
        if(testMovingObj) {
            if(!testMovingObj.speed) {
                testMovingObj.speed = {x: 0, y: 0, z: 0}
            }
            testMovingObj.speed.x += Math.cos(testMovingObj.coordinates.x*Math.PI);
        }
    }

}