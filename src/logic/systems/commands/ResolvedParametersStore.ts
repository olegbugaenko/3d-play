import { CommandGroupContext } from './command-group.types';
import { ResolverSource } from './ParameterResolvers/IParameterResolver';

interface CacheEntry {
  value: any;
  source: ResolverSource;
}

export class ResolvedParametersStore {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly context: CommandGroupContext) {
    if (context.resolved) {
      for (const [key, value] of Object.entries(context.resolved)) {
        this.entries.set(key, { value, source: 'group-start' });
      }
    }
  }

  shouldResolve(paramId: string, source: ResolverSource): boolean {
    const entry = this.entries.get(paramId);
    if (!entry) {
      return true;
    }

    if (source === 'group-start') {
      return entry.source !== 'group-start';
    }

    return true;
  }

  get(paramId: string): any {
    return this.entries.get(paramId)?.value;
  }

  set(paramId: string, value: any, source: ResolverSource): void {
    const existing = this.entries.get(paramId);
    if (existing && existing.value === value && existing.source === source) {
      return;
    }

    this.entries.set(paramId, { value, source });
    this.flush();
  }

  merge(values: Record<string, any>, source: ResolverSource): void {
    let changed = false;

    for (const [key, value] of Object.entries(values)) {
      const existing = this.entries.get(key);
      if (!existing || existing.value !== value || existing.source !== source) {
        this.entries.set(key, { value, source });
        changed = true;
      }
    }

    if (changed) {
      this.flush();
    }
  }

  snapshot(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, entry] of this.entries.entries()) {
      result[key] = entry.value;
    }
    return result;
  }

  private flush(): void {
    this.context.resolved = this.snapshot();
  }
}
