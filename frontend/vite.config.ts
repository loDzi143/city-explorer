import { createReadStream, readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Connect, type Plugin } from "vite"

const workerPath = "/maplibre-gl-worker.mjs"

function maplibreWorker(): Plugin {
  const workerFile = resolve(import.meta.dirname, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs")
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== workerPath) {
      next()
      return
    }
    res.setHeader("Content-Type", "text/javascript")
    createReadStream(workerFile).pipe(res)
  }

  return {
    name: "maplibre-worker",
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "maplibre-gl-worker.mjs",
        source: readFileSync(workerFile),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorker()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
