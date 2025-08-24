import * as THREE from 'three';

type GetMeshById = (id: string) => THREE.Object3D | null;
type GetSceneObject = (id: string) => any | null;

// -------------------------------------------------------------
// Glow helper: гладка напівпрозора сфера (яскравіший центр)
// -------------------------------------------------------------
function makeGlowBallMaterial(
  base: THREE.MeshBasicMaterial,
  opts?: {
    centerPower?: number;
    colorBoost?: number;
    alphaBoost?: number;
  }
) {
  const centerPower = opts?.centerPower ?? 3.0;
  const colorBoost  = opts?.colorBoost  ?? 1.7;
  const alphaBoost  = opts?.alphaBoost  ?? 1.0;

  base.wireframe   = false;
  base.transparent = true;
  base.depthWrite  = false;             // важливо для additive
  base.toneMapped  = false;
  base.blending    = THREE.AdditiveBlending;

  base.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
      `)
      .replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        vViewNormal = normalize( normalMatrix * objectNormal );
      `)
      .replace('#include <project_vertex>', `
        #include <project_vertex>
        vViewPosition = -mvPosition.xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
      `)
      .replace('#include <tonemapping_fragment>', `
        // напрямок ВІД камери до фрагмента
        vec3 V = normalize( vViewPosition ); V = -V;
        float center = clamp( dot( normalize(vViewNormal), V ), 0.0, 1.0 );
        center = pow( center, ${centerPower.toFixed(2)} );

        // підсилення кольору/альфи до центру
        gl_FragColor.rgb *= (1.0 + center * ${colorBoost.toFixed(2)});
        gl_FragColor.a   *= (0.10 + center * ${alphaBoost.toFixed(2)});

        #include <tonemapping_fragment>
      `);
  };

  base.needsUpdate = true;
  return base;
}

