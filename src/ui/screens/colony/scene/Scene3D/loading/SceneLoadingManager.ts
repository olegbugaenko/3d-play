import * as React from 'react';
import * as THREE from 'three';

export interface SceneLoadingSnapshot {
  itemsLoaded: number;
  itemsTotal: number;
  manualCompleted: number;
  manualTotal: number;
  errors: string[];
  lastUrl?: string;
}

type Listener = (snapshot: SceneLoadingSnapshot) => void;

export class SceneLoadingManager {
  private readonly loadingManager: THREE.LoadingManager;
  private snapshot: SceneLoadingSnapshot = {
    itemsLoaded: 0,
    itemsTotal: 0,
    manualCompleted: 0,
    manualTotal: 0,
    errors: [],
    lastUrl: undefined,
  };

  private readonly listeners = new Set<Listener>();

  constructor() {
    this.loadingManager = new THREE.LoadingManager();

    this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
      this.updateProgress(url, itemsLoaded, itemsTotal);
    };

    this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.updateProgress(url, itemsLoaded, itemsTotal);
    };

    this.loadingManager.onLoad = () => {
      this.updateProgress(undefined, this.snapshot.itemsTotal, this.snapshot.itemsTotal);
    };

    this.loadingManager.onError = (url) => {
      this.snapshot = {
        ...this.snapshot,
        errors: url ? [...this.snapshot.errors, url] : this.snapshot.errors,
        lastUrl: url ?? this.snapshot.lastUrl,
        itemsLoaded: Math.min(this.snapshot.itemsTotal, this.snapshot.itemsLoaded + 1),
      };
      this.emit();
    };
  }

  public getLoadingManager(): THREE.LoadingManager {
    return this.loadingManager;
  }

  public getSnapshot(): SceneLoadingSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public trackPromise<T>(promise: Promise<T>): Promise<T> {
    this.snapshot = {
      ...this.snapshot,
      manualTotal: this.snapshot.manualTotal + 1,
    };
    this.emit();

    return promise.finally(() => {
      this.snapshot = {
        ...this.snapshot,
        manualCompleted: Math.min(
          this.snapshot.manualTotal,
          this.snapshot.manualCompleted + 1,
        ),
      };
      this.emit();
    });
  }

  public getProgress(): number {
    const total = this.snapshot.itemsTotal + this.snapshot.manualTotal;
    if (total === 0) {
      return 1;
    }
    const loaded = this.snapshot.itemsLoaded + this.snapshot.manualCompleted;
    return Math.min(1, loaded / total);
  }

  public isDone(): boolean {
    return (
      this.snapshot.itemsLoaded >= this.snapshot.itemsTotal &&
      this.snapshot.manualCompleted >= this.snapshot.manualTotal
    );
  }

  private updateProgress(url: string | undefined, itemsLoaded: number, itemsTotal: number): void {
    this.snapshot = {
      ...this.snapshot,
      itemsLoaded,
      itemsTotal,
      lastUrl: url ?? this.snapshot.lastUrl,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

export function useSceneLoadingSnapshot(manager: SceneLoadingManager) {
  const [snapshot, setSnapshot] = React.useState<SceneLoadingSnapshot>(manager.getSnapshot());

  React.useEffect(() => manager.subscribe(setSnapshot), [manager]);

  return snapshot;
}
