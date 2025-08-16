import { SceneLogic } from '../scene/scene-logic';
import { TCameraProps } from '../../shared/camera.types';

export class MapLogic {

    constructor(public scene: SceneLogic) {
        // Constructor implementation
    }

    initMap(cameraProps: TCameraProps) {
        this.scene.initializeViewport(cameraProps);

        let addedObjects = 0;
        let skippedObjects = 0;

        // Генеруємо сітку 100x100 кубів
        for (let x = 0; x < 100; x++) {
            for (let z = 0; z < 100; z++) {
                // Різні розміри для різноманітності
                const scaleX = 0.5 + Math.random() * 2; // 0.5 - 2.5
                const scaleY = 0.5 + Math.random() * 3; // 0.5 - 3.5
                const scaleZ = 0.5 + Math.random() * 2; // 0.5 - 2.5
                
                // Різні кольори
                const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                
                const success = this.scene.pushObject({
                    id: `cube_${x}_${z}`,
                    coordinates: {
                        x: x * 5 - 100, // Відстань 5 одиниць по X
                        y: 0,     // Всі куби на землі
                        z: z * 5 - 100, // Відстань 5 одиниць по Z
                    },
                    type: 'cube',
                    scale: {
                        x: scaleX,
                        y: scaleY,
                        z: scaleZ,
                    },
                    rotation: {
                        x: 0,
                        y: Math.random() * Math.PI * 2, // Випадковий поворот навколо Y
                        z: 0,
                    },
                    data: {
                        color: randomColor
                    }
                });

                if (success) {
                    addedObjects++;
                } else {
                    skippedObjects++;
                }
            }
        }

        // Логуємо результат
        console.log(`Map initialized: ${addedObjects} objects added, ${skippedObjects} objects skipped (out of bounds)`);

        setInterval(
            this.tick,
            1000 // This will be increased for sure
        )
    }

    tick() {
        // Logic is ticking
    }

}