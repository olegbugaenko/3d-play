import { Game } from '@game/game';

export const mapInit = (seed?: number) => {
    const map = Game.getInstance().mapLogic;
    
    if (seed) {
        map.updateGenerationSeed(seed);
    }

    return map;
}