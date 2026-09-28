import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv } from 'vite'
import analyzer from 'vite-bundle-analyzer'
// import viteBasicSslPlugin from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react({}),
      tailwindcss(),
      ...(env.VITE_ANALYZE_BUNDLE || mode === 'analyze' ? [analyzer()] : []),
      // viteBasicSslPlugin()
    ],
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './app'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
  }
})
