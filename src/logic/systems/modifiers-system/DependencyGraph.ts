import { BonusRegistry } from './BonusRegistry';

export interface DependencyNode {
  id: string;
  name: string;
  description?: string;
  
  // Що дає цей сорс
  provides: {
    effects: string[];       // Які ефекти дає
    resources: string[];     // Які ресурси дає
  };
  
  // Від чого залежить цей сорс
  dependsOn: {
    effects: string[];       // Від яких ефектів залежить
    resources: string[];     // Від яких ресурсів залежить
  };
  
  // Хто залежить від цього сорса
  dependents: {
    effects: Set<string>;    // Які ефекти залежать від цього
    resources: Set<string>;  // Які ресурси залежать від цього
  };
}

export interface UpdateOrderItem {
  id: string;
  type: 'source' | 'effect' | 'resource';
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  
  // Швидкий пошук: які сорси дають конкретний ефект
  private effectToSources: Map<string, Set<string>> = new Map();
  
  // Швидкий пошук: які сорси залежать від конкретного ефекту
  private effectToDependents: Map<string, Set<string>> = new Map();
  
  public buildGraph(registry: BonusRegistry): void {
    console.log('[DependencyGraph] Building graph...');
    
    // Очищаємо попередній граф
    this.nodes.clear();
    this.effectToSources.clear();
    this.effectToDependents.clear();
    
    const sources = registry.getAllSources();
    const effects = registry.getAllEffects();
    
    // Створюємо вузли для джерел
    sources.forEach((sourceData, sourceId) => {
      const node: DependencyNode = {
        id: sourceId,
        name: sourceData.name,
        description: sourceData.description,
        provides: {
          effects: [],
          resources: []
        },
        dependsOn: {
          effects: [],
          resources: []
        },
        dependents: {
          effects: new Set(),
          resources: new Set()
        }
      };
      
      // Збираємо всі ефекти та ресурси які дає цей сорс
      if (sourceData.modifiers.effect) {
        // Обробляємо income ефекти
        if (sourceData.modifiers.effect.income) {
          Object.keys(sourceData.modifiers.effect.income).forEach(effectId => {
            node.provides.effects.push(effectId);
            this.addEffectToSource(effectId, sourceId);
          });
        }
        
        // Обробляємо multiplier ефекти
        if (sourceData.modifiers.effect.multiplier) {
          Object.keys(sourceData.modifiers.effect.multiplier).forEach(effectId => {
            node.provides.effects.push(effectId);
            this.addEffectToSource(effectId, sourceId);
          });
        }
      }

      console.log('RS: ', sourceData.modifiers);
      
      if (sourceData.modifiers.resource) {
        Object.entries(sourceData.modifiers.resource).forEach(([_resourceType, resources]) => {
          Object.keys(resources).forEach(resourceId => {
            node.provides.resources.push(resourceId);
            this.addEffectToSource(resourceId, sourceId);
          });
        });
      }
      
      // Збираємо залежності
      if (sourceData.modifiers.effect) {
        // Залежності для income ефектів
        if (sourceData.modifiers.effect.income) {
          Object.values(sourceData.modifiers.effect.income).forEach(modifier => {
            if(modifier){
              node.dependsOn.effects.push(...modifier.deps);
            }
          });
        }
        
        // Залежності для multiplier ефектів
        if (sourceData.modifiers.effect.multiplier) {
          Object.values(sourceData.modifiers.effect.multiplier).forEach(modifier => {
            if(modifier){
              node.dependsOn.effects.push(...modifier.deps);
            }
          });
        }
      }
      
      // ВАЖЛИВО: Збираємо залежності ресурсів!
      if (sourceData.modifiers.resource) {
        Object.entries(sourceData.modifiers.resource).forEach(([_resourceType, resources]) => {
          Object.values(resources).forEach(modifier => {
            // ВАЖЛИВО: Залежності ресурсів від ефектів додаються в dependsOn.effects!
            // Бо ресурс може залежати від ефекту через формулу
            if(modifier) {
              node.dependsOn.effects.push(...modifier.deps);
            }
          });
        });
      }
      
      this.nodes.set(sourceId, node);
    });
    
    // Створюємо вузли для ефектів (якщо вони не є джерелами)
    effects.forEach((effectData, effectId) => {
      if (!this.nodes.has(effectId)) {
        const node: DependencyNode = {
          id: effectId,
          name: effectData.name,
          description: effectData.description,
          provides: {
            effects: [], // Ефект НЕ дає сам себе - він тільки має initialValue
            resources: []
          },
          dependsOn: {
            effects: [],
            resources: []
          },
          dependents: {
            effects: new Set(),
            resources: new Set()
          }
        };
        
        this.nodes.set(effectId, node);
        // НЕ додаємо ефект як джерело самого себе
        console.log(`[DependencyGraph] Created node for effect: ${effectId} with initial value: ${effectData.initialValue}`);
      }
    });
    
    // Будуємо залежності
    this.buildDependencies();
    
    console.log(`[DependencyGraph] Built graph with ${this.nodes.size} nodes`);
    console.log('[DependencyGraph] Effect mappings:', this.effectToSources.size);
  }
  
