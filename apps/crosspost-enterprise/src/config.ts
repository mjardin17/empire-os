/// <reference types="vite/client" />

// Base URL of the Empire OS engine server (apps/empire-os-server).
// Defaults to the local dev server. Set VITE_EMPIRE_OS_URL to point the UI
// at a hosted engine server, e.g. when this app runs in Google AI Studio.
export const EMPIRE_OS_URL: string =
  import.meta.env.VITE_EMPIRE_OS_URL || 'http://localhost:3001';
