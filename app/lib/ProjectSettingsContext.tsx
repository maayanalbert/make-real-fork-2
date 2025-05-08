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
	switchBranch: (shapeId: string) => Promise<void>
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
const DB_VERSION = 3
const HANDLE_STORE = 'directory-handles'
const GIT_REPO_STORE = 'git-repo-info'
const FIRST_FRAME_STORE = 'first-frame'

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
			}

			if (oldVersion < 3) {
				// Create first frame store
				if (!db.objectStoreNames.contains(FIRST_FRAME_STORE)) {
					db.createObjectStore(FIRST_FRAME_STORE)
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
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
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
				resolve(result || null)
			}
			request.onerror = () => {
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
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
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		throw error
	}
}

// Store Git repo info in IndexedDB
const storeGitRepoInfo = async (repoInfo: GitRepoInfo): Promise<void> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_REPO_STORE, 'readwrite')
		const store = transaction.objectStore(GIT_REPO_STORE)

		return new Promise((resolve, reject) => {
			const request = store.put(repoInfo, 'currentRepo')

			request.onsuccess = () => {
				resolve()
			}
			request.onerror = () => {
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		throw error
	}
}

// Get Git repo info from IndexedDB
const getGitRepoInfo = async (): Promise<GitRepoInfo | null> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_REPO_STORE, 'readonly')
		const store = transaction.objectStore(GIT_REPO_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get('currentRepo')

			request.onsuccess = () => {
				const result = request.result
				resolve(result || null)
			}
			request.onerror = () => {
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		throw error
	}
}

