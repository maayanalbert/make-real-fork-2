import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Permission states
type PermissionState = 'granted' | 'denied' | 'prompt'

// Define minimal interfaces for File System Access API
type FileSystemHandle = {
	kind: string
	name: string
}

type FileSystemDirectoryHandle = FileSystemHandle & {
	kind: 'directory'
	getDirectoryHandle?: (
		name: string,
		options?: { create?: boolean }
	) => Promise<FileSystemDirectoryHandle>
	getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandle>
	values?: () => AsyncIterableIterator<{ kind: string; name: string }>
	queryPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>
	requestPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>
}

type FileSystemFileHandle = FileSystemHandle & {
	kind: 'file'
	getFile: () => Promise<File>
}

// Git repository information
type GitRepoInfo = {
	repoUrl: string
	currentBranch: string
	branches: string[]
	lastCommitDate: Date | null
	isInitialized: boolean
}

type ProjectSettingsContextType = {
	directoryHandle: FileSystemDirectoryHandle | null
	port: string
	gitRepo: GitRepoInfo | null
	setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
	setPort: (port: string) => void
	initializeGitRepo: (
		repoUrl: string,
		branch?: string,
		directoryHandle?: FileSystemDirectoryHandle
	) => Promise<void>
	switchBranch: (branchName: string) => Promise<void>
	commitChanges: (
		message: string,
		files: Array<{ path: string; content: string }>
	) => Promise<string>
	commitLocalDirectory: (message: string) => Promise<string | null>
}

// Add window.showDirectoryPicker declaration
declare global {
	interface Window {
		showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
	}
}

const ProjectSettingsContext = createContext<ProjectSettingsContextType | undefined>(undefined)

// Storage keys
const PORT_STORAGE_KEY = 'project-port'
const DIRECTORY_HANDLE_KEY = 'project-directory-handle'
const DB_NAME = 'project-settings-db'
const DB_VERSION = 2
const HANDLE_STORE = 'directory-handles'
const GIT_REPO_STORE = 'git-repo-info'
const GIT_OBJECTS_STORE = 'git-objects'

// Helper function to open the IndexedDB database
const openDB = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => {
			reject(request.error)
		}
		request.onsuccess = () => {
			resolve(request.result)
		}

		request.onupgradeneeded = (event) => {
			const db = request.result
			const oldVersion = event.oldVersion

			// Create stores if they don't exist
			if (oldVersion < 1) {
				if (!db.objectStoreNames.contains(HANDLE_STORE)) {
					db.createObjectStore(HANDLE_STORE)
				}
			}

			if (oldVersion < 2) {
				// Create Git repo info store
				if (!db.objectStoreNames.contains(GIT_REPO_STORE)) {
					db.createObjectStore(GIT_REPO_STORE)
				}

				// Create Git objects store with hash index
				if (!db.objectStoreNames.contains(GIT_OBJECTS_STORE)) {
					const objectStore = db.createObjectStore(GIT_OBJECTS_STORE, { keyPath: 'hash' })
					objectStore.createIndex('type', 'type', { unique: false })
				}
			}
		}
	})
}

