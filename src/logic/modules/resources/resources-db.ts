import { Requirement } from '@systems/requirements';

// База даних ресурсів
export type ResourceId = 'energy' | 'stone' | 'ore' | 'biomass';

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  maxCapacity: number;
  icon?: string;
  color?: string;
  description?: string;
  requirements?: Requirement[];  // Додаємо реквайрменти
  miningDifficulty?: number;    // Множник складності добування (1.0 = базова швидкість)
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
    description: 'Будівельний камінь для споруд',
    miningDifficulty: 1.0  // Базова швидкість
  },
  ore: {
    id: 'ore',
    name: 'Ore',
    maxCapacity: 300,
    icon: '⛏️',
    color: '#696969',
    description: 'Руда для виробництва металів',
    miningDifficulty: 0.5,  // В 2 рази повільніше
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
        level: 2
      }
    ]
  },
  biomass: {
    id: 'biomass',
    name: 'Biomass',
    maxCapacity: 400,
    icon: '🌱',
    color: '#228B22',
    description: 'Органічна біомаса для виробництва',
    miningDifficulty: 0.25,  // В 4 рази повільніше
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
        level: 5
      }
    ]
  }
};

export const RESOURCE_IDS: ResourceId[] = Object.keys(RESOURCES_DB) as ResourceId[];
