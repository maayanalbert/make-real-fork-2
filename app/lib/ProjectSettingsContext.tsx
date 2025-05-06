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
	createBranch: (branchName: string, fromBranch?: string) => Promise<void>
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
	console.log('Checking path against patterns:', path, patterns)

	// Always ignore node_modules
	if (path.includes('node_modules') || path === 'node_modules') {
		console.log('Ignoring node_modules:', path)
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
		branch: string = 'main',
		directoryHandle?: FileSystemDirectoryHandle
	) => {
		console.log(`[Git] Initializing Git repository from ${repoUrl}, branch ${branch}`)

		try {
			// Create new repo info object
			const newRepoInfo: GitRepoInfo = {
				repoUrl,
				currentBranch: branch,
				branches: [branch],
				lastCommitDate: null,
				isInitialized: false,
			}

			// Store initial repo info
			await storeGitRepoInfo(newRepoInfo)
			setGitRepo(newRepoInfo)

			// Call API to fetch repository data
			const apiUrl = `http://localhost:3000/api/git/initialize`
			console.log(`[Git] Calling API at: ${apiUrl}`)

			// Process directory and get files
			let files: { path: string; content: string; sha: string; size: number }[] = []
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
				files = await Promise.all(
					processedFiles.map(async (file) => ({
						path: file.path,
						content: new TextDecoder().decode(file.content),
						sha: await generateHash(
							`blob ${file.content.byteLength}\0${new TextDecoder().decode(file.content)}`
						),
						size: file.size,
					}))
				)
			}

			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					repoUrl,
					branch,
					files,
				}),
			})

			if (!response.ok) {
				throw new Error(`Failed to initialize repository: ${response.statusText}`)
			}

			const repoData = await response.json()

			// Update repo info
			const updatedRepoInfo = {
				...newRepoInfo,
				lastCommitDate: new Date(),
				isInitialized: true,
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)

			console.log('[Git] Repository initialized successfully')
		} catch (error) {
			console.error('[Git] Failed to initialize repository:', error)
			throw error
		}
	}

	// Create a new branch
	const createBranch = async (branchName: string, fromBranch?: string) => {
		console.log(
			`[Git] Creating new branch: ${branchName} from ${fromBranch || gitRepo?.currentBranch}`
		)

		if (!gitRepo?.isInitialized) {
			throw new Error('No Git repository has been initialized')
		}

		try {
			const sourceBranch = fromBranch || gitRepo.currentBranch

			// Validate branch name
			if (!branchName || !/^[a-zA-Z0-9_\-./]+$/.test(branchName)) {
				throw new Error('Invalid branch name')
			}

			// Check if branch already exists
			if (gitRepo.branches.includes(branchName)) {
				throw new Error(`Branch '${branchName}' already exists`)
			}

			// Get the source branch reference
			const sourceRefHash = `refs/heads/${sourceBranch}`
			const db = await openDB()
			const transaction = db.transaction(GIT_OBJECTS_STORE, 'readonly')
			const store = transaction.objectStore(GIT_OBJECTS_STORE)

			const request = store.get(sourceRefHash)
			const sourceRef = await new Promise<any>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})

			db.close()

			if (!sourceRef) {
				throw new Error(`Source branch '${sourceBranch}' not found`)
			}

			// Create new branch reference pointing to the same commit
			const newRefHash = `refs/heads/${branchName}`
			await storeGitObject(newRefHash, 'ref', new TextEncoder().encode(sourceRef.target))

			// Update repository info
			const updatedRepoInfo = {
				...gitRepo,
				branches: [...gitRepo.branches, branchName],
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)

			console.log(`[Git] Branch '${branchName}' created successfully`)
		} catch (error) {
			console.error(`[Git] Failed to create branch '${branchName}':`, error)
			throw error
		}
	}

	// Switch to another branch
	const switchBranch = async (branchName: string) => {
		console.log(`[Git] Switching to branch: ${branchName}`)

		if (!gitRepo?.isInitialized) {
			throw new Error('No Git repository has been initialized')
		}

		try {
			// Check if branch exists
			if (!gitRepo.branches.includes(branchName)) {
				throw new Error(`Branch '${branchName}' does not exist`)
			}

			// Update repository info
			const updatedRepoInfo = {
				...gitRepo,
				currentBranch: branchName,
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

		if (!gitRepo?.isInitialized) {
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

			// Get current branch reference
			const currentRefHash = `refs/heads/${gitRepo.currentBranch}`
			console.log('[commitLocalDirectory] currentRefHash:', currentRefHash)
			const db = await openDB()
			let transaction = db.transaction(GIT_OBJECTS_STORE, 'readonly')
			let store = transaction.objectStore(GIT_OBJECTS_STORE)

			// Debug the object store and current reference hash
			console.log(`[commitLocalDirectory] Looking for ref: ${currentRefHash} in object store`)

			// Check if the reference exists first
			const checkRequest = store.count(currentRefHash)
			const count = await new Promise<number>((resolve, reject) => {
				checkRequest.onsuccess = () => resolve(checkRequest.result)
				checkRequest.onerror = () => {
					console.error('[commitLocalDirectory] Count error:', checkRequest.error)
					reject(checkRequest.error)
				}
			})

			console.log(`[commitLocalDirectory] Found ${count} matching references`)

			// If the reference doesn't exist, create an initial commit first
			if (count === 0) {
				console.log(`[Git] Reference not found, creating initial commit`)
				db.close()

				// Create initial tree
				const initialTreeData = { tree: [] }
				const initialTreeContent = JSON.stringify(initialTreeData)
				const initialTreeHash = await generateHash(
					`tree ${initialTreeContent.length}\0${initialTreeContent}`
				)
				await storeGitObject(initialTreeHash, 'tree', new TextEncoder().encode(initialTreeContent))

				// Create initial commit
				const author = {
					name: 'Local User',
					email: 'user@localhost',
					date: new Date().toISOString(),
				}

				const initialCommitObject = {
					message: 'Initial commit',
					tree: initialTreeHash,
					parents: [],
					author,
					committer: author,
				}

				const initialCommitContent = JSON.stringify(initialCommitObject)
				const initialCommitHash = await generateHash(
					`commit ${initialCommitContent.length}\0${initialCommitContent}`
				)

				await storeGitObject(
					initialCommitHash,
					'commit',
					new TextEncoder().encode(initialCommitContent)
				)

				// Create branch reference
				await storeGitObject(currentRefHash, 'ref', new TextEncoder().encode(initialCommitHash))

				// Now continue with the actual file commit
				transaction = (await openDB()).transaction(GIT_OBJECTS_STORE, 'readonly')
				store = transaction.objectStore(GIT_OBJECTS_STORE)

				console.log('[commitLocalDirectory] After initial commit, looking for ref:', currentRefHash)
				const refRequest = store.get(currentRefHash)
				const currentRef = await new Promise<any>((resolve, reject) => {
					refRequest.onsuccess = () => resolve(refRequest.result)
					refRequest.onerror = () => reject(refRequest.error)
				})
				console.log('[commitLocalDirectory] currentRef after initial commit:', currentRef)
				if (!currentRef) {
					db.close()
					throw new Error(
						`[commitLocalDirectory] Current branch reference not found even after creation`
					)
				}

				// Create an empty tree for the initial commit
				const initialTree = {
					hash: initialTreeHash,
					type: 'tree',
					data: Array.from(new TextEncoder().encode(initialTreeContent)),
					tree: [],
				}

				// Create new tree with files
				const newBlobs = await Promise.all(
					files.map(async (file) => {
						const hash = await generateHash(
							`blob ${file.content.byteLength}\0${new TextDecoder().decode(file.content)}`
						)
						await storeGitObject(hash, 'blob', file.content)

						return {
							path: file.path,
							hash,
							mode: '100644', // Regular file
						}
					})
				)

				// Create tree entries for all files
				const newTreeEntries = newBlobs.map((blob) => ({
					path: blob.path,
					mode: blob.mode,
					type: 'blob',
					sha: blob.hash,
				}))

				// Create new tree object
				const newTreeContent = JSON.stringify({ tree: newTreeEntries })
				const newTreeHash = await generateHash(`tree ${newTreeContent.length}\0${newTreeContent}`)
				await storeGitObject(newTreeHash, 'tree', new TextEncoder().encode(newTreeContent))

				// Create new commit object
				const commitObject = {
					message,
					tree: newTreeHash,
					parents: [initialCommitHash],
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

				console.log(`[Git] Committed local directory successfully with initial commit`)
				return commitHash
			}

			const refRequest = store.get(currentRefHash)
			if (!currentRefHash) {
				throw new Error(
					'[commitLocalDirectory] currentRefHash is undefined or null before store.get'
				)
			}
			const currentRef = await new Promise<any>((resolve, reject) => {
				refRequest.onsuccess = () => resolve(refRequest.result)
				refRequest.onerror = () => reject(refRequest.error)
			})
			console.log('[commitLocalDirectory] currentRef:', currentRef)
			if (!currentRef) {
				db.close()
				throw new Error(`[commitLocalDirectory] Current branch reference not found`)
			}

			let refTarget = currentRef.target
			if (!refTarget && currentRef.data) {
				refTarget = new TextDecoder().decode(currentRef.data)
			}

			// Get current commit
			const commitRequest = store.get(refTarget)
			console.log('[commitLocalDirectory] Getting commit for target:', refTarget)
			const currentCommit = await new Promise<any>((resolve, reject) => {
				commitRequest.onsuccess = () => resolve(commitRequest.result)
				commitRequest.onerror = () => reject(commitRequest.error)
			})
			console.log('[commitLocalDirectory] currentCommit:', currentCommit)
			if (!currentCommit) {
				db.close()
				throw new Error(`[commitLocalDirectory] Current commit not found`)
			}

			// Decode commit data to get the actual commit object
			let commitData = currentCommit
			if (currentCommit.data) {
				const decoded = new TextDecoder().decode(currentCommit.data)
				try {
					commitData = JSON.parse(decoded)
				} catch (e) {
					db.close()
					throw new Error(`[commitLocalDirectory] Failed to parse commit data: ${e}`)
				}
			}

			if (!commitData.tree) {
				db.close()
				throw new Error(`[commitLocalDirectory] Commit object does not have a tree property`)
			}

			// Get current tree
			const treeRequest = store.get(commitData.tree)
			console.log('[commitLocalDirectory] Getting tree for:', commitData.tree)
			const currentTree = await new Promise<any>((resolve, reject) => {
				treeRequest.onsuccess = () => resolve(treeRequest.result)
				treeRequest.onerror = () => reject(treeRequest.error)
			})
			console.log('[commitLocalDirectory] currentTree:', currentTree)
			db.close()
			if (!currentTree) {
				throw new Error(`[commitLocalDirectory] Current tree not found`)
			}

			const treeData = JSON.parse(new TextDecoder().decode(new Uint8Array(currentTree.data)))

			// Create blobs for all files
			const newBlobs = await Promise.all(
				files.map(async (file) => {
					const hash = await generateHash(
						`blob ${file.content.byteLength}\0${new TextDecoder().decode(file.content)}`
					)
					await storeGitObject(hash, 'blob', file.content)

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
				parents: [refTarget],
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

			console.log(`[Git] Committed local directory successfully`)
			return commitHash
		} catch (error) {
			console.error(`[Git] Failed to commit local directory:`, error)
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
		createBranch,
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
