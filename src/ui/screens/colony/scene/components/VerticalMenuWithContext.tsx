import React from 'react';
import { VerticalMenu } from '@ui/shared';
import { useUpgradesMenuButton } from '@ui/screens/colony/upgrades/UpgradesPanel';
import { useBuildingsMenuButton } from '@ui/screens/colony/buildings/BuildingsPanel';

interface VerticalMenuWithContextProps {
  game: any;
  onShowMainMenu: () => void;
}

export const VerticalMenuWithContext: React.FC<VerticalMenuWithContextProps> = ({ game, onShowMainMenu }) => {
  const upgradesMenu = useUpgradesMenuButton(game);
  const buildingsMenu = useBuildingsMenuButton(game, (typeId: string) => {
    console.log(`Selected building for construction: ${typeId}`);
  });

  return (
    <>
      <VerticalMenu
        buttons={[
          {
            id: 'main-menu',
            iconId: 'interface/main_menu.png',
            variant: 'primary',
            onClick: onShowMainMenu,
            title: 'Головне меню'
          },
          {
            id: 'save-game',
            iconId: 'interface/save.png',
            variant: 'primary',
            onClick: () => game.saveToCurrentSlot(),
            title: 'Зберегти гру'
          },
          upgradesMenu.button,
          buildingsMenu.button
        ]}
      />

      {/* Modals */}
      {upgradesMenu.modal}
      {buildingsMenu.modal}
    </>
  );
};
