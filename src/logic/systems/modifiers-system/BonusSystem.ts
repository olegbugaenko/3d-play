import { BonusRegistry } from './BonusRegistry';
import { DependencyGraph } from './DependencyGraph';
import { FormulaEngine } from './FormulaEngine';
import { IBonusSystem } from '@interfaces/index';

export interface BonusSourceState {
  id: string;
  level: number;
  efficiency: number;
}

export interface ResourceCache {
  income: number;
  multiplier: number;
  consumption: number;
  cap: number;
  capMultiplier: number;
}

export class BonusSystem implements IBonusSystem {
  private registry: BonusRegistry;
  private graph: DependencyGraph;
  private formulaEngine: FormulaEngine;
  
  // Кеш результатів формул
  private formulaResultsCache: Map<string, number> = new Map();
  
  // Кеш фінальних значень
  private effectsCache: Map<string, number> = new Map();
  private resourcesCache: Map<string, ResourceCache> = new Map();
  
  // Стан джерел бонусів
  private sourceStates: Map<string, BonusSourceState> = new Map();
  
  // Статистика кешу
  private cacheStats = {
    formulaHits: 0,
    formulaMisses: 0,
    effectsHits: 0,
    effectsMisses: 0,
    resourcesHits: 0,
    resourcesMisses: 0
  };
  
  constructor() {
    this.registry = new BonusRegistry();
    this.graph = new DependencyGraph();
    this.formulaEngine = new FormulaEngine();
    
    console.log('[BonusSystem] Initialized');
  }
  
  /**
   * Реєструє джерело бонусів
   */
  public registerSource(id: string, data: any): void {
    console.log(`[BonusSystem] Registering source: ${id}`, data);
    this.registry.registerSource(id, data);
    console.log(`[BonusSystem] Source ${id} registered successfully`);
  }
  
  /**
   * Реєструє ефект з початковим значенням
   */
  public registerEffect(id: string, data: any): void {
    this.registry.registerEffect(id, data);
  }
  
  /**
   * Будує граф залежностей після реєстрації всіх джерел
   */
  public buildDependencyGraph(): void {
    this.graph.buildGraph(this.registry);
    
    // Перевіряємо циклічність
    const cycles = this.graph.detectCycles();
    if (cycles.length > 0) {
      console.error('[BonusSystem] Cycles detected in dependency graph:');
      cycles.forEach(cycle => {
        console.error(`  ${cycle.description}`);
      });
      throw new Error('Cyclic dependencies detected in bonus system');
    }
    
    console.log('[BonusSystem] Dependency graph built successfully');
  }
  
  /**
   * Встановлює стан джерела бонусів
   */
  public setSourceState(id: string, level: number, efficiency: number = 1): void {
    // Перевіряємо чи існує джерело
    if (!this.registry.isSourceRegistered(id)) {
      console.error(`[BonusSystem] Source ${id} not found in registry`);
      throw new Error(`Bonus source '${id}' not found`);
    }
    
    this.sourceStates.set(id, { id, level, efficiency });
    
    // Інвалідуємо кеші для цього джерела та всіх залежних
    this.invalidateCaches(id);
    
    console.log(`[BonusSystem] Set source state: ${id} (level: ${level}, efficiency: ${efficiency})`);
  }
  
  /**
   * Отримує значення ефекту
   */
  public getEffectValue(effectId: string): number {
    if (this.effectsCache.has(effectId)) {
      this.cacheStats.effectsHits++;
      return this.effectsCache.get(effectId)!;
    }
    
    this.cacheStats.effectsMisses++;
    const value = this.calculateEffectValue(effectId);
    this.effectsCache.set(effectId, value);
    return value;
  }
  
  /**
   * Отримує значення ресурсу
   */
  public getResourceValue(resourceId: string): ResourceCache {
    if (this.resourcesCache.has(resourceId)) {
      this.cacheStats.resourcesHits++;
      return this.resourcesCache.get(resourceId)!;
    }
    
    this.cacheStats.resourcesMisses++;
    const value = this.calculateResourceValue(resourceId);
    this.resourcesCache.set(resourceId, value);
    return value;
  }
  
  /**
   * Оновлює рівень джерела бонусів
   */
  public updateBonusSourceLevel(sourceId: string, level: number): void {
    // Перевіряємо чи існує джерело
    if (!this.registry.isSourceRegistered(sourceId)) {
      console.error(`[BonusSystem] Source ${sourceId} not found in registry`);
      throw new Error(`Bonus source '${sourceId}' not found`);
    }
    
    const currentState = this.sourceStates.get(sourceId);
    if (!currentState) {
      console.warn(`[BonusSystem] Source ${sourceId} not found, creating new state`);
      this.setSourceState(sourceId, level);
      return;
    }
    
    if (currentState.level !== level) {
      currentState.level = level;
      this.invalidateCaches(sourceId);
      console.log(`[BonusSystem] Updated source level: ${sourceId} -> ${level}`);
    }
  }
  
