export interface ValidationRule {
  type: 'arrayNotEmpty' | 'objectExists' | 'distanceValid' | 'resourceAmount' | 'custom';
  value?: any;
  customValidator?: (value: any, context: any) => boolean;
}

export interface ValidationResult {
  success: boolean;
  message: string;
  code?: string;
}

export class ValidationService {
  /**
   * Валідує значення за правилом
   */
  validate(value: any, rule: ValidationRule, context?: any): ValidationResult {
    switch (rule.type) {
      case 'arrayNotEmpty':
        return this.validateArrayNotEmpty(value);
      
      case 'objectExists':
        return this.validateObjectExists(value);
      
      case 'distanceValid':
        return this.validateDistanceValid(value, rule.value);
      
      case 'resourceAmount':
        return this.validateResourceAmount(value);
      
      case 'custom':
        return this.validateCustom(value, rule.customValidator!, context);
      
      default:
        return {
          success: false,
          message: `Unknown validation rule: ${rule.type}`,
          code: 'UNKNOWN_VALIDATION_RULE'
        };
    }
  }

  /**
   * Перевіряє чи масив не порожній
   */
  private validateArrayNotEmpty(value: any): ValidationResult {
    if (!Array.isArray(value)) {
      return {
        success: false,
        message: 'Value is not an array',
        code: 'NOT_ARRAY'
      };
    }

    if (value.length === 0) {
      return {
        success: false,
        message: 'Array is empty',
        code: 'ARRAY_EMPTY'
      };
    }

    return {
      success: true,
      message: 'Array is not empty'
    };
  }

  /**
   * Перевіряє чи об'єкт існує
   */
  private validateObjectExists(value: any): ValidationResult {
    if (value === null || value === undefined) {
      return {
        success: false,
        message: 'Object does not exist',
        code: 'OBJECT_NOT_FOUND'
      };
    }

    return {
      success: true,
      message: 'Object exists'
    };
  }

  /**
   * Перевіряє чи дистанція в межах
   */
  private validateDistanceValid(value: any, maxDistance: number): ValidationResult {
    if (typeof value !== 'number') {
      return {
        success: false,
        message: 'Distance is not a number',
        code: 'INVALID_DISTANCE_TYPE'
      };
    }

    if (value > maxDistance) {
      return {
        success: false,
        message: `Distance ${value} exceeds maximum ${maxDistance}`,
        code: 'DISTANCE_TOO_FAR'
      };
    }

    return {
      success: true,
      message: 'Distance is valid'
    };
  }

  /**
   * Перевіряє чи ресурс має кількість > 0
   */
  private validateResourceAmount(value: any): ValidationResult {
    if (typeof value !== 'number') {
      return {
        success: false,
        message: 'Resource amount is not a number',
        code: 'INVALID_AMOUNT_TYPE'
      };
    }

    if (value <= 0) {
      return {
        success: false,
        message: 'Resource amount is zero or negative',
        code: 'RESOURCE_DEPLETED'
      };
    }

    return {
      success: true,
      message: 'Resource amount is valid'
    };
  }

  /**
   * Кастомна валідація
   */
  private validateCustom(value: any, validator: (value: any, context: any) => boolean, context?: any): ValidationResult {
    try {
      const isValid = validator(value, context);
      
      if (isValid) {
        return {
          success: true,
          message: 'Custom validation passed'
        };
      } else {
        return {
          success: false,
          message: 'Custom validation failed',
          code: 'CUSTOM_VALIDATION_FAILED'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Custom validation error: ${error}`,
        code: 'CUSTOM_VALIDATION_ERROR'
      };
    }
  }
}
