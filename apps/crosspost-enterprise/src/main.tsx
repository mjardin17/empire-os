import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installEmpireFetch } from './lib/empireOs';

// Every request to the Empire OS server carries the Empire key (if one is saved).
installEmpireFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
