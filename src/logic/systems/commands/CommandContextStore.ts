import { CommandGroupContext, ResolveParametersPipeline } from './command-group.types';
import { ParameterResolutionService } from './ParameterResolutionService';

interface ContextRecord {
  context: CommandGroupContext;
  pipeline?: ResolveParametersPipeline[];
  resolvedCache: Record<string, any>;
}

function mergeResolved(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  return { ...target, ...source };
}

export class CommandContextStore {
  private readonly records: Map<string, ContextRecord> = new Map();
  private readonly resolutionService: ParameterResolutionService;

  constructor(resolutionService: ParameterResolutionService) {
    this.resolutionService = resolutionService;
  }

  register(instanceId: string, context: CommandGroupContext, pipeline?: ResolveParametersPipeline[]): void {
    const clonedContext = context;
    const record: ContextRecord = {
      context: clonedContext,
      pipeline,
      resolvedCache: context.resolved ? { ...context.resolved } : {}
    };
    this.records.set(instanceId, record);

    if (pipeline) {
      const resolved = this.resolutionService.resolveParameters(pipeline, context, 'group-start');
      record.resolvedCache = mergeResolved(record.resolvedCache, resolved);
      if (!record.context.resolved) {
        record.context.resolved = {};
      }
      record.context.resolved = mergeResolved(record.context.resolved, resolved);
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
    record.resolvedCache = mergeResolved(record.resolvedCache, resolved);
    if (!record.context.resolved) {
      record.context.resolved = {};
    }
    record.context.resolved = mergeResolved(record.context.resolved, resolved);
    return record.context.resolved;
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
    record.resolvedCache = mergeResolved(record.resolvedCache, resolved);
    if (!record.context.resolved) {
      record.context.resolved = {};
    }
    record.context.resolved = mergeResolved(record.context.resolved, resolved);
  }
}