// Helper function to store a handle in IndexedDB
const storeDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readwrite')
		const store = transaction.objectStore(HANDLE_STORE)

		return new Promise((resolve, reject) => {
			const request = store.put(handle, DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error storing handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to store directory handle:', error)
		throw error
	}
}

// Helper function to get a handle from IndexedDB
const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readonly')
		const store = transaction.objectStore(HANDLE_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get(DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				const result = request.result
				if (result) resolve(result || null)
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error retrieving handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to retrieve directory handle:', error)
		throw error
	}
}

// Helper function to remove a handle from IndexedDB
const removeDirectoryHandle = async (): Promise<void> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readwrite')
		const store = transaction.objectStore(HANDLE_STORE)

		return new Promise((resolve, reject) => {
			const request = store.delete(DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error removing handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to remove directory handle:', error)
		throw error
	}
}

// Store Git repo info in IndexedDB
const storeGitRepoInfo = async (repoInfo: GitRepoInfo): Promise<void> => {
	console.log('[IndexedDB] Storing Git repo info:', repoInfo)
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_REPO_STORE, 'readwrite')
		const store = transaction.objectStore(GIT_REPO_STORE)

		return new Promise((resolve, reject) => {
			const request = store.put(repoInfo, 'currentRepo')

			request.onsuccess = () => {
				console.log('[IndexedDB] Git repo info stored successfully')
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error storing Git repo info:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to store Git repo info:', error)
		throw error
	}
}

// Get Git repo info from IndexedDB
const getGitRepoInfo = async (): Promise<GitRepoInfo | null> => {
	console.log('[IndexedDB] Retrieving Git repo info')
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_REPO_STORE, 'readonly')
		const store = transaction.objectStore(GIT_REPO_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get('currentRepo')

			request.onsuccess = () => {
				const result = request.result
				console.log('[IndexedDB] Git repo info retrieved:', result ? 'Found' : 'Not found')
				resolve(result || null)
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error retrieving Git repo info:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to retrieve Git repo info:', error)
		throw error
	}
}

// Store a Git object in IndexedDB
const storeGitObject = async (hash: string, type: string, data: Uint8Array): Promise<void> => {
	console.log(`[IndexedDB] Storing Git object: hash=${hash}, type=${type}`)
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_OBJECTS_STORE, 'readwrite')
		const store = transaction.objectStore(GIT_OBJECTS_STORE)

		return new Promise((resolve, reject) => {
			const request = store.put({ hash, type, data })

			request.onsuccess = () => {
				console.log('[IndexedDB] Git object stored successfully')
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error storing Git object:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to store Git object:', error)
		throw error
	}
}

// Helper function to verify and request permissions if needed
const verifyPermission = async (
	handle: FileSystemDirectoryHandle,
	mode: 'readwrite' | 'read' = 'readwrite'
): Promise<boolean> => {
	console.log('[Permissions] Verifying permissions for handle:', handle.name)

	if (!handle.queryPermission || !handle.requestPermission) {
		console.error('[Permissions] Permission API not supported')
		return false
	}

	try {
		let permission = await handle.queryPermission({ mode })
		console.log('[Permissions] Current permission status:', permission)

		if (permission === 'prompt') {
			console.log('[Permissions] Requesting permission from user')
			permission = await handle.requestPermission({ mode })
			console.log('[Permissions] User response:', permission)
		}

		return permission === 'granted'
	} catch (error) {
		console.error('[Permissions] Error verifying permissions:', error)
		return false
	}
}

// Generate a SHA-1 hash for Git objects
const generateHash = async (data: string): Promise<string> => {
	const encoder = new TextEncoder()
	const encodedData = encoder.encode(data)
	const hashBuffer = await crypto.subtle.digest('SHA-1', encodedData)

	// Convert to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Parse .gitignore file content into an array of patterns
const parseGitignore = (content: string): string[] => {
	const patterns = content
		.split('\n')
		.map((line) => {
			// Remove comments and trim
			const commentIndex = line.indexOf('#')
			if (commentIndex !== -1) {
				line = line.slice(0, commentIndex)
			}
			return line.trim()
		})
		.filter((line) => line && !line.startsWith('#'))
		.map((line) => {
			// Handle negated patterns
			if (line.startsWith('!')) {
				return line.slice(1)
			}
			return line
		})

	console.log('Parsed .gitignore patterns:', patterns)
	return patterns
}

// Check if a path should be ignored based on gitignore patterns
const shouldIgnore = (path: string, patterns: string[]): boolean => {
	// Always ignore node_modules and .env files
	if (path.includes('node_modules') || path === 'node_modules' || path.startsWith('.env')) {
		console.log('Ignoring node_modules or .env:', path)
		return true
	}

	patterns.push('.git')

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

// Recursive function to process files in a directory
const processDirectory = async (
	dirHandle: FileSystemDirectoryHandle,
	ignorePatterns: string[] = [],
	parentPath: string = ''
): Promise<{ path: string; content: Uint8Array; size: number }[]> => {
	const files: { path: string; content: Uint8Array; size: number }[] = []

	if (!dirHandle.values) {
		console.error(`[Git] Directory handle doesn't support values() method`)
		return files
	}

	for await (const entry of dirHandle.values()) {
		const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

		// Skip if this path should be ignored
		if (shouldIgnore(entryPath, ignorePatterns)) {
			console.log(`[Git] Ignoring path: ${entryPath}`)
			continue
		}

		if (entry.kind === 'file') {
			try {
				// Get file handle and contents
				if (!dirHandle.getFileHandle) {
					console.error(`[Git] Directory handle doesn't support getFileHandle() method`)
					continue
				}

				const fileHandle = await dirHandle.getFileHandle(entry.name)
				const file = await fileHandle.getFile()
				const content = new Uint8Array(await file.arrayBuffer())

				files.push({
					path: entryPath,
					content,
					size: file.size,
				})
			} catch (error) {
				console.error(`[Git] Error processing file ${entryPath}:`, error)
			}
		} else if (entry.kind === 'directory') {
			// Process subdirectory recursively
			if (!dirHandle.getDirectoryHandle) {
				console.error(`[Git] Directory handle doesn't support getDirectoryHandle() method`)
				continue
			}

			try {
				const subdirHandle = await dirHandle.getDirectoryHandle(entry.name)
				const subdirFiles = await processDirectory(subdirHandle, ignorePatterns, entryPath)
				files.push(...subdirFiles)
			} catch (error) {
				console.error(`[Git] Error processing directory ${entryPath}:`, error)
			}
		}
	}

	return files
}

// Add this function before the ProjectSettingsProvider
const verifyGitRepo = async (repoUrl: string): Promise<boolean> => {
	try {
		const response = await fetch(`http://localhost:3000/api/git/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ repoUrl }),
		})

		if (!response.ok) {
			console.error('[Git] Failed to verify repository:', response.statusText)
			return false
		}

		const result = await response.json()
		return result.exists
	} catch (error) {
		console.error('[Git] Error verifying repository:', error)
		return false
	}
}

// Helper to recursively create directories and get file handle
async function getOrCreateFileHandleRecursive(
	rootHandle: FileSystemDirectoryHandle,
	filePath: string
): Promise<FileSystemFileHandle> {
	const parts = filePath.split('/')
	let dirHandle = rootHandle
	for (let i = 0; i < parts.length - 1; i++) {
		if (!dirHandle.getDirectoryHandle)
			throw new Error('Directory handle does not support getDirectoryHandle')
		dirHandle = await dirHandle.getDirectoryHandle(parts[i], { create: true })
	}
	if (!dirHandle.getFileHandle) throw new Error('Directory handle does not support getFileHandle')
	return await dirHandle.getFileHandle(parts[parts.length - 1], { create: true })
}

export function ProjectSettingsProvider({ children }: { children: ReactNode }) {
	const [directoryHandle, setDirectoryHandleState] = useState<FileSystemDirectoryHandle | null>(
		null
	)
	const [port, setPortState] = useState<string>('3000')
	const [gitRepo, setGitRepo] = useState<GitRepoInfo | null>(null)

	// Load from localStorage and IndexedDB on initial mount
	useEffect(() => {
		const loadSettings = async () => {
			console.log('[Settings] Loading settings from storage')
			// Load port from localStorage
			const storedPort = localStorage.getItem(PORT_STORAGE_KEY)
			if (storedPort) {
				console.log('[Settings] Loaded port:', storedPort)
				setPortState(storedPort)
			} else {
				console.log('[Settings] No saved port found, using default')
			}

			// Try to load directory handle from IndexedDB
			try {
				console.log('[Settings] Attempting to load directory handle')
				const handle = await getDirectoryHandle()
				if (handle) {
					console.log('[Settings] Directory handle found in storage')

					// Log more details about the handle for debugging
					console.log('[Settings] Handle details:', {
						name: handle.name,
						kind: handle.kind,
					})

					setDirectoryHandleState(handle)
				} else {
					console.log('[Settings] No directory handle found in storage')
				}
			} catch (error) {
				console.error('[Settings] Failed to retrieve directory handle:', error)
			}

			// Load Git repo info from IndexedDB and verify it exists
			try {
				console.log('[Settings] Attempting to load Git repo info')
				const repoInfo = await getGitRepoInfo()
				if (repoInfo) {
					console.log('[Settings] Git repo info found:', repoInfo)

					// Only verify if repoUrl is non-empty
					if (repoInfo.repoUrl && repoInfo.repoUrl.trim() !== '') {
						const repoExists = await verifyGitRepo(repoInfo.repoUrl)
						if (repoExists) {
							console.log('[Settings] Git repository verified')
							setGitRepo(repoInfo)
						} else {
							console.log('[Settings] Git repository not found, clearing repo info')
							// Clear the invalid repo info
							await storeGitRepoInfo({
								repoUrl: '',
								currentBranch: '',
								branches: [],
								lastCommitDate: null,
								isInitialized: false,
							})
							setGitRepo(null)
						}
					} else {
						console.log('[Settings] repoUrl is empty, not verifying')
						setGitRepo(null)
					}
				} else {
					console.log('[Settings] No Git repo info found')
				}
			} catch (error) {
				console.error('[Settings] Failed to retrieve Git repo info:', error)
			}
		}

		loadSettings()
	}, [])

	// Function to update the directory handle
	const setDirectoryHandle = async (handle: FileSystemDirectoryHandle | null) => {
		console.log('[Settings] Setting directory handle:', handle ? handle.name : 'null')
		setDirectoryHandleState(handle)

		if (handle) {
			try {
				console.log('[Settings] Ensuring we have read/write permission')
				// Ensure we have read/write permission
				const hasPermission = await verifyPermission(handle)
				console.log('[Settings] Permission check result:', hasPermission)

				if (hasPermission) {
					console.log('[Settings] Storing handle in IndexedDB')
					// Store the actual handle in IndexedDB
					await storeDirectoryHandle(handle)
					console.log('[Settings] Handle stored successfully')
				} else {
					console.error('[Settings] Permission denied for directory')
				}
			} catch (error) {
				console.error('[Settings] Failed to save directory handle:', error)
			}
		} else {
			// Clear stored handle if setting to null
			console.log('[Settings] Clearing stored directory handle')
			await removeDirectoryHandle()
		}
	}

	// Function to update the port and save to localStorage
	const setPort = (newPort: string) => {
		localStorage.setItem(PORT_STORAGE_KEY, newPort)
		setPortState(newPort)
	}

	// Initialize a Git repository by mirroring from a remote URL
	const initializeGitRepo = async (
		repoUrl: string,
		branch?: string,
		directoryHandle?: FileSystemDirectoryHandle
	) => {
		console.log(`[Git] Initializing Git repository from ${repoUrl}, branch ${branch}`)

		try {
			// Create new repo info object
			const newRepoInfo: GitRepoInfo = {
				repoUrl,
				currentBranch: branch || 'main',
				branches: [branch || 'main'],
				lastCommitDate: null,
				isInitialized: false,
			}

			// Store initial repo info
			await storeGitRepoInfo(newRepoInfo)
			setGitRepo(newRepoInfo)

			// Call API to initialize repository with a single file first
			const initApiUrl = `http://localhost:3000/api/git/initialize`
			console.log(`[Git] Calling API at: ${initApiUrl} with initial file`)

			// Create a single initial file with "api" content
			const initialFile = {
				path: 'initial.txt',
				content: 'api',
				sha: await generateHash(`blob ${3}\0api`),
				size: 3,
			}

			// First request: Initialize with just one file
			const initResponse = await fetch(initApiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					repoUrl,
					branch: branch || 'main',
					files: [initialFile],
				}),
			})

			if (!initResponse.ok) {
				throw new Error(`Failed to initialize repository: ${initResponse.statusText}`)
			}

			await initResponse.json()
			console.log('[Git] Repository initialized with initial file')

			// Process directory and get remaining files
			if (directoryHandle) {
				// Try to find .gitignore
				let ignorePatterns: string[] = []
				try {
					if (directoryHandle.getFileHandle) {
						const gitignoreHandle = await directoryHandle.getFileHandle('.gitignore')
						const gitignoreFile = await gitignoreHandle.getFile()
						const gitignoreContent = await gitignoreFile.text()
						ignorePatterns = parseGitignore(gitignoreContent)
					}
				} catch (error) {
					console.log('No .gitignore found, will process all files')
				}

				// Process directory and convert Uint8Array to string
				const processedFiles = await processDirectory(directoryHandle, ignorePatterns)
				const files = await Promise.all(
					processedFiles
						.filter((file) => file.path !== 'initial.txt') // Skip the initial file we already uploaded
						.map(async (file) => ({
							path: file.path,
							content: new TextDecoder().decode(file.content),
							sha: await generateHash(
								`blob ${file.content.byteLength}\0${new TextDecoder().decode(file.content)}`
							),
							size: file.size,
						}))
				)

				// Only make the second API call if there are files to upload
				if (files.length > 0) {
					console.log(`[Git] Uploading remaining ${files.length} files`)

					// Second request: Upload the rest of the files
					const uploadApiUrl = `http://localhost:3000/api/git/push`
					const uploadResponse = await fetch(uploadApiUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							repoUrl,
							branch: branch || 'main',
							commits: [{ message: 'Add remaining files' }],
							files,
						}),
					})

					if (!uploadResponse.ok) {
						throw new Error(`Failed to upload remaining files: ${uploadResponse.statusText}`)
					}

					await uploadResponse.json()
					console.log('[Git] Successfully uploaded remaining files')
				}
			}

			// Update repo info
			const updatedRepoInfo = {
				...newRepoInfo,
				lastCommitDate: new Date(),
				isInitialized: true,
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)

			console.log('[Git] Repository initialization complete')
		} catch (error) {
			console.error('[Git] Failed to initialize repository:', error)
			throw error
		}
	}

	// Switch to another branch
	const switchBranch = async (branchName: string) => {
		console.log(`[Git] Switching to branch: ${branchName}`)

		if (!gitRepo?.isInitialized || !gitRepo.repoUrl) {
			throw new Error('No Git repository has been initialized')
		}

		if (!directoryHandle) {
			throw new Error('No directory selected')
		}

		try {
			console.log('[Git] Calling switch-branch API')
			// Call the switch-branch API endpoint
			const response = await fetch('http://localhost:3000/api/git/switch-branch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					repoUrl: gitRepo.repoUrl,
					branchName,
					fromBranch: gitRepo.currentBranch,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to switch branch')
			}

			const result = await response.json()

			// Store the branch reference in IndexedDB
			const refHash = `refs/heads/${branchName}`
			await storeGitObject(refHash, 'ref', new TextEncoder().encode(result.commitSha))

			// Only clear and recreate files if the API indicates this is an existing branch
			// The API will return files for existing branches, but not for new ones
			if (result.files && result.files.length > 0) {
				// Get .gitignore patterns
				let ignorePatterns: string[] = []
				try {
					if (directoryHandle.getFileHandle) {
						const gitignoreHandle = await directoryHandle.getFileHandle('.gitignore')
						const gitignoreFile = await gitignoreHandle.getFile()
						const gitignoreContent = await gitignoreFile.text()
						ignorePatterns = parseGitignore(gitignoreContent)
						console.log(`[Git] Found .gitignore with ${ignorePatterns.length} patterns`)
					}
				} catch (error) {
					console.log(`[Git] No .gitignore found, will process all files`)
				}

				// Clear existing files in the directory, respecting .gitignore
				if (directoryHandle.values) {
					for await (const entry of directoryHandle.values()) {
						const entryPath = entry.name

						// Skip if this path should be ignored
						if (shouldIgnore(entryPath, ignorePatterns)) {
							console.log(`[Git] Skipping ignored path: ${entryPath}`)
							continue
						}

						if (entry.kind === 'file') {
							try {
								// @ts-ignore - removeEntry exists in the API but not in types
								await directoryHandle.removeEntry(entry.name)
							} catch (error) {
								console.error(`[Git] Error removing file ${entry.name}:`, error)
							}
						} else if (entry.kind === 'directory') {
							try {
								// @ts-ignore - removeEntry exists in the API but not in types
								await directoryHandle.removeEntry(entry.name, { recursive: true })
							} catch (error) {
								console.error(`[Git] Error removing directory ${entry.name}:`, error)
							}
						}
					}
				}

				// Create new files from the response
				for (const file of result.files) {
					try {
						const fileHandle = await getOrCreateFileHandleRecursive(directoryHandle, file.path)
						// @ts-ignore - createWritable exists in the API but not in types
						const writable = await fileHandle.createWritable()
						await writable.write(file.content)
						await writable.close()
					} catch (error) {
						console.error(`[Git] Error creating file ${file.path}:`, error)
					}
				}
			}

			// Update repository info with new branch
			const updatedRepoInfo = {
				...gitRepo,
				currentBranch: branchName,
				branches: gitRepo.branches.includes(branchName)
					? gitRepo.branches
					: [...gitRepo.branches, branchName],
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)

			console.log(`[Git] Switched to branch '${branchName}' successfully`)
		} catch (error) {
			console.error(`[Git] Failed to switch to branch '${branchName}':`, error)
			throw error
		}
	}

	// Commit changes to the current branch
	const commitChanges = async (
		message: string,
		files: Array<{ path: string; content: string }>
	): Promise<string> => {
		console.log(`[Git] Committing changes to branch: ${gitRepo?.currentBranch}`)

		if (!gitRepo?.isInitialized) {
			throw new Error('No Git repository has been initialized')
		}

		try {
			// Validate commit message
			if (!message) {
				throw new Error('Commit message is required')
			}

			// Get current branch reference
			const currentRefHash = `refs/heads/${gitRepo.currentBranch}`
			const db = await openDB()
			let transaction = db.transaction(GIT_OBJECTS_STORE, 'readonly')
			let store = transaction.objectStore(GIT_OBJECTS_STORE)

			const refRequest = store.get(currentRefHash)
			const currentRef = await new Promise<any>((resolve, reject) => {
				refRequest.onsuccess = () => resolve(refRequest.result)
				refRequest.onerror = () => reject(refRequest.error)
			})

			if (!currentRef) {
				db.close()
				throw new Error(`Current branch reference not found`)
			}

			// Get current commit
			const commitRequest = store.get(currentRef.target)
			const currentCommit = await new Promise<any>((resolve, reject) => {
				commitRequest.onsuccess = () => resolve(commitRequest.result)
				commitRequest.onerror = () => reject(commitRequest.error)
			})

			if (!currentCommit) {
				db.close()
				throw new Error(`Current commit not found`)
			}

			// Get current tree
			const treeRequest = store.get(currentCommit.tree)
			const currentTree = await new Promise<any>((resolve, reject) => {
				treeRequest.onsuccess = () => resolve(treeRequest.result)
				treeRequest.onerror = () => reject(treeRequest.error)
			})
			db.close()

			if (!currentTree) {
				throw new Error(`Current tree not found`)
			}

			const treeData = JSON.parse(new TextDecoder().decode(new Uint8Array(currentTree.data)))

			// Create blobs for modified files
			const newBlobs = await Promise.all(
				files.map(async (file) => {
					const content = new TextEncoder().encode(file.content)
					const hash = await generateHash(`blob ${content.byteLength}\0${file.content}`)

					await storeGitObject(hash, 'blob', content)

					return {
						path: file.path,
						hash,
						mode: '100644', // Regular file
					}
				})
			)

			// Create new tree with updated files
			const newTreeEntries = [...treeData.tree]

			for (const blob of newBlobs) {
				const existingIndex = newTreeEntries.findIndex((entry: any) => entry.path === blob.path)

				if (existingIndex >= 0) {
					// Update existing file
					newTreeEntries[existingIndex] = {
						...newTreeEntries[existingIndex],
						sha: blob.hash,
					}
				} else {
					// Add new file
					newTreeEntries.push({
						path: blob.path,
						mode: blob.mode,
						type: 'blob',
						sha: blob.hash,
					})
				}
			}

			// Create new tree object
			const newTreeContent = JSON.stringify({ tree: newTreeEntries })
			const newTreeHash = await generateHash(`tree ${newTreeContent.length}\0${newTreeContent}`)
			await storeGitObject(newTreeHash, 'tree', new TextEncoder().encode(newTreeContent))

			// Create new commit object
			const author = {
				name: 'Local User',
				email: 'user@localhost',
				date: new Date().toISOString(),
			}

			const commitObject = {
				message,
				tree: newTreeHash,
				parents: [currentRef.target],
				author,
				committer: author,
			}

			const commitContent = JSON.stringify(commitObject)
			const commitHash = await generateHash(`commit ${commitContent.length}\0${commitContent}`)

			await storeGitObject(commitHash, 'commit', new TextEncoder().encode(commitContent))

			// Update branch reference
			await storeGitObject(currentRefHash, 'ref', new TextEncoder().encode(commitHash))

			// Update repository info
			const updatedRepoInfo = {
				...gitRepo,
				lastCommitDate: new Date(),
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)

			console.log(`[Git] Committed changes successfully`)
			return commitHash
		} catch (error) {
			console.error(`[Git] Failed to commit changes:`, error)
			throw error
		}
	}

	// Commit all files from the selected directory
	const commitLocalDirectory = async (message: string): Promise<string | null> => {
		console.log(`[Git] Committing local directory to branch: ${gitRepo?.currentBranch}`)

		if (!gitRepo?.isInitialized || !gitRepo.repoUrl) {
			throw new Error('No Git repository has been initialized')
		}

		if (!directoryHandle) {
			throw new Error('No directory selected')
		}

		try {
			// Validate commit message
			if (!message) {
				throw new Error('Commit message is required')
			}

			// Check for permission
			const hasPermission = await verifyPermission(directoryHandle)
			if (!hasPermission) {
				throw new Error('Permission denied for directory')
			}

			// Try to find .gitignore file
			let ignorePatterns: string[] = []
			try {
				if (!directoryHandle.getFileHandle) {
					console.log(
						`[Git] Directory handle doesn't support getFileHandle method, skipping .gitignore check`
					)
				} else {
					const gitignoreHandle = await directoryHandle.getFileHandle('.gitignore')
					const gitignoreFile = await gitignoreHandle.getFile()
					const gitignoreContent = await gitignoreFile.text()
					ignorePatterns = parseGitignore(gitignoreContent)
					console.log(`[Git] Found .gitignore with ${ignorePatterns.length} patterns`)
				}
			} catch (error) {
				console.log(`[Git] No .gitignore found, processing all files`)
			}

			// Process all files in the directory
			const files = await processDirectory(directoryHandle, ignorePatterns)
			console.log(`[Git] Found ${files.length} files to commit`)

			if (files.length === 0) {
				throw new Error('No files found to commit')
			}

			// Convert files to the format expected by the push API
			const fileContents = files.map((file) => ({
				path: file.path,
				content: new TextDecoder().decode(file.content),
			}))

			// Call the push API endpoint
			const response = await fetch('http://localhost:3000/api/git/push', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					repoUrl: gitRepo.repoUrl,
					branch: gitRepo.currentBranch,
					commits: [{ message }],
					files: fileContents,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to push changes')
			}

			const result = await response.json()
			console.log(`[Git] Successfully pushed changes to remote repository`)

			// Update repository info with new commit date
			const updatedRepoInfo = {
				...gitRepo,
				lastCommitDate: new Date(),
			}
			setGitRepo(updatedRepoInfo)

			return result.commitSha
		} catch (error) {
			console.error(`[Git] Failed to push changes:`, error)
			throw error
		}
	}

	const contextValue = {
		directoryHandle,
		port,
		gitRepo,
		setDirectoryHandle,
		setPort,
		initializeGitRepo,
		switchBranch,
		commitChanges,
		commitLocalDirectory,
	}

	return (
		<ProjectSettingsContext.Provider value={contextValue}>
			{children}
		</ProjectSettingsContext.Provider>
	)
}

export function useProjectSettings() {
	const context = useContext(ProjectSettingsContext)
	if (context === undefined) {
		throw new Error('useProjectSettings must be used within a ProjectSettingsProvider')
	}
	return context
}
