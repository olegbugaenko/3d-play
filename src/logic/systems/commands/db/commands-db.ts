import { CommandType } from '../command.types';

/**
 * Затратність команд (power per second)
 * Кожна команда має свою базову затратність енергії
 */
export const COMMAND_COSTS: Record<CommandType, { powerPerSecond: number }> = {
  'move-to': { powerPerSecond: 0.0 },           // Рух не споживає енергію
  'collect-resource': { powerPerSecond: 1 },  // Добування ресурсів
  'unload-resources': { powerPerSecond: 0.5 }, // Розвантаження
  'build': { powerPerSecond: 2.5 },             // Будівництво
  'build-road': { powerPerSecond: 2.0 },        // Будівництво дороги
  'wait': { powerPerSecond: 0.0 },              // Очікування не споживає
  'attack': { powerPerSecond: 2.0 },            // Атака (висока затратність)
  'charge': { powerPerSecond: 0.0 }             // Зарядка не споживає
};

/**
 * Отримати затратність команди
 */
export function getCommandCost(commandType: CommandType): { powerPerSecond: number } {
  return COMMAND_COSTS[commandType] || { powerPerSecond: 0.0 };
}

/**
 * Перевірити чи команда споживає енергію
 */
export function isCommandConsumingPower(commandType: CommandType): boolean {
  const cost = getCommandCost(commandType);
  return cost.powerPerSecond > 0;
}
