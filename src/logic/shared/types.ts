/**
 * Спільні типи для заміни any в критичних місцях
 */

// TSceneObject використовується з @scene/scene.types.ts
// CommandContext, CommandGroupContext, CommandGroupState використовуються з @commands/command.types.ts та @commands/command-group.types.ts

// Типи для системи бонусів (використовуються в BonusSystem.ts)
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export interface CacheSizes {
  sources: number;
  effects: number;
  formulas: number;
}

// UpgradeDataUI та UpgradeEffectUI використовуються з @upgrades/upgrades.types.ts
// ResourceCost видалено - використовується ResourceRequest з @resources/resource-types.ts
// BonusData та BonusEffect видалено - не використовуються

// ValidationContext, ValidationResult використовуються з @commands/ValidationService.ts
// SaveData, ManagerSaveData використовуються з @save-load/save-load.types.ts
// FormulaData використовується з @modifiers/BonusRegistry.ts
// BuildingData використовується з @buildings/buildings.types.ts
// DroneData, ResourceAmount використовуються з @drones/DroneManager.ts
// CommandData використовується з @commands/command.types.ts
// RendererData використовується з @ui/renderers/
// TerrainData використовується з @scene/terrain-manager.ts
// EffectData використовується з @shared/effects/

// Універсальний тип для логування (використовується в ErrorService.ts)
export interface LogData {
  [key: string]: unknown;
}
