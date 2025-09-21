import { BuildingData } from '@scene/scene.types';
import { BuildingInstance, BuildingTypeData, BuildingTypeId } from './buildings.types';

export interface BuildingSceneBinding extends BuildingData {
  readonly blueprint: BuildingTypeData;
  readonly instance: BuildingInstance;
  readonly typeId: BuildingTypeId;
  readonly buildingType: BuildingTypeId;
  hudOffsetY?: number;
}

function cloneBlueprintData(data: BuildingTypeData['data']): Record<string, unknown> {
  if (!data) {
    return {};
  }
  return { ...data };
}

export function createBuildingSceneBinding(
  instance: BuildingInstance,
  blueprint: BuildingTypeData
): BuildingSceneBinding {
  const base: Partial<BuildingSceneBinding> & Record<string, unknown> = {
    buildingType: blueprint.id,
    typeId: blueprint.id,
    blueprint,
    hudOffsetY: (blueprint.ui as any)?.hudOffsetY,
    ...cloneBlueprintData(blueprint.data),
  };

  const binding = base as BuildingSceneBinding;

  Object.defineProperty(binding, 'instance', {
    value: instance,
    enumerable: false,
    writable: false,
  });

  const ensureResourcesCollected = () => {
    if (!instance.resourcesCollected) {
      instance.resourcesCollected = {};
    }
    return instance.resourcesCollected;
  };

  Object.defineProperties(binding, {
    built: {
      get: () => instance.built ?? false,
      set: (value: boolean) => {
        instance.built = value;
      },
      enumerable: true,
    },
    isBuilt: {
      get: () => instance.built ?? false,
      set: (value: boolean) => {
        instance.built = value;
      },
      enumerable: true,
    },
    level: {
      get: () => instance.level,
      set: (value: number) => {
        instance.level = value;
      },
      enumerable: true,
    },
    constructionProgress: {
      get: () => instance.constructionProgress ?? 0,
      set: (value: number | undefined) => {
        instance.constructionProgress = value ?? 0;
      },
      enumerable: true,
    },
    resourcesCollected: {
      get: ensureResourcesCollected,
      set: (value: Record<string, number> | undefined) => {
        instance.resourcesCollected = value ?? {};
      },
      enumerable: true,
    },
    internalStorage: {
      get: () => instance.internalStorage,
      set: (value: BuildingInstance['internalStorage']) => {
        instance.internalStorage = value ?? undefined;
      },
      enumerable: true,
    },
    isFunctional: {
      get: () => instance.isFunctional ?? true,
      set: (value: boolean | undefined) => {
        instance.isFunctional = value ?? true;
      },
      enumerable: true,
    },
  });

  return binding;
}
