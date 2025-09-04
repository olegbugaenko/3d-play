import React, { createContext, useContext, ReactNode } from 'react';
import { InteractionManager } from '../interaction/InteractionManager';

const InteractionContext = createContext<InteractionManager | null>(null);

interface InteractionProviderProps {
  children: ReactNode;
  value: InteractionManager | null;
}

export const InteractionProvider: React.FC<InteractionProviderProps> = ({ children, value }) => {
  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
};

export const useInteractionContext = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteractionContext must be used within an InteractionProvider');
  }
  return context;
};
