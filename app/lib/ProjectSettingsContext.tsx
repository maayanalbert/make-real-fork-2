'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { FileSystemDirectoryHandle, PermissionState, FileSystemFileHandle } from './types'

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
const DB_VERSION = 3
const HANDLE_STORE = 'directory-handles'

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

const verifyPermission = async (
	handle: FileSystemDirectoryHandle,
	mode: 'readwrite' | 'read' = 'readwrite'
): Promise<boolean> => {
	try {
		// Check if we already have permission
		const permissionState = await handle.queryPermission({ mode })
		if (permissionState === 'granted') {
			return true
		}

		// Request permission if we don't have it
		const newPermissionState = await handle.requestPermission({ mode })
		return newPermissionState === 'granted'
	} catch (error) {
		console.error('Error verifying permission:', error)
		return false
	}
}

export function ProjectSettingsProvider({ children }: { children: ReactNode }) {
	const [directoryHandle, setDirectoryHandleState] = useState<FileSystemDirectoryHandle | null>(
		null
	)
	const [port, setPortState] = useState<string>('3000')

	// Load settings on mount
	useEffect(() => {
		const loadSettings = async () => {
			try {
				// Load directory handle from IndexedDB
				const handle = await getDirectoryHandle()
				if (handle) {
					// Verify we still have permission
					const hasPermission = await verifyPermission(handle)
					if (hasPermission) {
						setDirectoryHandleState(handle)
					} else {
						// If we lost permission, remove the handle
						await removeDirectoryHandle()
					}
				}

				// Load port from localStorage
				const storedPort = localStorage.getItem(PORT_STORAGE_KEY)
				if (storedPort) {
					setPortState(storedPort)
				}
			} catch (error) {
				console.error('Error loading settings:', error)
			}
		}

		loadSettings()
	}, [])

	const setDirectoryHandle = async (handle: FileSystemDirectoryHandle | null) => {
		if (handle) {
			try {
				// Verify we have permission
				const hasPermission = await verifyPermission(handle)
				if (!hasPermission) {
					throw new Error('Permission denied')
				}

				// Store the handle
				await storeDirectoryHandle(handle)
				setDirectoryHandleState(handle)
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

	return (
		<ProjectSettingsContext.Provider
			value={{
				directoryHandle,
				port,
				setDirectoryHandle,
				setPort,
			}}
		>
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
