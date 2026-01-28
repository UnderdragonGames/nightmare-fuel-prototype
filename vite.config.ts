import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'state-lab-test-writer',
      configureServer(server: ViteDevServer) {
        server.middlewares.use('/__lab/create-test', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          let payload: { filename?: string; contents?: string } = {}
          try {
            const chunks: Uint8Array[] = []
            for await (const chunk of req) chunks.push(chunk as Uint8Array)
            const bodyText = Buffer.concat(chunks).toString('utf-8')
            payload = JSON.parse(bodyText || '{}') as { filename?: string; contents?: string }
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
            return
          }

          const filename = payload.filename ?? ''
          if (!filename || filename.includes('/') || filename.includes('\\') || !filename.endsWith('.test.ts')) {
            res.statusCode = 400
            res.end('Invalid filename')
            return
          }

          const contents = payload.contents ?? ''
          const testsDir = resolve(server.config.root, 'src', 'tests')
          try {
            await mkdir(testsDir, { recursive: true })
            await writeFile(resolve(testsDir, filename), contents, 'utf-8')
            res.statusCode = 200
            res.end('ok')
          } catch {
            res.statusCode = 500
            res.end('Failed to write test file')
          }
        })
      },
    },
  ],
})
