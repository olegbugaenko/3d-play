import { InteractionHandler, InteractionMode } from './InteractionHandler';

export class InteractionManager {
  private handlers: Map<InteractionMode, InteractionHandler> = new Map();
  private currentMode: InteractionMode = 'selection';
  private isMouseDown = false;
  private mousePosition = { x: 0, y: 0 };
  private eventListeners: Map<string, Function[]> = new Map();

  constructor() {
    this.setupEventListeners();
    // Автоматична реакція на запити зміни режиму від хендлерів
    this.on('modeChange', (data: any) => {
      const next: InteractionMode | undefined = data?.to;
      if (!next) return;
      // Уникаємо зациклення: якщо вже в цьому режимі — нічого не робимо
      if (next === this.currentMode) return;
      this.setMode(next);
    });
  }

  private setupEventListeners(): void {
    // Один раз на весь додаток - всі обробники подій миші тут
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('contextmenu', this.handleContextMenu);
  }

  private isUiTarget(target: HTMLElement | null): boolean {
    if (!target) return false;
    return Boolean(
      target.closest('.command-panel') ||
      target.closest('.buildings-panel') ||
      target.closest('.ui-panel') ||
      target.closest('button') ||
      target.closest('input')
    );
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    // Перевіряємо, чи подія відбувається над UI елементом
    const target = event.target as HTMLElement;
    if (this.isUiTarget(target)) {
      return; // Ігноруємо події над UI елементами
    }

    this.isMouseDown = true;
    this.mousePosition = { x: event.clientX, y: event.clientY };

    // Делегуємо до активного хендлера
    const activeHandler = this.handlers.get(this.currentMode);
    if (activeHandler) {
      activeHandler.onMouseDown(event);
    }

    // Емітимо подію для інших підписників
    this.emit('mousedown', { event, mode: this.currentMode });
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    // Перевіряємо, чи подія відбувається над UI елементом
    const target = event.target as HTMLElement;
    if (this.isUiTarget(target) && !this.isMouseDown) {
      return; // Ігноруємо рухи, які почалися на UI
    }

    this.mousePosition = { x: event.clientX, y: event.clientY };
    // Делегуємо до активного хендлера
    const activeHandler = this.handlers.get(this.currentMode);
    if (activeHandler) {
      activeHandler.onMouseMove(event);
    }

    // Емітимо подію для інших підписників
    this.emit('mousemove', { event, mode: this.currentMode });
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    // Перевіряємо, чи подія відбувається над UI елементом
    const target = event.target as HTMLElement;
    if (this.isUiTarget(target) && !this.isMouseDown) {
      return; // Ігноруємо завершення, яке не стосується сцени
    }

    this.isMouseDown = false;

    // Делегуємо до активного хендлера
    const activeHandler = this.handlers.get(this.currentMode);
    if (activeHandler) {
      activeHandler.onMouseUp(event);
    }

    // Емітимо подію для інших підписників
    this.emit('mouseup', { event, mode: this.currentMode });
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();

    // Делегуємо до активного хендлера
    const activeHandler = this.handlers.get(this.currentMode);
    if (activeHandler) {
      activeHandler.onContextMenu(event);
    }

    // Логіка для правої кнопки миші
    this.emit('contextmenu', { event, mode: this.currentMode });
  };

  registerHandler(mode: InteractionMode, handler: InteractionHandler): void {
    this.handlers.set(mode, handler);
  }

  setMode(mode: InteractionMode): void {
    // Виходимо з попереднього режиму
    const previousHandler = this.handlers.get(this.currentMode);
    if (previousHandler) {
      previousHandler.onExit();
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;

    // Входимо в новий режим
    const newHandler = this.handlers.get(mode);
    if (newHandler) {
      newHandler.onEnter();
    }

    // Емітимо подію зміни режиму
    this.emit('modeChange', { from: previousMode, to: mode });
  }

  setSelectedCommand(command: any): void {
    // Встановлюємо команду для поточного хендлера
    const currentHandler = this.handlers.get(this.currentMode);
    if (currentHandler && 'setSelectedCommand' in currentHandler) {
      (currentHandler as any).setSelectedCommand(command);
    }
  }

  setSelectedBuilding(buildingData: any): void {
    // Встановлюємо будівлю для поточного хендлера
    const currentHandler = this.handlers.get(this.currentMode);
    if (currentHandler && 'setSelectedBuilding' in currentHandler) {
      (currentHandler as any).setSelectedBuilding(buildingData);
    }
  }


  getCurrentMode(): InteractionMode {
    return this.currentMode;
  }

  getMousePosition(): { x: number; y: number } {
    return { ...this.mousePosition };
  }

  isMousePressed(): boolean {
    return this.isMouseDown;
  }

  // Система подій для комунікації між компонентами
  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }


  // Методи для отримання стану будівництва (для UI)
  getBuildingState(): any {
    const buildingHandler = this.handlers.get('building') as any;
    return buildingHandler?.getBuildingState?.() || { 
      isInBuildingMode: false, 
      selectedBuilding: null 
    };
  }

  getSegmentedState(): any {
    const buildingHandler = this.handlers.get('building') as any;
    return buildingHandler?.getSegmentedState?.() || {
      isSegmentedMode: false,
      segmentedPath: [],
      canConfirm: false
    };
  }

  finishSegmentedBuilding(): void {
    const buildingHandler = this.handlers.get('building') as any;
    if (buildingHandler?.finishSegmentedBuilding) {
      buildingHandler.finishSegmentedBuilding();
    }
  }

  cancelSegmentedBuilding(): void {
    const buildingHandler = this.handlers.get('building') as any;
    if (buildingHandler?.cancelSegmentedBuilding) {
      buildingHandler.cancelSegmentedBuilding();
    }
  }

  dispose(): void {
    // Видаляємо всі обробники подій
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('contextmenu', this.handleContextMenu);

    // Очищаємо хендлери
    this.handlers.forEach(handler => handler.dispose());
    this.handlers.clear();
    this.eventListeners.clear();
  }
}
