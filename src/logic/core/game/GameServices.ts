// Групуємо пов'язані сервіси разом
import { ISceneLogic, IResourceManager, IBonusSystem, IBuildingsManager, IUpgradesManager, IDroneManager, ICommandSystem, ICommandGroupSystem, ISaveManager } from '../../interfaces/index';
import { DynamicsLogic } from '../../systems/scene/dynamics-logic';

/**
 * Основні сервіси сцени та логіки
 */
export interface CoreServices {
  sceneLogic: ISceneLogic;
  dynamicsLogic: DynamicsLogic;
}

/**
 * Сервіси ресурсів та бонусів
 */
export interface ResourceServices {
  resourceManager: IResourceManager;
  bonusSystem: IBonusSystem;
}

/**
 * Сервіси команд
 */
export interface CommandServices {
  commandSystem: ICommandSystem;
  commandGroupSystem: ICommandGroupSystem;
}

/**
 * Сервіси ігрових об'єктів
 */
export interface GameObjectServices {
  droneManager: IDroneManager;
  buildingsManager: IBuildingsManager;
  upgradesManager: IUpgradesManager;
}

/**
 * Всі сервіси разом (поточний інтерфейс для сумісності)
 */
export interface AllGameServices extends 
  CoreServices, 
  ResourceServices, 
  CommandServices, 
  GameObjectServices {
  saveManager: ISaveManager;
}

/**
 * Мінімальні залежності для MapLogic (поступово зменшуємо)
 */
export interface MapLogicDependencies {
  sceneLogic: ISceneLogic;
  dynamicsLogic: DynamicsLogic;
  commandSystem: ICommandSystem;
  commandGroupSystem: ICommandGroupSystem;
}
