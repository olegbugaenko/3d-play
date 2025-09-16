/**
 * SVG іконки для ресурсів
 * Генерує SVG рядки для різних типів ресурсів
 */

export class ResourceIcons {
  /**
   * Генерує SVG іконку для енергії (блискавка)
   */
  static getEnergyIcon(color: string = '#FFD700'): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>
      </svg>
    `;
  }

  /**
   * Генерує SVG іконку для каменю (куб)
   */
  static getStoneIcon(color: string = '#8B7355'): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3h18v18H3z" fill="${color}" stroke="#000" stroke-width="1"/>
        <path d="M3 3l18 0l0 18l-18 0z" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M3 3l9 9l9 -9" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M12 12l9 9l-9 -9" fill="none" stroke="#000" stroke-width="1"/>
      </svg>
    `;
  }

  /**
   * Генерує SVG іконку для руди (кристал)
   */
  static getOreIcon(color: string = '#696969'): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l4 6h4l-2 8-6 6-6-6-2-8h4l4-6z" fill="${color}" stroke="#000" stroke-width="1" stroke-linejoin="round"/>
        <path d="M12 2l-4 6l4 4l4-4l-4-6z" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M8 8l4 4l4-4" fill="none" stroke="#000" stroke-width="1"/>
      </svg>
    `;
  }

  /**
   * Генерує SVG іконку для біомаси (листок)
   */
  static getBiomassIcon(color: string = '#228B22'): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2c-2 0-4 1-5 3-1 2-1 4 0 6l5 9 5-9c1-2 1-4 0-6-1-2-3-3-5-3z" fill="${color}" stroke="#000" stroke-width="1" stroke-linejoin="round"/>
        <path d="M12 2l-2 4 2 2 2-2-2-4z" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M8 8l4 2 4-2" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M10 12l2 2 2-2" fill="none" stroke="#000" stroke-width="1"/>
      </svg>
    `;
  }

  /**
   * Отримує SVG іконку для ресурсу за його ID
   */
  static getIconForResource(resourceId: string, color?: string): string {
    switch (resourceId) {
      case 'energy':
        return this.getEnergyIcon(color);
      case 'stone':
        return this.getStoneIcon(color);
      case 'ore':
        return this.getOreIcon(color);
      case 'biomass':
        return this.getBiomassIcon(color);
      default:
        // Fallback - простий квадрат
        return `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" fill="${color || '#FFFFFF'}" stroke="#000" stroke-width="1"/>
          </svg>
        `;
    }
  }

  /**
   * Конвертує SVG рядок в Data URL для використання в Three.js текстурах
   */
  static svgToDataUrl(svgString: string): string {
    const encoded = encodeURIComponent(svgString.trim());
    return `data:image/svg+xml,${encoded}`;
  }
}
