import { CommandResult } from '../../command.types';
import { CommandExecutor } from '../../CommandExecutor';

export class BuildRoadExecutor extends CommandExecutor {
  private lastTime = 0;

  canExecute(): boolean {
    return !!this.context?.mapLogic?.buildingsManager;
  }

  completeCheck(): boolean {
    const bm: any = this.context.mapLogic?.buildingsManager;
    const roadId = this.command.parameters?.roadId as string;
    const segmentIndex = this.command.parameters?.segmentIndex as number;
    
    if (!bm || !roadId || segmentIndex === undefined) return true;

    const road = bm.getRoadInfo(roadId);
    if (!road || !road.segments || segmentIndex >= road.segments.length) return true;

    // Перевіряємо чи конкретний сегмент завершений
    const segment = road.segments[segmentIndex];
    return segment.buildingState === 'completed';
  }

  getEnergyUpkeep(): number {
    const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.buildSpeed) {
            return 0.2; // Мінімальне споживання енергії для будівництва
        }
        
        return object.data.buildSpeed * 0.15;
  }

  execute(): CommandResult {
    const bm: any = this.context.mapLogic?.buildingsManager;
    const roadId = this.command.parameters?.roadId as string;
    const segmentIndex = this.command.parameters?.segmentIndex as number;
    
    if (!bm || !roadId || segmentIndex === undefined) {
      return { success: false, message: 'No BuildingsManager, roadId or segmentIndex' };
    }

    const road = bm.getRoadInfo(roadId);
    if (!road || !road.segments || segmentIndex >= road.segments.length) {
      return { success: false, message: 'Road not found or invalid segmentIndex' };
    }

    const seg = road.segments[segmentIndex];
    if (seg.buildingState === 'completed') {
      return { success: true, message: 'Segment already complete' };
    }

    const now = performance.now();
    if (this.lastTime === 0) {
      this.lastTime = now;
      return { success: true, message: 'Start building road segment' };
    }
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const buildSpeed = (this.context.scene.getObjectById(this.context.objectId)?.data?.buildSpeed ?? 0.5) as number;
    const effort = seg.constructionEffort ?? (seg.length && seg.length > 0 ? seg.length : 1);
    const normalizedEffort = effort > 0 ? effort : 1;
    const oldProgress = seg.constructionProgress || 0;
    const newProgress = Math.min(1.0, oldProgress + (buildSpeed * dt) / normalizedEffort);
    
    seg.constructionProgress = newProgress;
    
    // Встановлюємо стан будівництва
    if (newProgress < 1.0) {
      if(seg.buildingState !== 'under_construction') {
        seg.buildingState = 'under_construction';
        // Інвалідуємо кеш для оновлення візуалізації
        const obj = this.context.scene.getObjectById(roadId);
        if (obj) {
            obj.data.segmentStates = road.segments;
            this.context.scene.markObjectDirty(roadId);
        }
      }
      
    }

    // when completed, finalize segment through BuildingsManager
    if (newProgress >= 1.0 && seg.buildingState !== 'completed') {
      console.log(`[BuildRoadExecutor] Calling finishSegment for road ${roadId}, segment ${segmentIndex}`);
      bm.finishSegment(roadId, segmentIndex);
    }

    return { success: true, message: 'Building road segment...', data: { progress: seg.constructionProgress, buildingState: seg.buildingState, seg } };
  }
}


