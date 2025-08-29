export interface BonusFormula {
    type: 'linear' | 'exponential';
    A: number;
    B: number;
  }
  
  export interface BonusModifier {
    formula: (data: any, ...deps: number[]) => BonusFormula;
    deps: string[];
  }

  export type BonusBatch = Partial<Record<string, BonusModifier>>;

  export type BonusSourceModifier = {
    resource?: {
      income?: BonusBatch;
      multiplier?: BonusBatch;
      cap?: BonusBatch;
      capMultiplier?: BonusBatch;
      consumption?: BonusBatch;
    };
    effect?: {
      income?: BonusBatch; // Added income for effects
      multiplier?: BonusBatch; // Added multiplier for effects
    };
};
  
  export interface BonusSourceData {
    name: string;
    description?: string;
    modifiers: BonusSourceModifier;
  }
  
  // Новий інтерфейс для реєстрації ефектів
  export interface BonusEffectData {
    name: string;
    description: string;
    initialValue: number; // Початкове значення ефекту
  }