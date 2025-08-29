/**
 * Стан генерації мапи для збереження/завантаження прогресу
 */
export interface MapGenerationState {
  // Seed для процедурної генерації
  generationSeed: number;
  
  // Загальна кількість зібраних ресурсів по типах
  collectedResources: {
    stone: number;
    ore: number;
  };
  
  // Кількість зібраних ресурсів по кластерах
  clusterCollectionState: Record<number, number>; // clusterId -> collectedCount
  
  // Версія формату збереження
  version: string;
  
  // Timestamp останнього збереження
  lastSaved: number;
}

/**
 * Клас для відстеження стану генерації мапи
 */
export class MapGenerationTracker {
  private state: MapGenerationState;
  private readonly VERSION = '1.0.0';

  constructor(seed: number = Date.now()) {
    this.state = {
      generationSeed: seed,
      collectedResources: {
        stone: 0,
        ore: 0
      },
      clusterCollectionState: {},
      version: this.VERSION,
      lastSaved: Date.now()
    };
  }

  /**
   * Отримує поточний seed
   */
  getSeed(): number {
    return this.state.generationSeed;
  }

  /**
   * Позначає ресурс як зібраний
   */
  markResourceCollected(clusterId: number, resourceType: 'stone' | 'ore'): void {
    // Оновлюємо загальну кількість
    this.state.collectedResources[resourceType]++;
    
    // Оновлюємо стан кластера
    if (!this.state.clusterCollectionState[clusterId]) {
      this.state.clusterCollectionState[clusterId] = 0;
    }
    this.state.clusterCollectionState[clusterId]++;
    
    // Оновлюємо timestamp
    this.state.lastSaved = Date.now();
  }

  /**
   * Перевіряє чи зібраний ресурс в кластері
   */
  isResourceCollected(clusterId: number, resourceIndex: number): boolean {
    const collectedInCluster = this.state.clusterCollectionState[clusterId] || 0;
    return resourceIndex < collectedInCluster;
  }

  /**
   * Отримує кількість зібраних ресурсів по типу
   */
  getCollectedResources(resourceType: 'stone' | 'ore'): number {
    return this.state.collectedResources[resourceType];
  }

  /**
   * Отримує стан кластера
   */
  getClusterState(clusterId: number): number {
    return this.state.clusterCollectionState[clusterId] || 0;
  }

  /**
   * Отримує повний стан для збереження
   */
  getSaveState(): MapGenerationState {
    return { ...this.state };
  }

  /**
   * Завантажує стан з збереження
   */
  loadSaveState(savedState: MapGenerationState): void {
    // Перевіряємо версію
    if (savedState.version !== this.VERSION) {
      console.warn(`Version mismatch: saved ${savedState.version}, current ${this.VERSION}`);
    }
    
    this.state = { ...savedState };
  }

  /**
   * Скидає стан (корисно для тестування)
   */
  reset(): void {
    this.state.collectedResources.stone = 0;
    this.state.collectedResources.ore = 0;
    this.state.clusterCollectionState = {};
    this.state.lastSaved = Date.now();
  }

  /**
   * Генерує новий seed
   */
  regenerateSeed(): void {
    this.state.generationSeed = Date.now();
    this.reset();
  }
}
