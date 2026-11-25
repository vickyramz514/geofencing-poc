import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, isPreview, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = new URL(env.ADMIN_API_BASE_URL || 'http://localhost:3000/api');
  const apiBasePath = apiBaseUrl.pathname.replace(/\/+$/, '');
  const useDevProxy = command === 'serve' && !isPreview;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '^/api(?:/|$)': {
          target: apiBaseUrl.origin,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api(?=\/|$)/, apiBasePath),
        },
      },
    },
    define: {
      __ADMIN_API_BASE_URL__: JSON.stringify(useDevProxy ? '/api' : apiBaseUrl.href),
      __ADMIN_API_TOKEN__: JSON.stringify(env.ADMIN_API_TOKEN || ''),
    },
  };
});