  private addEffectToSource(effectId: string, sourceId: string): void {
    if (!this.effectToSources.has(effectId)) {
      this.effectToSources.set(effectId, new Set());
    }
    this.effectToSources.get(effectId)!.add(sourceId);
  }
  
  private buildDependencies(): void {
    console.log('[DependencyGraph] Building dependencies...', this.nodes);
    
    // ВАЖЛИВО: Коли джерело дає income/multiplier до ефекту,
    // ефект має залежати ВІД джерела, а не навпаки!
    this.nodes.forEach((node, sourceId) => {
      node.provides.effects.forEach(effectId => {
        if (!this.effectToDependents.has(effectId)) {
          this.effectToDependents.set(effectId, new Set());
        }
        
        // Знаходимо всі сорси які залежать від цього ефекту
        this.nodes.forEach((otherNode, otherSourceId) => {
          if (otherNode.dependsOn.effects.includes(effectId)) {
            this.effectToDependents.get(effectId)!.add(otherSourceId);
            node.dependents.effects.add(otherSourceId);
          }
        });
        
        // ВАЖЛИВО: Ефект автоматично залежить від джерела який його дає
        // Це означає що при зміні рівня джерела, ефект повинен перерахуватися
        // Додаємо залежність: ефект залежить ВІД джерела
        if (this.nodes.has(effectId)) {
          const effectNode = this.nodes.get(effectId)!;
          // Ефект залежить від джерела тільки якщо він є джерелом бонусів
          // (має provides.length > 0), а не просто initialValue
          if (effectNode.provides.effects.length > 0 && !effectNode.dependsOn.effects.includes(sourceId)) {
            effectNode.dependsOn.effects.push(sourceId);
            console.log(`[DependencyGraph] Added dependency: ${effectId} depends on ${sourceId}`);
          }
        } else {
          console.warn(`[DependencyGraph] Effect ${effectId} not found in nodes`);
        }
      });
    });
    
    // ВАЖЛИВО: Додатково шукаємо залежності ресурсів від ефектів
    // Це потрібно для випадків коли ресурс залежить від ефекту через формулу
    this.nodes.forEach((node, sourceId) => {
      // Перевіряємо залежності ресурсів від ефектів
      if (node.dependsOn.effects.length > 0) {
        node.dependsOn.effects.forEach(depEffectId => {
          // Знаходимо хто дає цей ефект
          this.nodes.forEach((otherNode, otherSourceId) => {
            if (otherNode.provides.effects.includes(depEffectId)) {
              console.log(`[DependencyGraph] ${sourceId} depends on effect ${depEffectId} (provided by ${otherSourceId})`);
              
              // Додаємо залежність між джерелами
              if (!otherNode.dependents.resources.has(sourceId)) {
                otherNode.dependents.resources.add(sourceId);
                console.log(`[DependencyGraph] Added dependency: ${otherSourceId} → ${sourceId} (resource depends on effect)`);
              }
              
              // Додаємо в мапінг ефект → залежні ресурси
              if (!this.effectToDependents.has(depEffectId)) {
                this.effectToDependents.set(depEffectId, new Set());
              }
              this.effectToDependents.get(depEffectId)!.add(sourceId);
            }
          });
        });
      }
    });
    
    // ВАЖЛИВО: Додатково шукаємо залежності ефектів від ефектів
    // Це потрібно для випадків коли ефект залежить від іншого ефекту
    this.nodes.forEach((node, sourceId) => {
      // Перевіряємо залежності ефектів від ефектів
      if (node.dependsOn.effects.length > 0) {
        node.dependsOn.effects.forEach(depEffectId => {
          // Знаходимо хто дає цей ефект
          this.nodes.forEach((otherNode, otherSourceId) => {
            if (otherNode.provides.effects.includes(depEffectId)) {
              console.log(`[DependencyGraph] ${sourceId} depends on effect ${depEffectId} (provided by ${otherSourceId})`);
              
              // Додаємо залежність між джерелами
              if (!otherNode.dependents.effects.has(sourceId)) {
                otherNode.dependents.effects.add(sourceId);
                console.log(`[DependencyGraph] Added dependency: ${otherSourceId} → ${sourceId} (effect depends on effect)`);
              }
              
              // Додаємо в мапінг ефект → залежні ефекти
              if (!this.effectToDependents.has(depEffectId)) {
                this.effectToDependents.set(depEffectId, new Set());
              }
              this.effectToDependents.get(depEffectId)!.add(sourceId);
            }
          });
        });
      }
    });
    
    console.log('[DependencyGraph] Effect to dependents mapping:');
    this.effectToDependents.forEach((dependents, effect) => {
      console.log(`  ${effect} -> ${Array.from(dependents)}`);
    });
  }
  