function makeCenterGlowByView_SAFE(
    base: THREE.MeshBasicMaterial,
    opts?: {
      centerPower?: number;
      colorBoost?: number;
      alphaMin?: number;
      alphaMax?: number;
      alphaFloor?: number;
      debugSolidRed?: boolean;
    }
  ) {
    const centerPower = opts?.centerPower ?? 2.6;
    const colorBoost  = opts?.colorBoost  ?? 2.0;
    const alphaMin    = opts?.alphaMin    ?? 0.05;
    const alphaMax    = opts?.alphaMax    ?? 1.00;
    const alphaFloor  = opts?.alphaFloor  ?? 0.02;
    const debugSolid  = !!opts?.debugSolidRed;
  
    base.transparent = true;
    base.depthWrite  = false;
    base.depthTest   = false;
    base.blending    = THREE.AdditiveBlending;
    base.toneMapped  = false;
    base.side        = THREE.FrontSide;
  
    base.onBeforeCompile = (shader) => {
      // ---- VERTEX: створюємо varyings та присвоюємо значення ----
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `
          #include <common>
          varying vec3 vViewNormal;
          varying vec3 vViewPos;
        `)
        // Після розрахунку transformedNormal:
        .replace('#include <defaultnormal_vertex>', `
          #include <defaultnormal_vertex>
          vViewNormal = normalize( normalMatrix * transformedNormal );
        `)
        // Після розрахунку mvPosition:
        .replace('#include <project_vertex>', `
          #include <project_vertex>
          vViewPos = mvPosition.xyz;
        `);
  
      // ---- FRAGMENT: оголошуємо ті ж varyings у шейдері фрагмента ----
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
          #include <common>
          varying vec3 vViewNormal;
          varying vec3 vViewPos;
        `);
  
      // ---- FRAGMENT: підміна фінального присвоєння gl_FragColor ----
      const FRAG = shader.fragmentShader;
  
      const injectCode = `
        // ---- injected center glow begin ----
        vec3 V = normalize(-vViewPos); // напрямок до камери у view-space
  
        float center = clamp(dot(normalize(vViewNormal), V), 0.0, 1.0);
        center = pow(center, ${centerPower.toFixed(2)});
  
        // База кольору/альфи, які вже порахував MeshBasic:
        vec3  outRGB = diffuseColor.rgb;
        float outA   = diffuseColor.a;
  
        // Підсилення
        outRGB *= (1.0 + center * ${colorBoost.toFixed(2)});
        float a = mix(${alphaMin.toFixed(2)}, ${alphaMax.toFixed(2)}, center);
        a = max(a, ${alphaFloor.toFixed(2)});
        outA *= a;
  
        ${debugSolid ? 'outRGB = vec3(1.0, 0.0, 0.0); outA = 1.0;' : ''}
  
        // ---- injected center glow end ----
      `;
  
      const patterns = [
        /gl_FragColor\s*=\s*vec4\s*\(\s*diffuseColor\.rgb\s*,\s*diffuseColor\.a\s*\)\s*;/, // MeshBasic
        /gl_FragColor\s*=\s*vec4\s*\(\s*outgoingLight\s*,\s*diffuseColor\.a\s*\)\s*;/,     // інші матеріали
        /gl_FragColor\s*=\s*vec4\s*\(\s*totalEmissiveRadiance\s*,\s*diffuseColor\.a\s*\)\s*;/,
      ];
  
      let replaced = false;
      for (const pat of patterns) {
        if (pat.test(FRAG)) {
          shader.fragmentShader = FRAG.replace(pat, `
            ${injectCode}
            gl_FragColor = vec4(outRGB, outA);
          `);
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        shader.fragmentShader = FRAG.replace(/}\s*$/, `
          ${injectCode}
          gl_FragColor = vec4(outRGB, outA);
        }
        `);
      }
  
      // На відладку можна подивитись результат:
      // console.log('FRAGMENT:\\n', shader.fragmentShader);
    };
  
    base.needsUpdate = true;
    return base;
  }
  
  function makeInteractiveGlowShaderMaterialPortable(opts?: {
    color?: THREE.ColorRepresentation;
    centerPower?: number;   // різкість ядра (2..6)
    colorBoost?: number;    // підсилення кольору до центру
    alphaMin?: number;      // альфа на краях
    alphaMax?: number;      // альфа в центрі
    alphaFloor?: number;    // мін. альфа
    debugCenter?: boolean;  // показати центр як ч/б
  }) {
    const color       = new THREE.Color(opts?.color ?? 0x66ccff);
    const centerPower = opts?.centerPower ?? 2.6;
    const colorBoost  = opts?.colorBoost  ?? 2.0;
    const alphaMin    = opts?.alphaMin    ?? 0.12;
    const alphaMax    = opts?.alphaMax    ?? 1.00;
    const alphaFloor  = opts?.alphaFloor  ?? 0.01;
    const debugCenter = !!opts?.debugCenter;
  
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:       { value: color },
        uCenterPower: { value: centerPower },
        uColorBoost:  { value: colorBoost },
        uAlphaMin:    { value: alphaMin },
        uAlphaMax:    { value: alphaMax },
        uAlphaFloor:  { value: alphaFloor },
        uDebugCenter: { value: debugCenter ? 1 : 0 },
      },
      //defines: {
      //  USE_INSTANCING: 1, // щоб ми знали, що є instanceMatrix
      //},
      vertexShader: `
        precision highp float;
  
        // attribute vec3 position;
        // #ifdef USE_INSTANCING
        // attribute mat4 instanceMatrix;
        // #endif
  
        // uniform mat4 modelMatrix;
        // uniform mat4 viewMatrix;
        // uniform mat4 projectionMatrix;
  
        varying vec3 vViewPos;
  
        void main() {
          mat4 modelMat = modelMatrix;
          #ifdef USE_INSTANCING
            modelMat = modelMat * instanceMatrix;
          #endif
  
          vec4 mvPos = viewMatrix * modelMat * vec4(position, 1.0);
          vViewPos   = mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        precision highp float;
        // derivatives для WebGL1; у WebGL2 вони вбудовані
        #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
        #endif
  
        uniform vec3  uColor;
        uniform float uCenterPower;
        uniform float uColorBoost;
        uniform float uAlphaMin, uAlphaMax, uAlphaFloor;
        uniform int   uDebugCenter;
  
        varying vec3 vViewPos;
  
        void main() {
          // нормаль у view-space з геометричних похідних
          vec3 dx = dFdx(vViewPos);
          vec3 dy = dFdy(vViewPos);
          vec3 N  = normalize(cross(dx, dy));       // view-space normal
          vec3 V  = normalize(-vViewPos);           // напрямок до камери
  
          float center = clamp(dot(N, V), 0.0, 1.0);
          center = pow(center, uCenterPower);
  
          if (uDebugCenter == 1) {
            gl_FragColor = vec4(vec3(center), 1.0);
            return;
          }
  
          vec3  rgb = uColor * (1.0 + center * uColorBoost);
          float a   = max(mix(uAlphaMin, uAlphaMax, center), uAlphaFloor);
          gl_FragColor = vec4(rgb, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.FrontSide,
    });
  
    return mat;
  }
  
  

  
