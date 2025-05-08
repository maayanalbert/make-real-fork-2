import * as git from 'isomorphic-git'
import { FileSystemDirectoryHandle, FileSystemFileHandle } from './types'
// @ts-ignore
import minimatch from 'minimatch'

let cachedGitignorePatterns: string[] | null = null

async function getCachedGitignorePatterns(handle: FileSystemDirectoryHandle): Promise<string[]> {
	if (cachedGitignorePatterns !== null) return cachedGitignorePatterns
	try {
		const fileHandle = await handle.getFileHandle('.gitignore')
		const file = await fileHandle.getFile()
		const text = await file.text()
		cachedGitignorePatterns = text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
		return cachedGitignorePatterns
	} catch {
		cachedGitignorePatterns = []
		return []
	}
}

// Helper to create a stat object with required methods
function makeStats({
	type,
	ctimeMs,
	mtimeMs,
	size,
}: {
	type: 'file' | 'dir'
	ctimeMs: number
	mtimeMs: number
	size: number
}) {
	return {
		ctimeMs,
		mtimeMs,
		size,
		type,
		isFile: () => type === 'file',
		isDirectory: () => type === 'dir',
		isSymbolicLink: () => false,
	}
}

// Check if a path should be ignored based on gitignore patterns
function shouldIgnore(path: string, patterns: string[]): boolean {
	// Always ignore node_modules and .env files
	if (path.includes('node_modules') || path === 'node_modules' || path.startsWith('.env')) {
		console.log('Ignoring node_modules or .env', path)
		return true
	}

	return patterns.some((pattern) => {
		// Handle directory patterns
		if (path.startsWith(pattern) || path.startsWith(pattern.slice(1))) {
			console.log('Directory pattern match:', pattern, 'for path:', path)
			return true
		}

		// Handle wildcards
		let regexPattern = pattern
			.replace(/\./g, '\\.') // Escape dots
			.replace(/\*/g, '[^/]*') // * matches anything except /
			.replace(/\?/g, '.') // ? matches any single character

		// Handle leading slash
		if (pattern.startsWith('/')) {
			regexPattern = '^' + regexPattern
		} else {
			regexPattern = '^' + regexPattern + '$|^.*/' + regexPattern + '$'
		}

		const regex = new RegExp(regexPattern)
		const matches = regex.test(path)
		if (matches) {
			console.log('Pattern match:', pattern, 'for path:', path)
		}
		return matches
	})
}

// Create a filesystem implementation that works with the File System Access API
export class FileSystemAPIFs implements git.PromiseFsClient {
	private dirHandle: FileSystemDirectoryHandle
	public promises = {
		stat: this.stat.bind(this),
		lstat: this.stat.bind(this),
		readdir: this.readdir.bind(this),
		readFile: this.readFile.bind(this),
		mkdir: this.mkdir.bind(this),
		writeFile: this.writeFile.bind(this),
		unlink: this.unlink.bind(this),
		rmdir: this.rmdir.bind(this),
		rename: this.rename.bind(this),
		readlink: async () => {
			throw new Error('Not implemented')
		},
		symlink: async () => {
			throw new Error('Not implemented')
		},
	}

	constructor(dirHandle: FileSystemDirectoryHandle) {
		this.dirHandle = dirHandle
	}

