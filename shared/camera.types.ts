import { Vector3 } from './math.types';

export interface TCameraProps {
    position: Vector3;
    rotation: Vector3;
    fov: number;
    aspect: number;
    distance: number; // Відстань між камерою та точкою фокусу
}