import { IRequirementsSystem } from '@interfaces/index';
import { Requirement, RequirementsCheckResult, RequirementCheckDetail } from './requirements.types';
import { GameContainer } from '@core/game/GameContainer';

export class RequirementsSystem implements IRequirementsSystem {
  private container: GameContainer;

  constructor(container: GameContainer) {
    this.container = container;
  }

  /**
   * Перевіряє чи задоволені всі реквайрменти
   */
  public checkRequirements(requirements: Requirement[]): RequirementsCheckResult {
    // Якщо реквайрментів нема - автоматично задоволені
    if (!requirements || requirements.length === 0) {
      return {
        satisfied: true,
        details: []
      };
    }

    const details: RequirementCheckDetail[] = [];
    let allSatisfied = true;

    for (const requirement of requirements) {
      const detail = this.checkSingleRequirement(requirement);
      details.push(detail);
      
      if (!detail.satisfied) {
        allSatisfied = false;
      }
    }

    return {
      satisfied: allSatisfied,
      details
    };
  }

  /**
   * Перевіряє один реквайрмент
   */
  private checkSingleRequirement(requirement: Requirement): RequirementCheckDetail {
    switch (requirement.scope) {
      case 'upgrade':
        return this.checkUpgradeRequirement(requirement);
      case 'building-type':
        return this.checkBuildingTypeRequirement(requirement);
      case 'building-instance':
        return this.checkBuildingInstanceRequirement(requirement);
      case 'resource':
        return this.checkResourceRequirement(requirement);
      case 'command-group':
        return this.checkCommandGroupRequirement(requirement);
      default:
        return {
          requirement,
          satisfied: false,
          currentLevel: 0,
          requiredLevel: requirement.level,
          message: `Unknown requirement scope: ${requirement.scope}`
        };
    }
  }

  private checkUpgradeRequirement(requirement: Requirement): RequirementCheckDetail {
    const upgradesManager = this.container.get('upgradesManager') as any;
    const upgradeState = upgradesManager.getUpgradeState(requirement.id);
    
    if (!upgradeState) {
      return {
        requirement,
        satisfied: false,
        currentLevel: 0,
        requiredLevel: requirement.level,
        message: `Upgrade ${requirement.id} not found`
      };
    }

    const satisfied = upgradeState.unlocked && upgradeState.level >= requirement.level;
    
    return {
      requirement,
      satisfied,
      currentLevel: upgradeState.level,
      requiredLevel: requirement.level,
      message: satisfied 
        ? `Upgrade ${requirement.id} level ${upgradeState.level} >= ${requirement.level}`
        : `Upgrade ${requirement.id} level ${upgradeState.level} < ${requirement.level}`
    };
  }

  private checkBuildingTypeRequirement(requirement: Requirement): RequirementCheckDetail {
    const buildingsManager = this.container.get('buildingsManager') as any;
    const totalLevel = buildingsManager.getTotalLevelForBuildingType(requirement.id);
    const satisfied = totalLevel >= requirement.level;
    
    return {
      requirement,
      satisfied,
      currentLevel: totalLevel,
      requiredLevel: requirement.level,
      message: satisfied
        ? `Total level of ${requirement.id} buildings: ${totalLevel} >= ${requirement.level}`
        : `Total level of ${requirement.id} buildings: ${totalLevel} < ${requirement.level}`
    };
  }

  private checkBuildingInstanceRequirement(requirement: Requirement): RequirementCheckDetail {
    const buildingsManager = this.container.get('buildingsManager') as any;
    const maxLevel = buildingsManager.getMaxLevelForBuildingType(requirement.id);
    const satisfied = maxLevel >= requirement.level;
    
    return {
      requirement,
      satisfied,
      currentLevel: maxLevel,
      requiredLevel: requirement.level,
      message: satisfied
        ? `Max level of ${requirement.id} building: ${maxLevel} >= ${requirement.level}`
        : `Max level of ${requirement.id} building: ${maxLevel} < ${requirement.level}`
    };
  }

  private checkResourceRequirement(requirement: Requirement): RequirementCheckDetail {
    const resourceManager = this.container.get('resourceManager') as any;
    const isUnlocked = resourceManager.isUnlocked(requirement.id);
    const currentLevel = isUnlocked ? 1 : 0;
    const satisfied = currentLevel >= requirement.level;
    
    return {
      requirement,
      satisfied,
      currentLevel,
      requiredLevel: requirement.level,
      message: satisfied 
        ? `Resource ${requirement.id} is unlocked`
        : `Resource ${requirement.id} is locked`
    };
  }

  private checkCommandGroupRequirement(requirement: Requirement): RequirementCheckDetail {
    const commandGroupSystem = this.container.get('commandGroupSystem') as any;
    const isUnlocked = commandGroupSystem.isUnlocked(requirement.id);
    const currentLevel = isUnlocked ? 1 : 0;
    const satisfied = currentLevel >= requirement.level;
    
    return {
      requirement,
      satisfied,
      currentLevel,
      requiredLevel: requirement.level,
      message: satisfied 
        ? `Command group ${requirement.id} is available`
        : `Command group ${requirement.id} is locked`
    };
  }
}
