/**
 * Build the Node.js sidecar server for bundling into Blitz.app.
 *
 * By default this builds from ../blitz-cn/server (the known-working server
 * implementation). Once a dedicated blitz-macos server is ready, set:
 *   SERVER_SRC_DIR=/path/to/server node scripts/build-server.mjs
 *
 * Output: dist/server/ (with pre-installed node_modules, ready to bundle)
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const distServerDir = join(rootDir, 'dist', 'server')

// Server source: configurable via SERVER_SRC_DIR env var.
// Defaults to blitz-cn which has the proven server implementation.
const serverSrcDir = process.env.SERVER_SRC_DIR ?? join(rootDir, '..', 'blitz-cn')

if (!existsSync(serverSrcDir)) {
  console.error(`ERROR: Server source not found at ${serverSrcDir}`)
  console.error('Set SERVER_SRC_DIR env var to the path of the server source.')
  process.exit(1)
}

console.log(`Building server from: ${serverSrcDir}`)

// Check if blitz-cn node_modules exist (needed for its build scripts)
const srcNodeModules = join(serverSrcDir, 'node_modules')
if (!existsSync(srcNodeModules)) {
  console.log('Installing blitz-cn dependencies...')
  execSync('npm install', { cwd: serverSrcDir, stdio: 'inherit' })
}

// Run blitz-cn's server build, which produces dist/server/ with:
//   - bundled server JS (index.js)
//   - pre-installed node_modules
//   - project template
//   - ax-scan source
//   - companion UI assets
console.log('Building server bundle...')
execSync('node scripts/build-server.mjs', { cwd: serverSrcDir, stdio: 'inherit' })

const srcDistServer = join(serverSrcDir, 'dist', 'server')
if (!existsSync(srcDistServer)) {
  console.error(`ERROR: Expected ${srcDistServer} after build. Check blitz-cn build output.`)
  process.exit(1)
}

// Clean and copy to blitz-macos dist/server
if (existsSync(distServerDir)) {
  rmSync(distServerDir, { recursive: true })
}
mkdirSync(join(rootDir, 'dist'), { recursive: true })

console.log(`Copying ${srcDistServer} → ${distServerDir}`)
cpSync(srcDistServer, distServerDir, { recursive: true })

console.log('')
console.log('Server build complete!')
console.log(`Output: ${distServerDir}`)
console.log('The sidecar will be bundled at: Blitz.app/Contents/Resources/dist/server/')
