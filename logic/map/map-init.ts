import { DynamicsLogic } from "../scene/dynamics-logic";
import { SceneLogic } from "../scene/scene-logic"
import { MapLogic } from "./map-logic";
import { ResourceManager } from "../resources";

export const mapInit = (seed?: number) => {
    const scene = new SceneLogic();
    const dynamic = new DynamicsLogic(scene);
    dynamic.setEnabled(true);

    // Створюємо ResourceManager з початковими ресурсами
    const resources = new ResourceManager({
        energy: 150,
        stone: 75,
        ore: 25
    });

    // Передаємо seed для детермінованої генерації
    const map = new MapLogic(scene, dynamic, resources, seed);

    return map;
}