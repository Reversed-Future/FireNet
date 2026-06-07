import { readFile } from 'node:fs/promises'
import { parseCsv } from '../csv.js'

export async function readCsvRows(path: string): Promise<Record<string, string>[]> {
  const content = await readFile(path, 'utf-8')
  return parseCsv(content)
}
