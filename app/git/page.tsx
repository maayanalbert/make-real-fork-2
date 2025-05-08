'use client'

import { useState, useEffect } from 'react'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import * as git from 'isomorphic-git'
import { FileSystemAPIFs } from '../lib/FileSystemAPIFs'

export default function GitPage() {
	const { directoryHandle } = useProjectSettings()
	const [currentBranch, setCurrentBranch] = useState<string>('')
	const [branches, setBranches] = useState<string[]>([])
	const [newBranchName, setNewBranchName] = useState('')
	const [commitMessage, setCommitMessage] = useState('')
	const [status, setStatus] = useState<{ [key: string]: string }>({})
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Initialize git
	const initGit = async () => {
		if (!directoryHandle) return
		setIsLoading(true)
		setError(null)

		try {
			const fs = new FileSystemAPIFs(directoryHandle).promises

			// Create all required git directories first
			await ensureGitDirectories()

			// Initialize git
			await git.init({ fs, dir: '/' })

			// Get and display status after initialization
			await refreshGitStatus()
		} catch (err) {
			console.error('Error initializing git:', err)
			setError('Failed to initialize git repository')
		} finally {
			setIsLoading(false)
		}
	}

	// Pre-create all required git directories
	const ensureGitDirectories = async () => {
		if (!directoryHandle) return
		try {
			const fs = new FileSystemAPIFs(directoryHandle)

			// Create basic git structure
			await fs.promises.mkdir('.git')
			await fs.promises.mkdir('.git/objects')
			await fs.promises.mkdir('.git/refs')
			await fs.promises.mkdir('.git/refs/heads')
			await fs.promises.mkdir('.git/refs/tags')

			// Create common hash prefix directories
			// This covers all possible first byte values for hash prefixes
			for (let i = 0; i < 256; i++) {
				const prefix = i.toString(16).padStart(2, '0')
				try {
					await fs.promises.mkdir(`.git/objects/${prefix}`)
					console.log(`Created .git/objects/${prefix} directory`)
				} catch (err) {
					// Ignore errors if directory already exists
					console.log(`Directory may already exist: .git/objects/${prefix}`)
				}
			}

			console.log('Successfully created all git directories')
		} catch (err) {
			console.error('Error creating git directories:', err)
			throw err // Re-throw to be handled by caller
		}
	}

	// Get current branch and status
	const refreshGitStatus = async () => {
		if (!directoryHandle) return
		setIsLoading(true)
		setError(null)

		try {
			const fs = new FileSystemAPIFs(directoryHandle).promises

			// Get current branch
			const currentBranch = await git.currentBranch({ fs, dir: '/' })
			setCurrentBranch(currentBranch || 'main')

			// Get all branches
			const allBranches = await git.listBranches({ fs, dir: '/' })
			setBranches(allBranches)

			// Get status
			const status = await git.statusMatrix({ fs, dir: '/' })
			const statusMap: { [key: string]: string } = {}
			for (const [file, head, workdir, stage] of status) {
				if (workdir !== 1) {
					statusMap[file] = 'modified'
				} else if (stage !== 1) {
					statusMap[file] = 'staged'
				}
			}
			setStatus(statusMap)
		} catch (err) {
			console.error('Error refreshing git status:', err)
			setError('Failed to refresh git status')
		} finally {
			setIsLoading(false)
		}
	}

	// Create new branch
	const createBranch = async () => {
		if (!directoryHandle || !newBranchName) return
		setIsLoading(true)
		setError(null)

		try {
			// Ensure git directories exist first
			await ensureGitDirectories()

			const fs = new FileSystemAPIFs(directoryHandle).promises
			await git.branch({ fs, dir: '/', ref: newBranchName })
			setNewBranchName('')
			await refreshGitStatus()
		} catch (err) {
			console.error('Error creating branch:', err)
			setError('Failed to create branch')
		} finally {
			setIsLoading(false)
		}
	}

	// Switch branch
	const switchBranch = async (branchName: string) => {
		if (!directoryHandle) return
		setIsLoading(true)
		setError(null)

		try {
			// Ensure git directories exist first
			await ensureGitDirectories()

			const fs = new FileSystemAPIFs(directoryHandle).promises
			await git.checkout({ fs, dir: '/', ref: branchName })
			await refreshGitStatus()
		} catch (err) {
			console.error('Error switching branch:', err)
			setError('Failed to switch branch')
		} finally {
			setIsLoading(false)
		}
	}

	// Commit changes
	const commitChanges = async () => {
		if (!directoryHandle || !commitMessage) return
		setIsLoading(true)
		setError(null)

		try {
			// IMPORTANT: Always ensure ALL git directories exist before committing
			await ensureGitDirectories()

			const fs = new FileSystemAPIFs(directoryHandle).promises

			// Stage all changes
			const status = await git.statusMatrix({ fs, dir: '/' })
			for (const [file, head, workdir, stage] of status) {
				if (workdir !== 1) {
					await git.add({ fs, dir: '/', filepath: file })
				}
			}

			// Commit
			await git.commit({
				fs,
				dir: '/',
				message: commitMessage,
				author: {
					name: 'User',
					email: 'user@example.com',
				},
			})

			setCommitMessage('')
			await refreshGitStatus()
		} catch (err) {
			console.error('Error committing changes:', err)
			let errorMessage = 'Failed to commit changes'
			if (err instanceof Error) {
				errorMessage += `: ${err.message}`
				// Add additional details for debugging
				console.error('Stack trace:', err.stack)
			}
			setError(errorMessage)
		} finally {
			setIsLoading(false)
		}
	}

	// Initialize git and refresh status on mount
	useEffect(() => {
		if (directoryHandle) {
			// Ensure git directories exist first, then initialize
			const setup = async () => {
				try {
					await ensureGitDirectories()
					await initGit()
				} catch (err) {
					console.error('Error during setup:', err)
					setError('Failed to set up Git environment')
				}
			}
			setup()
		}
	}, [directoryHandle])

	if (!directoryHandle) {
		return (
			<div className="p-8">
				<h1 className="text-2xl font-bold mb-4">Git Operations</h1>
				<p className="text-gray-600">Please select a project directory first.</p>
			</div>
		)
	}

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-6">Git Operations</h1>

			{error && (
				<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
					{error}
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				{/* Branch Management */}
				<div className="bg-white p-6 rounded-lg shadow">
					<h2 className="text-xl font-semibold mb-4">Branch Management</h2>

					<div className="mb-4">
						<p className="text-sm text-gray-600 mb-2">Current Branch: {currentBranch}</p>
						<div className="flex gap-2">
							<input
								type="text"
								value={newBranchName}
								onChange={(e) => setNewBranchName(e.target.value)}
								placeholder="New branch name"
								className="flex-1 px-3 py-2 border rounded"
							/>
							<button
								onClick={createBranch}
								disabled={isLoading || !newBranchName}
								className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
							>
								Create Branch
							</button>
						</div>
					</div>

					<div>
						<h3 className="font-medium mb-2">Switch Branch</h3>
						<div className="space-y-2">
							{branches.map((branch) => (
								<button
									key={branch}
									onClick={() => switchBranch(branch)}
									disabled={isLoading || branch === currentBranch}
									className="w-full px-3 py-2 text-left rounded hover:bg-gray-100 disabled:opacity-50"
								>
									{branch}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Commit Changes */}
				<div className="bg-white p-6 rounded-lg shadow">
					<h2 className="text-xl font-semibold mb-4">Commit Changes</h2>

					<div className="mb-4">
						<h3 className="font-medium mb-2">Modified Files</h3>
						{Object.entries(status).length === 0 ? (
							<p className="text-gray-600">No changes to commit</p>
						) : (
							<ul className="space-y-1">
								{Object.entries(status).map(([file, state]) => (
									<li key={file} className="text-sm">
										{file} <span className="text-gray-500">({state})</span>
									</li>
								))}
							</ul>
						)}
					</div>

					<div>
						<textarea
							value={commitMessage}
							onChange={(e) => setCommitMessage(e.target.value)}
							placeholder="Enter commit message"
							className="w-full px-3 py-2 border rounded mb-2"
							rows={3}
						/>
						<button
							onClick={commitChanges}
							disabled={isLoading || !commitMessage || Object.keys(status).length === 0}
							className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
						>
							Commit Changes
						</button>
					</div>
				</div>
			</div>

			<div className="mt-4">
				<button
					onClick={refreshGitStatus}
					disabled={isLoading}
					className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
				>
					Refresh Status
				</button>

				{/* Add a button to explicitly create all git directories */}
				<button
					onClick={ensureGitDirectories}
					disabled={isLoading}
					className="ml-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
				>
					Repair Git Directories
				</button>
			</div>
		</div>
	)
}
