import { useState, useEffect, useRef } from 'react'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditor } from 'tldraw'

// Import the type from the context file
type FileSystemDirectoryHandle = {
	kind: 'directory'
	name: string
	queryPermission?: (descriptor: {
		mode: 'readwrite' | 'read'
	}) => Promise<'granted' | 'denied' | 'prompt'>
	requestPermission?: (descriptor: {
		mode: 'readwrite' | 'read'
	}) => Promise<'granted' | 'denied' | 'prompt'>
}

interface FileSelectionModalProps {
	isOpen?: boolean
	setIsOpen?: (isOpen: boolean) => void
}

export function ProjectSettingsModal({
	isOpen: externalIsOpen,
	setIsOpen: externalSetIsOpen,
}: FileSelectionModalProps = {}) {
	const { directoryHandle, port, setDirectoryHandle, setPort, initializeGitRepo } =
		useProjectSettings()
	const [newPort, setNewPort] = useState(port)
	const [internalIsOpen, setInternalIsOpen] = useState(false)
	const [selectedHandle, setSelectedHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [permissionError, setPermissionError] = useState<string | null>(null)
	const [rejectedPath, setRejectedPath] = useState<string | null>(null)
	const [hasPreviewShapes, setHasPreviewShapes] = useState(false)
	const [repoUrl, setRepoUrl] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const editor = useEditor()
	const modalRef = useRef<HTMLDivElement>(null)

	// Determine if modal is open based on props or internal state
	const isModalOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
	const setModalOpen = (open: boolean) => {
		if (externalSetIsOpen !== undefined) {
			externalSetIsOpen(open)
		} else {
			setInternalIsOpen(open)
		}
	}

	// Update newPort when port changes in context
	useEffect(() => {
		setNewPort(port)
	}, [port])

	// Show modal on initial load if no directory is set
	useEffect(() => {
		if (!directoryHandle) {
			setModalOpen(true)
		}
	}, [directoryHandle])

	// Check existing directory handle permission on mount and modal open
	useEffect(() => {
		const checkExistingPermission = async () => {
			if (directoryHandle && isModalOpen) {
				await verifyPermission(directoryHandle as FileSystemDirectoryHandle)
			}
		}

		checkExistingPermission()
	}, [directoryHandle, isModalOpen])

	// Handle click outside of modal
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				modalRef.current &&
				!modalRef.current.contains(event.target as Node) &&
				directoryHandle &&
				!isLoading
			) {
				setModalOpen(false)
			}
		}

		if (isModalOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isModalOpen, directoryHandle])

	// Check if there are any preview shapes
	useEffect(() => {
		if (editor) {
			const previewShapes = editor
				.getCurrentPageShapes()
				.filter((shape) => shape.type === 'response')
			setHasPreviewShapes(previewShapes.length > 0)
		}
	}, [editor, isModalOpen])

	// Function to check permission for a directory handle
	const verifyPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
		if (!handle.queryPermission || !handle.requestPermission) {
			setError('You must allow folder access to continue.')
			return false
		}

		try {
			// First check current permission status
			let permission = await handle.queryPermission({ mode: 'readwrite' })

			// If we need to ask, request permission from user
			if (permission === 'prompt') {
				permission = await handle.requestPermission({ mode: 'readwrite' })
			}

			if (permission !== 'granted') {
				setError('You must allow folder access to continue.')
				return false
			}

			setError(null)
			return true
		} catch (error) {
			setError('You must allow folder access to continue.')
			return false
		}
	}

	// Function to open the directory picker
	const openDirectoryPicker = async () => {
		try {
			// @ts-ignore - showDirectoryPicker may not be recognized in TypeScript definitions
			const dirHandle = (await window.showDirectoryPicker()) as FileSystemDirectoryHandle
			// Check permission immediately after selection
			const hasPermission = await verifyPermission(dirHandle)
			if (hasPermission) {
				setSelectedHandle(dirHandle)
				// Automatically set repo URL based on the folder name
				setRepoUrl(`https://github.com/maayan-albert-dev/${dirHandle.name}.git`)
				setError(null)
			} else {
				setError('You must allow folder access to continue.')
			}
		} catch (error) {
			setError('You must allow folder access to continue.')
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setIsLoading(true)

		try {
			// Only save if directory and port are set and we have permissions
			const handleToCheck = selectedHandle || directoryHandle

			if (handleToCheck && newPort) {
				// Verify permission before proceeding
				const hasPermission = await verifyPermission(handleToCheck as FileSystemDirectoryHandle)
				if (!hasPermission) {
					setError('Permission denied. You must allow access to the selected folder to continue.')
					setIsLoading(false)
					return
				}

				// Use the new selected handle or keep the existing one
				if (selectedHandle) {
					await setDirectoryHandle(selectedHandle)
				}

				setPort(newPort)

				// Initialize Git repository if URL is provided
				if (repoUrl) {
					try {
						await initializeGitRepo(repoUrl, 'main', handleToCheck)
					} catch (error) {
						setError('Failed to initialize Git repository. Please check the URL and try again.')
						setIsLoading(false)
						return
					}
				}

				setModalOpen(false)
			}
		} catch (error) {
			setError('An error occurred while saving settings.')
		} finally {
			setIsLoading(false)
		}
	}

	// Function to retry permission request
	const retryPermission = async () => {
		const handleToCheck = selectedHandle || directoryHandle
		if (handleToCheck) {
			await verifyPermission(handleToCheck as FileSystemDirectoryHandle)
		}
	}

	const canSubmit = !!(directoryHandle || selectedHandle) && !!newPort && !permissionError
	const isDirectorySet = !!directoryHandle
	const displayPath = selectedHandle?.name || directoryHandle?.name || ''

	return (
		<>
			<AnimatePresence>
				{!isModalOpen && isDirectorySet && (
					<motion.button
						className="fixed top-5 left-5 bg-white border border-gray-300 px-4 py-2 rounded-md cursor-pointer z-100 text-sm shadow-sm hover:shadow-md transition-shadow"
						onClick={() => setModalOpen(true)}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5 }}
					>
						Project Settings
					</motion.button>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{isModalOpen && (
					<motion.div
						className="fixed inset-0 bg-black/50 flex justify-center items-center z-50"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
					>
						<motion.div
							ref={modalRef}
							className="bg-white p-7 rounded-lg w-[420px] shadow-lg"
							initial={{ scale: 0.9, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.9, opacity: 0 }}
							transition={{ type: 'spring', damping: 20, stiffness: 300 }}
						>
							<h2 className="mt-0 mb-2 text-2xl font-semibold">
								{hasPreviewShapes ? 'Project Settings' : 'Set Up Project'}
							</h2>
							<p className="mt-0 mb-5 text-gray-600 text-base">
								Choose the folder containing your PDF files:
							</p>

							<form onSubmit={handleSubmit}>
								<div className="mb-4">
									<button
										type="button"
										className="w-full py-3 px-4 text-sm text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md text-base font-medium cursor-pointer transition-colors"
										onClick={openDirectoryPicker}
										disabled={isLoading}
									>
										Browse Folders
									</button>
								</div>

								{displayPath && !permissionError && (
									<motion.div
										className="mb-6 p-3 bg-gray-100 rounded-md text-sm text-gray-800 break-all"
										initial={{ opacity: 0, y: -10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.2 }}
									>
										Selected: {displayPath}
									</motion.div>
								)}
								{error && (
									<motion.div
										className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600"
										initial={{ opacity: 0, y: -10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.2 }}
									>
										{error}
									</motion.div>
								)}
								<div className="mb-6">
									<label className="block text-gray-700 text-sm font-medium mb-2">
										Project Port
									</label>
									<input
										type="text"
										value={newPort}
										onChange={(e) => setNewPort(e.target.value)}
										placeholder="The port you're running the project on (e.g. 3000)"
										className="w-full p-3 border border-gray-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>

								<div className="flex justify-end gap-3">
									{isDirectorySet && !isLoading && (
										<button
											type="button"
											className="px-5 py-2.5 bg-transparent border border-gray-300 rounded-md cursor-pointer text-sm text-gray-600 hover:bg-gray-100 transition-colors"
											onClick={() => setModalOpen(false)}
											disabled={isLoading}
										>
											Cancel
										</button>
									)}
									<button
										type="submit"
										className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white border-none rounded-md cursor-pointer text-sm font-medium transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center gap-2"
										disabled={!canSubmit || isLoading}
									>
										{isLoading ? (
											<>
												<svg
													className="animate-spin h-4 w-4 text-white"
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
												>
													<circle
														className="opacity-25"
														cx="12"
														cy="12"
														r="10"
														stroke="currentColor"
														strokeWidth="4"
													></circle>
													<path
														className="opacity-75"
														fill="currentColor"
														d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
													></path>
												</svg>
												Initializing...
											</>
										) : hasPreviewShapes ? (
											'Save'
										) : (
											'Finish'
										)}
									</button>
								</div>

								{/* Clear Local Storage Button */}
								<div className="mt-6 flex justify-center">
									<button
										type="button"
										className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
										onClick={() => {
											localStorage.clear()
											if ('databases' in indexedDB) {
												indexedDB
													.databases()
													.then((dbs) => {
														dbs.forEach((db) => db.name && indexedDB.deleteDatabase(db.name))
													})
													.finally(() => {
														window.location.reload()
													})
											} else {
												// Fallback for browsers without indexedDB.databases()
												window.location.reload()
											}
										}}
										disabled={isLoading}
									>
										Clear Local Storage
									</button>
								</div>
							</form>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
