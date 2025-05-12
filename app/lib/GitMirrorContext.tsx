'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getGitMirrorDB } from './GitMirrorDB'
import { useProjectSettings } from './ProjectSettingsContext'
import { readFilesRecursively } from './GitMirrorUtils'

// Define context type
type GitMirrorContextType = {
	isReady: boolean
	isRepoInitialized: boolean
	initRepoWithFiles: () => Promise<void>
	addFile: (fileName: string, content: string) => Promise<void>
	commit: (message: string, author: { name: string; email: string }) => Promise<string>
	listFiles: () => Promise<string[]>
	getFileContent: (fileName: string) => Promise<string>
	log: () => Promise<any[]>
	status: () => Promise<any>
	getOperationHistory: () => Promise<any[]>
	fileList: string[]
	commits: any[]
	operationHistory: any[]
	refreshData: () => Promise<void>
	listBranches: () => Promise<string[]>
	createBranch: (branchName: string) => Promise<void>
	checkout: (branchName: string) => Promise<void>
	getCurrentBranch: () => Promise<string>
	branches: string[]
	currentBranch: string
}

const GitMirrorContext = createContext<GitMirrorContextType | undefined>(undefined)

export function GitMirrorProvider({ children }: { children: ReactNode }) {
	const [isReady, setIsReady] = useState(false)
	const [isRepoInitialized, setIsRepoInitialized] = useState(false)
	const [fileList, setFileList] = useState<string[]>([])
	const [commits, setCommits] = useState<any[]>([])
	const [operationHistory, setOperationHistory] = useState<any[]>([])
	const [branches, setBranches] = useState<string[]>([])
	const [currentBranch, setCurrentBranch] = useState<string>('main')
	const { directoryHandle } = useProjectSettings()

	// Get DB instance
	const gitMirrorDB = getGitMirrorDB()

	// Initialize and setup event listeners
	useEffect(() => {
		// Setup event listeners
		const onReady = () => {
			console.log('[GitMirrorContext] DB is ready')
			setIsReady(true)
			checkRepoStatus()
		}

		const onRepoInitialized = () => {
			console.log('[GitMirrorContext] Repository initialized')
			setIsRepoInitialized(true)
			// refreshData will be triggered by the useEffect that watches isRepoInitialized
		}

		const onFileAdded = () => {
			console.log('[GitMirrorContext] File added')
			refreshData()
		}

		const onCommitted = () => {
			console.log('[GitMirrorContext] Changes committed')
			refreshData()
		}

		const onBranchCreated = () => {
			console.log('[GitMirrorContext] Branch created')
			refreshData()
		}

		const onBranchCheckedOut = () => {
			console.log('[GitMirrorContext] Branch checked out')
			refreshData()
		}

		// Add event listeners
		gitMirrorDB.on('ready', onReady)
		gitMirrorDB.on('repo-initialized', onRepoInitialized)
		gitMirrorDB.on('file-added', onFileAdded)
		gitMirrorDB.on('committed', onCommitted)
		gitMirrorDB.on('branch-created', onBranchCreated)
		gitMirrorDB.on('branch-checked-out', onBranchCheckedOut)

		// Check initial status if DB is already ready
		if (gitMirrorDB.getFS()) {
			setIsReady(true)
			checkRepoStatus()
		}

		// Cleanup event listeners
		return () => {
			gitMirrorDB.off('ready', onReady)
			gitMirrorDB.off('repo-initialized', onRepoInitialized)
			gitMirrorDB.off('file-added', onFileAdded)
			gitMirrorDB.off('committed', onCommitted)
			gitMirrorDB.off('branch-created', onBranchCreated)
			gitMirrorDB.off('branch-checked-out', onBranchCheckedOut)
		}
	}, [])

	// Check if repo exists
	const checkRepoStatus = async () => {
		try {
			// Use the dedicated method to check if repo is initialized
			const initialized = await gitMirrorDB.isRepoInitialized()
			setIsRepoInitialized(initialized)
		} catch (error) {
			console.log('[GitMirrorContext] Repository not initialized yet')
			setIsRepoInitialized(false)
		}
	}

	// Refresh all data
	const refreshData = async () => {
		if (!isReady || !isRepoInitialized) return

		try {
			// Wrap each operation in its own try/catch to prevent one failure from stopping others
			try {
				// Get files
				const files = await gitMirrorDB.listFiles()
				setFileList(files)
			} catch (error) {
				console.error('[GitMirrorContext] Failed to list files:', error)
			}

			try {
				// Get commits
				const log = await gitMirrorDB.log()
				setCommits(log)
			} catch (error) {
				console.error('[GitMirrorContext] Failed to get log:', error)
				// If log fails (which happens when HEAD is missing), set empty commits
				setCommits([])
			}

			try {
				// Get operation history
				const history = await gitMirrorDB.getOperationHistory()
				setOperationHistory(history)
			} catch (error) {
				console.error('[GitMirrorContext] Failed to get operation history:', error)
			}

			try {
				// Get branches
				const branchesList = await gitMirrorDB.listBranches()
				setBranches(branchesList)
			} catch (error) {
				console.error('[GitMirrorContext] Failed to list branches:', error)
			}

			try {
				// Get current branch
				const branch = await gitMirrorDB.getCurrentBranch()
				setCurrentBranch(branch)
			} catch (error) {
				console.error('[GitMirrorContext] Failed to get current branch:', error)
			}
		} catch (error) {
			console.error('[GitMirrorContext] Failed to refresh data:', error)
		}
	}

	// Initialize repository with project files
	const initRepoWithFiles = async () => {
		try {
			console.log('[GitMirrorContext] Initializing repository with project files')

			// First initialize the repository
			await gitMirrorDB.initRepo()
			setIsRepoInitialized(true)

			// Check if we have a directory handle from project settings
			if (!directoryHandle) {
				console.warn('[GitMirrorContext] No directory handle available')
				return
			}

			// Read files from the directory handle
			console.log('[GitMirrorContext] Reading files from directory')

			// Type cast to work with our utility function
			// This is safe because our utility checks for the presence of required methods
			const dirHandle = directoryHandle as unknown as Parameters<typeof readFilesRecursively>[0]
			const files = await readFilesRecursively(dirHandle)

			console.log(`[GitMirrorContext] Found ${files.length} files to add`)

			// Add files to the repository
			for (const file of files) {
				console.log(`[GitMirrorContext] Adding file: ${file.path}`)
				await gitMirrorDB.addFile(file.path, file.content)
			}

			// Make initial commit if files were added
			if (files.length > 0) {
				console.log('[GitMirrorContext] Making initial commit')
				await gitMirrorDB.commit('Initial commit', {
					name: 'Git Mirror',
					email: 'git-mirror@example.com',
				})

				console.log('[GitMirrorContext] Repository initialized with project files')
			}
		} catch (error) {
			console.error('[GitMirrorContext] Failed to initialize repository with files:', error)
			throw error
		}
	}

	// Add file
	const addFile = async (fileName: string, content: string) => {
		try {
			await gitMirrorDB.addFile(fileName, content)
		} catch (error) {
			console.error('[GitMirrorContext] Failed to add file:', error)
			throw error
		}
	}

	// Commit changes
	const commit = async (message: string, author: { name: string; email: string }) => {
		try {
			return await gitMirrorDB.commit(message, author)
		} catch (error) {
			console.error('[GitMirrorContext] Failed to commit:', error)
			throw error
		}
	}

	// List files
	const listFiles = async () => {
		try {
			const files = await gitMirrorDB.listFiles()
			setFileList(files)
			return files
		} catch (error) {
			console.error('[GitMirrorContext] Failed to list files:', error)
			throw error
		}
	}

	// Get file content
	const getFileContent = async (fileName: string) => {
		try {
			return await gitMirrorDB.getFileContent(fileName)
		} catch (error) {
			console.error('[GitMirrorContext] Failed to get file content:', error)
			throw error
		}
	}

	// Get commit log
	const log = async () => {
		try {
			const log = await gitMirrorDB.log()
			setCommits(log)
			return log
		} catch (error) {
			console.error('[GitMirrorContext] Failed to get log:', error)
			throw error
		}
	}

	// Get status
	const status = async () => {
		try {
			return await gitMirrorDB.status()
		} catch (error) {
			console.error('[GitMirrorContext] Failed to get status:', error)
			throw error
		}
	}

	// Get operation history
	const getOperationHistory = async () => {
		try {
			const history = await gitMirrorDB.getOperationHistory()
			setOperationHistory(history)
			return history
		} catch (error) {
			console.error('[GitMirrorContext] Failed to get operation history:', error)
			throw error
		}
	}

	// Get list of branches
	const listBranches = async () => {
		try {
			const branches = await gitMirrorDB.listBranches()
			setBranches(branches)
			return branches
		} catch (error) {
			console.error('[GitMirrorContext] Failed to list branches:', error)
			throw error
		}
	}

	// Create a new branch
	const createBranch = async (branchName: string) => {
		try {
			await gitMirrorDB.createBranch(branchName)

			// Update branches list
			await listBranches()
		} catch (error) {
			console.error('[GitMirrorContext] Failed to create branch:', error)
			throw error
		}
	}

	// Checkout a branch
	const checkout = async (branchName: string) => {
		try {
			// First get the list of files in the current branch before switching
			const currentBranchName = await gitMirrorDB.getCurrentBranch()
			const currentBranchFiles = await gitMirrorDB.listFiles()
			const currentFilesMap = new Map<string, string>()

			// Build a map of current branch file contents for comparison
			if (directoryHandle && currentBranchName !== branchName) {
				console.log(
					`[GitMirrorContext] Preparing for efficient branch switch from ${currentBranchName} to ${branchName}`
				)
				for (const fileName of currentBranchFiles) {
					try {
						const content = await gitMirrorDB.getFileContent(fileName)
						currentFilesMap.set(fileName, content)
					} catch (error) {
						console.error(
							`[GitMirrorContext] Failed to read file content for comparison: ${fileName}`,
							error
						)
					}
				}
			}

			// Perform the actual branch checkout
			await gitMirrorDB.checkout(branchName)

			// Update current branch after checkout
			const branch = await gitMirrorDB.getCurrentBranch()
			setCurrentBranch(branch)

			// Also refresh file list since different branches might have different files
			const files = await gitMirrorDB.listFiles()
			setFileList(files)

			// If we have a directory handle, write the branch files to the local filesystem
			if (directoryHandle) {
				console.log(`[GitMirrorContext] Updating local filesystem for branch ${branchName}`)

				// Keep track of changed files
				let filesWritten = 0
				let filesSkipped = 0
				let filesAdded = 0

				// Check each file in the new branch
				for (const fileName of files) {
					try {
						const content = await gitMirrorDB.getFileContent(fileName)

						// Check if the file exists in the previous branch with the same content
						const previousContent = currentFilesMap.get(fileName)

						if (currentBranchName === branchName) {
							// Just checking out the same branch again - write all files
							await writeFileToLocalFilesystem(directoryHandle, fileName, content)
							filesWritten++
						} else if (!previousContent) {
							// File is new in this branch - write it
							await writeFileToLocalFilesystem(directoryHandle, fileName, content)
							filesAdded++
						} else if (previousContent !== content) {
							// File exists in both branches but has changed - write it
							await writeFileToLocalFilesystem(directoryHandle, fileName, content)
							filesWritten++
						} else {
							// File exists in both branches with identical content - skip
							filesSkipped++
						}

						// Remove this file from the map as we've processed it
						currentFilesMap.delete(fileName)
					} catch (error) {
						console.error(`[GitMirrorContext] Failed to write file ${fileName}:`, error)
					}
				}

				// Any files remaining in the map were in the old branch but not in the new one
				// These files should be deleted from the filesystem
				const filesRemoved = currentFilesMap.size

				// Delete files that are in the old branch but not in the new branch
				if (filesRemoved > 0 && currentBranchName !== branchName) {
					console.log(
						`[GitMirrorContext] Removing ${filesRemoved} files that don't exist in the new branch`
					)

					// Convert map keys to array before iterating
					const filesToRemove = Array.from(currentFilesMap.keys())
					for (const fileName of filesToRemove) {
						try {
							await deleteFileFromLocalFilesystem(directoryHandle, fileName)
							console.log(`[GitMirrorContext] Deleted file: ${fileName}`)
						} catch (error) {
							console.error(`[GitMirrorContext] Failed to delete file ${fileName}:`, error)
						}
					}
				}

				console.log(
					`[GitMirrorContext] Branch switch complete: ${filesAdded} files added, ${filesWritten} files updated, ${filesSkipped} files unchanged, ${filesRemoved} files removed`
				)
			} else {
				console.log(
					`[GitMirrorContext] No directory handle available, skipping write to local filesystem`
				)
			}
		} catch (error) {
			console.error('[GitMirrorContext] Failed to checkout branch:', error)
			throw error
		}
	}

	// Helper function to write a file to the local filesystem
	const writeFileToLocalFilesystem = async (
		directoryHandle: any,
		filePath: string,
		content: string
	): Promise<void> => {
		// Split the path into directories and filename
		const pathParts = filePath.split('/')
		const fileName = pathParts.pop() || ''

		// Navigate to the correct directory
		let currentDirHandle = directoryHandle
		for (const dir of pathParts) {
			if (dir) {
				try {
					// Try to get the subdirectory, create it if it doesn't exist
					currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true })
				} catch (err) {
					console.error(`[GitMirrorContext] Error accessing/creating directory ${dir}:`, err)
					throw err
				}
			}
		}

		// Create/open the file
		const fileHandle = await currentDirHandle.getFileHandle(fileName, { create: true })

		// Create a writable stream
		const writable = await fileHandle.createWritable()

		// Write the content
		await writable.write(content)

		// Close the file
		await writable.close()

		console.log(`[GitMirrorContext] Successfully wrote file: ${filePath}`)
	}

	// Helper function to delete a file from the local filesystem
	const deleteFileFromLocalFilesystem = async (
		directoryHandle: any,
		filePath: string
	): Promise<void> => {
		// Split the path into directories and filename
		const pathParts = filePath.split('/')
		const fileName = pathParts.pop() || ''

		// Navigate to the correct directory
		let currentDirHandle = directoryHandle
		for (const dir of pathParts) {
			if (dir) {
				try {
					// Try to get the subdirectory, create it if it doesn't exist
					currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true })
				} catch (err) {
					console.error(`[GitMirrorContext] Error accessing/creating directory ${dir}:`, err)
					throw err
				}
			}
		}

		// Delete the file
		await currentDirHandle.removeEntry(fileName)

		console.log(`[GitMirrorContext] Successfully deleted file: ${filePath}`)
	}

	// Get current branch
	const getCurrentBranch = async () => {
		try {
			const branch = await gitMirrorDB.getCurrentBranch()
			setCurrentBranch(branch)
			return branch
		} catch (error) {
			console.error('[GitMirrorContext] Failed to get current branch:', error)
			throw error
		}
	}

	const contextValue: GitMirrorContextType = {
		isReady,
		isRepoInitialized,
		initRepoWithFiles,
		addFile,
		commit,
		listFiles,
		getFileContent,
		log,
		status,
		getOperationHistory,
		fileList,
		commits,
		operationHistory,
		refreshData,
		listBranches,
		createBranch,
		checkout,
		getCurrentBranch,
		branches,
		currentBranch,
	}

	return <GitMirrorContext.Provider value={contextValue}>{children}</GitMirrorContext.Provider>
}

export function useGitMirror() {
	const context = useContext(GitMirrorContext)
	if (context === undefined) {
		throw new Error('useGitMirror must be used within a GitMirrorProvider')
	}
	return context
}