export class SelectionRenderer {
  private scene: THREE.Scene;
  private getMeshById: GetMeshById;
  private getSceneObject: GetSceneObject;
  private static readonly EPS = 1e-4;


  // ---------- інстансингові меші ----------
  private selectionIMesh: THREE.InstancedMesh | null = null;       // зелений box (основний)
  private selectionOutlineIMesh: THREE.InstancedMesh | null = null; // контур BackSide
  private targetIMesh: THREE.InstancedMesh | null = null;           // glow‑сфера (таргет)
  private targetRingIMesh: THREE.InstancedMesh | null = null;       // кільце на землі
  private interactiveIMesh: THREE.InstancedMesh | null = null;      // soft‑glow‑диск (інтерактив)
  private interactiveHoverMesh: THREE.Mesh | null = null;           // hover‑диск (яскравіший, один на екрані)

  // ---------- капасіті/пули ----------
  private readonly MAX_SELECTION = 1024;
  private readonly MAX_TARGETS = 1024;
  private readonly MAX_INTERACTIVE = 2048;

  private selectionIndexFree: number[] = [];
  private targetIndexFree: number[] = [];
  private interactiveIndexFree: number[] = [];

  private selectionIndexById: Map<string, number> = new Map();
  private targetIndexById: Map<string, number> = new Map();
  private interactiveIndexById: Map<string, number> = new Map();

  // ---------- геометрії ----------
  private static BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
  private static SPHERE_GEO = new THREE.SphereGeometry(1, 32, 32);
  private static RING_GEO = new THREE.RingGeometry(0.8, 1.0, 64);

  // ---------- hover ефект ----------
  private hoveredObjectId: string | null = null;
  private hoverIntensity = 2.5; // множник яскравості при hover

