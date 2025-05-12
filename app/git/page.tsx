'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useGitMirror } from '../lib/GitMirrorContext'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import { motion } from 'framer-motion'
import { readFilesRecursively } from '../lib/GitMirrorUtils'

export default function GitMirrorPage() {
	const {
		isReady,
		isRepoInitialized,
		initRepoWithFiles,
		addFile,
		commit,
		fileList,
		commits,
		operationHistory,
		refreshData,
		listBranches,
		checkout,
		createBranch,
		getCurrentBranch,
		branches,
		currentBranch,
	} = useGitMirror()
	const { directoryHandle } = useProjectSettings()

	const [fileName, setFileName] = useState('')
	const [fileContent, setFileContent] = useState('')
	const [commitMessage, setCommitMessage] = useState('')
	const [authorName, setAuthorName] = useState('Test User')
	const [authorEmail, setAuthorEmail] = useState('test@example.com')
	const [selectedFile, setSelectedFile] = useState<string | null>(null)
	const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState<string | null>(null)
	const [showSyncModal, setShowSyncModal] = useState(false)
	const [filesExpanded, setFilesExpanded] = useState(true)
	const [fileContentExpanded, setFileContentExpanded] = useState(true)
	const [commitsExpanded, setCommitsExpanded] = useState(true)
	const [historyExpanded, setHistoryExpanded] = useState(true)
	const [branchesExpanded, setBranchesExpanded] = useState(true)

	// Initialize or refresh data
	useEffect(() => {
		if (isReady && isRepoInitialized) {
			// First get the current branch
			;(async () => {
				try {
					await getCurrentBranch()
					await refreshData()
				} catch (err) {
					console.error('Error refreshing data:', err)
				}
			})()
		}
	}, [isReady, isRepoInitialized])

	// Handle initialization with project files
	const handleInitRepoWithFiles = async () => {
		try {
			setLoading(true)
			setError(null)
			await initRepoWithFiles()
			setSuccess('Repository initialized with project files successfully!')
			setTimeout(() => setSuccess(null), 3000)
		} catch (err) {
			setError(
				`Failed to initialize repository with files: ${
					err instanceof Error ? err.message : String(err)
				}`
			)
		} finally {
			setLoading(false)
		}
	}

	// Handle clearing the repository by removing all data instead of deleting the DB
	const handleDeleteRepo = () => {
		console.log('CLEAR REPO FUNCTION CALLED')

		setLoading(true)
		setError(null)

		try {
			// Clear localStorage first
			console.log('Clearing localStorage')
			localStorage.removeItem('git-mirror-fs')
			console.log('localStorage cleared successfully')

			// Open a connection to the database to clear its contents
			const openRequest = indexedDB.open('git-mirror-db')

			openRequest.onerror = (event) => {
				console.error('Error opening database:', event)
				setError(
					'Could not open database for clearing: ' + (openRequest.error?.message || 'Unknown error')
				)
				setLoading(false)
			}

			openRequest.onblocked = (event) => {
				console.log('Open request is blocked:', event)
				setError('Database access is blocked. Please close other tabs and try again.')
				setLoading(false)
			}

			// Once we have the database connection, clear all object stores
			openRequest.onsuccess = (event) => {
				console.log('Successfully opened database for clearing')
				const db = openRequest.result

				// Start a transaction to clear all object stores
				try {
					const storeNames = Array.from(db.objectStoreNames)
					console.log('Object stores to clear:', storeNames)

					if (storeNames.length === 0) {
						console.log('No object stores found to clear')
						setSuccess('Repository data already cleared!')
						db.close()
						setLoading(false)
						return
					}

					const transaction = db.transaction(storeNames, 'readwrite')

					transaction.onerror = (event) => {
						console.error('Transaction error:', event)
						setError('Error clearing data: ' + (transaction.error?.message || 'Unknown error'))
						db.close()
						setLoading(false)
					}

					// Count completed store clears to know when we're done
					let completedStores = 0

					// Clear each object store
					storeNames.forEach((storeName) => {
						console.log(`Clearing object store: ${storeName}`)
						const objectStore = transaction.objectStore(storeName)
						const clearRequest = objectStore.clear()

						clearRequest.onsuccess = () => {
							console.log(`Successfully cleared store: ${storeName}`)
							completedStores++

							// If all stores are cleared, we're done
							if (completedStores === storeNames.length) {
								console.log('All object stores cleared successfully')
								setSuccess('Repository data cleared successfully! Reload the page to see changes.')
								db.close()
								setLoading(false)
							}
						}

						clearRequest.onerror = (event) => {
							console.error(`Error clearing store ${storeName}:`, event)
							// Continue trying to clear other stores
						}
					})

					// Also handle transaction completion
					transaction.oncomplete = () => {
						console.log('Transaction completed')
						db.close()
						setLoading(false)
						// Force refresh data
						setTimeout(() => refreshData(), 500)
					}
				} catch (err) {
					console.error('Error in transaction:', err)
					setError(
						'Error in database transaction: ' + (err instanceof Error ? err.message : String(err))
					)
					db.close()
					setLoading(false)
				}
			}

			// Handle database upgrades if needed
			openRequest.onupgradeneeded = (event) => {
				console.log('Database upgrade needed - not expected during clear operation')
				// This shouldn't happen during a clear operation, but handle it just in case
				const db = openRequest.result
				db.close()
			}
		} catch (err) {
			console.error('Unexpected error in handleDeleteRepo:', err)
			setError('Unexpected error: ' + (err instanceof Error ? err.message : String(err)))
			setLoading(false)
		}
	}

	// Handle adding a file
	const handleAddFile = async (e: FormEvent) => {
		e.preventDefault()
		if (!fileName || !fileContent) {
			setError('Please provide both file name and content')
			return
		}

		try {
			setLoading(true)
			setError(null)
			await addFile(fileName, fileContent)
			setSuccess(`File ${fileName} added successfully!`)
			setFileName('')
			setFileContent('')
			setTimeout(() => setSuccess(null), 3000)
		} catch (err) {
			setError(`Failed to add file: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setLoading(false)
		}
	}

	// Handle committing changes
	const handleCommit = async (e: FormEvent) => {
		e.preventDefault()
		if (!commitMessage || !authorName || !authorEmail) {
			setError('Please provide commit message, author name, and email')
			return
		}

		try {
			setLoading(true)
			setError(null)
			const sha = await commit(commitMessage, { name: authorName, email: authorEmail })
			setSuccess(`Changes committed successfully! SHA: ${sha.substring(0, 7)}`)
			setCommitMessage('')
			setTimeout(() => setSuccess(null), 3000)
		} catch (err) {
			setError(`Failed to commit changes: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setLoading(false)
		}
	}

	// Handle viewing file content
	const handleViewFile = async (file: string) => {
		try {
			setLoading(true)
			setError(null)
			const content = await useGitMirror().getFileContent(file)
			setSelectedFile(file)
			setSelectedFileContent(content)
		} catch (err) {
			setError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setLoading(false)
		}
	}

	// Helper function to write branch files to local FS
	const writeBranchToLocalFS = async (branchName: string) => {
		if (!directoryHandle) {
			setError('No directory handle available')
			return false
		}

		try {
			setLoading(true)
			setError(null)

			console.log(`Writing files from branch ${branchName} to local filesystem...`)

			// Get all files from current branch
			const allRepoFiles = await useGitMirror().listFiles()
			console.log(`Found ${allRepoFiles.length} files in repository`)

			// Get content of each file and write to local filesystem
			let updatedCount = 0
			for (const filePath of allRepoFiles) {
				try {
					// Get file content from repo
					const content = await useGitMirror().getFileContent(filePath)

					// Write to local filesystem using the helper from SyncChangesModal
					await writeFileToLocalFS(directoryHandle, filePath, content)
					updatedCount++
				} catch (err) {
					console.error(`Error writing file ${filePath}:`, err)
				}
			}

			setSuccess(
				`Successfully wrote ${updatedCount} files from branch '${branchName}' to local filesystem`
			)
			setTimeout(() => setSuccess(null), 3000)
			return true
		} catch (err) {
			setError(`Failed to write branch files: ${err instanceof Error ? err.message : String(err)}`)
			return false
		} finally {
			setLoading(false)
		}
	}

	// Helper function to write a file to the local filesystem (shared with SyncChangesModal)
	const writeFileToLocalFS = async (directoryHandle: any, filePath: string, content: string) => {
		// Split the path into directories and filename
		const pathParts = filePath.split('/')
		const fileName = pathParts.pop() || ''

		// Navigate to the correct directory
		let currentDirHandle = directoryHandle
		for (const dir of pathParts) {
			if (dir) {
				try {
					// Try to get the subdirectory
					currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true })
				} catch (err) {
					console.error(`Error accessing/creating directory ${dir}:`, err)
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

		console.log(`Successfully wrote file: ${filePath}`)
	}

	return (
		<div className="min-h-screen bg-gray-50 p-8">
			<div className="max-w-6xl mx-auto">
				<h1 className="text-3xl font-bold mb-8">Git Mirror DB</h1>

				{/* Status Bar */}
				<div className="bg-white p-4 rounded-lg shadow mb-6 flex items-center justify-between">
					<div>
						<span className="font-semibold">Status:</span>{' '}
						{isReady ? (
							<span className="text-green-600">DB Ready</span>
						) : (
							<span className="text-yellow-600">Initializing DB...</span>
						)}
						{' | '}
						<span className="font-semibold">Repository:</span>{' '}
						{isRepoInitialized ? (
							<span className="text-green-600">Initialized</span>
						) : (
							<span className="text-yellow-600">Not Initialized</span>
						)}
						{isRepoInitialized && currentBranch && (
							<>
								{' | '}
								<span className="font-semibold">Branch:</span>{' '}
								<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-semibold">
									{currentBranch}
								</span>
							</>
						)}
					</div>
					<div className="flex gap-2">
						<button
							onClick={handleInitRepoWithFiles}
							disabled={loading || !isReady}
							className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Init with Project Files
						</button>
						<button
							onClick={() => {
								setShowSyncModal(true)
							}}
							disabled={loading || !isReady || !isRepoInitialized || !directoryHandle}
							className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
							title="Push local changes to repository or pull repository changes to local filesystem"
						>
							Sync Changes
						</button>
						<button
							onClick={() => {
								if (
									window.confirm(
										'Are you sure you want to delete the repository? This cannot be undone.'
									)
								) {
									handleDeleteRepo()
								}
							}}
							disabled={loading || !isReady}
							className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Delete Repository
						</button>
						<button
							onClick={() => refreshData()}
							disabled={loading || !isReady}
							className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Refresh Data
						</button>
					</div>
				</div>

				{/* Branches Section */}
				{isRepoInitialized && (
					<div className="bg-white p-4 rounded-lg shadow mb-6">
						<div className="flex justify-between items-center mb-4">
							<h2 className="text-xl font-semibold">Branches</h2>
							<button
								onClick={() => setBranchesExpanded(!branchesExpanded)}
								className="text-gray-500 hover:text-gray-700 flex items-center"
							>
								{branchesExpanded ? (
									<>
										<span className="mr-1 text-sm">Collapse</span>
										<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M5 15l7-7 7 7"
											/>
										</svg>
									</>
								) : (
									<>
										<span className="mr-1 text-sm">Expand</span>
										<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</>
								)}
							</button>
						</div>

						<motion.div
							initial={{ height: branchesExpanded ? 'auto' : 0, opacity: branchesExpanded ? 1 : 0 }}
							animate={{ height: branchesExpanded ? 'auto' : 0, opacity: branchesExpanded ? 1 : 0 }}
							transition={{ duration: 0.3 }}
							className="overflow-hidden"
						>
							<div className="flex items-center mb-4">
								<span className="font-medium mr-2">Current Branch:</span>
								<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-semibold">
									{currentBranch || 'main'}
								</span>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* Branch List */}
								<div>
									<h3 className="text-lg font-medium mb-2">Available Branches</h3>
									{branches.length > 0 ? (
										<ul className="bg-gray-50 rounded border p-3 max-h-48 overflow-y-auto">
											{branches.map((branch) => (
												<li
													key={branch}
													className={`py-2 px-3 flex justify-between items-center ${
														branch === currentBranch
															? 'bg-blue-50 border-l-4 border-blue-500'
															: 'hover:bg-gray-100'
													}`}
												>
													<span className="font-medium">{branch}</span>
													<div className="flex space-x-2">
														{branch !== currentBranch && (
															<button
																onClick={async () => {
																	try {
																		if (
																			directoryHandle &&
																			window.confirm(
																				`Checkout branch '${branch}'? This will efficiently update your local files to match this branch, only writing changed files.`
																			)
																		) {
																			setLoading(true)
																			setError(null)

																			// Checkout branch (which now efficiently updates files)
																			await checkout(branch)

																			// Explicitly update UI state
																			await getCurrentBranch()
																			await refreshData()

																			setSuccess(
																				`Switched to branch ${branch} and efficiently updated local files`
																			)
																			setTimeout(() => setSuccess(null), 3000)
																		}
																	} catch (err) {
																		setError(
																			`Failed to checkout branch: ${
																				err instanceof Error ? err.message : String(err)
																			}`
																		)
																		setLoading(false)
																	}
																}}
																className="text-blue-500 hover:text-blue-700 text-sm"
																disabled={loading}
																title="Checkout this branch and efficiently update your local files"
															>
																Checkout
															</button>
														)}
													</div>
												</li>
											))}
										</ul>
									) : (
										<p className="text-gray-500 italic">No branches found</p>
									)}
								</div>

								{/* Create Branch Form */}
								<div>
									<h3 className="text-lg font-medium mb-2">Create New Branch</h3>
									<form
										className="bg-gray-50 rounded border p-4"
										onSubmit={async (e) => {
											e.preventDefault()

											// Get the branch name from form
											const formData = new FormData(e.currentTarget)
											const newBranchName = formData.get('newBranchName') as string

											if (!newBranchName) {
												setError('Please provide a branch name')
												return
											}

											try {
												setLoading(true)
												setError(null)

												// First create the branch
												await createBranch(newBranchName)

												// Then checkout to it
												await checkout(newBranchName)

												// Explicitly update the current branch state
												await getCurrentBranch()

												// Also refresh file list since we've changed branches
												await refreshData()

												setSuccess(
													`Created and switched to branch ${newBranchName} with efficient file updates`
												)
												setTimeout(() => setSuccess(null), 3000)

												// Reset the form
												;(e.target as HTMLFormElement).reset()
											} catch (err) {
												setError(
													`Failed to create branch: ${
														err instanceof Error ? err.message : String(err)
													}`
												)
											} finally {
												setLoading(false)
											}
										}}
									>
										<div className="mb-4">
											<label
												htmlFor="newBranchName"
												className="block text-gray-700 text-sm font-bold mb-2"
											>
												Branch Name:
											</label>
											<input
												type="text"
												id="newBranchName"
												name="newBranchName"
												className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
												placeholder="new-branch-name"
												disabled={loading || !isReady || !isRepoInitialized}
											/>
										</div>
										<button
											type="submit"
											disabled={loading || !isReady || !isRepoInitialized}
											className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
										>
											Create & Checkout Branch
										</button>
									</form>
								</div>
							</div>
						</motion.div>
					</div>
				)}

				{/* Notifications */}
				{error && (
					<motion.div
						className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
					>
						{error}
					</motion.div>
				)}

				{success && (
					<motion.div
						className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-md mb-6"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
					>
						{success}
					</motion.div>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{/* Right column */}
					<div className="space-y-6">
						{/* File List */}
						<div className="bg-white p-6 rounded-lg shadow">
							<div className="flex justify-between items-center mb-4">
								<h2 className="text-xl font-semibold">
									Repository Files
									{currentBranch && (
										<span className="ml-2 text-sm text-gray-500 font-normal">
											(branch: {currentBranch})
										</span>
									)}
								</h2>
								<button
									onClick={() => setFilesExpanded(!filesExpanded)}
									className="text-gray-500 hover:text-gray-700 flex items-center"
								>
									{filesExpanded ? (
										<>
											<span className="mr-1 text-sm">Collapse</span>
											<svg
												className="w-5 h-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 15l7-7 7 7"
												/>
											</svg>
										</>
									) : (
										<>
											<span className="mr-1 text-sm">Expand</span>
											<svg
												className="w-5 h-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</>
									)}
								</button>
							</div>

							<motion.div
								initial={{ height: filesExpanded ? 'auto' : 0, opacity: filesExpanded ? 1 : 0 }}
								animate={{ height: filesExpanded ? 'auto' : 0, opacity: filesExpanded ? 1 : 0 }}
								transition={{ duration: 0.3 }}
								className="overflow-hidden"
							>
								{fileList.length > 0 ? (
									<ul className="divide-y divide-gray-200">
										{fileList.map((file) => (
											<li key={file} className="py-2">
												<div className="flex justify-between items-center">
													<span className="font-medium">{file}</span>
													<button
														onClick={() => handleViewFile(file)}
														className="text-blue-500 hover:text-blue-700"
													>
														View
													</button>
												</div>
											</li>
										))}
									</ul>
								) : (
									<p className="text-gray-500 italic">No files in repository</p>
								)}
							</motion.div>
						</div>

						{/* Selected File Content */}
						{selectedFile && selectedFileContent !== null && (
							<div className="bg-white p-6 rounded-lg shadow">
								<div className="flex justify-between items-center mb-4">
									<h2 className="text-xl font-semibold">{selectedFile}</h2>
									<div className="flex items-center">
										<button
											onClick={() => setFileContentExpanded(!fileContentExpanded)}
											className="text-gray-500 hover:text-gray-700 flex items-center mr-3"
										>
											{fileContentExpanded ? (
												<>
													<span className="mr-1 text-sm">Collapse</span>
													<svg
														className="w-5 h-5"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M5 15l7-7 7 7"
														/>
													</svg>
												</>
											) : (
												<>
													<span className="mr-1 text-sm">Expand</span>
													<svg
														className="w-5 h-5"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M19 9l-7 7-7-7"
														/>
													</svg>
												</>
											)}
										</button>
										<button
											onClick={() => {
												setSelectedFile(null)
												setSelectedFileContent(null)
											}}
											className="text-gray-500 hover:text-gray-700"
										>
											Close
										</button>
									</div>
								</div>
								<motion.div
									initial={{
										height: fileContentExpanded ? 'auto' : 0,
										opacity: fileContentExpanded ? 1 : 0,
									}}
									animate={{
										height: fileContentExpanded ? 'auto' : 0,
										opacity: fileContentExpanded ? 1 : 0,
									}}
									transition={{ duration: 0.3 }}
									className="overflow-hidden"
								>
									<div className="bg-gray-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap overflow-auto max-h-60">
										{selectedFileContent}
									</div>
								</motion.div>
							</div>
						)}

						{/* Commits Log */}
						<div className="bg-white p-6 rounded-lg shadow">
							<div className="flex justify-between items-center mb-4">
								<h2 className="text-xl font-semibold">Commit Log</h2>
								<button
									onClick={() => setCommitsExpanded(!commitsExpanded)}
									className="text-gray-500 hover:text-gray-700 flex items-center"
								>
									{commitsExpanded ? (
										<>
											<span className="mr-1 text-sm">Collapse</span>
											<svg
												className="w-5 h-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 15l7-7 7 7"
												/>
											</svg>
										</>
									) : (
										<>
											<span className="mr-1 text-sm">Expand</span>
											<svg
												className="w-5 h-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</>
									)}
								</button>
							</div>
							<motion.div
								initial={{ height: commitsExpanded ? 'auto' : 0, opacity: commitsExpanded ? 1 : 0 }}
								animate={{ height: commitsExpanded ? 'auto' : 0, opacity: commitsExpanded ? 1 : 0 }}
								transition={{ duration: 0.3 }}
								className="overflow-hidden"
							>
								{commits.length > 0 ? (
									<ul className="divide-y divide-gray-200">
										{commits.map((commit, index) => (
											<li key={index} className="py-3">
												<div className="text-sm text-gray-500 mb-1">
													{new Date(commit.commit.author.timestamp * 1000).toLocaleString()}
												</div>
												<div className="font-medium">{commit.commit.message}</div>
												<div className="text-xs text-gray-500 mt-1">
													{commit.oid.substring(0, 7)} by {commit.commit.author.name}
												</div>
											</li>
										))}
									</ul>
								) : (
									<p className="text-gray-500 italic">No commits yet</p>
								)}
							</motion.div>
						</div>
					</div>
				</div>

				{/* Operation History */}
				<div className="mt-6 bg-white p-6 rounded-lg shadow">
					<div className="flex justify-between items-center mb-4">
						<h2 className="text-xl font-semibold">Operation History</h2>
						<button
							onClick={() => setHistoryExpanded(!historyExpanded)}
							className="text-gray-500 hover:text-gray-700 flex items-center"
						>
							{historyExpanded ? (
								<>
									<span className="mr-1 text-sm">Collapse</span>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M5 15l7-7 7 7"
										/>
									</svg>
								</>
							) : (
								<>
									<span className="mr-1 text-sm">Expand</span>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</>
							)}
						</button>
					</div>
					<motion.div
						initial={{ height: historyExpanded ? 'auto' : 0, opacity: historyExpanded ? 1 : 0 }}
						animate={{ height: historyExpanded ? 'auto' : 0, opacity: historyExpanded ? 1 : 0 }}
						transition={{ duration: 0.3 }}
						className="overflow-hidden"
					>
						{operationHistory.length > 0 ? (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-gray-200">
									<thead className="bg-gray-50">
										<tr>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
												Operation
											</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
												Timestamp
											</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
												Details
											</th>
										</tr>
									</thead>
									<tbody className="bg-white divide-y divide-gray-200">
										{operationHistory.map((op, index) => (
											<tr key={index}>
												<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
													{op.type}
												</td>
												<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
													{new Date(op.timestamp).toLocaleString()}
												</td>
												<td className="px-6 py-4 text-sm text-gray-500">
													{op.type === 'add' && (
														<span>
															Added file: {op.fileName} ({op.contentLength} bytes)
														</span>
													)}
													{op.type === 'commit' && (
														<span>
															"{op.message}" by {op.author.name}
															<br />
															<span className="text-xs">SHA: {op.sha.substring(0, 7)}</span>
														</span>
													)}
													{op.type === 'init' && <span>Repository initialized</span>}
													{op.type === 'create-branch' && (
														<span>Created branch: {op.branchName}</span>
													)}
													{op.type === 'checkout' && (
														<span>Checked out branch: {op.branchName}</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="text-gray-500 italic">No operations recorded</p>
						)}
					</motion.div>
				</div>

				{/* SyncChangesModal */}
				{showSyncModal && (
					<SyncChangesModal
						onClose={() => setShowSyncModal(false)}
						directoryHandle={directoryHandle}
						onCommit={refreshData}
						writeFileToLocalFS={writeFileToLocalFS}
					/>
				)}
			</div>
		</div>
	)
}

// SyncChangesModal Component
function SyncChangesModal({
	onClose,
	directoryHandle,
	onCommit,
	writeFileToLocalFS,
}: {
	onClose: () => void
	directoryHandle: any
	onCommit: () => void
	writeFileToLocalFS: (dirHandle: any, path: string, content: string) => Promise<void>
}) {
	const { addFile, commit, getFileContent, fileList, currentBranch } = useGitMirror()
	const [changedFiles, setChangedFiles] = useState<
		{ path: string; status: 'new' | 'modified' | 'unchanged' }[]
	>([])
	const [loading, setLoading] = useState(false)
	const [scanning, setScanning] = useState(false)
	const [commitMessage, setCommitMessage] = useState('')
	const [authorName, setAuthorName] = useState('Git Mirror')
	const [authorEmail, setAuthorEmail] = useState('git-mirror@example.com')
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState<string | null>(null)
	const [syncType, setSyncType] = useState<'pull' | 'push'>('push') // Default to push changes

	// Scan for local changes when modal opens
	useEffect(() => {
		scanForChanges()

		// Add event listener for setModalToPull event
		const handleSetModalToPull = () => {
			setSyncType('pull')
		}

		window.addEventListener('setModalToPull', handleSetModalToPull)

		// Cleanup
		return () => {
			window.removeEventListener('setModalToPull', handleSetModalToPull)
		}
	}, [])

	// Function to scan for changes between local files and repository
	const scanForChanges = async () => {
		if (!directoryHandle) {
			setError('No directory handle available')
			return
		}

		setScanning(true)
		setError(null)

		try {
			// Read all files from the local directory
			const localFiles = await readFilesRecursively(directoryHandle)

			console.log(`Found ${localFiles.length} files in local directory`)

			// Compare with files in the repository
			const changes: { path: string; status: 'new' | 'modified' | 'unchanged' }[] = []

			// Process each local file
			for (const localFile of localFiles) {
				// Check if file exists in repository
				const existsInRepo = fileList.includes(localFile.path)

				if (!existsInRepo) {
					changes.push({ path: localFile.path, status: 'new' })
				} else {
					// File exists in repo, check if contents match
					try {
						const repoContent = await getFileContent(localFile.path)
						if (repoContent !== localFile.content) {
							changes.push({ path: localFile.path, status: 'modified' })
						} else {
							changes.push({ path: localFile.path, status: 'unchanged' })
						}
					} catch (error) {
						console.error(`Error comparing file ${localFile.path}:`, error)
						// If we can't read the file from repo, consider it new
						changes.push({ path: localFile.path, status: 'new' })
					}
				}
			}

			// Filter to only show changed files
			setChangedFiles(changes.filter((file) => file.status !== 'unchanged'))

			if (changes.filter((file) => file.status !== 'unchanged').length === 0) {
				setSuccess('No changes detected between local files and repository')
			}
		} catch (error) {
			console.error('Error scanning for changes:', error)
			setError(
				`Failed to scan for changes: ${error instanceof Error ? error.message : String(error)}`
			)
		} finally {
			setScanning(false)
		}
	}

	// Handle committing all changed files
	const handleCommitChanges = async () => {
		if (!directoryHandle) {
			setError('No directory handle available')
			return
		}

		if (changedFiles.length === 0 && syncType === 'push') {
			setError('No changes to commit')
			return
		}

		if (!commitMessage && syncType === 'push') {
			setError('Please provide a commit message')
			return
		}

		setLoading(true)
		setError(null)

		try {
			if (syncType === 'push') {
				// PUSH: Local files -> Git Mirror DB
				// Get the file paths to read
				const filePaths = changedFiles.map((file) => file.path)

				// Read all changed files from the local directory
				const fileEntries = await readFilesRecursively(directoryHandle, '', [], filePaths)

				// Add each file to the repository
				for (const file of fileEntries) {
					await addFile(file.path, file.content)
					console.log(`Added/updated file: ${file.path}`)
				}

				// Commit all changes
				const sha = await commit(commitMessage, { name: authorName, email: authorEmail })

				setSuccess(
					`Successfully committed ${fileEntries.length} files! SHA: ${sha.substring(0, 7)}`
				)
			} else {
				// PULL: Git Mirror DB -> Local file system

				// Get all files from current branch
				console.log(`Pulling files from branch: ${currentBranch}`)

				// First, get list of all files in the repo
				const allRepoFiles = await fileList
				console.log(`Found ${allRepoFiles.length} files in repository`)

				// Get content of each file and write to local filesystem
				let updatedCount = 0
				for (const filePath of allRepoFiles) {
					try {
						// Get file content from repo
						const content = await getFileContent(filePath)

						// Write to local filesystem
						await writeFileToLocalFS(directoryHandle, filePath, content)
						updatedCount++
					} catch (err) {
						console.error(`Error writing file ${filePath}:`, err)
					}
				}

				setSuccess(
					`Successfully pulled ${updatedCount} files from branch '${currentBranch}' to local filesystem`
				)
			}

			onCommit() // Refresh data in parent component

			// Close modal after a delay
			setTimeout(() => {
				onClose()
			}, 2000)
		} catch (error) {
			console.error('Error syncing changes:', error)
			setError(`Failed to sync changes: ${error instanceof Error ? error.message : String(error)}`)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
				<div className="p-6 border-b">
					<div className="flex justify-between items-center">
						<h2 className="text-2xl font-semibold">Sync Changes</h2>
						<button onClick={onClose} className="text-gray-500 hover:text-gray-700">
							<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				<div className="p-6 overflow-y-auto flex-grow">
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
							{error}
						</div>
					)}

					{success && (
						<div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-md mb-4">
							{success}
						</div>
					)}

					{/* Sync Type Selector */}
					<div className="mb-6">
						<h3 className="text-lg font-medium mb-2">Sync Direction</h3>
						<div className="flex space-x-4">
							<label className="flex items-center">
								<input
									type="radio"
									name="syncType"
									value="push"
									checked={syncType === 'push'}
									onChange={() => setSyncType('push')}
									className="mr-2"
								/>
								<span>Push changes (Local → Repository)</span>
							</label>
							<label className="flex items-center">
								<input
									type="radio"
									name="syncType"
									value="pull"
									checked={syncType === 'pull'}
									onChange={() => setSyncType('pull')}
									className="mr-2"
								/>
								<span>Pull changes (Repository → Local)</span>
							</label>
						</div>

						{syncType === 'pull' && (
							<div className="mt-2 bg-blue-50 p-3 rounded text-blue-800 text-sm">
								<strong>Note:</strong> This will pull ALL files from the current branch (
								{currentBranch}) and write them to your local filesystem. This will overwrite any
								local changes.
							</div>
						)}
					</div>

					{syncType === 'push' && (
						<div className="mb-6">
							<h3 className="text-lg font-medium mb-2">Changed Files</h3>
							{scanning ? (
								<div className="text-center py-8">
									<svg
										className="animate-spin h-8 w-8 text-blue-500 mx-auto"
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
									<p className="mt-2 text-gray-600">Scanning for changes...</p>
								</div>
							) : changedFiles.length === 0 ? (
								<p className="text-gray-500 italic">No changes detected</p>
							) : (
								<div className="border rounded-md overflow-hidden">
									<table className="min-w-full divide-y divide-gray-200">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
													File
												</th>
												<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
													Status
												</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{changedFiles.map((file) => (
												<tr key={file.path}>
													<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
														{file.path}
													</td>
													<td className="px-6 py-4 whitespace-nowrap text-sm">
														{file.status === 'new' ? (
															<span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
																New
															</span>
														) : (
															<span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
																Modified
															</span>
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}

							<div className="mt-4">
								<button
									onClick={scanForChanges}
									disabled={scanning || loading}
									className="text-blue-600 hover:text-blue-800 text-sm font-medium"
								>
									Refresh Changes
								</button>
							</div>
						</div>
					)}

					{syncType === 'pull' && (
						<div className="mb-6">
							<h3 className="text-lg font-medium mb-2">Target Branch</h3>
							<div className="border rounded-md p-4 bg-gray-50">
								<div className="flex items-center">
									<span className="font-medium mr-2">Current Branch:</span>
									<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-semibold">
										{currentBranch || 'main'}
									</span>
								</div>
								<p className="mt-3 text-gray-600 text-sm">
									All files from the current branch ({currentBranch || 'main'}) will be written to
									your local filesystem. This will write the exact state of the branch to your local
									files, overwriting any local changes.
								</p>
								<div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
									<strong>Note:</strong> After pulling, your local files will match exactly what's
									in the repository branch. Any local changes that haven't been committed will be
									overwritten.
								</div>
							</div>
						</div>
					)}

					{syncType === 'push' && (
						<div className="border-t pt-4">
							<h3 className="text-lg font-medium mb-4">Commit Details</h3>
							<div className="space-y-4">
								<div>
									<label
										className="block text-gray-700 text-sm font-bold mb-2"
										htmlFor="commitMessage"
									>
										Commit Message:
									</label>
									<input
										type="text"
										id="commitMessage"
										value={commitMessage}
										onChange={(e) => setCommitMessage(e.target.value)}
										className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
										placeholder="Describe your changes"
										disabled={loading || changedFiles.length === 0}
									/>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div>
										<label
											className="block text-gray-700 text-sm font-bold mb-2"
											htmlFor="authorName"
										>
											Author Name:
										</label>
										<input
											type="text"
											id="authorName"
											value={authorName}
											onChange={(e) => setAuthorName(e.target.value)}
											className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
											placeholder="John Doe"
											disabled={loading || changedFiles.length === 0}
										/>
									</div>
									<div>
										<label
											className="block text-gray-700 text-sm font-bold mb-2"
											htmlFor="authorEmail"
										>
											Author Email:
										</label>
										<input
											type="email"
											id="authorEmail"
											value={authorEmail}
											onChange={(e) => setAuthorEmail(e.target.value)}
											className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
											placeholder="john@example.com"
											disabled={loading || changedFiles.length === 0}
										/>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="p-6 border-t bg-gray-50 flex justify-end">
					<button
						onClick={onClose}
						className="mr-2 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
					>
						Cancel
					</button>
					<button
						onClick={handleCommitChanges}
						disabled={
							loading ||
							scanning ||
							(syncType === 'push' && (changedFiles.length === 0 || !commitMessage))
						}
						className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loading ? 'Syncing...' : syncType === 'push' ? 'Push Changes' : 'Pull Branch Files'}
					</button>
				</div>
			</div>
		</div>
	)
}
