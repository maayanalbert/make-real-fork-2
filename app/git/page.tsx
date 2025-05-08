'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useGitMirror } from '../lib/GitMirrorContext'
import { motion } from 'framer-motion'

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
	} = useGitMirror()

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

	// Initialize or refresh data
	useEffect(() => {
		if (isReady && isRepoInitialized) {
			refreshData()
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

	// Handle deleting the repository
	const handleDeleteRepo = async () => {
		try {
			setLoading(true)
			setError(null)
			// Clear the local storage for the git-mirror-fs
			window.localStorage.removeItem('git-mirror-fs')
			// Delete the IndexedDB database
			const deleteRequest = window.indexedDB.deleteDatabase('git-mirror-db')
			deleteRequest.onsuccess = () => {
				setSuccess('Repository deleted successfully! Reload the page to see changes.')
				setTimeout(() => setSuccess(null), 3000)
			}
			deleteRequest.onerror = () => {
				setError('Failed to delete repository database')
			}
		} catch (err) {
			setError(`Failed to delete repository: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
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

	// View file content
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
							onClick={handleDeleteRepo}
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
					{/* Left column */}
					<div className="space-y-6">
						{/* Add File Form */}
						<div className="bg-white p-6 rounded-lg shadow">
							<h2 className="text-xl font-semibold mb-4">Add File</h2>
							<form onSubmit={handleAddFile}>
								<div className="mb-4">
									<label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="fileName">
										File Name:
									</label>
									<input
										type="text"
										id="fileName"
										value={fileName}
										onChange={(e) => setFileName(e.target.value)}
										className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
										placeholder="example.txt"
										disabled={loading || !isRepoInitialized}
									/>
								</div>
								<div className="mb-4">
									<label
										className="block text-gray-700 text-sm font-bold mb-2"
										htmlFor="fileContent"
									>
										File Content:
									</label>
									<textarea
										id="fileContent"
										value={fileContent}
										onChange={(e) => setFileContent(e.target.value)}
										className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
										rows={5}
										placeholder="Enter file content here..."
										disabled={loading || !isRepoInitialized}
									/>
								</div>
								<div>
									<button
										type="submit"
										disabled={loading || !isRepoInitialized}
										className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
									>
										Add File
									</button>
								</div>
							</form>
						</div>

						{/* Commit Form */}
						<div className="bg-white p-6 rounded-lg shadow">
							<h2 className="text-xl font-semibold mb-4">Commit Changes</h2>
							<form onSubmit={handleCommit}>
								<div className="mb-4">
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
										placeholder="Add my changes"
										disabled={loading || !isRepoInitialized}
									/>
								</div>
								<div className="grid grid-cols-2 gap-4 mb-4">
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
											disabled={loading || !isRepoInitialized}
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
											disabled={loading || !isRepoInitialized}
										/>
									</div>
								</div>
								<div>
									<button
										type="submit"
										disabled={loading || !isRepoInitialized || fileList.length === 0}
										className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
									>
										Commit Changes
									</button>
								</div>
							</form>
						</div>
					</div>

					{/* Right column */}
					<div className="space-y-6">
						{/* File List */}
						<div className="bg-white p-6 rounded-lg shadow">
							<h2 className="text-xl font-semibold mb-4">Repository Files</h2>
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
						</div>

						{/* Selected File Content */}
						{selectedFile && selectedFileContent !== null && (
							<div className="bg-white p-6 rounded-lg shadow">
								<div className="flex justify-between items-center mb-4">
									<h2 className="text-xl font-semibold">{selectedFile}</h2>
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
								<div className="bg-gray-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap overflow-auto max-h-60">
									{selectedFileContent}
								</div>
							</div>
						)}

						{/* Commits Log */}
						<div className="bg-white p-6 rounded-lg shadow">
							<h2 className="text-xl font-semibold mb-4">Commit Log</h2>
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
						</div>
					</div>
				</div>

				{/* Operation History */}
				<div className="mt-6 bg-white p-6 rounded-lg shadow">
					<h2 className="text-xl font-semibold mb-4">Operation History</h2>
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
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-gray-500 italic">No operations recorded</p>
					)}
				</div>
			</div>
		</div>
	)
}
