import { SaveLoadManager } from '@save-load/save-load.types';
import { 
  BuildingTypeData, 
  BuildingInstance, 
  BuildingsManagerSaveData, 
} from './buildings.types';
import { BUILDINGS_DB } from './buildings-db';
import { IBuildingsManager, IBonusSystem, ISceneLogic, IRequirementsSystem } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';

export class BuildingsManager implements SaveLoadManager, IBuildingsManager {
  private buildingsDB: Map<string, BuildingTypeData> = new Map();
  private buildingInstances: Map<string, BuildingInstance> = new Map();
  private bonusSystem: IBonusSystem;
  private sceneLogic: ISceneLogic;
  private requirementsSystem: IRequirementsSystem;

  constructor(bonusSystem: IBonusSystem, sceneLogic: ISceneLogic, requirementsSystem: IRequirementsSystem) {
    this.bonusSystem = bonusSystem;
    this.sceneLogic = sceneLogic;
    this.requirementsSystem = requirementsSystem;

  }

  /**
   * Ініціалізація перед початком гри
   * Читає об'єкти з БД будівель, створює бонус-сорти
   */
  public beforeInit(): void {

    
    // Копіюємо БД будівель
    this.buildingsDB = new Map(BUILDINGS_DB);

    
    // Реєструємо кожну будівлю як бонус-сорт в BonusSystem
    this.buildingsDB.forEach((buildingType, typeId) => {

      
      if (buildingType.modifier) {

        
        // Створюємо унікальний ID для бонус-сорта
        const bonusSourceId = this.getBonusSourceId(typeId);
        
        // Реєструємо будівлю як джерело бонусів з формулами з БД
        this.bonusSystem.registerSource(bonusSourceId, {
          name: buildingType.name,
          description: buildingType.description,
          modifiers: buildingType.modifier
        });
        this.bonusSystem.setSourceState(bonusSourceId, 0, 1.0);

      } else {

      }
    });
    

  }

  /**
   * Реєструє новий тип будівлі
   */
  public registerBuildingType(id: string, data: BuildingTypeData): void {
    this.buildingsDB.set(id, data);

  }

  /**
   * Встановлює початковий стан будівлі
   */
  public setInitialState(instanceId: string, typeId: string, level: number = 0, built: boolean = false, position?: { x: number; y: number; z: number }): void {
    if (!this.buildingsDB.has(typeId)) {
      throw new Error(`Building type ${typeId} not registered`);
    }

    const buildingInstance: BuildingInstance = {
      id: instanceId,
      typeId,
      level,
      built,
      position
    };

    this.buildingInstances.set(instanceId, buildingInstance);
    
    // Синхронізуємо з BonusSystem
    if (built) {
      const bonusSourceId = this.getBonusSourceId(typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, level);
    }
    

  }

  /**
   * Будує або підвищує рівень будівлі
   */
  public buildOrUpgrade(instanceId: string, typeId: string, position?: { x: number; y: number; z: number }): boolean {
    const buildingType = this.buildingsDB.get(typeId);
    const instance = this.buildingInstances.get(instanceId);

    if (!buildingType) {
      console.error(`[BuildingsManager] Building type ${typeId} not found`);
      return false;
    }

    if (!instance) {
      // Створюємо новий екземпляр
      const newInstance: BuildingInstance = {
        id: instanceId,
        typeId,
        level: 1,
        built: true,
        position: position
      };
      this.buildingInstances.set(instanceId, newInstance);
      const bonusSourceId = this.getBonusSourceId(typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, 1);
      return true;
    }

    if (!instance.built) {
      // Будуємо будівлю
      instance.built = true;
      instance.level = 1;
      if (position) instance.position = position;
      const bonusSourceId = this.getBonusSourceId(typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, 1);
      return true;
    }

    if (instance.level >= buildingType.maxLevel) {
      console.error(`[BuildingsManager] Building ${instanceId} already at max level`);
      return false;
    }

    // Підвищуємо рівень
    instance.level++;
    const bonusSourceId = this.getBonusSourceId(typeId);
    this.bonusSystem.updateBonusSourceLevel(bonusSourceId, instance.level);
    return true;
  }

