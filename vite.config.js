import { defineConfig } from 'vite'

// The local BTCS L2 RPC (btcs-l2/execution/evm/src/rpc.ts) does not send CORS
// headers, so the browser cannot call 127.0.0.1:8545 from the Vite origin
// directly. The dev server forwards /rpc to the node. A static deployment
// needs the same reverse proxy; see README.md and docs/LOCAL-NETWORK.md.
const L2_RPC_TARGET = process.env.BTCS_L2_RPC_URL || 'http://127.0.0.1:8545'

const proxy = {
  '/rpc': {
    target: L2_RPC_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/rpc/, ''),
  },
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
