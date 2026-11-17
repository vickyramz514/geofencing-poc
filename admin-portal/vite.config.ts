import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __ADMIN_API_BASE_URL__: JSON.stringify(env.ADMIN_API_BASE_URL || 'http://localhost:3000/api'),
      __ADMIN_API_TOKEN__: JSON.stringify(env.ADMIN_API_TOKEN || ''),
    },
  };
});
