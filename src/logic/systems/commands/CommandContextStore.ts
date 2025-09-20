import { CommandGroupContext, ResolveParametersPipeline } from './command-group.types';
import { ParameterResolutionService } from './ParameterResolutionService';
import { ResolvedParametersStore } from './ResolvedParametersStore';

interface ContextRecord {
  context: CommandGroupContext;
  pipeline?: ResolveParametersPipeline[];
  resolvedCache: Record<string, any>;
}

export class CommandContextStore {
  private readonly records: Map<string, ContextRecord> = new Map();
  private readonly resolutionService: ParameterResolutionService;

  constructor(resolutionService: ParameterResolutionService) {
    this.resolutionService = resolutionService;
  }

  register(instanceId: string, context: CommandGroupContext, pipeline?: ResolveParametersPipeline[]): void {
    const record: ContextRecord = {
      context,
      pipeline,
      resolvedCache: context.resolved ? { ...context.resolved } : {}
    };
    this.records.set(instanceId, record);

    if (pipeline) {
      const resolved = this.resolutionService.resolveParameters(pipeline, context, 'group-start');
      this.updateResolvedCache(record, resolved, 'group-start');
    }
  }

  unregister(instanceId: string): void {
    this.records.delete(instanceId);
  }

  getContext(instanceId: string): CommandGroupContext | undefined {
    return this.records.get(instanceId)?.context;
  }

  resolveForTiming(instanceId: string, timing: 'before-command' | 'group-start'): Record<string, any> {
    const record = this.records.get(instanceId);
    if (!record || !record.pipeline) {
      return record?.context.resolved ?? {};
    }

    const resolved = this.resolutionService.resolveParameters(record.pipeline, record.context, timing);
    this.updateResolvedCache(record, resolved, timing);
    return record.context.resolved ?? {};
  }

  getResolvedValue<T = any>(instanceId: string, path: string): T | undefined {
    const record = this.records.get(instanceId);
    if (!record) {
      return undefined;
    }
    const source = record.context.resolved ?? record.resolvedCache;
    if (!source) {
      return undefined;
    }
    const segments = path.split('.');
    let current: any = source;
    for (const segment of segments) {
      if (current == null) {
        return undefined;
      }
      current = current[segment];
    }
    return current as T;
  }

  reset(instanceId: string, context: CommandGroupContext): void {
    const record = this.records.get(instanceId);
    if (!record) {
      return;
    }
    record.context = context;
    record.resolvedCache = context.resolved ? { ...context.resolved } : {};
    if (!record.pipeline) {
      return;
    }

    const resolved = this.resolutionService.resolveParameters(record.pipeline, record.context, 'group-start');
    this.updateResolvedCache(record, resolved, 'group-start');
  }

  private updateResolvedCache(
    record: ContextRecord,
    resolved: Record<string, any>,
    source: 'group-start' | 'before-command'
  ): void {
    if (Object.keys(resolved).length > 0) {
      const store = new ResolvedParametersStore(record.context);
      store.merge(resolved, source);
      record.resolvedCache = store.snapshot();
      return;
    }

    if (record.context.resolved) {
      record.resolvedCache = { ...record.context.resolved };
    }
  }
}
