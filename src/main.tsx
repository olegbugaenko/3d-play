import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Game } from '@core/game/game';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element with id "root" not found');
}

const root = ReactDOM.createRoot(container);

const render = () => {
  root.render(<App />);
};

render();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    root.unmount();
    Game.destroyInstance();
  });
}
