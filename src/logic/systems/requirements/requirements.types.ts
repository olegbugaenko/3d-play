export type RequirementScope = 'upgrade' | 'building-type' | 'building-instance' | 'resource' | 'command-group';

export interface Requirement {
  scope: RequirementScope;
  id: string;
  level: number;
}

export interface RequirementsCheckResult {
  satisfied: boolean;
  details: RequirementCheckDetail[];
}

export interface RequirementCheckDetail {
  requirement: Requirement;
  satisfied: boolean;
  currentLevel: number;
  requiredLevel: number;
  message: string;
}
