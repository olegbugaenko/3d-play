import { useEffect, useState } from 'react';
import type { GraphicsSettingsManager, GraphicsSettingsState } from '@systems/graphics';
import { GraphicsSettingsModal } from './GraphicsSettingsModal';

export const useGraphicsSettingsMenuButton = (graphicsSettings: GraphicsSettingsManager) => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<GraphicsSettingsState>(graphicsSettings.getState());

  useEffect(() => graphicsSettings.subscribe(setSettings), [graphicsSettings]);

  const handleChange = (changes: Partial<GraphicsSettingsState>) => {
    graphicsSettings.update(changes);
  };

  return {
    button: {
      id: 'graphics-settings',
      iconId: 'interface/settings.svg',
      variant: 'primary' as const,
      onClick: () => setIsOpen(true),
      title: 'Налаштування графіки',
      visible: true
    },
    modal: (
      <GraphicsSettingsModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        settings={settings}
        onChange={handleChange}
      />
    )
  };
};