  public getUpdateOrder(sourceId: string): UpdateOrderItem[] {
    // console.log(`[DependencyGraph] Getting update order for source: ${sourceId}`);
    
    const source = this.nodes.get(sourceId);
    if (!source) {
      return [];
    }
    
    const dependents = new Set<string>();
    const queue = [sourceId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = this.nodes.get(currentId)!;
      
      // console.log(`[DependencyGraph] Processing current: ${currentId}, provides:`, current.provides);
      
      // Додаємо всіх хто залежить від ефектів цього сорса
      current.provides.effects.forEach(effect => {
        const effectDependents = this.effectToDependents.get(effect) || new Set();
        // console.log(`[DependencyGraph] Found dependents for effect ${effect}:`, Array.from(effectDependents));
        
        effectDependents.forEach(dependentId => {
          if (!dependents.has(dependentId)) {
            dependents.add(dependentId);
            queue.push(dependentId);
          }
        });
        
        // ВАЖЛИВО: Додаємо сам ефект який дає цей сорс
        // Бо він автоматично залежить від нього
        if (!dependents.has(effect)) {
          dependents.add(effect);
          // НЕ додаємо ефекти в чергу - вони не є сорсами
          // але вони мають бути в списку інвалідації
        }
      });
      
      // ВАЖЛИВО: Додаємо всіх хто залежить від цього сорса напряму
      // Це потрібно для випадків коли сорс має dependents через buildDependencies
      current.dependents.effects.forEach(dependentId => {
        if (!dependents.has(dependentId)) {
          dependents.add(dependentId);
          queue.push(dependentId);
        }
      });
      
      // Додаємо всіх хто залежить від цього сорса через ресурси
      current.dependents.resources.forEach(dependentId => {
        if (!dependents.has(dependentId)) {
          dependents.add(dependentId);
          queue.push(dependentId);
        }
      });
      
      // ВАЖЛИВО: Додаємо самі ресурси які дає цей сорс
      // Бо вони автоматично залежать від нього
      current.provides.resources.forEach(resourceId => {
        if (!dependents.has(resourceId)) {
          dependents.add(resourceId);
          // НЕ додаємо ресурси в чергу - вони не є сорсами
          // але вони мають бути в списку інвалідації
        }
      });
    }
    
    // Конвертуємо в масив об'єктів з типом
    const result: UpdateOrderItem[] = Array.from(dependents).map(id => {
      const node = this.nodes.get(id);
      if (node) {
        // Якщо це сорс (має provides)
        if (node.provides.effects.length > 0 || node.provides.resources.length > 0) {
          return { id, type: 'source' as const };
        }
        // Інакше це ефект
        return { id, type: 'effect' as const };
      }
      // Якщо не знайдено в нодах, це ресурс
      return { id, type: 'resource' as const };
    });
    
    // console.log(`[DependencyGraph] Final update order for ${sourceId}:`, result);
    return result;
  }
  
  public detectCycles(): Array<{cycle: string[], description: string}> {
    const cycles: Array<{cycle: string[], description: string}> = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        // Знайшли цикл
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart);
        cycles.push({
          cycle,
          description: `Cycle detected: ${cycle.join(' → ')} → ${nodeId}`
        });
        return;
      }
      
      if (visited.has(nodeId)) return;
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const node = this.nodes.get(nodeId);
      if (node) {
        // Перевіряємо залежності через ефекти
        node.dependents.effects.forEach(dependentId => {
          dfs(dependentId, [...path]);
        });
        
        // Перевіряємо залежності через ресурси
        node.dependents.resources.forEach(dependentId => {
          dfs(dependentId, [...path]);
        });
      }
      
      recursionStack.delete(nodeId);
    };
    
    this.nodes.forEach((_, nodeId) => {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    });
    
    return cycles;
  }
  
  public getNode(id: string): DependencyNode | undefined {
    return this.nodes.get(id);
  }
  
  public getAllNodes(): Map<string, DependencyNode> {
    return new Map(this.nodes);
  }
  
  public getEffectSources(effectId: string): Set<string> {
    return this.effectToSources.get(effectId) || new Set();
  }
  
  public getEffectDependents(effectId: string): Set<string> {
    return this.effectToDependents.get(effectId) || new Set();
  }
}
