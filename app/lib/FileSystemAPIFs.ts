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
		exists: this.exists.bind(this),
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

			// Ensure basic git directories exist
			if (filepath.startsWith('.git/objects/') && filepath.split('/').length >= 3) {
				const segments = filepath.split('/').filter(Boolean)
				// If this is a git object directory path (.git/objects/xx)
				if (segments.length >= 3 && segments[0] === '.git' && segments[1] === 'objects') {
					try {
						// Create necessary directories
						let handle = this.dirHandle
						await handle.getDirectoryHandle('.git', { create: true })
						handle = await handle.getDirectoryHandle('.git')
						await handle.getDirectoryHandle('objects', { create: true })
						handle = await handle.getDirectoryHandle('objects')
						await handle.getDirectoryHandle(segments[2], { create: true })
					} catch (e) {
						console.warn(`[FileSystemAPIFs.stat] Failed to create git directory: ${filepath}`, e)
					}
				}
			}

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
						console.log('[FileSystemAPIFs.stat] Found file:', segment, 'size:', file.size)
						return makeStats({
							ctimeMs: file.lastModified,
							mtimeMs: file.lastModified,
							size: file.size,
							type: 'file',
						})
					} catch (e) {
						// If not a file, try as directory
						try {
							const dirHandle = await handle.getDirectoryHandle(segment)
							console.log('[FileSystemAPIFs.stat] Found directory:', segment)
							return makeStats({
								ctimeMs: Date.now(),
								mtimeMs: Date.now(),
								size: 0,
								type: 'dir',
							})
						} catch (dirErr) {
							console.error(
								`[FileSystemAPIFs.stat] Neither file nor directory found for segment: ${segment}`,
								dirErr
							)
							throw new Error(`ENOENT: no such file or directory: ${filepath}`)
						}
					}
				} else {
					try {
						console.log('[FileSystemAPIFs.stat] Navigating to directory:', segment)
						handle = await handle.getDirectoryHandle(segment)
					} catch (e) {
						console.error(`[FileSystemAPIFs.stat] Failed to navigate to directory: ${segment}`, e)
						throw new Error(`ENOENT: no such directory: ${segments.slice(0, i + 1).join('/')}`)
					}
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
			console.log('[FileSystemAPIFs.readFile] filepath:', filepath)

			// Special handling for git object files that don't exist yet
			if (filepath.startsWith('.git/objects/') && filepath.split('/').length >= 4) {
				const segments = filepath.split('/').filter(Boolean)
				if (segments.length >= 4 && segments[0] === '.git' && segments[1] === 'objects') {
					// Create the directory hierarchy if needed
					try {
						let handle = this.dirHandle
						// Navigate to .git
						handle = await handle.getDirectoryHandle('.git', { create: true })
						// Navigate to objects
						handle = await handle.getDirectoryHandle('objects', { create: true })
						// Navigate to the hash prefix directory (e.g., "16")
						handle = await handle.getDirectoryHandle(segments[2], { create: true })

						// Check if the file exists
						try {
							const fileHandle = await handle.getFileHandle(segments[3])
							const file = await fileHandle.getFile()

							if (options.encoding === 'utf8') {
								return await file.text()
							} else {
								return new Uint8Array(await file.arrayBuffer())
							}
						} catch (e) {
							// If the file doesn't exist yet, return an empty buffer/string
							// This helps git with existence checks
							console.log(
								`[FileSystemAPIFs.readFile] Git object file doesn't exist, returning empty: ${filepath}`
							)
							if (options.encoding === 'utf8') {
								return ''
							} else {
								return new Uint8Array(0)
							}
						}
					} catch (e) {
						console.warn(`[FileSystemAPIFs.readFile] Failed to read git object: ${filepath}`, e)
					}
				}
			}

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
			console.error('[FileSystemAPIFs.readFile] Error for filepath:', filepath, err)
			throw new Error(`ENOENT: no such file: ${filepath}`)
		}
	}

	async mkdir(filepath: string) {
		try {
			console.log(`[FileSystemAPIFs.mkdir] Creating directory: ${filepath}`)
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Create directories recursively
			for (const segment of segments) {
				try {
					// Try to get the directory first (in case it exists)
					try {
						handle = await handle.getDirectoryHandle(segment)
						console.log(`[FileSystemAPIFs.mkdir] Directory already exists: ${segment}`)
					} catch {
						// If it doesn't exist, create it
						handle = await handle.getDirectoryHandle(segment, { create: true })
						console.log(`[FileSystemAPIFs.mkdir] Created directory: ${segment}`)
					}
				} catch (e) {
					console.error(`[FileSystemAPIFs.mkdir] Failed to create directory segment: ${segment}`, e)
					throw e // Re-throw to be caught by outer try/catch
				}
			}
			console.log(`[FileSystemAPIFs.mkdir] Successfully created/verified directory: ${filepath}`)
		} catch (err) {
			console.error(`[FileSystemAPIFs.mkdir] Error creating directory: ${filepath}`, err)
			throw new Error(`Failed to create directory: ${filepath}`)
		}
	}

	async writeFile(filepath: string, data: Uint8Array | string, options: { mode?: number } = {}) {
		try {
			console.log(`[FileSystemAPIFs.writeFile] Writing file: ${filepath}`)

			// Special handling for git object files
			if (filepath.startsWith('.git/objects/') && filepath.split('/').length >= 4) {
				const segments = filepath.split('/').filter(Boolean)
				if (segments.length >= 4 && segments[0] === '.git' && segments[1] === 'objects') {
					// Explicitly create the directory structure for the git object
					let handle = this.dirHandle

					// Create .git if it doesn't exist
					try {
						handle = await handle.getDirectoryHandle('.git')
					} catch {
						handle = await handle.getDirectoryHandle('.git', { create: true })
						console.log(`[FileSystemAPIFs.writeFile] Created .git directory`)
					}

					// Create objects if it doesn't exist
					try {
						handle = await handle.getDirectoryHandle('objects')
					} catch {
						handle = await handle.getDirectoryHandle('objects', { create: true })
						console.log(`[FileSystemAPIFs.writeFile] Created .git/objects directory`)
					}

					// Create the hash prefix directory (e.g., "16")
					try {
						handle = await handle.getDirectoryHandle(segments[2])
					} catch {
						handle = await handle.getDirectoryHandle(segments[2], { create: true })
						console.log(`[FileSystemAPIFs.writeFile] Created .git/objects/${segments[2]} directory`)
					}

					// Now write the file
					const fileHandle = await handle.getFileHandle(segments[3], { create: true })
					const writable = await fileHandle.createWritable()
					await writable.write(data)
					await writable.close()

					console.log(`[FileSystemAPIFs.writeFile] Successfully wrote git object: ${filepath}`)
					return // Exit early, we've handled this special case
				}
			}

			// Standard file writing logic for non-git-object files
			const segments = filepath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Create parent directories recursively
			for (let i = 0; i < segments.length - 1; i++) {
				try {
					handle = await handle.getDirectoryHandle(segments[i])
				} catch {
					handle = await handle.getDirectoryHandle(segments[i], { create: true })
					console.log(`[FileSystemAPIFs.writeFile] Created directory: ${segments[i]}`)
				}
			}

			// Get or create the file
			const fileHandle = await handle.getFileHandle(segments[segments.length - 1], { create: true })
			const writable = await fileHandle.createWritable()

			await writable.write(data)
			await writable.close()
			console.log(`[FileSystemAPIFs.writeFile] Successfully wrote file: ${filepath}`)
		} catch (err) {
			console.error(`[FileSystemAPIFs.writeFile] Error writing file: ${filepath}`, err)
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

	// Add an exists method that will be used to check if files/directories exist
	// This needs special handling for git objects
	async exists(filepath: string) {
		// For git object files, always return true to let git create them
		// This is the simplest solution that works with isomorphic-git
		if (filepath.includes('/objects/') && filepath.includes('.git')) {
			console.log(
				`[FileSystemAPIFs.exists] Git object path: ${filepath} - returning true to allow creation`
			)

			// Extract directory path and ensure it exists
			const segments = filepath.replace(/^\/+/, '').split('/')
			const dirPath = segments.slice(0, segments.length - 1).join('/')

			// Create directory structure without checking first
			try {
				await this.mkdir(dirPath)
				console.log(`[FileSystemAPIFs.exists] Created directory: ${dirPath}`)
			} catch (e) {
				// Ignore errors - directory might already exist
				console.log(`[FileSystemAPIFs.exists] Directory may already exist: ${dirPath}`)
			}

			// Always return true for git object paths - this allows isomorphic-git to write them
			return true
		}

		try {
			// For all other files, do a real existence check
			console.log('[FileSystemAPIFs.exists] Checking if exists:', filepath)

			// Remove leading slash if present
			const normalizedPath = filepath.replace(/^\/+/, '')

			// Handle root and empty paths
			if (!normalizedPath || normalizedPath === '.' || normalizedPath === '') {
				return true // Root always exists
			}

			const segments = normalizedPath.split('/').filter(Boolean)
			let handle = this.dirHandle

			// Navigate to the parent directory
			for (let i = 0; i < segments.length - 1; i++) {
				try {
					handle = await handle.getDirectoryHandle(segments[i])
				} catch {
					return false // Parent path doesn't exist
				}
			}

			// Try as file first
			try {
				await handle.getFileHandle(segments[segments.length - 1])
				return true // File exists
			} catch {
				// Then try as directory
				try {
					await handle.getDirectoryHandle(segments[segments.length - 1])
					return true // Directory exists
				} catch {
					return false // Neither file nor directory exists
				}
			}
		} catch (err) {
			// For any error, return false instead of throwing
			console.error('[FileSystemAPIFs.exists] Error checking existence:', filepath, err)
			return false
		}
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
