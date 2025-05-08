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
}

const GitMirrorContext = createContext<GitMirrorContextType | undefined>(undefined)

export function GitMirrorProvider({ children }: { children: ReactNode }) {
	const [isReady, setIsReady] = useState(false)
	const [isRepoInitialized, setIsRepoInitialized] = useState(false)
	const [fileList, setFileList] = useState<string[]>([])
	const [commits, setCommits] = useState<any[]>([])
	const [operationHistory, setOperationHistory] = useState<any[]>([])
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

		// Add event listeners
		gitMirrorDB.on('ready', onReady)
		gitMirrorDB.on('repo-initialized', onRepoInitialized)
		gitMirrorDB.on('file-added', onFileAdded)
		gitMirrorDB.on('committed', onCommitted)

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
