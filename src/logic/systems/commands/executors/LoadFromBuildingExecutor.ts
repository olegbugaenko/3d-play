import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';

export class LoadFromBuildingExecutor extends CommandExecutor {
  canExecute(): boolean {
    const drone = this.context.scene.getObjectById(this.context.objectId);
    const targetId = this.command.targetId;
    const resourceId = this.command.parameters?.resourceId;
    if (!drone || !targetId || !resourceId) return false;
    return true;
  }

  execute(): CommandResult {
    const drone = this.context.scene.getObjectById(this.context.objectId);
    const building = this.context.scene.getObjectById(this.command.targetId!);
    const resourceId: string = this.command.parameters?.resourceId;
    const amount: number = Math.max(0, this.command.parameters?.amount || 0);
    if (!drone || !building || !resourceId || amount <= 0) {
      return { success: false, message: 'Invalid parameters' };
    }

    // init drone storage
    if (!drone.data.storage) drone.data.storage = {};

    const inst = this.context.mapLogic?.buildingsManager?.getBuildingInstance?.(building.id);
    const store = inst?.internalStorage?.[resourceId];
    if (!store) return { success: false, message: 'No internal storage for resource' };

    const take = Math.min(amount, store.current);
    if (take <= 0) return { success: false, message: 'Nothing to take' };

    store.current = Math.max(0, store.current - take);
    drone.data.storage[resourceId] = (drone.data.storage[resourceId] || 0) + take;

    // mark dirty for HUD refresh
    this.context.scene.markObjectDirty?.(building.id);

    return { success: true, message: `Loaded ${take} ${resourceId} from ${building.id}` };
  }
}


