import React from 'react';
import { CameraController } from '@ui/screens/colony/scene/CameraController';
import { IMapLogic } from '@interfaces/index';

interface DebugPanelProps {
  fps: number;
  debugInfo: {
    visibleObjectsCount: number;
    totalObjectsCount: number;
    viewportData: { centerX: number; centerY: number; width: number; height: number };
    gridInfo: { totalCells: number; visibleCells: number };
    currentDistance: number;
    buildingModelsLoaded: number;
    buildingModelsTotal: number;
  };
  controller: CameraController;
  mapLogicRef: React.MutableRefObject<IMapLogic | null>;
  selectedCommand: any;
  interactionManager: any;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  fps,
  debugInfo,
  controller,
  mapLogicRef,
  selectedCommand,
  interactionManager
}) => {
  return (
    <div style={{
      position: 'absolute', 
      top: 10, 
      left: 10, 
      color: 'white', 
      fontFamily: 'monospace',
      fontSize: 14, 
      backgroundColor: 'rgba(0,0,0,0.7)', 
      padding: 8, 
      borderRadius: 4, 
      zIndex: 1000
    }}>
      <div>FPS: {fps}</div>
      <div>Visible Objects: {debugInfo.visibleObjectsCount}</div>
      <div>Total Objects: {debugInfo.totalObjectsCount}</div>
      <div>Camera Distance: {debugInfo.currentDistance}</div>
      <div>Viewport Center: ({debugInfo.viewportData.centerX}, {debugInfo.viewportData.centerY})</div>
      <div>Viewport Size: {debugInfo.viewportData.width} × {debugInfo.viewportData.height}</div>
      <div>Grid Cells: {debugInfo.gridInfo.totalCells} total, {debugInfo.gridInfo.visibleCells} visible</div>
      <div>Viewport Bounds: X[{Math.round((debugInfo.viewportData.centerX - debugInfo.viewportData.width/2) * 100) / 100}, {Math.round((debugInfo.viewportData.centerX + debugInfo.viewportData.width/2) * 100) / 100}]</div>
      <div>Viewport Bounds: Z[{Math.round((debugInfo.viewportData.centerY - debugInfo.viewportData.height/2) * 100) / 100}, {Math.round((debugInfo.viewportData.centerY + debugInfo.viewportData.height/2) * 100) / 100}]</div>
      <div>Terrain: Active (Height: 0 to 20)</div>
      <div>Focus Point: ({Math.round(controller.getTarget().x * 100) / 100}, {Math.round(controller.getTarget().y * 100) / 100}, {Math.round(controller.getTarget().z * 100) / 100})</div>
      <div>Selected Objects: {mapLogicRef.current?.selection.getSelectedCount() || 0}</div>
      <div>Selected Command: {selectedCommand ? (selectedCommand.ui?.name || selectedCommand.name) : 'None'}</div>
      <div>Interaction Mode: {interactionManager?.getCurrentMode() || 'None'}</div>
      <div>Building Mode: {interactionManager?.getBuildingState()?.isInBuildingMode ? 'Active' : 'Inactive'}</div>
      <div>Selected Building: {interactionManager?.getBuildingState()?.selectedBuilding?.name || 'None'}</div>
      <div>Building Models: {debugInfo.buildingModelsLoaded}/{debugInfo.buildingModelsTotal}</div>
    </div>
  );
};
