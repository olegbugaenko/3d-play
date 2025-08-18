import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface CloudData {
    color?: number;
    size?: number;
    density?: number;
    height?: number;
    particleCount?: number; // Кількість частинок в хмарі
    windSpeed?: number; // Швидкість вітру
}

export class CloudRenderer extends BaseRenderer {
    private dustParticles: THREE.Points[] = []; // Масив пилових хмар
    private cloudGroup: THREE.Group;
    private clock: THREE.Clock;

    constructor(scene: THREE.Scene) {
        super(scene);
        this.cloudGroup = new THREE.Group();
        this.cloudGroup.name = 'CloudGroup';
        this.clock = new THREE.Clock();
        this.scene.add(this.cloudGroup);
        console.log('🚀 CloudRenderer створено');
    }

    render(object: SceneObject): THREE.Object3D {
        const cloudData: CloudData = object.data || {};
        console.log(`☁️ CloudRenderer.render() викликано для ${object.id}, тип: ${object.type}: [${object.coordinates.x},${object.coordinates.y},${object.coordinates.z}]`);
        
        // ТЕСТ: Спробуємо простий шейдер
        const dustCloud = this.createSimpleShaderCloud(cloudData, object.coordinates);
        console.log(`☁️ Хмара ${object.id} створена, додаємо до сцени`);
        
        this.dustParticles.push(dustCloud);
        this.cloudGroup.add(dustCloud);
        
        // Додаємо до BaseRenderer для сумісності
        this.addMesh(object.id, dustCloud);
        
        return dustCloud;
    }

    private createSimpleShaderCloud(cloudData: CloudData, coordinates: { x: number; y: number; z: number }): THREE.Points {
        const particleCount = cloudData.particleCount || 500; // ЗБІЛЬШУЄМО до 500 частинок
        const size = cloudData.size || 20; // Радіус хмари
        const height = cloudData.height || 5; // Висота хмари
        
                 // Створюємо геометрію для частинок
         const geometry = new THREE.BufferGeometry();
         const radii = new Float32Array(particleCount);      // Радіуси частинок
         const angles = new Float32Array(particleCount);     // Кути частинок
         const heights = new Float32Array(particleCount);    // Висоти частинок
         const colors = new Float32Array(particleCount * 3);
         const blurFactors = new Float32Array(particleCount); // Фактор розмитості (0.5-2.0)
         
         // Використовуємо колір з даних або пісочний за замовчуванням
         const baseColor = new THREE.Color(cloudData.color || 0xD2B48C);
        
        for (let i = 0; i < particleCount; i++) {
            // БІЛЬШ ПРИРОДНИЙ розподіл частинок (кубічний корінь + кластери)
            
            // Випадковий кут
            const angle = Math.random() * Math.PI * 2;
            
                         // РАДІАЛЬНИЙ РОЗПОДІЛ: менше частинок біля країв, більше в центрі
             const radialDistribution = Math.pow(Math.random(), 1.5); // Квадратичний розподіл для концентрації в центрі
             const radius = radialDistribution * size;
             
             // Висота з кластерами (більше частинок внизу та вгорі)
             let heightOffset;
             if (Math.random() < 0.1) {
                 // 10% частинок внизу (0-20% висоти)
                 heightOffset = Math.random() * height * 0.2;
             } else if (Math.random() < 0.2) {
                 // 10% частинок вгорі (80-100% висоти)
                 heightOffset = height * 0.8 + Math.random() * height * 0.2;
             } else {
                 // 80% частинок в центрі (20-80% висоти) - більше концентрації
                 heightOffset = height * 0.2 + Math.random() * height * 0.6;
             }
             
                          // Додаємо випадкове зміщення для більшої природності
             const randomOffset = (Math.random() - 0.5) * size * 0.3;
 
             // Радіальний коефіцієнт: менше частинок біля країв
             const hToRadOff = 0.2 + 0.8*Math.sin(heightOffset*Math.PI/height);
             
             // Зберігаємо полярні координати частинки
             radii[i] = radius * hToRadOff + randomOffset;  // Радіус з варіацією
             angles[i] = angle;                             // Кут частинки
             heights[i] = heightOffset;                     // Висота частинки
            
                         // Випадковий колір (відтінки базового кольору)
             const colorVariation = 0.7 + Math.random() * 0.6; // 0.7-1.3
             colors[i * 3] = baseColor.r * colorVariation;     // R
             colors[i * 3 + 1] = baseColor.g * colorVariation; // G
             colors[i * 3 + 2] = baseColor.b * colorVariation; // B
             
             // ФАКТОР РОЗМИТОСТІ: від 0.5 до 2.0
             blurFactors[i] = 0.2 + Math.random() * 1.5; // 0.5-2.0
             
             // Зберігаємо оригінальний кут частинки!
             angles[i] = angle;
         }

         console.log('Cloud created: ', cloudData);
        
                 // Додаємо position атрибут для сумісності з шейдером
         const positions = new Float32Array(particleCount * 3);
         for (let i = 0; i < particleCount; i++) {
             positions[i * 3] = radii[i] * Math.cos(angles[i]);     // X
             positions[i * 3 + 1] = heights[i];                     // Y  
             positions[i * 3 + 2] = radii[i] * Math.sin(angles[i]); // Z
         }
         
         geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); // ОБОВ'ЯЗКОВО!
         geometry.setAttribute('radius', new THREE.BufferAttribute(radii, 1));      // Радіуси
         geometry.setAttribute('angle', new THREE.BufferAttribute(angles, 1));     // Кути
         geometry.setAttribute('height', new THREE.BufferAttribute(heights, 1));   // Висоти
         geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
         geometry.setAttribute('blurFactor', new THREE.BufferAttribute(blurFactors, 1)); // Фактор розмитості
        
