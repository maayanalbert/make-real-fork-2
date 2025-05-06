import { useState, useEffect, useCallback } from 'react'
import { useProjectSettings } from './ProjectSettingsContext'

// Types for Git objects
type GitObjectType = 'blob' | 'tree' | 'commit' | 'ref'

interface GitObject {
	hash: string
	type: GitObjectType
	data: number[] // Serialized data
	path?: string
	size?: number
}

interface GitBlob extends GitObject {
	type: 'blob'
	path: string
	size: number
}

interface GitTree extends GitObject {
	type: 'tree'
	tree: Array<{
		path: string
		type: string
		mode: string
		sha: string
	}>
}

interface GitCommit extends GitObject {
	type: 'commit'
	message: string
	tree: string
	parents: string[]
}

interface GitRef extends GitObject {
	type: 'ref'
	target: string
}

interface GitFile {
	path: string
	content: string | null
	size: number
	sha: string
}

interface UseGitRepositoryReturn {
	isInitialized: boolean
	isLoading: boolean
	error: string | null
	commitSha: string | null
	listFiles: () => Promise<GitFile[]>
	getFileContent: (path: string) => Promise<string | null>
	getCommitInfo: () => Promise<{ message: string; date: Date } | null>
	getBranchName: () => string | null
	getBranches: () => string[]
}

// Constants for IndexedDB
const DB_NAME = 'project-settings-db'
const DB_VERSION = 2
const GIT_OBJECTS_STORE = 'git-objects'

// Helper to open IndexedDB
const openDB = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

// Get a Git object from IndexedDB
const getGitObject = async (hash: string): Promise<GitObject | null> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_OBJECTS_STORE, 'readonly')
		const store = transaction.objectStore(GIT_OBJECTS_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get(hash)

			request.onsuccess = () => {
				db.close()
				resolve(request.result || null)
			}

			request.onerror = () => {
				db.close()
				reject(request.error)
			}
		})
	} catch (error) {
		console.error(`Failed to get Git object ${hash}:`, error)
		return null
	}
}

// Get all Git objects by type
const getGitObjectsByType = async (type: GitObjectType): Promise<GitObject[]> => {
	try {
		const db = await openDB()
		const transaction = db.transaction(GIT_OBJECTS_STORE, 'readonly')
		const store = transaction.objectStore(GIT_OBJECTS_STORE)
		const index = store.index('type')

		return new Promise((resolve, reject) => {
			const request = index.getAll(type)

			request.onsuccess = () => {
				db.close()
				resolve(request.result || [])
			}

			request.onerror = () => {
				db.close()
				reject(request.error)
			}
		})
	} catch (error) {
		console.error(`Failed to get Git objects of type ${type}:`, error)
		return []
	}
}

// Convert array data to string
const arrayBufferToString = (data: number[]): string => {
	return new TextDecoder().decode(new Uint8Array(data))
}

/**
 * Custom hook to work with Git repository data
 */
export function useGitRepository(): UseGitRepositoryReturn {
	const { gitRepo } = useProjectSettings()
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [commitSha, setCommitSha] = useState<string | null>(null)

	// Get the current commit SHA when repository changes
	useEffect(() => {
		const loadCurrentCommit = async () => {
			if (!gitRepo?.isInitialized) {
				setCommitSha(null)
				return
			}

			try {
				setIsLoading(true)
				setError(null)

				// Get the ref for the current branch
				const refHash = `refs/heads/${gitRepo.currentBranch}`
				const refObject = (await getGitObject(refHash)) as GitRef | null

				if (refObject) {
					setCommitSha(refObject.target)
				} else {
					setError('Failed to find branch reference')
				}
			} catch (err) {
				setError(`Error loading commit: ${err instanceof Error ? err.message : String(err)}`)
			} finally {
				setIsLoading(false)
			}
		}

		loadCurrentCommit()
	}, [gitRepo])

	// List all files in the repository
	const listFiles = useCallback(async (): Promise<GitFile[]> => {
		if (!gitRepo?.isInitialized || !commitSha) {
			return []
		}

		try {
			setIsLoading(true)

			// Get the commit object to find the tree
			const commitObject = (await getGitObject(commitSha)) as GitCommit | null

			if (!commitObject) {
				throw new Error(`Commit ${commitSha} not found`)
			}

			// Get the tree object
			const treeObject = (await getGitObject(commitObject.tree)) as GitTree | null

			if (!treeObject) {
				throw new Error(`Tree ${commitObject.tree} not found`)
			}

			// Extract file information from the tree
			return treeObject.tree
				.filter((item) => item.type === 'blob')
				.map((item) => ({
					path: item.path,
					content: null, // Content is loaded on demand
					size: parseInt(item.mode, 8) || 0,
					sha: item.sha,
				}))
		} catch (err) {
			setError(`Error listing files: ${err instanceof Error ? err.message : String(err)}`)
			return []
		} finally {
			setIsLoading(false)
		}
	}, [gitRepo, commitSha])

	// Get the content of a specific file
	const getFileContent = useCallback(
		async (path: string): Promise<string | null> => {
			if (!gitRepo?.isInitialized || !commitSha) {
				return null
			}

			try {
				setIsLoading(true)

				// Get the commit object to find the tree
				const commitObject = (await getGitObject(commitSha)) as GitCommit | null

				if (!commitObject) {
					throw new Error(`Commit ${commitSha} not found`)
				}

				// Get the tree object
				const treeObject = (await getGitObject(commitObject.tree)) as GitTree | null

				if (!treeObject) {
					throw new Error(`Tree ${commitObject.tree} not found`)
				}

				// Find the file entry in the tree
				const fileEntry = treeObject.tree.find((item) => item.path === path && item.type === 'blob')

				if (!fileEntry) {
					throw new Error(`File ${path} not found in tree`)
				}

				// Get the blob object
				const blobObject = (await getGitObject(fileEntry.sha)) as GitBlob | null

				if (!blobObject) {
					throw new Error(`Blob ${fileEntry.sha} not found`)
				}

				// Convert the data to string
				return arrayBufferToString(blobObject.data)
			} catch (err) {
				setError(`Error getting file content: ${err instanceof Error ? err.message : String(err)}`)
				return null
			} finally {
				setIsLoading(false)
			}
		},
		[gitRepo, commitSha]
	)

	// Get information about the current commit
	const getCommitInfo = useCallback(async () => {
		if (!gitRepo?.isInitialized || !commitSha) {
			return null
		}

		try {
			setIsLoading(true)

			// Get the commit object
			const commitObject = (await getGitObject(commitSha)) as GitCommit | null

			if (!commitObject) {
				throw new Error(`Commit ${commitSha} not found`)
			}

			// Parse the commit data to get more details
			const commitData = JSON.parse(arrayBufferToString(commitObject.data))

			return {
				message: commitObject.message || commitData.message || '',
				date: new Date(commitData.author?.date || commitData.committer?.date || Date.now()),
			}
		} catch (err) {
			setError(`Error getting commit info: ${err instanceof Error ? err.message : String(err)}`)
			return null
		} finally {
			setIsLoading(false)
		}
	}, [gitRepo, commitSha])

	// Get the current branch name
	const getBranchName = useCallback((): string | null => {
		return gitRepo?.currentBranch || null
	}, [gitRepo])

	// Get all branches
	const getBranches = useCallback((): string[] => {
		return gitRepo?.branches || []
	}, [gitRepo])

	return {
		isInitialized: !!gitRepo?.isInitialized,
		isLoading,
		error,
		commitSha,
		listFiles,
		getFileContent,
		getCommitInfo,
		getBranchName,
		getBranches,
	}
}
