import { useState, useEffect } from 'react'
import { useWorkingDirectory } from '../lib/WorkingDirectoryContext'

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

	if (!isModalOpen && isDirectorySet) {
		return (
			<button className="dir-btn" onClick={() => setModalOpen(true)}>
				Directory
			</button>
		)
	}

	if (!isModalOpen) {
		return null
	}

	return (
		<div className="modal">
			<div className="modal-content">
				<h2>Select Working Directory</h2>
				<p>Choose the folder containing your PDF files:</p>

				<form onSubmit={handleSubmit}>
					<div className="button-group">
						<button type="button" className="browse-btn" onClick={openDirectoryPicker}>
							Browse Folders
						</button>
					</div>

					{directoryPath && <div className="selected-dir">Selected: {directoryPath}</div>}

					<div className="btn-row">
						{isDirectorySet && (
							<button type="button" className="cancel-btn" onClick={() => setModalOpen(false)}>
								Cancel
							</button>
						)}
						<button type="submit" className="save-btn" disabled={!directoryPath}>
							Save
						</button>
					</div>
				</form>
			</div>

			<style jsx>{`
				.modal {
					position: fixed;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background-color: rgba(0, 0, 0, 0.5);
					display: flex;
					justify-content: center;
					align-items: center;
					z-index: 1000;
				}

				.modal-content {
					background-color: white;
					padding: 1.75rem;
					border-radius: 8px;
					width: 420px;
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
				}

				h2 {
					margin-top: 0;
					margin-bottom: 0.5rem;
					font-size: 1.5rem;
					color: #333;
					font-weight: 600;
				}

				p {
					margin-top: 0;
					margin-bottom: 1.25rem;
					color: #555;
					font-size: 1rem;
				}

				.button-group {
					margin-bottom: 1rem;
				}

				.browse-btn {
					width: 100%;
					padding: 12px 16px;
					background-color: #3b82f6;
					color: white;
					border: none;
					border-radius: 6px;
					font-size: 16px;
					font-weight: 500;
					cursor: pointer;
					transition: background-color 0.2s;
				}

				.browse-btn:hover {
					background-color: #2563eb;
				}

				.selected-dir {
					margin-bottom: 1.5rem;
					padding: 12px;
					background-color: #f3f4f6;
					border-radius: 6px;
					font-size: 0.9rem;
					color: #333;
					word-break: break-all;
				}

				.btn-row {
					display: flex;
					justify-content: flex-end;
					gap: 12px;
				}

				.save-btn {
					padding: 10px 20px;
					background-color: #3b82f6;
					color: white;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					font-size: 16px;
					font-weight: 500;
					transition: background-color 0.2s;
				}

				.save-btn:hover {
					background-color: #2563eb;
				}

				.save-btn:disabled {
					background-color: #93c5fd;
					cursor: not-allowed;
				}

				.cancel-btn {
					padding: 10px 20px;
					background-color: transparent;
					border: 1px solid #d1d5db;
					border-radius: 6px;
					cursor: pointer;
					font-size: 16px;
					color: #4b5563;
					transition: background-color 0.2s;
				}

				.cancel-btn:hover {
					background-color: #f3f4f6;
				}

				.dir-btn {
					position: fixed;
					bottom: 20px;
					right: 20px;
					background-color: white;
					border: 1px solid #d1d5db;
					padding: 8px 16px;
					border-radius: 6px;
					cursor: pointer;
					z-index: 100;
					font-size: 14px;
					box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
					transition: box-shadow 0.2s;
				}

				.dir-btn:hover {
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				}
			`}</style>
		</div>
	)
}
