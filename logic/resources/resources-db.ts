// База даних ресурсів
export type ResourceId = 'energy' | 'stone' | 'ore';

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  maxCapacity: number;
  icon?: string;
  color?: string;
  description?: string;
}

export const RESOURCES_DB: Record<ResourceId, ResourceDefinition> = {
  energy: {
    id: 'energy',
    name: 'Energy',
    maxCapacity: 1000,
    icon: '⚡',
    color: '#FFD700',
    description: 'Електрична енергія для живлення систем'
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    maxCapacity: 500,
    icon: '🪨',
    color: '#8B7355',
    description: 'Будівельний камінь для споруд'
  },
  ore: {
    id: 'ore',
    name: 'Ore',
    maxCapacity: 300,
    icon: '⛏️',
    color: '#696969',
    description: 'Руда для виробництва металів'
  }
};

export const RESOURCE_IDS: ResourceId[] = Object.keys(RESOURCES_DB) as ResourceId[];
