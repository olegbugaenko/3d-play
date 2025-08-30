import { Requirement, RequirementsCheckResult } from '@systems/requirements';

export interface IRequirementsSystem {
  /**
   * Перевіряє чи задоволені всі реквайрменти
   */
  checkRequirements(requirements: Requirement[]): RequirementsCheckResult;
}