  /**
   * Отримує кількість зареєстрованих джерел
   */
  public getSourceCount(): number {
    return this.registry.getSourceCount();
  }
  
  /**
   * Отримує граф залежностей для дебагу
   */
  public getDependencyGraph(): DependencyGraph {
    return this.graph;
  }
  
  /**
   * Отримує статистику кешу
   */
  public getCacheStats(): any {
    return { ...this.cacheStats };
  }
  
  /**
   * Скидає статистику кешу
   */
  public resetCacheStats(): void {
    this.cacheStats = {
      formulaHits: 0,
      formulaMisses: 0,
      effectsHits: 0,
      effectsMisses: 0,
      resourcesHits: 0,
      resourcesMisses: 0
    };
  }
  
  /**
   * Отримує розмір кешів
   */
  public getCacheSizes(): any {
    return {
      formulaResults: this.formulaResultsCache.size,
      effects: this.effectsCache.size,
      resources: this.resourcesCache.size
    };
  }
  
  /**
   * Розраховує значення ефекту
   */
  private calculateEffectValue(effectId: string): number {
    // Перевіряємо чи є базовий ефект з початковим значенням
    const baseEffect = this.registry.getEffect(effectId);
    let baseValue = 0;
    if (baseEffect) {
      baseValue = baseEffect.initialValue;
    }
    
    // Знаходимо всі джерела які дають цей ефект
    const sources = this.graph.getEffectSources(effectId);
    
    let totalIncome = 0;
    let totalMultiplier = 1;
    
    sources.forEach(sourceId => {
      const source = this.registry.getSource(sourceId);
      const state = this.sourceStates.get(sourceId);
      
      if (source && source.modifiers.effect && state) {
        // Обробляємо income ефекти
        if (source.modifiers.effect.income && source.modifiers.effect.income[effectId]) {
          const modifier = source.modifiers.effect.income[effectId];
          const deps = this.resolveDependencies(modifier.deps);
          
          // Створюємо ключ для кешу формули
          const formulaKey = `${sourceId}_${effectId}_income_${state.level}_${state.efficiency}_${deps.join('_')}`;
          
          let value: number;
          if (this.formulaResultsCache.has(formulaKey)) {
            value = this.formulaResultsCache.get(formulaKey)!;
            this.cacheStats.formulaHits++;
          } else {
            value = this.formulaEngine.evaluateFormula(
              modifier.formula({ level: state.level, efficiency: state.efficiency }, ...deps),
              { level: state.level, efficiency: state.efficiency },
            );
            this.formulaResultsCache.set(formulaKey, value);
            this.cacheStats.formulaMisses++;
          }
          
          totalIncome += value;
        }
        
        // Обробляємо multiplier ефекти
        if (source.modifiers.effect.multiplier && source.modifiers.effect.multiplier[effectId]) {
          const modifier = source.modifiers.effect.multiplier[effectId];
          const deps = this.resolveDependencies(modifier.deps);
          
          // Створюємо ключ для кешу формули
          const formulaKey = `${sourceId}_${effectId}_multiplier_${state.level}_${state.efficiency}_${deps.join('_')}`;
          
          let value: number;
          if (this.formulaResultsCache.has(formulaKey)) {
            value = this.formulaResultsCache.get(formulaKey)!;
            this.cacheStats.formulaHits++;
          } else {
            value = this.formulaEngine.evaluateFormula(
              modifier.formula({ level: state.level, efficiency: state.efficiency }, ...deps),
              { level: state.level, efficiency: state.efficiency },
            );
            this.formulaResultsCache.set(formulaKey, value);
            this.cacheStats.formulaMisses++;
          }
          
          totalMultiplier *= value;
        }
      }
    });
    
    // Фінальне значення: (базове значення + сума income) * сума multiplier
    return (baseValue + totalIncome) * totalMultiplier;
  }
  
