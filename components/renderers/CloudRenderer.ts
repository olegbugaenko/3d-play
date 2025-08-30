import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface CloudData {
  color?: number;        // базовий колір хмари
  size?: number;         // "візуальний" розмір частинки (у пікселях, базово ~72)
  density?: number;      // не використовується тут (залишив на майбутнє)
  height?: number;       // висота "стовпа" хмари
  particleCount?: number;// кількість частинок
  windSpeed?: number;    // швидкість вітру (одиниці/сек) — застосовується в шейдері
}

const _tmpV2 = new THREE.Vector2(); // для uSizeAtten


export class CloudRenderer extends BaseRenderer {
  private dustParticles: THREE.Points[] = [];
  private cloudGroup: THREE.Group;
  private clock: THREE.Clock;

  // один спільний матеріал на всі хмари
  private static sharedMaterial: THREE.ShaderMaterial | null = null;

  constructor(scene: THREE.Scene) {
    super(scene);
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = 'CloudGroup';
    this.clock = new THREE.Clock();
    this.scene.add(this.cloudGroup);
            // CloudRenderer створено
  }

  // ===== Shared material =====
  private getOrCreateMaterial(): THREE.ShaderMaterial {
    if (CloudRenderer.sharedMaterial) return CloudRenderer.sharedMaterial;

    const vertexShader = `
      precision mediump float;

        uniform float uTime;
        uniform float uCosRot;
        uniform float uSinRot;
        uniform float uPointSize;
        uniform float uSizeAtten;   // scale від FOV/viewport (як у PointsMaterial)
        uniform vec3  uBaseColor;
        uniform vec2  uWind;

        attribute float radius;
        attribute float cosA;
        attribute float sinA;
        attribute float height;
        attribute float colVar;
        attribute vec2  jitter;
        attribute float phase;

        varying float vAlpha;
        varying vec3  vColor;

        void main(){
        float x = radius * (cosA * uCosRot - sinA * uSinRot);
        float z = radius * (sinA * uCosRot + cosA * uSinRot);
        float y = height;

        float s = sin(uTime*0.9 + phase);
        x += jitter.x * s;
        z += jitter.y * s;
        y += 0.15 * sin(uTime*0.6 + phase*1.7);

        x += uWind.x * uTime;
        z += uWind.y * uTime;

        vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);

        // Правильне size attenuation у пікселях
        gl_PointSize = uPointSize * (uSizeAtten / -mv.z);
        gl_PointSize = min(gl_PointSize, 1024.0);

        gl_Position = projectionMatrix * mv;

        vColor = uBaseColor * colVar;
        vAlpha = 1.0; // простий варіант (можеш потім підміксувати залежність від висоти/дистанції)
        }

    `;

    const fragmentShader = `
      precision mediump float;
      varying float vAlpha;
      varying vec3  vColor;

      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv);

        // круглий спрайт із м'якими краями
        float soft = smoothstep(0.5, 0.0, r);

        // легка мікроваріація — дешево, без шуму
        float ring = 0.04 * sin((uv.x + uv.y) * 20.0);

        float alpha = soft * vAlpha * 0.07;
        if (alpha < 0.002) discard;

        gl_FragColor = vec4(vColor + ring, alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;

    CloudRenderer.sharedMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:      { value: 0 },
        uCosRot:    { value: 1 },
        uSinRot:    { value: 0 },
        uPointSize: { value: 24.0 },      // базовий розмір (пікселі)
        uSizeAtten: { value: 1.0 },
        uBaseColor: { value: new THREE.Color(0xD2B48C) },
        uWind:      { value: new THREE.Vector2(0, 0) },
      }
    });
    (CloudRenderer.sharedMaterial as any).toneMapped = true;
    return CloudRenderer.sharedMaterial!;
  }

  // ====== Public API ======
  render(object: SceneObject): THREE.Object3D {
    const cloudData: CloudData = object.data || {};
            // CloudRenderer.render() викликано

    const dustCloud = this.createCloudPoints(cloudData, object.coordinates);

    this.dustParticles.push(dustCloud);
    this.cloudGroup.add(dustCloud);

    this.addMesh(object.id, dustCloud);
    return dustCloud;
  }

  update(_object: SceneObject): void {
    // більше не рухаємо хмару в JS — вітер у шейдері (дешевше).
    // лишаємо метод для сумісності з BaseRenderer.
  }

  remove(id: string): void {
    const cloud = this.getMeshById(id);
    if (cloud) {
      this.cloudGroup.remove(cloud);
      if (cloud instanceof THREE.Points) {
        cloud.geometry.dispose();
        // матеріал — спільний, не диспоузимо!
      }
    }
    super.remove(id);
  }

  // Викликати раз за кадр
  updateAllClouds(): void {
    const t = this.clock.getElapsedTime();
    const mat = CloudRenderer.sharedMaterial;
    if (!mat) return;

    // глобальний час + одна синус/косинус на кадр (дешево)
    mat.uniforms.uTime.value = t;
    const rot = t * 2.0;
    mat.uniforms.uCosRot.value = Math.cos(rot);
    mat.uniforms.uSinRot.value = Math.sin(rot);
  }

  // Оптимізація: приховуємо далекі хмари для кращого FPS
  optimizeByDistance(cameraPosition: THREE.Vector3, maxDistance: number = 300): void {
    for (const cloud of this.dustParticles) {
      const distance = cameraPosition.distanceTo(cloud.position);
      
      if (distance > maxDistance) {
        // Приховуємо далекі хмари
        cloud.visible = false;
      } else {
        // Показуємо близькі хмари
        cloud.visible = true;
        
        // Додаткова оптимізація: зменшуємо розмір частинок для далеких хмар
        if (distance > maxDistance * 0.7) {
          const material = cloud.material as THREE.ShaderMaterial;
          if (material && material.uniforms.uPointSize) {
            material.uniforms.uPointSize.value = Math.max(12, (material.uniforms.uPointSize.value || 24) * 0.5);
          }
        }
      }
    }
  }

  // ====== Internal ======
  private createCloudPoints(cloudData: CloudData, coordinates: { x: number; y: number; z: number }): THREE.Points {
    // Оптимізація: зменшуємо кількість частинок за замовчуванням
    const particleCount = cloudData.particleCount ?? 50; // було 100, тепер 50
    const radiusMax = cloudData.size ?? 20;     // радіус "гриба" по XZ
    const height = cloudData.height ?? 5;       // висота "гриба"
    const baseColor = new THREE.Color(cloudData.color ?? 0xD2B48C);
    const windSpeed = cloudData.windSpeed ?? 0; // скаляр, м/с (умовно)
    // напрям вітру — довільно на схід (можна зробити параметром):
    const windDir = new THREE.Vector2(1, 0).normalize().multiplyScalar(windSpeed);

    // Геометрія
    const geometry = new THREE.BufferGeometry();

    // Атрибути (мінімум bandwidth, максимум FPS)
    const radii   = new Float32Array(particleCount);
    const cosA    = new Float32Array(particleCount);
    const sinA    = new Float32Array(particleCount);
    const heights = new Float32Array(particleCount);
    const colVar  = new Float32Array(particleCount);
    const jitter  = new Float32Array(particleCount * 2);
    const phase   = new Float32Array(particleCount);

    // `position` потрібен Points, але у вертексі ми не читаємо його значення
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const a = Math.random() * Math.PI * 2;
      cosA[i] = Math.cos(a);
      sinA[i] = Math.sin(a);

      // радіальний розподіл із концентрацією в центрі
      const radialDistribution = Math.pow(Math.random(), 1.5);
      const r = radialDistribution * radiusMax;
      radii[i] = r;

      // висота з "кластерами"
      let hOff: number;
      const rnd = Math.random();
      if (rnd < 0.1)        hOff = Math.random() * height * 0.2;                       // нижній шар
      else if (rnd < 0.2)   hOff = height * 0.8 + Math.random() * height * 0.2;        // верхній шар
      else                  hOff = height * 0.2 + Math.random() * height * 0.6;        // центр
      heights[i] = hOff;

      // варіація кольору (множник для uBaseColor)
      colVar[i] = 0.7 + Math.random() * 0.6; // 0.7..1.3

      // дешевий XZ-джиттер
      jitter[i*2 + 0] = (Math.random() * 2 - 1) * 0.15;
      jitter[i*2 + 1] = (Math.random() * 2 - 1) * 0.15;

      // фаза для синуса
      phase[i] = Math.random() * Math.PI * 2;

      // "порожні" позиції
      const i3 = i*3;
      positions[i3+0] = 0;
      positions[i3+1] = 0;
      positions[i3+2] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('radius',   new THREE.BufferAttribute(radii, 1));
    geometry.setAttribute('cosA',     new THREE.BufferAttribute(cosA, 1));
    geometry.setAttribute('sinA',     new THREE.BufferAttribute(sinA, 1));
    geometry.setAttribute('height',   new THREE.BufferAttribute(heights, 1));
    geometry.setAttribute('colVar',   new THREE.BufferAttribute(colVar, 1));
    geometry.setAttribute('jitter',   new THREE.BufferAttribute(jitter, 2));
    geometry.setAttribute('phase',    new THREE.BufferAttribute(phase, 1));

    const pad = Math.max(1.0, radiusMax * 0.5); // невеликий запас на джиттер/анімацію
    geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-radiusMax - pad, -pad, -radiusMax - pad),
    new THREE.Vector3( radiusMax + pad,  height + pad,  radiusMax + pad)
    );
    geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, height * 0.5, 0),
    Math.sqrt((radiusMax + pad) * (radiusMax + pad) + (height * 0.5 + pad) * (height * 0.5 + pad))
    );

    // Позначаємо статичне використання
    for (const name of ['position','radius','cosA','sinA','height','colVar','jitter','phase']) {
      (geometry.getAttribute(name) as THREE.BufferAttribute).setUsage(THREE.StaticDrawUsage);
    }

    // Спільний матеріал
    const material = this.getOrCreateMaterial();
    const points = new THREE.Points(geometry, material);

    // Позиція хмари в світі
    const x = coordinates.x;
    const z = coordinates.z;
    const y = coordinates.y + (height / 2);
    points.position.set(x, y, z);

    // Оптимізація: додаємо frustum culling та distance culling
    points.frustumCulled = true;
    points.castShadow = false;
    points.receiveShadow = false;

    // Пер-об’єктні правки незадовго до рендеру (не створюємо новий матеріал)
    (points as any).onBeforeRender = (
        renderer: THREE.WebGLRenderer,
        _scene: THREE.Scene,
        camera: THREE.Camera,
        _geometry: THREE.BufferGeometry,
        mat: THREE.ShaderMaterial
      ) => {
        // базовий колір цієї хмари
        mat.uniforms.uBaseColor.value.copy(baseColor);
      
        // РОЗМІР ЧАСТИНКИ В ПІКСЕЛЯХ (твоя ручка)
        const px = cloudData.size ?? 72; // напряму, без mapLinear/множників
        mat.uniforms.uPointSize.value = px;
      
        // вітер для цієї хмари (XZ)
        mat.uniforms.uWind.value.set(windDir.x, windDir.y);
      
        // ---- Size attenuation scale (аналог PointsMaterial) ----
        renderer.getDrawingBufferSize(_tmpV2); // device-пікселі з урах. pixelRatio
        let atten = 1.0;
      
        if ((camera as any).isPerspectiveCamera) {
          const cam = camera as THREE.PerspectiveCamera;
          const invTanHalfFov = 1.0 / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
          // 0.5 * viewportHeightInPixels * 1/tan(fov/2)
          atten = 0.5 * _tmpV2.y * invTanHalfFov;
        } else if ((camera as any).isOrthographicCamera) {
          // для ortho розмір від відстані не залежить — привʼяжемо до zoom
          const cam = camera as THREE.OrthographicCamera;
          const pr = renderer.getPixelRatio();
          atten = pr * cam.zoom;
        }
      
        mat.uniforms.uSizeAtten.value = atten;
      };
      

    return points;
  }
}
