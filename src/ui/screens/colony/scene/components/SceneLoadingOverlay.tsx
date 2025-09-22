import React from 'react';
import './SceneLoadingOverlay.css';

interface SceneLoadingOverlayProps {
  progress: number;
  message?: string;
  errors?: string[];
}

export const SceneLoadingOverlay: React.FC<SceneLoadingOverlayProps> = ({
  progress,
  message,
  errors,
}) => {
  const percentage = Math.round(progress * 100);
  const hasErrors = errors && errors.length > 0;

  return (
    <div className="scene-loading-overlay">
      <div className="scene-loading-card">
        <div className="scene-loading-spinner" />
        <div className="scene-loading-title">Завантаження сцени</div>
        <div className="scene-loading-progress-bar">
          <div
            className="scene-loading-progress-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="scene-loading-progress-label">
          {percentage}%
        </div>
        {message && (
          <div className="scene-loading-message">{message}</div>
        )}
        {hasErrors && (
          <div className="scene-loading-errors">
            {errors?.map((err, idx) => (
              <div key={`${err}-${idx}`}>{err}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
