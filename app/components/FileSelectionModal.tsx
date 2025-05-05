import { useState, useEffect, useRef } from 'react'
import { useWorkingDirectory } from '../lib/WorkingDirectoryContext'
import { motion, AnimatePresence } from 'framer-motion'

interface FileSelectionModalProps {
	isOpen?: boolean
	setIsOpen?: (isOpen: boolean) => void
}

export function FileSelectionModal({
	isOpen: externalIsOpen,
	setIsOpen: externalSetIsOpen,
}: FileSelectionModalProps = {}) {
	const { workingDirectory, setWorkingDirectory, isDirectorySet } = useWorkingDirectory()
	const [internalIsOpen, setInternalIsOpen] = useState(false)
	const [directoryPath, setDirectoryPath] = useState('')
	const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
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

	// Show modal on initial load if no directory is set
	useEffect(() => {
		if (!isDirectorySet) {
			setModalOpen(true)
		}
	}, [isDirectorySet])

	// Handle click outside of modal
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (modalRef.current && !modalRef.current.contains(event.target as Node) && isDirectorySet) {
				setModalOpen(false)
			}
		}

		if (isModalOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isModalOpen, isDirectorySet])

	// Function to open the directory picker
	const openDirectoryPicker = async () => {
		try {
			// @ts-ignore - showDirectoryPicker may not be recognized in TypeScript definitions
			const dirHandle = await window.showDirectoryPicker()
			setDirectoryHandle(dirHandle)

			// Get the directory path by reading the name
			if (dirHandle) {
				const path = dirHandle.name
				setDirectoryPath(path)
			}
		} catch (error) {
			console.error('Error selecting directory:', error)
		}
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (directoryPath) {
			setWorkingDirectory(directoryPath)
			setModalOpen(false)
		}
	}

	return (
		<>
			<AnimatePresence>
				{!isModalOpen && isDirectorySet && (
					<motion.button
						className="fixed top-5 left-5 bg-white border border-gray-300 px-4 py-2 rounded-md cursor-pointer z-100 text-sm shadow-sm hover:shadow-md transition-shadow"
						onClick={() => setModalOpen(true)}
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						transition={{ duration: 0.2 }}
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
							<h2 className="text-red-500 mt-0 mb-2 text-2xl font-semibold">
								Select Working Directory
							</h2>
							<p className="mt-0 mb-5 text-gray-600 text-base">
								Choose the folder containing your PDF files:
							</p>

							<form onSubmit={handleSubmit}>
								<div className="mb-4">
									<button
										type="button"
										className="w-full py-3 px-4 text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md text-base font-medium cursor-pointer transition-colors"
										onClick={openDirectoryPicker}
									>
										Browse Folders
									</button>
								</div>

								{directoryPath && (
									<motion.div
										className="mb-6 p-3 bg-gray-100 rounded-md text-sm text-gray-800 break-all"
										initial={{ opacity: 0, y: -10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.2 }}
									>
										Selected: {directoryPath}
									</motion.div>
								)}

								<div className="flex justify-end gap-3">
									{isDirectorySet && (
										<button
											type="button"
											className="px-5 py-2.5 bg-transparent border border-gray-300 rounded-md cursor-pointer text-base text-gray-600 hover:bg-gray-100 transition-colors"
											onClick={() => setModalOpen(false)}
										>
											Cancel
										</button>
									)}
									<button
										type="submit"
										className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white border-none rounded-md cursor-pointer text-base font-medium transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
										disabled={!directoryPath}
									>
										Save
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