	async stat(filepath: string) {
		try {
			console.log('[FileSystemAPIFs.stat] filepath:', filepath)

			// Check .gitignore patterns and skip ignored files
			const patterns = await getCachedGitignorePatterns(this.dirHandle)
			const relPath = (filepath || '').replace(/^\/+/g, '').replace(/\/+/g, '/')
			if (patterns.length > 0 && shouldIgnore(relPath, patterns)) {
				console.log('[FileSystemAPIFs.stat] Skipping ignored file:', relPath)
				throw new Error(`ENOENT: no such file or directory: ${filepath}`)
			}

			// Normalize root paths and dot paths
			const normalized = (filepath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
			if (
				!normalized ||
				normalized === '.' ||
				normalized === '' ||
				normalized.split('/').every((seg) => seg === '' || seg === '.')
			) {
				console.log(
					'[FileSystemAPIFs.stat] Returning root directory stat (normalized:',
					normalized,
					')'
				)
				return makeStats({
					ctimeMs: Date.now(),
					mtimeMs: Date.now(),
					size: 0,
					type: 'dir',
				})
			}

			const segments = normalized
				.split('/')
				.filter(Boolean)
				.filter((seg) => seg !== '.')
			console.log('[FileSystemAPIFs.stat] segments:', segments)
			let handle = this.dirHandle

			// Navigate to the file/directory
			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i]
				if (i === segments.length - 1) {
					try {
						// Try as file first
						const fileHandle = await handle.getFileHandle(segment)
						const file = await fileHandle.getFile()
						console.log('[FileSystemAPIFs.stat] Found file:', segment)
						return makeStats({
							ctimeMs: file.lastModified,
							mtimeMs: file.lastModified,
							size: file.size,
							type: 'file',
						})
					} catch (e) {
						// If not a file, try as directory
						const dirHandle = await handle.getDirectoryHandle(segment)
						console.log('[FileSystemAPIFs.stat] Found directory:', segment)
						return makeStats({
							ctimeMs: Date.now(),
							mtimeMs: Date.now(),
							size: 0,
							type: 'dir',
						})
					}
				} else {
					console.log('[FileSystemAPIFs.stat] Navigating to directory:', segment)
					handle = await handle.getDirectoryHandle(segment)
				}
			}

			// If filepath is empty or '/', return stats for the root directory
			console.log('[FileSystemAPIFs.stat] Returning fallback root directory stat')
			return makeStats({
				ctimeMs: Date.now(),
				mtimeMs: Date.now(),
				size: 0,
				type: 'dir',
			})
		} catch (err) {
			console.error('[FileSystemAPIFs.stat] Error for filepath:', filepath, err)
			throw new Error(`ENOENT: no such file or directory: ${filepath}`)
		}
	}

	async readdir(filepath: string) {
		try {
			console.log('[FileSystemAPIFs.readdir] filepath:', filepath)
			let handle = this.dirHandle
			let relPath = ''
			if (filepath && filepath !== '/' && filepath !== '.') {
				const segments = filepath.split('/').filter(Boolean)
				relPath = segments.join('/')
				console.log('[FileSystemAPIFs.readdir] segments:', segments)
				for (const segment of segments) {
					console.log('[FileSystemAPIFs.readdir] Navigating to directory:', segment)
					handle = await handle.getDirectoryHandle(segment)
				}
			}

			let entries = []
			const patterns = await getCachedGitignorePatterns(this.dirHandle)
			for await (const entry of handle.values()) {
				const entryPath = relPath ? relPath + '/' + entry.name : entry.name
				if (!shouldIgnore(entryPath, patterns)) {
					entries.push(entry.name)
				}
			}

			console.log('[FileSystemAPIFs.readdir] entries:', entries)
			return entries
		} catch (err) {
			console.error('[FileSystemAPIFs.readdir] Error for filepath:', filepath, err)
			throw new Error(`ENOENT: no such directory: ${filepath}`)
		}
	}

	async readFile(filepath: string, options: { encoding?: string } = {}) {
		try {
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Navigate to the file
			for (let i = 0; i < segments.length - 1; i++) {
				handle = await handle.getDirectoryHandle(segments[i])
			}

			const fileHandle = await handle.getFileHandle(segments[segments.length - 1])
			const file = await fileHandle.getFile()

			if (options.encoding === 'utf8') {
				return await file.text()
			} else {
				return new Uint8Array(await file.arrayBuffer())
			}
		} catch (err) {
			throw new Error(`ENOENT: no such file: ${filepath}`)
		}
	}

	async mkdir(filepath: string) {
		try {
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Create directories recursively
			for (const segment of segments) {
				handle = await handle.getDirectoryHandle(segment, { create: true })
			}
		} catch (err) {
			throw new Error(`Failed to create directory: ${filepath}`)
		}
	}

	async writeFile(filepath: string, data: Uint8Array | string, options: { mode?: number } = {}) {
		try {
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Navigate to the parent directory
			for (let i = 0; i < segments.length - 1; i++) {
				handle = await handle.getDirectoryHandle(segments[i], { create: true })
			}

			// Get or create the file
			const fileHandle = await handle.getFileHandle(segments[segments.length - 1], { create: true })
			const writable = await fileHandle.createWritable()

			await writable.write(data)
			await writable.close()
		} catch (err) {
			throw new Error(`Failed to write file: ${filepath}`)
		}
	}

	async unlink(filepath: string) {
		try {
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Navigate to the parent directory
			for (let i = 0; i < segments.length - 1; i++) {
				handle = await handle.getDirectoryHandle(segments[i])
			}

			await handle.removeEntry(segments[segments.length - 1])
		} catch (err) {
			throw new Error(`Failed to unlink: ${filepath}`)
		}
	}

	async rmdir(filepath: string) {
		try {
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Navigate to the parent directory
			for (let i = 0; i < segments.length - 1; i++) {
				handle = await handle.getDirectoryHandle(segments[i])
			}

			await handle.removeEntry(segments[segments.length - 1], { recursive: true })
		} catch (err) {
			throw new Error(`Failed to rmdir: ${filepath}`)
		}
	}

	async rename(oldFilepath: string, newFilepath: string) {
		// File System Access API doesn't have a direct rename function
		// Need to implement by reading and writing
		const data = await this.readFile(oldFilepath)
		await this.writeFile(newFilepath, data)
		await this.unlink(oldFilepath)
	}

	// You may need to implement additional methods depending on which git operations you use
}

async function getGitignorePatterns(handle: FileSystemDirectoryHandle): Promise<string[]> {
	try {
		const fileHandle = await handle.getFileHandle('.gitignore')
		const file = await fileHandle.getFile()
		const text = await file.text()
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
	} catch (e) {
		// No .gitignore file
		return []
	}
}
