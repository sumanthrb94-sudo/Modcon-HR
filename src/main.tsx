import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import './index.css';
import './lib/firebase';
import { installGlobalErrorReporting } from './lib/observability';

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Every motion primitive honours the OS "reduce motion" setting from
        here; src/index.css guards the Tailwind keyframes the same way. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
