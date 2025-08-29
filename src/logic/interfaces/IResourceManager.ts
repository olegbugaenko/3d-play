import { ResourceId } from '@resources/resources-db';
import { ResourceChange, ResourceRequest, ResourceCheckResult } from '@resources/resource-types';
import { SaveLoadManager } from '@save-load/save-load.types';

export interface IResourceManager extends SaveLoadManager {
  // Основні методи
  getResourceAmount(resourceId: ResourceId): number;
  getResourceCapacity(resourceId: ResourceId): number;
  getResourceProgress(resourceId: ResourceId): number;
  
  // Зміна ресурсів
  addResources(changes: ResourceChange[]): boolean;
  spendResources(changes: ResourceChange[]): boolean;
  setResourceAmount(resourceId: ResourceId, amount: number, reason?: string): void;
  
  // Перевірка ресурсів
  checkResources(request: ResourceRequest): ResourceCheckResult;
  
  // Системні методи
  tick(dT: number): void;
  reset(): void;
}
