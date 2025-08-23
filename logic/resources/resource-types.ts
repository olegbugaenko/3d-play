import { ResourceId } from './resources-db';

// Запит на ресурси
export interface ResourceRequest {
  [resourceId: string]: number;
}

// Статус конкретного ресурсу
export interface ResourceStatus {
  required: number;
  own: number;
  isAffordable: boolean;
  progress: number; // 0..1
}

// Загальний результат перевірки ресурсів
export interface ResourceCheckResult {
  isAffordable: boolean;
  progress: number; // 0..1 - загальний прогрес
  resources: Record<ResourceId, ResourceStatus>;
  missing: ResourceRequest; // яких ресурсів бракує
  totalRequired: number; // загальна кількість необхідних ресурсів
  totalOwn: number; // загальна кількість наявних ресурсів
}

// Зміна ресурсів
export interface ResourceChange {
  resourceId: ResourceId;
  amount: number; // додатнє = додати, від'ємне = забрати
  reason?: string; // причина зміни (для логування)
}

// Історія змін ресурсів
export interface ResourceHistoryEntry {
  timestamp: number;
  resourceId: ResourceId;
  amount: number;
  reason?: string;
  balance: number; // баланс після зміни
}
