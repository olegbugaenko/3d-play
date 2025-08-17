import * as THREE from 'three';

export class SelectionManager {
    private selectedObjects: Set<string> = new Set();
    private selectionMeshes: Map<string, THREE.Mesh> = new Map();
    private targetIndicators: Map<string, THREE.Mesh> = new Map();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Selects an object (adds to selection)
     */
    selectObject(objectId: string, objectMesh: THREE.Mesh): void {
        if (this.selectedObjects.has(objectId)) {
            return; // Object already selected
        }

        this.selectedObjects.add(objectId);
        this.addSelectionHighlight(objectId, objectMesh);
        console.log(`Object ${objectId} selected`);
    }

    /**
     * Deselects an object
     */
    deselectObject(objectId: string): void {
        if (!this.selectedObjects.has(objectId)) {
            return; // Object not selected
        }

        this.selectedObjects.delete(objectId);
        this.removeSelectionHighlight(objectId);
        console.log(`Deselected object ${objectId}`);
    }

    /**
     * Deselects all objects
     */
    deselectAll(): void {
        const objectIds = Array.from(this.selectedObjects);
        objectIds.forEach(id => this.deselectObject(id));
        console.log('Deselected all objects');
    }

    /**
     * Checks if object is selected
     */
    isSelected(objectId: string): boolean {
        return this.selectedObjects.has(objectId);
    }

    /**
     * Gets all selected objects
     */
    getSelectedObjects(): string[] {
        return Array.from(this.selectedObjects);
    }

    /**
     * Adds selection highlight for selected object
     */
    private addSelectionHighlight(objectId: string, objectMesh: THREE.Mesh): void {
        // Create highlight - transparent cube around object
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Green color for highlight
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });

        const highlightMesh = new THREE.Mesh(geometry, material);
        
        // Copy position and scale from original mesh
        highlightMesh.position.copy(objectMesh.position);
        highlightMesh.scale.copy(objectMesh.scale);
        highlightMesh.rotation.copy(objectMesh.rotation);
        
        // Add to scene
        this.scene.add(highlightMesh);
        this.selectionMeshes.set(objectId, highlightMesh);
    }

    /**
     * Removes highlight from object
     */
    private removeSelectionHighlight(objectId: string): void {
        const highlightMesh = this.selectionMeshes.get(objectId);
        if (highlightMesh) {
            this.scene.remove(highlightMesh);
            this.selectionMeshes.delete(objectId);
        }
    }

    /**
     * Updates highlight position (called when object moves)
     */
    updateHighlightPosition(objectId: string, objectMesh: THREE.Mesh): void {
        const highlightMesh = this.selectionMeshes.get(objectId);
        if (highlightMesh) {
            highlightMesh.position.copy(objectMesh.position);
            highlightMesh.scale.copy(objectMesh.scale);
            highlightMesh.rotation.copy(objectMesh.rotation);
        }
    }

    /**
     * Sets target indicator for an object
     */
    setTargetIndicator(objectId: string, targetX: number, targetZ: number): void {
        // Remove existing target indicator
        this.removeTargetIndicator(objectId);
        
        // Create target indicator - small green sphere
        const geometry = new THREE.SphereGeometry(0.3, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });
        
        const targetIndicator = new THREE.Mesh(geometry, material);
        targetIndicator.position.set(targetX, 0.1, targetZ); // Slightly above ground
        
        this.scene.add(targetIndicator);
        this.targetIndicators.set(objectId, targetIndicator);
        
        console.log(`Target indicator set for ${objectId} at (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);
    }
    
    /**
     * Removes target indicator for an object
     */
    removeTargetIndicator(objectId: string): void {
        const indicator = this.targetIndicators.get(objectId);
        if (indicator) {
            this.scene.remove(indicator);
            this.targetIndicators.delete(objectId);
        }
    }
    
    /**
     * Cleans up all resources
     */
    dispose(): void {
        this.deselectAll();
        this.selectionMeshes.clear();
        this.selectedObjects.clear();
        
        // Clean up target indicators
        this.targetIndicators.forEach(indicator => {
            this.scene.remove(indicator);
        });
        this.targetIndicators.clear();
    }
}