        // ПОКРАЩЕНИЙ шейдер з шумом та кращими ефектами
                 const vertexShader = `
             uniform float uTime;
             attribute float radius;   // Радіус частинки
             attribute float angle;    // Кут частинки
             attribute float height;   // Висота частинки
             attribute float blurFactor; // Фактор розмитості (0.5-2.0)
             varying float vAlpha;
             varying vec3 vColor;
             varying float vBlurFactor; // Передаємо в фрагментний шейдер
             
             // Простий hash для шуму
             float hash(float n) {
                 return fract(sin(n) * 43758.5453);
             }
            
            // Простий шум
            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                
                float n = i.x + i.y * 57.0 + i.z * 113.0;
                return mix(mix(mix(hash(n), hash(n + 1.0), f.x),
                           mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                         mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                           mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
            }
            
            void main() {
                // Обчислюємо позицію з полярних координат
                vec3 pos = vec3(
                    radius * cos(angle),     // X з оригінального кута
                    height,                  // Y без змін
                    radius * sin(angle)      // Z з оригінального кута
                );
                
                // МІНІМАЛЬНИЙ шум для природності (без вбивання FPS)
                float noiseValue = noise(pos * 0.2 + uTime * 0.05);
                pos.x += noiseValue * 0.1; // Зменшуємо в 3 рази
                pos.z += noiseValue * 0.1; // Зменшуємо в 3 рази
                
                // СПРАВЖНЄ ЗАКРУЧУВАННЯ ДОВКОЛА ВЕРТИКАЛЬНОЇ ОСІ! 🌪️
                float rotationAngle = uTime * 2.0; // Швидке обертання!
                
                // Нова позиція після обертання
                pos.x = radius * cos(angle + rotationAngle);
                pos.z = radius * sin(angle + rotationAngle);
                
                // Легке підняття/опускання
                pos.y += sin(uTime * 0.7 + pos.x * 0.2) * 0.2;
                
                                 // Покращена альфа: на основі відстані від центру та висоти + blurFactor
                 float distFromCenter = length(pos.xz);
                 float heightAlpha = 1.0 - (pos.y / 5.0) * 0.3;
                 float centerAlpha = 1.0 - (distFromCenter / 8.0) * 0.2;
                 vAlpha = heightAlpha * centerAlpha * blurFactor; // Множимо на blurFactor
                 
                 // Передаємо колір та blurFactor
                 vColor = vec3(0.7, 0.4, 0.2); // Темніший коричневий
                 vBlurFactor = blurFactor; // Передаємо в фрагментний шейдер
                 
                 vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
                 gl_PointSize = 80.0 / blurFactor; // Ділимо розмір на blurFactor
                 gl_Position = projectionMatrix * mvPos;
            }
        `;
        
