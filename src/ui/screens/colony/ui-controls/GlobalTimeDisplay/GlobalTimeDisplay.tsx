import { useEffect, useState } from 'react';
import type { EnvironmentState } from '@systems/environment/environment.types';
import { EnvironmentLogic } from '@systems/environment/EnvironmentLogic';
import './GlobalTimeDisplay.css';

interface GlobalTimeDisplayProps {
  environment?: EnvironmentLogic;
}

const formatTemperature = (value: number): string => {
  const rounded = Math.round(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}°C`;
};

const formatWind = (value: number): string => {
  return `${Math.round(value)} м/с`;
};

export const GlobalTimeDisplay: React.FC<GlobalTimeDisplayProps> = ({ environment }) => {
  const [state, setState] = useState<EnvironmentState | null>(() =>
    environment ? environment.getEnvironmentState() : null,
  );

  useEffect(() => {
    if (!environment) {
      setState(null);
      return;
    }

    const update = () => {
      setState(environment.getEnvironmentState());
    };

    update();
    const intervalId = window.setInterval(update, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [environment]);

  if (!environment || !state) {
    return null;
  }

  return (
    <div className="box global-time">
      <div className="global-time__time">
        День {state.day} • {state.time.formatted}
      </div>
      <div className="global-time__weather">
        <span>Температура: {formatTemperature(state.temperature)}</span>
        <span>Вітер: {formatWind(state.windSpeed)}</span>
      </div>
    </div>
  );
};