  /**
   * Знищує будівлю
   */
  public destroyBuilding(instanceId: string): boolean {
    const instance = this.buildingInstances.get(instanceId);

    if (!instance || !instance.built) {
      console.error(`[BuildingsManager] Building ${instanceId} not built`);
      return false;
    }

    instance.built = false;
    instance.level = 0;
    
    // Синхронізуємо з BonusSystem
    const bonusSourceId = this.getBonusSourceId(instance.typeId);
    this.bonusSystem.updateBonusSourceLevel(bonusSourceId, 0);
    
    return true;
  }

  /**
   * Переміщує будівлю
   */
  public moveBuilding(instanceId: string, newPosition: { x: number; y: number; z: number }): boolean {
    const instance = this.buildingInstances.get(instanceId);

    if (!instance || !instance.built) {
      console.error(`[BuildingsManager] Building ${instanceId} not built`);
      return false;
    }

    instance.position = newPosition;
    return true;
  }

  /**
   * Отримує вартість будівництва/покращення
   */
  public getBuildingCost(typeId: string, level: number): ResourceRequest | undefined {
    const buildingType = this.buildingsDB.get(typeId);
    if (!buildingType) return undefined;
    
    return buildingType.cost(level);
  }

  /**
   * Отримує стан будівлі
   */
  public getBuildingInstance(instanceId: string): BuildingInstance | undefined {
    return this.buildingInstances.get(instanceId);
  }

  /**
   * Отримує тип будівлі
   */
  public getBuildingType(typeId: string): BuildingTypeData | undefined {
    return this.buildingsDB.get(typeId);
  }

  /**
   * Отримує всі типи будівель
   */
  public getAllBuildingTypes(): Map<string, BuildingTypeData> {
    return new Map(this.buildingsDB);
  }

  /**
   * Отримує всі екземпляри будівель
   */
  public getAllBuildingInstances(): Map<string, BuildingInstance> {
    return new Map(this.buildingInstances);
  }

  /**
   * Перевіряє чи тип будівлі зареєстрований
   */
  public isBuildingTypeRegistered(typeId: string): boolean {
    return this.buildingsDB.has(typeId);
  }

  /**
   * Отримує кількість зареєстрованих типів будівель
   */
  public getBuildingTypesCount(): number {
    return this.buildingsDB.size;
  }

  /**
   * Отримує кількість побудованих будівель
   */
  public getBuiltBuildingsCount(): number {
    let count = 0;
    this.buildingInstances.forEach(instance => {
      if (instance.built) count++;
    });
    return count;
  }

  /**
   * Отримує ID бонус-сорта для типу будівлі
   */
  private getBonusSourceId(typeId: string): string {
    return `building_source_${typeId}`;
  }

  /**
   * Створює будівлю на карті з вказаним типом, позицією та рівнем
   */
  public generateBuilding(typeId: string, position: { x: number; y: number; z: number }, level: number = 1): void {
    const buildingType = this.buildingsDB.get(typeId);
    if (!buildingType) {
      console.warn(`[BuildingsManager] Unknown building type: ${typeId}`);
      return;
    }

    // Створюємо унікальний ID для інстансу
    const instanceId = `${typeId}_${Date.now()}_${Math.random().toString(36)}`;
    
    // Створюємо інстанс будівлі
    const buildingInstance: BuildingInstance = {
      id: instanceId,
      typeId,
      level,
      built: true,
      position
    };

    // Зберігаємо інстанс
    this.buildingInstances.set(instanceId, buildingInstance);

    // Оновлюємо рівень у BonusSystem
    const bonusSourceId = this.getBonusSourceId(typeId);
    this.bonusSystem.updateBonusSourceLevel(bonusSourceId, level);

    // Створюємо об'єкт на карті аналогічно до generateBuildings
    const buildingObject = {
      id: instanceId,
      type: 'building',
      coordinates: position,
      scale: { x: 1.5, y: 1.5, z: 1.5 },
      rotation: { x: 0, y: 0, z: 0 },
      data: { 
        buildingType: typeId,
        level: level,
        typeId: typeId,
        ...(this.buildingsDB.get(typeId)?.data || {})
      },
      tags: ['on-ground', 'static', 'building', ...(this.buildingsDB.get(typeId)?.tags || [])],
      bottomAnchor: -0.75,
      terrainAlign: true,
      targetType: ['unload-resource', 'repair', 'upgrade'],
    };

    // Додаємо об'єкт на сцену з terrain constraint
    const success = this.sceneLogic.pushObjectWithTerrainConstraint(buildingObject);
    if (!success) {
      console.warn(`[BuildingsManager] Failed to add building ${typeId} to scene`);
    }
  }

