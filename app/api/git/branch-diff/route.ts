import { NextResponse } from 'next/server'

// This would normally be loaded from an environment variable
// For production, use proper environment variable management
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

/**
 * Compute the difference between two branches and return only the files that have changed
 * This eliminates the need for the client to store and compare tree data
 */
export async function POST(request: Request) {
	try {
		console.log('[Branch Diff] Starting branch diff operation')

		// Validate GitHub token is available
		if (!GITHUB_TOKEN) {
			console.error('[Branch Diff] GitHub token not configured')
			return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
		}

		// Get info from request
		const { repoUrl, targetBranch, currentBranch } = await request.json()
		console.log('[Branch Diff] Request details:', { repoUrl, targetBranch, currentBranch })

		if (!repoUrl) {
			console.error('[Branch Diff] Repository URL is missing')
			return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
		}

		if (!targetBranch) {
			console.error('[Branch Diff] Target branch name is missing')
			return NextResponse.json({ error: 'Target branch name is required' }, { status: 400 })
		}

		// Parse the GitHub repository information from URL
		const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i
		const match = repoUrl.match(repoRegex)

		if (!match) {
			console.error('[Branch Diff] Invalid GitHub URL format:', repoUrl)
			return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
		}

		const [, owner, repo] = match
		const repoName = repo.replace('.git', '')
		console.log(`[Branch Diff] Parsed repo info: owner=${owner}, repo=${repoName}`)

		// Step 1: Check if target branch exists, create it if not
		console.log(`[Branch Diff] Checking if target branch ${targetBranch} exists`)
		const branchResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/branches/${targetBranch}`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		// If target branch doesn't exist, create it from current or default branch
		if (branchResponse.status === 404) {
			console.log(
				`[Branch Diff] Branch ${targetBranch} doesn't exist, creating it from ${
					currentBranch || 'main'
				}`
			)

			// Get the source branch reference
			const sourceBranch = currentBranch || 'main'
			console.log(`[Branch Diff] Getting reference for source branch: ${sourceBranch}`)
			const refResponse = await fetch(
				`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${sourceBranch}`,
				{
					headers: {
						Authorization: `token ${GITHUB_TOKEN}`,
						Accept: 'application/vnd.github.v3+json',
						'X-GitHub-Api-Version': '2022-11-28',
					},
				}
			)

			if (!refResponse.ok) {
				console.error(
					`[Branch Diff] Failed to get source branch reference:`,
					await refResponse.text()
				)
				return NextResponse.json(
					{
						error: `Failed to get source branch reference: ${refResponse.statusText}`,
					},
					{ status: refResponse.status }
				)
			}

			const refData = await refResponse.json()
			console.log(`[Branch Diff] Got source branch reference:`, refData)

			// Create the new branch
			console.log(
				`[Branch Diff] Creating new branch ${targetBranch} pointing to ${refData.object.sha}`
			)
			const createBranchResponse = await fetch(
				`https://api.github.com/repos/${owner}/${repoName}/git/refs`,
				{
					method: 'POST',
					headers: {
						Authorization: `token ${GITHUB_TOKEN}`,
						'Content-Type': 'application/json',
						Accept: 'application/vnd.github.v3+json',
						'X-GitHub-Api-Version': '2022-11-28',
					},
					body: JSON.stringify({
						ref: `refs/heads/${targetBranch}`,
						sha: refData.object.sha,
					}),
				}
			)

			if (!createBranchResponse.ok) {
				const errorText = await createBranchResponse.text()
				console.error(`[Branch Diff] Failed to create branch:`, errorText)
				return NextResponse.json(
					{
						error: `Failed to create branch: ${createBranchResponse.statusText}`,
						details: errorText,
					},
					{ status: createBranchResponse.status }
				)
			}

			const createResult = await createBranchResponse.json()
			console.log(`[Branch Diff] Successfully created new branch:`, createResult)
		} else if (!branchResponse.ok) {
			console.error(`[Branch Diff] Failed to check branch:`, await branchResponse.text())
			return NextResponse.json(
				{
					error: `Failed to check branch: ${branchResponse.statusText}`,
				},
				{ status: branchResponse.status }
			)
		} else {
			console.log(`[Branch Diff] Branch ${targetBranch} already exists`)
		}

		// Step 2: Get the target branch tree
		// Get the latest commit SHA for the target branch
		const targetRefResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${targetBranch}`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!targetRefResponse.ok) {
			console.error(
				`[Branch Diff] Failed to get target branch ref:`,
				await targetRefResponse.text()
			)
			return NextResponse.json(
				{
					error: `Failed to get target branch ref: ${targetRefResponse.statusText}`,
				},
				{ status: targetRefResponse.status }
			)
		}

		const targetRefData = await targetRefResponse.json()
		const targetCommitSha = targetRefData.object.sha

		// Get the target commit object to get the tree SHA
		const targetCommitResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/commits/${targetCommitSha}`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!targetCommitResponse.ok) {
			console.error(`[Branch Diff] Failed to get target commit:`, await targetCommitResponse.text())
			return NextResponse.json(
				{
					error: `Failed to get target commit: ${targetCommitResponse.statusText}`,
				},
				{ status: targetCommitResponse.status }
			)
		}

		const targetCommitData = await targetCommitResponse.json()
		const targetTreeSha = targetCommitData.tree.sha

		// Get the target tree
		console.log(`[Branch Diff] Getting tree for target branch ${targetBranch}`)
		const targetTreeResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/trees/${targetTreeSha}?recursive=1`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!targetTreeResponse.ok) {
			console.error(`[Branch Diff] Failed to get target tree:`, await targetTreeResponse.text())
			return NextResponse.json(
				{
					error: `Failed to get target tree: ${targetTreeResponse.statusText}`,
				},
				{ status: targetTreeResponse.status }
			)
		}

		const targetTreeData = await targetTreeResponse.json()
		console.log(`[Branch Diff] Got target tree with ${targetTreeData.tree.length} items`)

		// Step 3: Get current branch tree (if there is a current branch)
		let currentTreeData: any = { tree: [] }
		let filesNeedComparison = false

		if (currentBranch) {
			try {
				console.log(`[Branch Diff] Getting tree for current branch ${currentBranch}`)

				// Get current branch ref
				const currentRefResponse = await fetch(
					`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${currentBranch}`,
					{
						headers: {
							Authorization: `token ${GITHUB_TOKEN}`,
							Accept: 'application/vnd.github.v3+json',
							'X-GitHub-Api-Version': '2022-11-28',
						},
					}
				)

				if (currentRefResponse.ok) {
					const currentRefData = await currentRefResponse.json()
					const currentCommitSha = currentRefData.object.sha

					// Get current commit
					const currentCommitResponse = await fetch(
						`https://api.github.com/repos/${owner}/${repoName}/git/commits/${currentCommitSha}`,
						{
							headers: {
								Authorization: `token ${GITHUB_TOKEN}`,
								Accept: 'application/vnd.github.v3+json',
								'X-GitHub-Api-Version': '2022-11-28',
							},
						}
					)

					if (currentCommitResponse.ok) {
						const currentCommitData = await currentCommitResponse.json()
						const currentTreeSha = currentCommitData.tree.sha

						// Get current tree
						const currentTreeResponse = await fetch(
							`https://api.github.com/repos/${owner}/${repoName}/git/trees/${currentTreeSha}?recursive=1`,
							{
								headers: {
									Authorization: `token ${GITHUB_TOKEN}`,
									Accept: 'application/vnd.github.v3+json',
									'X-GitHub-Api-Version': '2022-11-28',
								},
							}
						)

						if (currentTreeResponse.ok) {
							currentTreeData = await currentTreeResponse.json()
							console.log(
								`[Branch Diff] Got current tree with ${currentTreeData.tree.length} items`
							)
							filesNeedComparison = true
						} else {
							console.warn(
								`[Branch Diff] Failed to get current tree, will fetch all files from target branch`
							)
						}
					} else {
						console.warn(
							`[Branch Diff] Failed to get current commit, will fetch all files from target branch`
						)
					}
				} else {
					console.warn(
						`[Branch Diff] Failed to get current branch ref, will fetch all files from target branch`
					)
				}
			} catch (error) {
				console.error(`[Branch Diff] Error fetching current branch tree:`, error)
				console.warn(`[Branch Diff] Will fetch all files from target branch`)
			}
		}

		// Step 4: Compare trees and determine file status
		console.log(`[Branch Diff] Comparing trees to determine file changes`)

		// Create map of current files by path
		const currentFilesMap = new Map<string, any>()
		if (filesNeedComparison) {
			for (const item of currentTreeData.tree) {
				if (item.type === 'blob') {
					currentFilesMap.set(item.path, item)
				}
			}
		}

		// Create list of deleted files (in current but not in target)
		const deletedFiles: string[] = []

		// Process target files and determine status
		const result = await Promise.all(
			targetTreeData.tree
				.filter((item: any) => item.type === 'blob')
				.map(async (item: any) => {
					console.log(`[Branch Diff] Processing file ${item.path}`)

					// Determine file status
					let status: 'added' | 'modified' | 'unchanged' = 'added'
					const currentFile = currentFilesMap.get(item.path)

					if (currentFile) {
						// Remove from map so we can track deleted files
						currentFilesMap.delete(item.path)

						// Check if file has been modified
						status = currentFile.sha === item.sha ? 'unchanged' : 'modified'
					}

					// Only fetch content for added or modified files
					let content = ''
					if (status === 'added' || status === 'modified') {
						console.log(`[Branch Diff] Getting content for ${status} file ${item.path}`)
						const blobResponse = await fetch(
							`https://api.github.com/repos/${owner}/${repoName}/git/blobs/${item.sha}`,
							{
								headers: {
									Authorization: `token ${GITHUB_TOKEN}`,
									Accept: 'application/vnd.github.v3+json',
									'X-GitHub-Api-Version': '2022-11-28',
								},
							}
						)

						if (!blobResponse.ok) {
							console.error(
								`[Branch Diff] Failed to get blob for ${item.path}:`,
								await blobResponse.text()
							)
							throw new Error(`Failed to get blob for ${item.path}`)
						}

						const blobData = await blobResponse.json()
						content = atob(blobData.content)
					}

					return {
						path: item.path,
						sha: item.sha,
						status,
						content,
					}
				})
		)

		// Add remaining files from current branch to deleted list
		if (filesNeedComparison) {
			for (const [path] of Array.from(currentFilesMap.entries())) {
				deletedFiles.push(path)
			}
		}

		console.log(
			`[Branch Diff] Successfully processed all files: ${result.length} files, ${deletedFiles.length} deleted`
		)

		// Return the diff result
		return NextResponse.json({
			success: true,
			message: `Successfully compared branches ${currentBranch || 'none'} and ${targetBranch}`,
			files: result,
			deleted: deletedFiles,
			commitSha: targetCommitSha,
			treeSha: targetTreeSha,
		})
	} catch (error) {
		console.error('[Branch Diff] Error:', error)
		return NextResponse.json(
			{
				error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
			},
			{ status: 500 }
		)
	}
}
