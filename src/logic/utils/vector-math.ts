// ---- типи ----
export interface Vector3 { x:number; y:number; z:number; }
export type Quaternion = { x:number; y:number; z:number; w:number };

// ---- вектори ----
const EPS = 1e-10;
export const vLen = (a:Vector3) => Math.hypot(a.x,a.y,a.z);
export const vDistance = (a:Vector3, b:Vector3) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
export const vDot = (a:Vector3,b:Vector3) => a.x*b.x + a.y*b.y + a.z*b.z;
const vCross = (a:Vector3,b:Vector3):Vector3 => ({
  x: a.y*b.z - a.z*b.y,
  y: a.z*b.x - a.x*b.z,
  z: a.x*b.y - a.y*b.x,
});
const vNormalize = (a:Vector3):Vector3 => {
  const l = vLen(a); return l < EPS ? {x:0,y:0,z:0} : { x:a.x/l, y:a.y/l, z:a.z/l };
};

// ---- кватерніони ----
const qNormalize = (q:Quaternion):Quaternion => {
  const l = Math.hypot(q.x,q.y,q.z,q.w) || 1;
  return { x:q.x/l, y:q.y/l, z:q.z/l, w:q.w/l };
};
const qMultiply = (a:Quaternion, b:Quaternion):Quaternion => ({
  w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
  x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
  y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
  z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
});
const qFromAxisAngle = (axis:Vector3, angle:number):Quaternion => {
  const n = vNormalize(axis);
  const h = angle*0.5, s = Math.sin(h);
  return qNormalize({ x:n.x*s, y:n.y*s, z:n.z*s, w:Math.cos(h) });
};
// up→n (стійко до протилежних)
const qFromUnitVectors = (from:Vector3, to:Vector3):Quaternion => {
  const a = vNormalize(from), b = vNormalize(to);
  let r = 1 + vDot(a,b);
  if (r < EPS) {
    // майже протилежні: виберемо будь-яку ортогональну вісь
    let axis = vCross({x:1,y:0,z:0}, a);
    if (Math.abs(axis.x)<EPS && Math.abs(axis.y)<EPS && Math.abs(axis.z)<EPS) {
      axis = vCross({x:0,y:1,z:0}, a);
    }
    axis = vNormalize(axis);
    return { x:axis.x, y:axis.y, z:axis.z, w:0 }; // 180°
  } else {
    const c = vCross(a,b);
    return qNormalize({ x:c.x, y:c.y, z:c.z, w:r });
  }
};

// Кватерніон -> Euler 'XYZ' (дефолт Three.js)
const quatToEulerXYZ = (q:Quaternion):Vector3 => {
  const x=q.x,y=q.y,z=q.z,w=q.w;
  const m11 = 1 - 2*(y*y + z*z);
  const m12 = 2*(x*y - z*w);
  const m13 = 2*(x*z + y*w);
  const m22 = 1 - 2*(x*x + z*z);
  const m23 = 2*(y*z - x*w);
  const m32 = 2*(y*z + x*w);
  const m33 = 1 - 2*(x*x + y*y);
  const clamp = (v:number,lo:number,hi:number)=>Math.min(Math.max(v,lo),hi);

  // Порядок 'XYZ':
  const ey = Math.asin(clamp(m13, -1, 1));
  let ex:number, ez:number;
  if (Math.abs(m13) < 0.9999999) {
    ex = Math.atan2(-m23, m33);
    ez = Math.atan2(-m12, m11);
  } else {
    // ґімбл-лок при Y ≈ ±90°
    ex = Math.atan2(m32, m22);
    ez = 0;
  }
  return { x:ex, y:ey, z:ez };
};

/**
 * Орієнтація: up = normal, потім твіст навколо normal на angle (радіани).
 * Повертає Euler (x,y,z) у порядку 'XYZ' — готово для mesh.rotation.
 */
export const orientOnSurfaceEulerXYZ = (
  normal: Vector3,
  angle: number
): Vector3 => {
  const n = vNormalize(normal);
  if (vLen(n) < EPS) {
    // фолбек: просто твіст навколо глобального up
    return quatToEulerXYZ(qFromAxisAngle({x:0,y:1,z:0}, angle));
  }

  // 1) align: (0,1,0) -> n
  const align = qFromUnitVectors({x:0,y:1,z:0}, n);

  // 2) spin у світових координатах навколо n на angle
  const spin  = qFromAxisAngle(n, angle);

  // 3) ВАЖЛИВО: остаточний = spin * align (ліве множення)
  const final = qMultiply(spin, align);

  // 4) у Euler для дефолтного порядку 'XYZ'
  return quatToEulerXYZ(final);
}
