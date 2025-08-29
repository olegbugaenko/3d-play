export interface BonusFormula {
  type: 'linear' | 'exponential';
  A: number;
  B: number;
}

export class FormulaEngine {
  
  /**
   * Оцінює формулу
   */
  public evaluateFormula(formula: BonusFormula, data: any): number {
    switch (formula.type) {
      case 'linear':
        return this.evaluateLinear(formula, data);
      case 'exponential':
        return this.evaluateExponential(formula, data);
      default:
        throw new Error(`Unknown formula type: ${formula.type}`);
    }
  }
  
  /**
   * Оцінює лінійну формулу: A * level * efficiency + B
   */
  private evaluateLinear(formula: BonusFormula, data: any): number {
    // ВАЖЛИВО: deps вже враховані в коефіцієнтах A та B через modifier.formula
    // НЕ потрібно їх ще раз застосовувати!
    return formula.A * data.level * data.efficiency + formula.B;
  }
  
  /**
   * Оцінює експоненціальну формулу: A * (level * efficiency)^B
   */
  private evaluateExponential(formula: BonusFormula, data: any): number {
    // ВАЖЛИВО: deps вже враховані в коефіцієнтах A та B через modifier.formula
    // НЕ потрібно їх ще раз застосовувати!
    return formula.A * Math.pow(data.level * data.efficiency, formula.B);
  }
  
  /**
   * Валідація формули
   */
  public validateFormula(formula: BonusFormula): boolean {
    if (!formula.type || !['linear', 'exponential'].includes(formula.type)) {
      console.error(`[FormulaEngine] Invalid formula type: ${formula.type}`);
      return false;
    }
    
    if (typeof formula.A !== 'number' || typeof formula.B !== 'number') {
      console.error(`[FormulaEngine] Invalid formula parameters: A=${formula.A}, B=${formula.B}`);
      return false;
    }
    
    if (formula.type === 'exponential' && formula.B <= 0) {
      console.error(`[FormulaEngine] Exponential formula requires positive exponent: B=${formula.B}`);
      return false;
    }
    
    return true;
  }
}
