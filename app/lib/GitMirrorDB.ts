import git from 'isomorphic-git'
import LightningFS from '@isomorphic-git/lightning-fs'
import { EventEmitter } from 'events'

// Constants
const FS_NAME = 'git-mirror-fs'
const REPO_DIR = '/repo'
const DB_NAME = 'git-mirror-db'
const DB_VERSION = 1
const STORE_NAME = 'git-operations'

// Our Git mirror DB manager
class GitMirrorDB extends EventEmitter {
	private fs: any
	private db: IDBDatabase | null = null
	private initialized = false

	constructor() {
		super()
		// Initialize Lightning FS
		this.fs = new LightningFS(FS_NAME)

		// Initialize the DB
		this.initDB()
	}

	// Initialize IndexedDB
	private async initDB(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)

			request.onerror = () => {
				console.error('[GitMirrorDB] Failed to open IndexedDB:', request.error)
				reject(request.error)
			}

			request.onsuccess = () => {
				this.db = request.result
				this.initialized = true
				this.emit('ready')
				resolve()
			}

			request.onupgradeneeded = (event) => {
				const db = request.result
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
				}
			}
		})
	}

	// Get filesystem
	public getFS() {
		return this.fs
	}

	// Initialize a new repository
	public async initRepo(): Promise<void> {
		try {
			// Make sure the repo directory exists
			await this.fs.promises.mkdir(REPO_DIR).catch(() => {})

			// Initialize git in that directory
			await git.init({ fs: this.fs, dir: REPO_DIR })

			// Record this operation
			await this.recordOperation('init', { timestamp: Date.now() })

			this.emit('repo-initialized')
			return Promise.resolve()
		} catch (error) {
			console.error('[GitMirrorDB] Failed to initialize repo:', error)
			return Promise.reject(error)
		}
	}

	// Add file to the repository
	public async addFile(fileName: string, content: string): Promise<void> {
		try {
			// Create file path
			const filePath = `${REPO_DIR}/${fileName}`

			// Ensure directory exists by creating it recursively
			const lastSlashIndex = fileName.lastIndexOf('/')
			if (lastSlashIndex > 0) {
				// Extract directory path relative to the repo
				const dirPath = fileName.substring(0, lastSlashIndex)
				// Ensure the directory exists
				await this.ensureDirectoryExists(`${REPO_DIR}/${dirPath}`)
			}

			// Write the file
			await this.fs.promises.writeFile(filePath, content)

			// Add to git
			await git.add({ fs: this.fs, dir: REPO_DIR, filepath: fileName })

			// Record operation
			await this.recordOperation('add', {
				timestamp: Date.now(),
				fileName,
				contentLength: content.length,
			})

			this.emit('file-added', fileName)
			return Promise.resolve()
		} catch (error) {
			console.error('[GitMirrorDB] Failed to add file:', error)
			return Promise.reject(error)
		}
	}

	// Helper to ensure directory exists - handles special characters
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			// Check if directory already exists
			try {
				await this.fs.promises.stat(dirPath)
				return // Directory exists, no need to create
			} catch (error) {
				// Directory doesn't exist, continue to create
				console.log(`[GitMirrorDB] Directory doesn't exist, creating: ${dirPath}`)
			}

			// Split path into segments and handle special characters
			const normalizedPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`
			const segments = normalizedPath.split('/').filter((s) => s.length > 0)

			// Create path incrementally
			let currentPath = ''

			for (const segment of segments) {
				if (!segment) continue // Skip empty segments

				currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`

				try {
					// Check if this segment exists
					await this.fs.promises.stat(currentPath)
					console.log(`[GitMirrorDB] Directory segment exists: ${currentPath}`)
				} catch (error) {
					// Segment doesn't exist, create it
					console.log(`[GitMirrorDB] Creating directory segment: ${currentPath}`)
					try {
						await this.fs.promises.mkdir(currentPath)
					} catch (mkdirErr) {
						console.error(`[GitMirrorDB] Error creating directory ${currentPath}:`, mkdirErr)
						throw mkdirErr
					}
				}
			}
		} catch (error) {
			console.error(`[GitMirrorDB] Failed to create directory ${dirPath}:`, error)
			throw error
		}
	}

	// Commit changes
	public async commit(message: string, author: { name: string; email: string }): Promise<string> {
		try {
			const sha = await git.commit({
				fs: this.fs,
				dir: REPO_DIR,
				message,
				author,
			})

			// Record operation
			await this.recordOperation('commit', {
				timestamp: Date.now(),
				message,
				author,
				sha,
			})

			this.emit('committed', { sha, message })
			return sha
		} catch (error) {
			console.error('[GitMirrorDB] Failed to commit:', error)
			return Promise.reject(error)
		}
	}

	// List files in the repository
	public async listFiles(): Promise<string[]> {
		try {
			// First check if the repository is initialized
			const initialized = await this.isRepoInitialized()
			if (!initialized) {
				return []
			}

			const files = await git.listFiles({ fs: this.fs, dir: REPO_DIR })
			return files
		} catch (error) {
			console.error('[GitMirrorDB] Failed to list files:', error)
			// Return empty array instead of rejecting
			return []
		}
	}

	// Get file content
	public async getFileContent(fileName: string): Promise<string> {
		try {
			const filePath = `${REPO_DIR}/${fileName}`
			const content = await this.fs.promises.readFile(filePath, { encoding: 'utf8' })
			return content
		} catch (error) {
			console.error('[GitMirrorDB] Failed to read file:', error)
			return Promise.reject(error)
		}
	}

	// Get commit log
	public async log(): Promise<Array<any>> {
		try {
			// First check if the repository is initialized by trying to access the HEAD reference
			try {
				await git.resolveRef({ fs: this.fs, dir: REPO_DIR, ref: 'HEAD' })
			} catch (error) {
				console.log('[GitMirrorDB] No HEAD found, returning empty log')
				return []
			}

			const commits = await git.log({ fs: this.fs, dir: REPO_DIR })
			return commits
		} catch (error) {
			console.error('[GitMirrorDB] Failed to get log:', error)
			// Return empty array instead of rejecting, to prevent cascading errors
			return []
		}
	}

	// Get status of the repo
	public async status(): Promise<any> {
		try {
			// First check if the repository is initialized
			const initialized = await this.isRepoInitialized()
			if (!initialized) {
				return []
			}

			const statusMatrix = await git.statusMatrix({ fs: this.fs, dir: REPO_DIR })
			return statusMatrix
		} catch (error) {
			console.error('[GitMirrorDB] Failed to get status:', error)
			// Return empty array instead of rejecting
			return []
		}
	}

	// Record operation to IndexedDB for history
	private async recordOperation(type: string, details: Record<string, any>): Promise<void> {
		if (!this.db) {
			await new Promise<void>((resolve) => {
				this.once('ready', resolve)
			})
		}

		return new Promise((resolve, reject) => {
			if (!this.db) {
				return reject(new Error('Database not initialized'))
			}

			const transaction = this.db.transaction([STORE_NAME], 'readwrite')
			const store = transaction.objectStore(STORE_NAME)

			const operation = {
				type,
				timestamp: Date.now(),
				...details,
			}

			const request = store.add(operation)

			request.onsuccess = () => {
				resolve()
			}

			request.onerror = () => {
				console.error('[GitMirrorDB] Failed to record operation:', request.error)
				reject(request.error)
			}
		})
	}

	// Get operation history
	public async getOperationHistory(): Promise<any[]> {
		if (!this.db) {
			await new Promise<void>((resolve) => {
				this.once('ready', resolve)
			})
		}

		return new Promise((resolve, reject) => {
			if (!this.db) {
				return reject(new Error('Database not initialized'))
			}

			const transaction = this.db.transaction([STORE_NAME], 'readonly')
			const store = transaction.objectStore(STORE_NAME)
			const request = store.getAll()

			request.onsuccess = () => {
				resolve(request.result)
			}

			request.onerror = () => {
				console.error('[GitMirrorDB] Failed to get operation history:', request.error)
				reject(request.error)
			}
		})
	}

	// Check if repository is initialized
	public async isRepoInitialized(): Promise<boolean> {
		try {
			// Check if .git directory exists by listing the directory
			const gitDir = `${REPO_DIR}/.git`

			try {
				// Try to get the directory contents instead of using access
				const stats = await this.fs.promises.stat(gitDir)
				if (!stats.isDirectory()) return false
			} catch (error) {
				// Directory doesn't exist
				return false
			}

			// Also verify HEAD exists
			try {
				await git.resolveRef({ fs: this.fs, dir: REPO_DIR, ref: 'HEAD' })
				return true
			} catch (error) {
				// HEAD not found, repository might be improperly initialized
				return false
			}
		} catch (error) {
			console.error('[GitMirrorDB] Error checking repo initialization:', error)
			return false
		}
	}
}

// Export a singleton instance
let instance: GitMirrorDB | null = null

export function getGitMirrorDB(): GitMirrorDB {
	if (!instance) {
		instance = new GitMirrorDB()
	}
	return instance
}
