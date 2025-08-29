import { DynamicsLogic } from "../scene/dynamics-logic";
import { SceneLogic } from "../scene/scene-logic"
import { MapLogic } from "./map-logic";
import { ResourceManager } from "../resources";
import { Game } from '../game';

export const mapInit = (seed?: number) => {
    const map = Game.getInstance().mapLogic;
    
    if (seed) {
        map.updateGenerationSeed(seed);
    }

    return map;
}