  /**
   * Розраховує значення ресурсу
   */
  private calculateResourceValue(resourceId: string): ResourceCache {
    const cache: ResourceCache = {
      income: 0,
      multiplier: 1,
      consumption: 0,
      cap: 0,
      capMultiplier: 1
    };
    
    // Знаходимо всі джерела які дають цей ресурс
    const sources = this.graph.getEffectSources(resourceId);
    
    console.log(`Sources for ${resourceId}: `, sources);
    sources.forEach(sourceId => {
      const source = this.registry.getSource(sourceId);
      const state = this.sourceStates.get(sourceId);
      
      if (source && source.modifiers.resource && state) {
        Object.entries(source.modifiers.resource).forEach(([resourceType, resources]) => {
          if (resources[resourceId]) {
            const modifier = resources[resourceId];
            const deps = this.resolveDependencies(modifier.deps);
            
            // Створюємо ключ для кешу формули
            const formulaKey = `${sourceId}_${resourceId}_${resourceType}_${state.level}_${state.efficiency}_${deps.join('_')}`;
            
            let value: number;
            if (this.formulaResultsCache.has(formulaKey)) {
              value = this.formulaResultsCache.get(formulaKey)!;
              this.cacheStats.formulaHits++;
            } else {
              value = this.formulaEngine.evaluateFormula(
                modifier.formula({ level: state.level, efficiency: state.efficiency }, ...deps),
                { level: state.level, efficiency: state.efficiency },
              );
              this.formulaResultsCache.set(formulaKey, value);
              this.cacheStats.formulaMisses++;
            }
            
            switch (resourceType) {
              case 'income':
                cache.income += value;
                break;
              case 'multiplier':
                cache.multiplier *= value;
                break;
              case 'consumption':
                cache.consumption += value;
                break;
              case 'cap':
                cache.cap += value;
                break;
              case 'capMultiplier':
                cache.capMultiplier *= value;
                break;
            }
          }
        });
      }
    });
    
    return cache;
  }
  
  /**
   * Розв'язує залежності для формули
   */
  private resolveDependencies(deps: string[]): number[] {
    return deps.map(depId => this.getEffectValue(depId));
  }
  
  /**
   * Інвалідує кеші для джерела та всіх залежних
   */
  private invalidateCaches(sourceId: string): void {
    console.log(`[BonusSystem] Invalidating caches for source: ${sourceId}`);
    
    // Знаходимо всі залежні бонуси
    const dependents = this.graph.getUpdateOrder(sourceId);
    
    // Інвалідуємо кеші залежно від типу сутності
    dependents.forEach(dependent => {
      
      switch (dependent.type) {
        case 'source':
          // Для сорсів інвалідуємо всі кеші
          this.effectsCache.delete(dependent.id);
          this.resourcesCache.delete(dependent.id);
          this.formulaResultsCache.delete(dependent.id);
          break;
          
        case 'effect':
          // Для ефектів інвалідуємо тільки кеш ефектів
          this.effectsCache.delete(dependent.id);
          this.formulaResultsCache.delete(dependent.id);
          break;
          
        case 'resource':
          // Для ресурсів інвалідуємо тільки кеш ресурсів
          this.resourcesCache.delete(dependent.id);
          this.formulaResultsCache.delete(dependent.id);
          break;
      }
    });
    
    // Інвалідуємо кеш самого джерела
    this.effectsCache.delete(sourceId);
    this.resourcesCache.delete(sourceId);
    this.formulaResultsCache.delete(sourceId);
    
    // ВАЖЛИВО: Інвалідуємо кеші всіх ефектів які дає це джерело
    // Бо вони автоматично залежать від нього
    const source = this.registry.getSource(sourceId);
    if (source && source.modifiers.effect) {
      if (source.modifiers.effect.income) {
        Object.keys(source.modifiers.effect.income).forEach(effectId => {
          this.effectsCache.delete(effectId);
        });
      }
      if (source.modifiers.effect.multiplier) {
        Object.keys(source.modifiers.effect.multiplier).forEach(effectId => {
          this.effectsCache.delete(effectId);
        });
      }
    }
    
    // ВАЖЛИВО: Інвалідуємо кеші всіх ресурсів які дає це джерело
    // Бо вони автоматично залежать від нього
    if (source && source.modifiers.resource) {
      Object.entries(source.modifiers.resource).forEach(([_resourceType, resources]) => {
        Object.keys(resources).forEach(resourceId => {
          this.resourcesCache.delete(resourceId);
        });
      });
    }
    
  }
  
  /**
   * Скидає стан системи (для нової гри)
   */
  public reset(): void {
    this.sourceStates.clear();
    this.formulaResultsCache.clear();
    this.effectsCache.clear();
    this.resourcesCache.clear();
    this.resetCacheStats();
    console.log('[BonusSystem] Reset completed');
  }
}
