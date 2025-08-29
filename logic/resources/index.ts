// Експорт всіх компонентів системи ресурсів
export { ResourceManager } from './ResourceManager';
export { RESOURCES_DB, RESOURCE_IDS, type ResourceId, type ResourceDefinition } from './resources-db';
export type { 
  ResourceRequest, 
  ResourceCheckResult, 
  ResourceChange, 
  ResourceHistoryEntry 
} from './resource-types';

// Експорт нових типів з ResourceManager
export type { ResourceData, ResourceStatus } from './ResourceManager';
