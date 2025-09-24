import type { SaveLoadManager } from '@save-load/save-load.types';

export type ShadowQuality = 'detailed' | 'none';
export type ParticleQuality = 'high' | 'low';
export type AntialiasingMode = 'msaa' | 'off';

export interface GraphicsSettingsState {
  shadows: ShadowQuality;
  particles: ParticleQuality;
  droneDustTrails: boolean;
  antialiasing: AntialiasingMode;
}

const DEFAULT_SETTINGS: GraphicsSettingsState = {
  shadows: 'none',
  particles: 'high',
  droneDustTrails: true,
  antialiasing: 'msaa',
};

type Listener = (state: GraphicsSettingsState) => void;

export class GraphicsSettingsManager implements SaveLoadManager {
  private state: GraphicsSettingsState = { ...DEFAULT_SETTINGS };
  private listeners = new Set<Listener>();

  public getState(): GraphicsSettingsState {
    return this.state;
  }

  public setShadowQuality(shadows: ShadowQuality): void {
    if (this.state.shadows === shadows) return;
    this.state = { ...this.state, shadows };
    this.emit();
  }

  public setParticleQuality(particles: ParticleQuality): void {
    if (this.state.particles === particles) return;
    this.state = { ...this.state, particles };
    this.emit();
  }

  public setAntialiasing(mode: AntialiasingMode): void {
    if (this.state.antialiasing === mode) return;
    this.state = { ...this.state, antialiasing: mode };
    this.emit();
  }

  public update(partial: Partial<GraphicsSettingsState>): void {
    const next: GraphicsSettingsState = { ...this.state, ...partial };
    if (
      next.shadows === this.state.shadows &&
      next.particles === this.state.particles &&
      next.droneDustTrails === this.state.droneDustTrails &&
      next.antialiasing === this.state.antialiasing
    ) {
      return;
    }
    this.state = next;
    this.emit();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public save(): GraphicsSettingsState {
    return { ...this.state };
  }

  public load(data: any): void {
    if (!data || typeof data !== 'object') {
      this.state = { ...DEFAULT_SETTINGS };
      this.emit();
      return;
    }

    const next: GraphicsSettingsState = {
      shadows: this.parseShadowQuality((data as GraphicsSettingsState).shadows),
      particles: this.parseParticleQuality((data as GraphicsSettingsState).particles),
      droneDustTrails: this.parseDroneDustTrails((data as GraphicsSettingsState).droneDustTrails),
      antialiasing: this.parseAntialiasing((data as GraphicsSettingsState).antialiasing),
    };

    this.state = next;
    this.emit();
  }

  public reset(): void {
    this.state = { ...DEFAULT_SETTINGS };
    this.emit();
  }

  private parseShadowQuality(value: unknown): ShadowQuality {
    if (value === 'detailed' || value === 'none') {
      return value;
    }
    return DEFAULT_SETTINGS.shadows;
  }

  private parseParticleQuality(value: unknown): ParticleQuality {
    if (value === 'high' || value === 'low') {
      return value;
    }
    return DEFAULT_SETTINGS.particles;
  }

  public setDroneDustTrails(enabled: boolean): void {
    if (this.state.droneDustTrails === enabled) return;
    this.state = { ...this.state, droneDustTrails: enabled };
    this.emit();
  }

  private parseDroneDustTrails(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    return DEFAULT_SETTINGS.droneDustTrails;
  }

  private parseAntialiasing(value: unknown): AntialiasingMode {
    if (value === 'msaa' || value === 'off') {
      return value;
    }
    return DEFAULT_SETTINGS.antialiasing;
  }
}
