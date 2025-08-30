/**
 * Форматує число для відображення в UI
 * @param num - число для форматування
 * @param decimals - кількість десяткових знаків (за замовчуванням: 2)
 * @returns відформатований рядок
 */
export const formatNumber = (num: number, decimals: number = 2): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(decimals);
};

/**
 * Форматує число з префіксом для множників
 * @param num - число для форматування
 * @param decimals - кількість десяткових знаків (за замовчуванням: 2)
 * @returns відформатований рядок з префіксом ×
 */
export const formatMultiplier = (num: number, decimals: number = 2): string => {
  return `×${formatNumber(num, decimals)}`;
};