// Helper function to verify and request permissions if needed
const verifyPermission = async (
	handle: FileSystemDirectoryHandle,
	mode: 'readwrite' | 'read' = 'readwrite'
): Promise<boolean> => {
	if (!handle.queryPermission || !handle.requestPermission) {
		return false
	}

	try {
		let permission = await handle.queryPermission({ mode })

		if (permission === 'prompt') {
			permission = await handle.requestPermission({ mode })
		}

		return permission === 'granted'
	} catch (error) {
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

	return patterns
}

// Check if a path should be ignored based on gitignore patterns
const shouldIgnore = (path: string, patterns: string[]): boolean => {
	// Always ignore node_modules and .env files
	if (path.includes('node_modules') || path === 'node_modules' || path.startsWith('.env')) {
		return true
	}

	// Ignore common image formats
	const imageExtensions = [
		'.jpg',
		'.jpeg',
		'.png',
		'.gif',
		'.bmp',
		'.webp',
		'.svg',
		'.ico',
		'.tiff',
		'.tif',
	]
	if (imageExtensions.some((ext) => path.toLowerCase().endsWith(ext))) {
		return true
	}

	patterns.push('.git')

	return patterns.some((pattern) => {
		// Handle directory patterns
		if (path.startsWith(pattern) || path.startsWith(pattern.slice(1))) {
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
		return regex.test(path)
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
		return files
	}

	for await (const entry of dirHandle.values()) {
		const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

		// Skip if this path should be ignored
		if (shouldIgnore(entryPath, ignorePatterns)) {
			continue
		}

		if (entry.kind === 'file') {
			try {
				// Get file handle and contents
				if (!dirHandle.getFileHandle) {
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
				if (!entryPath.includes('node_modules')) {
					console.error(`[Git] Error processing file ${entryPath}:`, error)
				}
			}
		} else if (entry.kind === 'directory') {
			// Process subdirectory recursively
			if (!dirHandle.getDirectoryHandle) {
				continue
			}

			try {
				const subdirHandle = await dirHandle.getDirectoryHandle(entry.name)
				const subdirFiles = await processDirectory(subdirHandle, ignorePatterns, entryPath)
				files.push(...subdirFiles)
			} catch (error) {
				if (!entryPath.includes('node_modules')) {
					console.error(`[Git] Error processing directory ${entryPath}:`, error)
				}
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
			return false
		}

		const result = await response.json()
		return result.exists
	} catch (error) {
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

// Helper function to store first frame ID
export const storeFirstFrameId = async (frameId: string): Promise<void> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(FIRST_FRAME_STORE, 'readwrite')
		const store = transaction.objectStore(FIRST_FRAME_STORE)

		return new Promise((resolve, reject) => {
			const request = store.put(frameId, 'firstFrame')

			request.onsuccess = () => {
				resolve()
			}
			request.onerror = () => {
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		throw error
	}
}

// Helper function to get first frame ID
const getFirstFrameId = async (): Promise<string | null> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(FIRST_FRAME_STORE, 'readonly')
		const store = transaction.objectStore(FIRST_FRAME_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get('firstFrame')

			request.onsuccess = () => {
				const result = request.result
				resolve(result || null)
			}
			request.onerror = () => {
				reject(request.error)
			}
			transaction.oncomplete = () => {
				db.close()
			}
		})
	} catch (error) {
		throw error
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
			// Load port from localStorage
			const storedPort = localStorage.getItem(PORT_STORAGE_KEY)
			if (storedPort) {
				setPortState(storedPort)
			}

			// Try to load directory handle from IndexedDB
			try {
				const handle = await getDirectoryHandle()
				if (handle) {
					setDirectoryHandleState(handle)
				}
			} catch (error) {
				// Handle error silently
			}

			// Load Git repo info from IndexedDB and verify it exists
			try {
				const repoInfo = await getGitRepoInfo()
				if (repoInfo) {
					// Only verify if repoUrl is non-empty
					if (repoInfo.repoUrl && repoInfo.repoUrl.trim() !== '') {
						const repoExists = await verifyGitRepo(repoInfo.repoUrl)
						if (repoExists) {
							setGitRepo(repoInfo)
						} else {
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
						setGitRepo(null)
					}
				}
			} catch (error) {
				// Handle error silently
			}
		}

		loadSettings()
	}, [])

	// Function to update the directory handle
	const setDirectoryHandle = async (handle: FileSystemDirectoryHandle | null) => {
		setDirectoryHandleState(handle)

		if (handle) {
			try {
				// Ensure we have read/write permission
				const hasPermission = await verifyPermission(handle)

				if (hasPermission) {
					// Store the actual handle in IndexedDB
					await storeDirectoryHandle(handle)
				}
			} catch (error) {
				// Handle error silently
			}
		} else {
			// Clear stored handle if setting to null
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
		try {
			console.log(`[Git] Initializing repository at ${repoUrl} on branch ${branch || 'main'}`)
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
			console.log(`[Git] Stored initial repo info for ${repoUrl}`)

			// Call API to initialize repository with a single file first
			const initApiUrl = `http://localhost:3000/api/git/initialize`

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

			const initResponseJson = await initResponse.json()

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
				}
			}

			const updatedRepoInfo = {
				...newRepoInfo,
				lastCommitDate: new Date(),
				isInitialized: true,
			}

			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)
		} catch (error) {
			throw error
		}
	}

	// Switch to another branch
	const switchBranch = async (shapeId: string) => {
		if (!gitRepo?.isInitialized || !gitRepo.repoUrl) {
			throw new Error('No Git repository has been initialized')
		}

		if (!directoryHandle) {
			throw new Error('No directory selected')
		}

		// Get the first frame ID from the database
		const firstFrameId = await getFirstFrameId()

		// If this is the first frame, use 'main' as the branch name
		const branchName = firstFrameId === shapeId ? 'main' : shapeId.split(':')[1]
		console.log(`[Git] Switching to branch '${branchName}' from '${gitRepo.currentBranch}'`)

		try {
			console.log(`[Branch] Starting switch to ${branchName}`)

			// Step 1: Get tree and file information for both current and target branches
			const response = await fetch('http://localhost:3000/api/git/branch-diff', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					repoUrl: gitRepo.repoUrl,
					targetBranch: branchName,
					currentBranch: gitRepo.currentBranch,
				}),
			})

			if (!response.ok) {
				console.warn(`Failed to get branch data: ${response.status}. The branch may new`)
			}

			const result = await response.json()
			console.log(`[Branch] Got branch diff data with ${result.files?.length || 0} files`)

			// Step 2: Get .gitignore patterns
			let ignorePatterns: string[] = []
			try {
				if (directoryHandle.getFileHandle) {
					const gitignoreHandle = await directoryHandle.getFileHandle('.gitignore')
					const gitignoreFile = await gitignoreHandle.getFile()
					const gitignoreContent = await gitignoreFile.text()
					ignorePatterns = parseGitignore(gitignoreContent)
					console.log(`[Branch] Loaded ${ignorePatterns.length} .gitignore patterns`)
				}
			} catch (error) {
				console.log(`[Branch] No .gitignore found, using default patterns`)
			}

			// Step 4: Process files - only update changed files based on API diff data
			if (result.files && result.files.length > 0) {
				console.log(`[Branch] Processing ${result.files.length} files`)

				// Counter for changes
				let addedCount = 0
				let updatedCount = 0
				let unchangedCount = 0
				let deletedCount = 0

				// Step 4a: Process added and modified files
				for (const file of result.files) {
					if (shouldIgnore(file.path, ignorePatterns)) {
						console.log(`[Branch] Ignoring file ${file.path} (matches ignore pattern)`)
						continue
					}

					if (file.status === 'added') {
						// File is new - create it
						try {
							console.log(`[Branch] Adding new file: ${file.path}`)
							const fileHandle = await getOrCreateFileHandleRecursive(directoryHandle, file.path)
							// @ts-ignore - createWritable exists in the API but not in types
							const writable = await fileHandle.createWritable()
							await writable.write(file.content)
							await writable.close()
							addedCount++
						} catch (error) {
							console.error(`[Branch] Error creating file ${file.path}:`, error)
						}
					} else if (file.status === 'modified') {
						// File exists but has different content - update it
						try {
							console.log(`[Branch] Updating changed file: ${file.path}`)
							const fileHandle = await getOrCreateFileHandleRecursive(directoryHandle, file.path)
							// @ts-ignore - createWritable exists in the API but not in types
							const writable = await fileHandle.createWritable()
							await writable.write(file.content)
							await writable.close()
							updatedCount++
						} catch (error) {
							console.error(`[Branch] Error updating file ${file.path}:`, error)
						}
					} else if (file.status === 'unchanged') {
						// File exists and has the same content - skip
						console.log(`[Branch] Skipping unchanged file: ${file.path}`)
						unchangedCount++
					}
				}

				// Step 4b: Process deleted files
				if (result.deleted && result.deleted.length > 0) {
					for (const path of result.deleted) {
						if (shouldIgnore(path, ignorePatterns)) {
							console.log(`[Branch] Ignoring deleted file ${path} (matches ignore pattern)`)
							continue
						}

						try {
							console.log(`[Branch] Deleting file not in target branch: ${path}`)

							// Split path into directory and filename
							const parts = path.split('/')
							const fileName = parts.pop()!

							// Navigate to the parent directory
							let currentHandle: FileSystemDirectoryHandle = directoryHandle
							for (const part of parts) {
								try {
									if (currentHandle.getDirectoryHandle) {
										currentHandle = await currentHandle.getDirectoryHandle(part)
									} else {
										break
									}
								} catch (error) {
									console.warn(`[Branch] Could not find directory ${part} when deleting ${path}`)
									break
								}
							}

							// Delete the file
							try {
								// @ts-ignore - removeEntry exists in the API but not in types
								await currentHandle.removeEntry(fileName)
								deletedCount++
							} catch (error) {
								console.warn(`[Branch] Could not delete file ${fileName} in ${path}:`, error)
							}
						} catch (error) {
							console.error(`[Branch] Error deleting file ${path}:`, error)
						}
					}
				}

				console.log(
					`[Branch] File operations complete: ${addedCount} added, ${updatedCount} updated, ${unchangedCount} unchanged, ${deletedCount} deleted`
				)
			}

			// Step 5: Update repository info with new branch
			const updatedRepoInfo = {
				...gitRepo,
				currentBranch: branchName,
				branches: gitRepo.branches.includes(branchName)
					? gitRepo.branches
					: [...gitRepo.branches, branchName],
			}
			await storeGitRepoInfo(updatedRepoInfo)
			setGitRepo(updatedRepoInfo)
			console.log(`[Branch] Successfully switched to branch '${branchName}'`)
		} catch (error) {
			console.error(`[Branch] Failed to switch to branch '${branchName}':`, error)
			throw error
		}
	}

	// Commit changes to the current branch
	const commitChanges = async (
		message: string,
		files: Array<{ path: string; content: string }>
	): Promise<string> => {
		if (!gitRepo?.isInitialized) {
			throw new Error('No Git repository has been initialized')
		}

		try {
			console.log(`[Git] Committing ${files.length} files to branch '${gitRepo.currentBranch}'`)
			// Validate commit message
			if (!message) {
				throw new Error('Commit message is required')
			}

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
					files,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to push changes')
			}

			const result = await response.json()

			// Update repository info with new commit date
			const updatedRepoInfo = {
				...gitRepo,
				lastCommitDate: new Date(),
			}
			setGitRepo(updatedRepoInfo)

			return result.commitSha
		} catch (error) {
			throw error
		}
	}

	// Commit all files from the selected directory
	const commitLocalDirectory = async (message: string): Promise<string | null> => {
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
				}
			} catch (error) {
				console.log(`[Git] No .gitignore found, processing all files`)
			}

			// Process all files in the directory
			const files = await processDirectory(directoryHandle, ignorePatterns)

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

			// Update repository info with new commit date
			const updatedRepoInfo = {
				...gitRepo,
				lastCommitDate: new Date(),
			}
			setGitRepo(updatedRepoInfo)

			return result.commitSha
		} catch (error) {
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
