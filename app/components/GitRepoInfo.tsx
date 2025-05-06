import { useState, useEffect } from 'react'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import { useGitRepository } from '../lib/useGitRepository'

export default function GitRepoInfo() {
	const {
		gitRepo,
		initializeGitRepo,
		createBranch,
		switchBranch,
		commitChanges,
		commitLocalDirectory,
		directoryHandle,
		setDirectoryHandle,
	} = useProjectSettings()
	const { isInitialized, isLoading, error, commitSha, getCommitInfo, getBranchName, listFiles } =
		useGitRepository()

	const [repoUrl, setRepoUrl] = useState('')
	const [branch, setBranch] = useState('main')
	const [newBranchName, setNewBranchName] = useState('')
	const [commitMessage, setCommitMessage] = useState('')
	const [fileContent, setFileContent] = useState('')
	const [filePath, setFilePath] = useState('')
	const [commitInfo, setCommitInfo] = useState<{ message: string; date: Date } | null>(null)
	const [showFiles, setShowFiles] = useState(false)
	const [files, setFiles] = useState<Array<{ path: string; size: number; sha: string }>>([])
	const [selectedBranch, setSelectedBranch] = useState('')
	const [localDirCommitMessage, setLocalDirCommitMessage] = useState('')
	const [localDirLoading, setLocalDirLoading] = useState(false)

	// Load commit info when commitSha changes
	useEffect(() => {
		if (commitSha) {
			getCommitInfo().then((info) => {
				if (info) {
					setCommitInfo(info)
				}
			})
		}
	}, [commitSha, getCommitInfo])

	// Set selected branch when gitRepo changes
	useEffect(() => {
		if (gitRepo?.currentBranch) {
			setSelectedBranch(gitRepo.currentBranch)
		}
	}, [gitRepo])

	// Set repo URL when directory handle changes
	useEffect(() => {
		if (directoryHandle && directoryHandle.name) {
			setRepoUrl(`https://github.com/maayan-albert-dev/${directoryHandle.name}`)
		}
	}, [directoryHandle])

	// Handle repository initialization
	const handleInitializeRepo = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!repoUrl.trim() || !directoryHandle) return

		try {
			await initializeGitRepo(repoUrl.trim(), branch.trim() || 'main', directoryHandle)
		} catch (err) {
			console.error('Failed to initialize repository:', err)
		}
	}

	// Handle branch creation
	const handleCreateBranch = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newBranchName.trim()) return

		try {
			await createBranch(newBranchName.trim())
			setNewBranchName('')
		} catch (err) {
			console.error('Failed to create branch:', err)
		}
	}

	// Handle branch switching
	const handleSwitchBranch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
		const branchName = e.target.value
		if (!branchName || branchName === gitRepo?.currentBranch) return

		try {
			await switchBranch(branchName)
			setSelectedBranch(branchName)
		} catch (err) {
			console.error('Failed to switch branch:', err)
		}
	}

	// Handle commit
	const handleCommit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!commitMessage.trim() || !filePath.trim() || !fileContent.trim()) return

		try {
			const newCommitHash = await commitChanges(commitMessage, [
				{ path: filePath, content: fileContent },
			])
			console.log('Created commit:', newCommitHash)
			setCommitMessage('')
			setFilePath('')
			setFileContent('')
		} catch (err) {
			console.error('Failed to commit changes:', err)
		}
	}

	// Load and display files
	const handleLoadFiles = async () => {
		if (showFiles) {
			setShowFiles(false)
			return
		}

		try {
			const filesList = await listFiles()
			setFiles(filesList)
			setShowFiles(true)
		} catch (err) {
			console.error('Failed to load files:', err)
		}
	}

	// Select directory
	const handleSelectDirectory = async () => {
		if (typeof window.showDirectoryPicker !== 'function') {
			alert('The File System Access API is not supported in your browser.')
			return
		}

		try {
			// @ts-ignore - TypeScript might not recognize this browser API
			const handle = await window.showDirectoryPicker()
			await setDirectoryHandle(handle)
			// URL will be updated by the useEffect
		} catch (err) {
			console.error('Failed to select directory:', err)
		}
	}

	// Commit local directory
	const handleLocalDirCommit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!localDirCommitMessage.trim() || !directoryHandle) return

		setLocalDirLoading(true)
		try {
			const newCommitHash = await commitLocalDirectory(localDirCommitMessage)
			console.log('Created commit from local directory:', newCommitHash)
			setLocalDirCommitMessage('')
			alert('Successfully committed files from local directory!')
		} catch (err) {
			console.error('Failed to commit local directory:', err)
			alert(`Failed to commit local directory: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setLocalDirLoading(false)
		}
	}

	return (
		<div className="p-4 border rounded-lg shadow-sm space-y-4">
			<h2 className="text-xl font-semibold">Git Repository</h2>

			{error && (
				<div className="p-2 bg-red-50 text-red-700 rounded border border-red-200">{error}</div>
			)}

			{!isInitialized ? (
				<div>
					<p className="text-gray-600 mb-4">Initialize a Git repository to mirror in IndexedDB</p>

					<div className="mb-4">
						<button
							onClick={handleSelectDirectory}
							className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
						>
							{directoryHandle ? 'Change Directory' : 'Select Directory'}
						</button>

						{directoryHandle && (
							<p className="mt-2 text-sm text-gray-600">
								Selected directory: <span className="font-mono">{directoryHandle.name}</span>
							</p>
						)}
					</div>

					<form onSubmit={handleInitializeRepo} className="space-y-3">
						<div>
							<label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700 mb-1">
								Repository URL
							</label>
							<input
								type="text"
								id="repoUrl"
								placeholder="https://github.com/maayan-albert-dev/repository-name"
								value={repoUrl}
								onChange={(e) => setRepoUrl(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
							{directoryHandle && (
								<p className="mt-1 text-xs text-gray-500">
									URL auto-generated from selected directory
								</p>
							)}
						</div>

						<div>
							<label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-1">
								Branch (default: main)
							</label>
							<input
								type="text"
								id="branch"
								placeholder="main"
								value={branch}
								onChange={(e) => setBranch(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<button
							type="submit"
							disabled={isLoading || !repoUrl.trim()}
							className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
						>
							{isLoading ? 'Initializing...' : 'Initialize Repository'}
						</button>
					</form>
				</div>
			) : (
				<div className="space-y-6">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<h3 className="text-sm font-medium text-gray-500">Repository</h3>
							<p className="mt-1">{gitRepo?.repoUrl}</p>
							<p className="text-xs text-gray-500 mt-1">
								Username: maayan-albert-dev
								{directoryHandle && <>, Repository: {directoryHandle.name}</>}
							</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-gray-500">Current Branch</h3>
							<p className="mt-1">{getBranchName()}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-gray-500">Last Commit</h3>
							<p className="mt-1">
								{gitRepo?.lastCommitDate
									? new Date(gitRepo.lastCommitDate).toLocaleString()
									: 'None'}
							</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-gray-500">Current Commit</h3>
							<p className="mt-1 font-mono text-xs truncate">{commitSha}</p>
						</div>
					</div>

					{commitInfo && (
						<div className="border-t pt-3">
							<h3 className="text-sm font-medium text-gray-500">Latest Commit</h3>
							<p className="mt-1 font-medium">{commitInfo.message}</p>
							<p className="text-xs text-gray-500 mt-1">{commitInfo.date.toLocaleString()}</p>
						</div>
					)}

					<div className="border-t pt-3">
						<h3 className="text-sm font-medium text-gray-500 mb-2">Branch Management</h3>

						<div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
							<div className="flex-1">
								<label
									htmlFor="currentBranch"
									className="block text-sm font-medium text-gray-700 mb-1"
								>
									Switch Branch
								</label>
								<select
									id="currentBranch"
									value={selectedBranch}
									onChange={handleSwitchBranch}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									{gitRepo?.branches.map((branch) => (
										<option key={branch} value={branch}>
											{branch}
										</option>
									))}
								</select>
							</div>

							<div className="flex-1">
								<form onSubmit={handleCreateBranch} className="flex space-x-2">
									<div className="flex-1">
										<label
											htmlFor="newBranch"
											className="block text-sm font-medium text-gray-700 mb-1"
										>
											Create Branch
										</label>
										<input
											type="text"
											id="newBranch"
											placeholder="new-branch-name"
											value={newBranchName}
											onChange={(e) => setNewBranchName(e.target.value)}
											className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
											required
										/>
									</div>
									<button
										type="submit"
										disabled={isLoading || !newBranchName.trim()}
										className="self-end px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
									>
										Create
									</button>
								</form>
							</div>
						</div>
					</div>

					<div className="border-t pt-3">
						<h3 className="text-sm font-medium text-gray-500 mb-2">Local Directory</h3>

						<div className="mb-4">
							<button
								onClick={handleSelectDirectory}
								className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
							>
								{directoryHandle ? 'Change Directory' : 'Select Directory'}
							</button>

							{directoryHandle && (
								<p className="mt-2 text-sm text-gray-600">
									Selected directory: <span className="font-mono">{directoryHandle.name}</span>
								</p>
							)}
						</div>

						{directoryHandle && (
							<form onSubmit={handleLocalDirCommit} className="space-y-3">
								<div>
									<label
										htmlFor="localDirCommitMessage"
										className="block text-sm font-medium text-gray-700 mb-1"
									>
										Commit Message for Local Directory
									</label>
									<input
										type="text"
										id="localDirCommitMessage"
										placeholder="Initial commit from local directory"
										value={localDirCommitMessage}
										onChange={(e) => setLocalDirCommitMessage(e.target.value)}
										className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
										required
									/>
								</div>

								<p className="text-xs text-gray-500">
									This will commit all files from your selected directory, respecting .gitignore if
									present.
								</p>

								<button
									type="submit"
									disabled={localDirLoading || !localDirCommitMessage.trim()}
									className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
								>
									{localDirLoading ? 'Committing...' : 'Commit Directory'}
								</button>
							</form>
						)}
					</div>

					<div className="border-t pt-3">
						<h3 className="text-sm font-medium text-gray-500 mb-2">Make a Single File Commit</h3>

						<form onSubmit={handleCommit} className="space-y-3">
							<div>
								<label
									htmlFor="commitMessage"
									className="block text-sm font-medium text-gray-700 mb-1"
								>
									Commit Message
								</label>
								<input
									type="text"
									id="commitMessage"
									placeholder="Add a descriptive commit message"
									value={commitMessage}
									onChange={(e) => setCommitMessage(e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									required
								/>
							</div>

							<div>
								<label htmlFor="filePath" className="block text-sm font-medium text-gray-700 mb-1">
									File Path
								</label>
								<input
									type="text"
									id="filePath"
									placeholder="example.txt"
									value={filePath}
									onChange={(e) => setFilePath(e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									required
								/>
							</div>

							<div>
								<label
									htmlFor="fileContent"
									className="block text-sm font-medium text-gray-700 mb-1"
								>
									File Content
								</label>
								<textarea
									id="fileContent"
									placeholder="Your file content here"
									value={fileContent}
									onChange={(e) => setFileContent(e.target.value)}
									rows={4}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									required
								/>
							</div>

							<button
								type="submit"
								disabled={
									isLoading || !commitMessage.trim() || !filePath.trim() || !fileContent.trim()
								}
								className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
							>
								{isLoading ? 'Committing...' : 'Commit Changes'}
							</button>
						</form>
					</div>

					<div className="flex space-x-3 pt-2">
						<button
							onClick={handleLoadFiles}
							disabled={isLoading}
							className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
						>
							{showFiles ? 'Hide Files' : 'Show Files'}
						</button>
					</div>

					{showFiles && (
						<div className="border-t pt-3">
							<h3 className="text-sm font-medium text-gray-500 mb-2">Repository Files</h3>

							{files.length === 0 ? (
								<p className="text-sm text-gray-500">Loading files...</p>
							) : (
								<div className="max-h-60 overflow-y-auto border rounded">
									<table className="min-w-full divide-y divide-gray-200">
										<thead className="bg-gray-50">
											<tr>
												<th
													scope="col"
													className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
												>
													Path
												</th>
												<th
													scope="col"
													className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
												>
													Size
												</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{files.map((file) => (
												<tr key={file.path}>
													<td className="px-3 py-2 whitespace-nowrap text-sm font-mono">
														{file.path}
													</td>
													<td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
														{(file.size / 1024).toFixed(1)} KB
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
