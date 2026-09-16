import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

const modules = new Map()
// Link local TS modules for Node tests without a bundler or generated files.
export async function moduleUrl(relativePath) {
  const file = path.resolve(relativePath)
  if (modules.has(file)) return modules.get(file)
  const loading = (async () => {
    const source = await readFile(file, 'utf8')
    let output = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const references = [...output.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]
    for (const match of references) {
      let url
      if (match[1].startsWith('.') || match[1].startsWith('@/')) {
        const dependency = match[1].startsWith('@/') ? path.resolve(match[1].slice(2)) : path.resolve(path.dirname(file), match[1])
        if (path.extname(dependency)) url = await moduleUrl(dependency)
        else {
          try { await readFile(`${dependency}.ts`); url = await moduleUrl(`${dependency}.ts`) }
          catch (error) {
            if (error.code !== 'ENOENT') throw error
            url = await moduleUrl(`${dependency}.tsx`)
          }
        }
      } else {
        url = pathToFileURL(require.resolve(match[1])).href
        // Next's CommonJS entrypoints expose a nested default outside its bundler.
        if (match[1] === 'next/image' || match[1] === 'next/link') {
          url = `data:text/javascript;base64,${Buffer.from(`import entry from ${JSON.stringify(url)}; export default entry.default ?? entry;`).toString('base64')}`
        }
      }
      output = output.replaceAll(`'${match[1]}'`, `'${url}'`).replaceAll(`"${match[1]}"`, `"${url}"`)
    }
    return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  })()
  modules.set(file, loading)
  return loading
}

export async function loadModule(relativePath) {
  return import(await moduleUrl(relativePath))
}
