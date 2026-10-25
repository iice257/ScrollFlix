import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { type Plugin, defineConfig, loadEnv } from 'vite'
import analyzer from 'vite-bundle-analyzer'
// import viteBasicSslPlugin from "@vitejs/plugin-basic-ssl";

// Writes dist/version.json so the deployment smoke checks (and anyone with
// curl) can tell exactly which commit a URL is serving. Vercel sets the
// VERCEL_* variables; GitHub Actions and local builds fall back gracefully.
function versionFile(): Plugin {
  return {
    name: 'scrollflix-version-file',
    apply: 'build',
    generateBundle() {
      const sha =
        process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local'
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(
          {
            sha,
            ref: process.env.VERCEL_GIT_COMMIT_REF || null,
            env: process.env.VERCEL_ENV || null,
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        )}
`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react({}),
      tailwindcss(),
      versionFile(),
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