                 const fragmentShader = `
             precision mediump float;
             varying float vAlpha;
             varying vec3 vColor;
             varying float vBlurFactor; // Фактор розмитості
             
                          void main() {
                  vec2 uv = gl_PointCoord - 0.5;
                  float r = length(uv);
                  
                  // КРУГЛІ частинки з плавними краями + blurFactor
                  float soft = smoothstep(0.5, 0.0, r); // Більш різкий перехід для круглості
                  
                  // Додаємо варіацію кольору на основі позиції
                  vec3 baseColor = vColor;
                  vec3 colorVariation = vec3(0.15, 0.08, 0.05);
                  vec3 finalColor = baseColor + colorVariation * (uv.x + uv.y);
                  
                  // Додаємо легку варіацію розміру частинки
                  float sizeVariation = 1.0 + sin(uv.x * 10.0) * 0.1;
                  soft *= sizeVariation;
                  
                  // Додаткове розмиття для м'яких країв + blurFactor
                  soft = pow(soft, 0.8); // blurFactor впливає на розмиття
                  
                  // Покращена прозорість з blurFactor
                  float alpha = soft * vAlpha * 0.05 * vBlurFactor; // vAlpha вже враховує blurFactor
                  
                  if(alpha < 0.001) discard;
                  
                  gl_FragColor = vec4(finalColor, alpha);
              }
        `;
        
                 const material = new THREE.ShaderMaterial({
             transparent: true,
             depthWrite: false,
             // Додаємо налаштування для кращої круглості частинок
             blending: THREE.NormalBlending,
             uniforms: {
                 uTime: { value: 0 }
             },
             vertexShader,
             fragmentShader
         });
        
        const dustCloud = new THREE.Points(geometry, material);
        
        // Використовуємо координати з об'єкта (які вже враховують terrain!)
        const x = coordinates.x;
        const z = coordinates.z;
        const y = coordinates.y + (height / 2); // Y з об'єкта + половина висоти хмари
        
        // Логуємо координати для дебагу
        console.log(`☁️ Хмара ${cloudData.particleCount || 500} частинок: X=${x.toFixed(2)}, Y=${y.toFixed(2)}, Z=${z.toFixed(2)}, висота хмари=${height.toFixed(2)}`);
        
        dustCloud.position.set(x, y, z);
        
        return dustCloud;
    }


    update(object: SceneObject): void {
        // Хмари можуть рухатися повільно
        const cloud = this.getMeshById(object.id);
        if (cloud) {
            // Повільний рух хмари
            cloud.position.x += 0.01;
            if (cloud.position.x > 200) {
                cloud.position.x = -200;
            }
        }
    }

    remove(id: string): void {
        const cloud = this.getMeshById(id);
        if (cloud) {
            this.cloudGroup.remove(cloud);
            
            // Перевіряємо чи це Points (пилова хмара)
            if (cloud instanceof THREE.Points) {
                cloud.geometry.dispose();
                if (cloud.material instanceof THREE.ShaderMaterial) {
                    cloud.material.dispose();
                }
            }
        }
        super.remove(id);
    }

    // Метод для оновлення всіх пилових хмар (шейдерна анімація)
    updateAllClouds(): void {
        const time = this.clock.getElapsedTime();
        
        this.dustParticles.forEach((dustCloud, index) => {
            if (dustCloud instanceof THREE.Points) {
                // Оновлюємо uTime для простих шейдерів
                if (dustCloud.material instanceof THREE.ShaderMaterial) {
                    dustCloud.material.uniforms.uTime.value = time;
                }
            }
        });
    }
}
