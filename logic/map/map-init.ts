import { DynamicsLogic } from "../scene/dynamics-logic";
import { SceneLogic } from "../scene/scene-logic"
import { MapLogic } from "./map-logic";

export const mapInit = () => {
    const scene = new SceneLogic();
    const dynamic = new DynamicsLogic(scene);
    dynamic.setEnabled(true);

    const map = new MapLogic(scene, dynamic);

    return map;
}