import * as THREE from 'three';

/**
 * Орієнтує об'єкт так, щоб:
 *  - його up співпав із normal,
 *  - його "forward" (локальний +Z) був повернутий на angle навколо normal,
 *    відраховуючи кут від проєкції worldForward на площину ⟂ normal.
 *
 * @param obj         THREE.Object3D
 * @param normal      THREE.Vector3 (може бути ненормалізованим)
 * @param angle       радіани
 * @param worldForward базовий світовий напрям для азимуту (за замовч. (0,0,1))
 */
export function orientByNormalAndAngle(
  obj: THREE.Object3D,
  normal: THREE.Vector3,
  angle: number,
  worldForward = new THREE.Vector3(0, 0, 1)
) {
  const n = normal.clone().normalize();
  if (n.lengthSq() === 0) return; // нічого не робимо

  // 1) базовий тангенс на площині: t0 = worldForward - n * (worldForward·n)
  let t0 = worldForward.clone().addScaledVector(n, -worldForward.dot(n));
  if (t0.lengthSq() < 1e-12) {
    // якщо worldForward ≈ паралельний normal — беремо інший опорний
    t0.set(1, 0, 0).addScaledVector(n, -n.x);
  }
  t0.normalize();

  // 2) крутимо t0 навколо n на кут angle
  const spin = new THREE.Quaternion().setFromAxisAngle(n, angle);
  t0.applyQuaternion(spin);

  // 3) будуємо правий та остаточний forward (ортонормований базис)
  const right = new THREE.Vector3().crossVectors(t0, n).normalize(); // right = forward × up
  const fwd   = new THREE.Vector3().crossVectors(n, right).normalize();

  // 4) із базису -> матриця -> кватерніон
  const m = new THREE.Matrix4().makeBasis(right, n, fwd); // стовпці = right, up, forward
  obj.quaternion.setFromRotationMatrix(m);
}
