import { Vector3 } from '@utils/vector-math';

export interface TCameraProps {
    position: Vector3;
    rotation: Vector3;
    fov: number;
    aspect: number;
    distance: number; // Відстань між камерою та точкою фокусу
}