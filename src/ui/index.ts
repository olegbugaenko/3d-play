// Main UI exports - use @ui alias for imports
export * from './shared';

// Screen exports
export * from './screens/menu';
export * from './screens/colony';

// Re-export commonly used components for convenience
export { Modal } from './shared/Modal';
export { Button } from './shared/Button';
export { MainMenu } from './screens/menu';
export { 
  ResourcesBar, 
  CommandPanel, 
  Scene3D, 
  CameraController, 
  AreaSelectionRenderer,
  UpgradesPanel, 
  UpgradesModal 
} from './screens/colony';
