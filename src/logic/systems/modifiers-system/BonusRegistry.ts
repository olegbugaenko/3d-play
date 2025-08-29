import { BonusEffectData, BonusSourceData } from "./bonus-system.types";

export class BonusRegistry {
  private sources: Map<string, BonusSourceData> = new Map();
  private effects: Map<string, BonusEffectData> = new Map(); // Новий Map для ефектів
  
  /**
   * Реєструє джерело бонусів
   */
  public registerSource(id: string, data: BonusSourceData): void {
    console.log(`[BonusRegistry] Registering source: ${id}`, data);
    this.sources.set(id, data);
    console.log(`[BonusRegistry] Source ${id} added to registry. Total sources: ${this.sources.size}`);
  }
  
  /**
   * Реєструє ефект з початковим значенням
   */
  public registerEffect(id: string, data: BonusEffectData): void {
    this.effects.set(id, data);
  }
  
  /**
   * Отримує всі зареєстровані джерела
   */
  public getAllSources(): Map<string, BonusSourceData> {
    return new Map(this.sources);
  }
  
  /**
   * Отримує всі зареєстровані ефекти
   */
  public getAllEffects(): Map<string, BonusEffectData> {
    return new Map(this.effects);
  }
  
  /**
   * Отримує джерело за ID
   */
  public getSource(id: string): BonusSourceData | undefined {
    return this.sources.get(id);
  }
  
  /**
   * Отримує ефект за ID
   */
  public getEffect(id: string): BonusEffectData | undefined {
    return this.effects.get(id);
  }
  
  /**
   * Перевіряє чи зареєстроване джерело
   */
  public isSourceRegistered(id: string): boolean {
    return this.sources.has(id);
  }
  
  /**
   * Перевіряє чи зареєстрований ефект
   */
  public isEffectRegistered(id: string): boolean {
    return this.effects.has(id);
  }
  
  /**
   * Отримує кількість зареєстрованих джерел
   */
  public getSourceCount(): number {
    return this.sources.size;
  }
  
  /**
   * Отримує кількість зареєстрованих ефектів
   */
  public getEffectCount(): number {
    return this.effects.size;
  }
}
