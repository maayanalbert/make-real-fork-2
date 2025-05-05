import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Add TypeScript declaration for File System Access API
declare global {
	interface Window {
		showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
	}
	interface FileSystemDirectoryHandle {
		queryPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>
		requestPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>
	}
}

// Permission states
type PermissionState = 'granted' | 'denied' | 'prompt'

type ProjectSettingsContextType = {
	directoryHandle: FileSystemDirectoryHandle | null
	port: string
	setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
	setPort: (port: string) => void
}

const ProjectSettingsContext = createContext<ProjectSettingsContextType | undefined>(undefined)

// Storage keys
const PORT_STORAGE_KEY = 'project-port'
const DIRECTORY_HANDLE_KEY = 'project-directory-handle'
const DB_NAME = 'project-settings-db'
const DB_VERSION = 1
const HANDLE_STORE = 'directory-handles'

// Helper function to open the IndexedDB database
const openDB = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		console.log('[IndexedDB] Opening database:', DB_NAME, DB_VERSION)
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => {
			console.error('[IndexedDB] Error opening database:', request.error)
			reject(request.error)
		}
		request.onsuccess = () => {
			console.log('[IndexedDB] Database opened successfully')
			resolve(request.result)
		}

		request.onupgradeneeded = () => {
			console.log('[IndexedDB] Database upgrade needed')
			const db = request.result
			if (!db.objectStoreNames.contains(HANDLE_STORE)) {
				console.log('[IndexedDB] Creating object store:', HANDLE_STORE)
				db.createObjectStore(HANDLE_STORE)
			}
		}
	})
}

// Helper function to store a handle in IndexedDB
const storeDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
	console.log('[IndexedDB] Storing directory handle:', handle)
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readwrite')
		const store = transaction.objectStore(HANDLE_STORE)

		console.log('[IndexedDB] Storing with key:', DIRECTORY_HANDLE_KEY)

		return new Promise((resolve, reject) => {
			const request = store.put(handle, DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				console.log('[IndexedDB] Handle stored successfully')
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error storing handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				console.log('[IndexedDB] Transaction completed')
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
	console.log('[IndexedDB] Retrieving directory handle')
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readonly')
		const store = transaction.objectStore(HANDLE_STORE)

		return new Promise((resolve, reject) => {
			const request = store.get(DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				const result = request.result
				console.log('[IndexedDB] Handle retrieved:', result ? 'Found' : 'Not found')
				if (result)
					console.log('[IndexedDB] Handle details:', { name: result.name, kind: result.kind })
				resolve(result || null)
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error retrieving handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				console.log('[IndexedDB] Read transaction completed')
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
	console.log('[IndexedDB] Removing directory handle')
	try {
		const db = await openDB()
		const transaction = db.transaction(HANDLE_STORE, 'readwrite')
		const store = transaction.objectStore(HANDLE_STORE)

		return new Promise((resolve, reject) => {
			const request = store.delete(DIRECTORY_HANDLE_KEY)

			request.onsuccess = () => {
				console.log('[IndexedDB] Handle removed successfully')
				resolve()
			}
			request.onerror = () => {
				console.error('[IndexedDB] Error removing handle:', request.error)
				reject(request.error)
			}
			transaction.oncomplete = () => {
				console.log('[IndexedDB] Delete transaction completed')
				db.close()
			}
		})
	} catch (error) {
		console.error('[IndexedDB] Failed to remove directory handle:', error)
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

export function ProjectSettingsProvider({ children }: { children: ReactNode }) {
	const [directoryHandle, setDirectoryHandleState] = useState<FileSystemDirectoryHandle | null>(
		null
	)
	const [port, setPortState] = useState<string>('3000')

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

	const contextValue = {
		directoryHandle,
		port,
		setDirectoryHandle,
		setPort,
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