  // ---------- матеріали ----------
  private static MAT_SELECTION = new THREE.MeshBasicMaterial({
    color: 0x00ffae,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  private static MAT_SELECTION_OUTLINE = new THREE.MeshBasicMaterial({
    color: 0x00ffae,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.65,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });

  private static MAT_TARGET = makeGlowBallMaterial(
    new THREE.MeshBasicMaterial({
      color: 0xff4040,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    { centerPower: 2.2, colorBoost: 2.1, alphaBoost: 1.2 }
  );

  private static MAT_RING = new THREE.MeshBasicMaterial({
    color: 0xff6b6b,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  });

  //private static MAT_INTERACTIVE = makeInteractiveGlowShaderMaterialPortable({
  //  centerPower: 5.8,
  //  colorBoost: 2.2,
  //  alphaMin: 0.04,
  //  alphaMax: 0.85,
  //  color: 0x66ccff,
  //  debugCenter: false, // <- увімкни на 1 тест
  //});
  
  private static MAT_INTERACTIVE = makeGlowBallMaterial(
    new THREE.MeshBasicMaterial({
      color: 0xfff4a3, // світло-жовтий колір
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    { centerPower: 2.0, colorBoost: 1.8, alphaBoost: 1.0 }
  );

  // Окремий матеріал для hover ефекту (яскравіший)
  private static MAT_INTERACTIVE_HOVER = new THREE.MeshBasicMaterial({
    color: 0xffff00, // яскраво-жовтий
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });


  // ---------- ручки масштабу (радіуса) ----------
  private selectionBoxMul = 1.5;
  private selectionOutlineMul = 1.04;
  private targetGlowMul = 1.0;
  private interactiveGlowMul = 1.2;
  private ringScaleMul = 1.0;

  // ---------- тимчасові контейнери ----------
  private _tmpPos = new THREE.Vector3();
  private _tmpQuat = new THREE.Quaternion();
  private _tmpScale = new THREE.Vector3();
  private _identityQuat = new THREE.Quaternion();
  private _tmpMat = new THREE.Matrix4();

  constructor(
    scene: THREE.Scene,
    getMeshById: GetMeshById,
    getSceneObject: GetSceneObject
  ) {
    this.scene = scene;
    this.getMeshById = getMeshById;
    this.getSceneObject = getSceneObject;

    this.initInstancedMeshes();
  }

  // ----------------- ПУБЛІЧНІ РУЧКИ -----------------
  setSelectionBoxMul(f: number) { this.selectionBoxMul = f; }
  setTargetGlowMul(f: number) { this.targetGlowMul = f; }
  setInteractiveGlowMul(f: number) { this.interactiveGlowMul = f; }
  setRingScaleMul(f: number) { this.ringScaleMul = f; }

  // Встановлюємо hover стан для інтерактивного об'єкта
  setHoveredObject(objectId: string | null): void {
    if (this.hoveredObjectId === objectId) return;
    
    this.hoveredObjectId = objectId;

    console.log('HW: ', this.hoveredObjectId, this.interactiveHoverMesh, objectId ? this.getMeshById(objectId) : 'EMPTY')
    
    if (!this.interactiveHoverMesh) return;
    
    if (objectId) {
      // Hover: показуємо яскравіший диск
      const mesh = this.getMeshById(objectId);
      if (mesh) {
        const { pos, scale } = this.getCorrectPositionAndScale(objectId, mesh);
        console.log('HOVERING: ', pos, scale);
        const hoverScale = scale.clone().multiplyScalar(this.interactiveGlowMul * 1.4); // ще більший для помітності
        
        // Позиціонуємо hover диск трохи вище землі
        const hoverPos = pos.clone();
        hoverPos.y += 0.01; // трохи вище землі
        this.interactiveHoverMesh.position.copy(hoverPos);
        this.interactiveHoverMesh.scale.copy(hoverScale);
        
        // Диск лежить на землі (повертаємо на 90 градусів)
        this.interactiveHoverMesh.rotation.set(-Math.PI / 2, 0, 0);
        
        this.interactiveHoverMesh.visible = true;
      }
    } else {
      // Немає hover: ховаємо диск
      this.interactiveHoverMesh.visible = false;
    }
  }

  // ============================================================
  // ===============       ІНІЦІАЛІЗАЦІЯ       ==================
  // ============================================================

  private initInstancedMeshes() {
    // Selection (основний)
    this.selectionIMesh = new THREE.InstancedMesh(
      SelectionRenderer.BOX_GEO,
      SelectionRenderer.MAT_SELECTION,
      this.MAX_SELECTION
    );
    this.selectionIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.selectionIMesh.frustumCulled = false;
    this.selectionIMesh.renderOrder = 9999;
    this.scene.add(this.selectionIMesh);
    for (let i = 0; i < this.MAX_SELECTION; i++) this.selectionIndexFree.push(i);
    this.hideAllInstances(this.selectionIMesh);

    // Selection outline
    this.selectionOutlineIMesh = new THREE.InstancedMesh(
      SelectionRenderer.BOX_GEO,
      SelectionRenderer.MAT_SELECTION_OUTLINE,
      this.MAX_SELECTION
    );
    this.selectionOutlineIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.selectionOutlineIMesh.frustumCulled = false;
    this.selectionOutlineIMesh.renderOrder = 9998;
    this.scene.add(this.selectionOutlineIMesh);
    this.hideAllInstances(this.selectionOutlineIMesh);

    // Target (glow sphere)
    this.targetIMesh = new THREE.InstancedMesh(
      SelectionRenderer.SPHERE_GEO,
      SelectionRenderer.MAT_TARGET,
      this.MAX_TARGETS
    );
    this.targetIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.targetIMesh.frustumCulled = false;
    this.targetIMesh.renderOrder = 9999;
    this.scene.add(this.targetIMesh);
    for (let i = 0; i < this.MAX_TARGETS; i++) this.targetIndexFree.push(i);
    this.hideAllInstances(this.targetIMesh);

    // Target Ring
    this.targetRingIMesh = new THREE.InstancedMesh(
      SelectionRenderer.RING_GEO,
      SelectionRenderer.MAT_RING,
      this.MAX_TARGETS
    );
    this.targetRingIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.targetRingIMesh.frustumCulled = false;
    this.targetRingIMesh.renderOrder = 10000;
    this.scene.add(this.targetRingIMesh);
    this.hideAllInstances(this.targetRingIMesh);

    // Interactive (soft‑glow disk)
    this.interactiveIMesh = new THREE.InstancedMesh(
      SelectionRenderer.RING_GEO,
      SelectionRenderer.MAT_INTERACTIVE,
      this.MAX_INTERACTIVE
    );
    this.interactiveIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.interactiveIMesh.frustumCulled = false;
    this.interactiveIMesh.renderOrder = 9999;
    this.scene.add(this.interactiveIMesh);
    for (let i = 0; i < this.MAX_INTERACTIVE; i++) this.interactiveIndexFree.push(i);
    this.hideAllInstances(this.interactiveIMesh);

    // Interactive hover (brighter)
    this.interactiveHoverMesh = new THREE.Mesh(
      SelectionRenderer.RING_GEO,
      SelectionRenderer.MAT_INTERACTIVE_HOVER
    );
    this.interactiveHoverMesh.frustumCulled = false;
    this.interactiveHoverMesh.renderOrder = 9999;
    this.scene.add(this.interactiveHoverMesh);
    this.interactiveHoverMesh.visible = false; // Initially hidden
    console.log('interactiveHoverMesh', this.interactiveHoverMesh);
    [SelectionRenderer.MAT_TARGET, SelectionRenderer.MAT_INTERACTIVE, SelectionRenderer.MAT_INTERACTIVE_HOVER].forEach(m => m.needsUpdate = true);
  }

  private hideAllInstances(im: THREE.InstancedMesh) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, zero);
    im.instanceMatrix.needsUpdate = true;
  }

  // ============================================================
  // ===============     КОРИСНІ УТИЛІТИ       ==================
  // ============================================================

  private getWorldTRS(obj: THREE.Object3D) {
    obj.updateWorldMatrix(true, false);
    obj.matrixWorld.decompose(this._tmpPos, this._tmpQuat, this._tmpScale);
    return {
      pos: this._tmpPos.clone(),
      quat: this._tmpQuat.clone(),
      scale: this._tmpScale.clone(),
    };
  }

  getCorrectPositionAndScale(objectId: string, objectMesh: THREE.Object3D): { pos: THREE.Vector3; scale: THREE.Vector3 } {
    const sceneObject = this.getSceneObject(objectId);
    if (sceneObject && sceneObject.coordinates) {
      const pos = new THREE.Vector3(
        sceneObject.coordinates.x,
        sceneObject.coordinates.y,
        sceneObject.coordinates.z
      );
      const scale = new THREE.Vector3(
        sceneObject.scale?.x || 1,
        sceneObject.scale?.y || 1,
        sceneObject.scale?.z || 1
      );
      return { pos, scale };
    }
    const worldPos = objectMesh.getWorldPosition(new THREE.Vector3());
    const worldScale = new THREE.Vector3();
    objectMesh.getWorldScale(worldScale);
    return { pos: worldPos, scale: worldScale };
  }

  private setInstance(im: THREE.InstancedMesh, index: number, pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3) {
    this._tmpScale.copy(scale);
    const s = this._tmpScale;
    const eps = SelectionRenderer.EPS;
    s.set(
        Math.sign(s.x || 1) * Math.max(Math.abs(s.x), eps),
        Math.sign(s.y || 1) * Math.max(Math.abs(s.y), eps),
        Math.sign(s.z || 1) * Math.max(Math.abs(s.z), eps),
    );

    this._tmpMat.compose(pos, quat, s);
    im.setMatrixAt(index, this._tmpMat);
    im.instanceMatrix.needsUpdate = true;
  }

  private hideInstance(im: THREE.InstancedMesh, index: number) {
    this._tmpMat.makeScale(0, 0, 0);
    im.setMatrixAt(index, this._tmpMat);
    im.instanceMatrix.needsUpdate = true;
  }

  // ============================================================
  // ===============     SELECTION HIGHLIGHT     ================
  // ============================================================

  addSelectionHighlight(objectId: string, objectMesh: THREE.Mesh): void {
    if (!this.selectionIMesh || !this.selectionOutlineIMesh || this.selectionIndexById.has(objectId)) return;
    const slot = this.selectionIndexFree.pop();
    if (slot === undefined) return;

    const { pos, scale } = this.getCorrectPositionAndScale(objectId, objectMesh);
    const { quat } = this.getWorldTRS(objectMesh);
    const boxScale = scale.clone().multiplyScalar(this.selectionBoxMul);
    const outlineScale = boxScale.clone().multiplyScalar(this.selectionOutlineMul);

    this.setInstance(this.selectionIMesh, slot, pos, quat, boxScale);
    this.setInstance(this.selectionOutlineIMesh, slot, pos, quat, outlineScale);

    this.selectionIndexById.set(objectId, slot);
  }

  removeSelectionHighlight(objectId: string): void {
    if (!this.selectionIMesh || !this.selectionOutlineIMesh) return;
    const idx = this.selectionIndexById.get(objectId);
    if (idx === undefined) return;
    this.hideInstance(this.selectionIMesh, idx);
    this.hideInstance(this.selectionOutlineIMesh, idx);
    this.selectionIndexById.delete(objectId);
    this.selectionIndexFree.push(idx);
  }

  updateHighlightPosition(objectId: string, newPosition: THREE.Vector3, newScale: THREE.Vector3, newRotation: THREE.Euler): void {
    if (!this.selectionIMesh || !this.selectionOutlineIMesh) return;
    const idx = this.selectionIndexById.get(objectId);
    if (idx === undefined) return;

    const quat = new THREE.Quaternion().setFromEuler(newRotation);
    const boxScale = newScale.clone().multiplyScalar(this.selectionBoxMul);
    const outlineScale = boxScale.clone().multiplyScalar(this.selectionOutlineMul);

    this.setInstance(this.selectionIMesh, idx, newPosition, quat, boxScale);
    this.setInstance(this.selectionOutlineIMesh, idx, newPosition, quat, outlineScale);
  }

  // ============================================================
  // ===============        TARGET INDИКАТОР     ================
  // ============================================================

  addTargetIndicator(
    objectId: string,
    position: THREE.Vector3,
    opts?: { radiusMul?: number }
  ): void {
    if (!this.targetIMesh || !this.targetRingIMesh || this.targetIndexById.has(objectId)) return;
    const slot = this.targetIndexFree.pop();
    if (slot === undefined) return;

    const localMul = opts?.radiusMul ?? 1.0;
    // Для таргета використовуємо фіксований розмір
    const s = 0.5 * this.targetGlowMul * localMul;
    const sphereScale = new THREE.Vector3(s, s, s);

    this.setInstance(this.targetIMesh, slot, position, this._identityQuat, sphereScale);

    const quatFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const ringScale = new THREE.Vector3(this.ringScaleMul, this.ringScaleMul, this.ringScaleMul);
    this.setInstance(this.targetRingIMesh, slot, position, quatFlat, ringScale);

    this.targetIndexById.set(objectId, slot);

    console.log('TI: ', position);
  }

  removeTargetIndicator(objectId: string): void {
    if (!this.targetIMesh || !this.targetRingIMesh) return;
    const idx = this.targetIndexById.get(objectId);
    if (idx === undefined) return;
    this.hideInstance(this.targetIMesh, idx);
    this.hideInstance(this.targetRingIMesh, idx);
    this.targetIndexById.delete(objectId);
    this.targetIndexFree.push(idx);
    console.log('TR: ', objectId);
  }

  // ============================================================
  // ===============   INTERACTIVE HIGHLIGHT     ================
  // ============================================================

  highlightInteractiveObjects(interactiveObjects: Array<{ id: string; radiusMul?: number }>): void {
    if (!this.interactiveIMesh) return;

    const incoming = new Set(interactiveObjects.map(o => o.id));

    // Видалити ті, яких більше немає
    this.interactiveIndexById.forEach((idx, id) => {
      if (!incoming.has(id)) {
        this.hideInstance(this.interactiveIMesh!, idx);
        this.interactiveIndexById.delete(id);
        this.interactiveIndexFree.push(idx);
      }
    });

    // Додати/оновити актуальні
    for (const obj of interactiveObjects) {
      const mesh = this.getMeshById(obj.id);
      if (!mesh) continue;

      const localMul = obj.radiusMul ?? 1.0;
      const { pos, scale } = this.getCorrectPositionAndScale(obj.id, mesh as THREE.Object3D);
      const glowScale = scale.clone().multiplyScalar(this.interactiveGlowMul * localMul);

      let idx = this.interactiveIndexById.get(obj.id);
      if (idx === undefined) {
        const slot = this.interactiveIndexFree.pop();
        if (slot === undefined) continue;
        // Диск лежить на землі (повертаємо на 90 градусів)
        const quatFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        this.setInstance(this.interactiveIMesh, slot, pos, quatFlat, glowScale);
        this.interactiveIndexById.set(obj.id, slot);
      } else {
        // Диск лежить на землі (повертаємо на 90 градусів)
        const quatFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        this.setInstance(this.interactiveIMesh, idx, pos, quatFlat, glowScale);
      }
    }
  }

  // ============================================================
  // ===============         СЕРВІСНІ МЕТОДИ     ================
  // ============================================================

  clearAll(): void {
    if (this.selectionIMesh && this.selectionOutlineIMesh) {
      this.hideAllInstances(this.selectionIMesh);
      this.hideAllInstances(this.selectionOutlineIMesh);
      this.selectionIndexById.clear();
      this.selectionIndexFree.length = 0;
      for (let i = 0; i < this.MAX_SELECTION; i++) this.selectionIndexFree.push(i);
    }
    if (this.targetIMesh && this.targetRingIMesh) {
      this.hideAllInstances(this.targetIMesh);
      this.hideAllInstances(this.targetRingIMesh);
      this.targetIndexById.clear();
      this.targetIndexFree.length = 0;
      for (let i = 0; i < this.MAX_TARGETS; i++) this.targetIndexFree.push(i);
    }
    if (this.interactiveIMesh) {
      this.hideAllInstances(this.interactiveIMesh);
      this.interactiveIndexById.clear();
      this.interactiveIndexFree.length = 0;
      for (let i = 0; i < this.MAX_INTERACTIVE; i++) this.interactiveIndexFree.push(i);
    }
    // Hover меш просто ховаємо, не видаляємо
    if (this.interactiveHoverMesh) {
      this.interactiveHoverMesh.visible = false;
    }
  }

  dispose(): void {
    const ims: (THREE.InstancedMesh | null)[] = [
      this.selectionIMesh,
      this.selectionOutlineIMesh,
      this.targetIMesh,
      this.targetRingIMesh,
      this.interactiveIMesh,
    ];
    for (const im of ims) {
      if (!im) continue;
      this.scene.remove(im);
      im.geometry?.dispose();
      (im.material as THREE.Material)?.dispose();
    }
    // Hover меш видаляємо тільки при фінальному dispose
    if (this.interactiveHoverMesh) {
      this.scene.remove(this.interactiveHoverMesh);
      this.interactiveHoverMesh.geometry?.dispose();
      if (Array.isArray(this.interactiveHoverMesh.material)) {
        this.interactiveHoverMesh.material.forEach(m => m.dispose());
      } else {
        this.interactiveHoverMesh.material?.dispose();
      }
      this.interactiveHoverMesh = null;
    }
  }

  update(_deltaSeconds: number): void { /* no-op */ }

  getActiveHighlightCount(): number { return this.selectionIndexById.size; }
  getActiveTargetIndicatorCount(): number { return this.targetIndexById.size; }
}
