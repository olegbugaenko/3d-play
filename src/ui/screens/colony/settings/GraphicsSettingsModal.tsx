import React, { useState } from 'react';
import { Modal } from '@ui/shared/Modal';
import type { GraphicsSettingsState, ParticleQuality, ShadowQuality } from '@systems/graphics';
import './GraphicsSettingsModal.css';

interface GraphicsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GraphicsSettingsState;
  onChange: (changes: Partial<GraphicsSettingsState>) => void;
}

const SHADOW_OPTIONS: Array<{ value: ShadowQuality; label: string; description: string }> = [
  {
    value: 'detailed',
    label: 'Детальні',
    description: 'Увімкнути динамічні тіні для будівель та біомаси.'
  },
  {
    value: 'pseudo',
    label: 'Псевдо-тіні',
    description: 'Спрощені випечені плями без навантаження на тіньову карту.'
  },
  {
    value: 'none',
    label: 'Відсутні',
    description: 'Повністю вимкнути тіні від об’єктів.'
  }
];

const PARTICLE_OPTIONS: Array<{ value: ParticleQuality; label: string; description: string }> = [
  {
    value: 'high',
    label: 'Висока якість',
    description: 'Максимальна кількість частинок, текстури 128×128.'
  },
  {
    value: 'low',
    label: 'Низька якість',
    description: 'Текстури 64×64, удвічі більші спрайти та зменшений спавн.'
  }
];

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange
}) => {
  const [activeTab, setActiveTab] = useState<'graphics'>('graphics');

  const handleShadowChange = (value: ShadowQuality) => {
    if (value !== settings.shadows) {
      onChange({ shadows: value });
    }
  };

  const handleParticleChange = (value: ParticleQuality) => {
    if (value !== settings.particles) {
      onChange({ particles: value });
    }
  };

  const handleDustToggle = (value: boolean) => {
    if (value !== settings.droneDustTrails) {
      onChange({ droneDustTrails: value });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Налаштування" size="medium">
      <div className="graphics-settings-modal">
        <div className="graphics-settings-tabs">
          <button
            type="button"
            className={`graphics-settings-tab${activeTab === 'graphics' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('graphics')}
          >
            Графіка
          </button>
        </div>

        {activeTab === 'graphics' && (
          <div className="graphics-settings-content">
            <section className="graphics-settings-section">
              <h3 className="graphics-settings-section-title">Тіні</h3>
              <div className="graphics-settings-options">
                {SHADOW_OPTIONS.map(option => (
                  <label key={option.value} className="graphics-settings-option">
                    <input
                      type="radio"
                      name="shadow-quality"
                      value={option.value}
                      checked={settings.shadows === option.value}
                      onChange={() => handleShadowChange(option.value)}
                    />
                    <div className="graphics-settings-option-body">
                      <span className="graphics-settings-option-label">{option.label}</span>
                      <span className="graphics-settings-option-description">{option.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section className="graphics-settings-section">
              <h3 className="graphics-settings-section-title">Частинки</h3>
              <div className="graphics-settings-options">
                {PARTICLE_OPTIONS.map(option => (
                  <label key={option.value} className="graphics-settings-option">
                    <input
                      type="radio"
                      name="particle-quality"
                      value={option.value}
                      checked={settings.particles === option.value}
                      onChange={() => handleParticleChange(option.value)}
                    />
                    <div className="graphics-settings-option-body">
                      <span className="graphics-settings-option-label">{option.label}</span>
                      <span className="graphics-settings-option-description">{option.description}</span>
                    </div>
                  </label>
                ))}
                <label className="graphics-settings-option">
                  <input
                    type="checkbox"
                    name="drone-dust-trails"
                    checked={settings.droneDustTrails}
                    onChange={(event) => handleDustToggle(event.target.checked)}
                  />
                  <div className="graphics-settings-option-body">
                    <span className="graphics-settings-option-label">Сліди пилюки дронів</span>
                    <span className="graphics-settings-option-description">
                      Увімкнути ефект пилу позаду дронів під час руху поза дорогами.
                    </span>
                  </div>
                </label>
              </div>
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
};