  /**
   * Створює початкові будівлі для нової гри
   */
  public newGameBuildings(): void {
    // Створюємо склад
    this.generateBuilding('storage', { x: 3, y: 30, z: 3 }, 1);
    
    // Створюємо зарядну станцію  
    this.generateBuilding('chargingStation', { x: -3, y: 30, z: -3 }, 1);
  }

  // SaveLoadManager implementation
  public save(): BuildingsManagerSaveData {
    const buildingInstances = Array.from(this.buildingInstances.values());
    return { buildingInstances };
  }

  public load(data: BuildingsManagerSaveData): void {
    // Очищаємо поточні екземпляри
    this.buildingInstances.clear();
    
    // Завантажуємо збережені екземпляри та створюємо їх на сцені
    data.buildingInstances.forEach(instance => {
      if (instance.built && instance.position) {
        // Створюємо будівлю на сцені через generateBuilding
        this.generateBuilding(instance.typeId, instance.position, instance.level);
      } else {
        // Якщо будівля не побудована - просто зберігаємо стан
        this.buildingInstances.set(instance.id, instance);
        
        // Синхронізуємо з BonusSystem
        const bonusSourceId = this.getBonusSourceId(instance.typeId);
        this.bonusSystem.updateBonusSourceLevel(bonusSourceId, instance.level);
      }
    });
  }

  public reset(): void {
    // Скидаємо всі екземпляри до початкових значень
    this.buildingInstances.forEach((instance, _instanceId) => {
      instance.level = 0;
      instance.built = false;
      instance.position = undefined;
      
      // Синхронізуємо з BonusSystem
      const bonusSourceId = this.getBonusSourceId(instance.typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, 0);
    });
  }

  /**
   * Перевіряє чи можна побудувати будівлю
   */
  public canBuild(buildingTypeId: string): boolean {
    const buildingData = this.buildingsDB.get(buildingTypeId);
    if (!buildingData) return false;
    
    // Якщо нема реквайрментів - будівлю можна будувати автоматично
    if (!buildingData.requirements || buildingData.requirements.length === 0) {
      return true;
    }

    // Перевіряємо реквайрменти через RequirementsSystem
    const result = this.requirementsSystem.checkRequirements(buildingData.requirements);
    return result.satisfied;
  }

  /**
   * Отримує список доступних типів будівель для UI
   */
  public getAvailableBuildingTypes(): BuildingTypeData[] {
    return Array.from(this.buildingsDB.values()).filter(building => 
      this.canBuild(building.id)
    );
  }

  /**
   * Отримує сумарний рівень всіх будівель типу
   */
  public getTotalLevelForBuildingType(buildingTypeId: string): number {
    let totalLevel = 0;
    
    for (const instance of this.buildingInstances.values()) {
      if (instance.typeId === buildingTypeId && instance.built) {
        totalLevel += instance.level;
      }
    }
    
    return totalLevel;
  }

  /**
   * Отримує максимальний рівень серед будівель типу
   */
  public getMaxLevelForBuildingType(buildingTypeId: string): number {
    let maxLevel = 0;
    
    for (const instance of this.buildingInstances.values()) {
      if (instance.typeId === buildingTypeId && instance.built) {
        maxLevel = Math.max(maxLevel, instance.level);
      }
    }
    
    return maxLevel;
  }
}
