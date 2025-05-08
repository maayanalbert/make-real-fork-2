import { NextResponse } from 'next/server'

// This would normally be loaded from an environment variable
// For production, use proper environment variable management
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

/**
 * Push local branches and commits to GitHub repository
 * This route handles pushing local changes to a remote GitHub repository
 */
export async function POST(request: Request) {
	try {
		// Validate GitHub token is available
		if (!GITHUB_TOKEN) {
			return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
		}

		// Get info from request
		const { repoUrl, branch, commits, files } = await request.json()

		if (!repoUrl) {
			return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
		}

		if (!branch) {
			return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
		}

		if (!files || !Array.isArray(files) || files.length === 0) {
			return NextResponse.json({ error: 'Files to push are required' }, { status: 400 })
		}

		// Filter out .env files
		const filteredFiles = files.filter(
			(file: { path: string; content: string }) => !file.path.startsWith('.env')
		)
		if (filteredFiles.length === 0) {
			return NextResponse.json(
				{ error: 'No valid files to push after filtering .env files' },
				{ status: 400 }
			)
		}

		// Parse the GitHub repository information from URL
		const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i
		const match = repoUrl.match(repoRegex)

		if (!match) {
			return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
		}

		const [, owner, repo] = match
		const repoName = repo.replace('.git', '')

		console.log(`Pushing to repo: ${owner}/${repoName}, branch: ${branch}`)

		// First, check if branch exists
		try {
			const branchResponse = await fetch(
				`https://api.github.com/repos/${owner}/${repoName}/branches/${branch}`,
				{
					headers: {
						Authorization: `token ${GITHUB_TOKEN}`,
						Accept: 'application/vnd.github.v3+json',
						'X-GitHub-Api-Version': '2022-11-28',
					},
				}
			)

			// If branch doesn't exist, create it
			if (branchResponse.status === 404) {
				// Get default branch to create from
				const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
					headers: {
						Authorization: `token ${GITHUB_TOKEN}`,
						Accept: 'application/vnd.github.v3+json',
						'X-GitHub-Api-Version': '2022-11-28',
					},
				})

				if (!repoInfoResponse.ok) {
					return NextResponse.json(
						{
							error: `Failed to get repository information: ${repoInfoResponse.statusText}`,
						},
						{ status: repoInfoResponse.status }
					)
				}

				const repoInfo = await repoInfoResponse.json()
				const defaultBranch = repoInfo.default_branch

				// Get the SHA of the latest commit on the default branch
				const refResponse = await fetch(
					`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${defaultBranch}`,
					{
						headers: {
							Authorization: `token ${GITHUB_TOKEN}`,
							Accept: 'application/vnd.github.v3+json',
							'X-GitHub-Api-Version': '2022-11-28',
						},
					}
				)

				if (!refResponse.ok) {
					return NextResponse.json(
						{
							error: `Failed to get reference: ${refResponse.statusText}`,
						},
						{ status: refResponse.status }
					)
				}

				const refData = await refResponse.json()

				// Create the new branch
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
							ref: `refs/heads/${branch}`,
							sha: refData.object.sha,
						}),
					}
				)

				if (!createBranchResponse.ok) {
					return NextResponse.json(
						{
							error: `Failed to create branch: ${createBranchResponse.statusText}`,
						},
						{ status: createBranchResponse.status }
					)
				}

				console.log(`Created new branch: ${branch}`)
			} else if (!branchResponse.ok) {
				return NextResponse.json(
					{
						error: `Failed to check branch: ${branchResponse.statusText}`,
					},
					{ status: branchResponse.status }
				)
			}
		} catch (error) {
			return NextResponse.json(
				{
					error: `Error checking/creating branch: ${
						error instanceof Error ? error.message : String(error)
					}`,
				},
				{ status: 500 }
			)
		}

		// Get the current commit SHA for the branch
		const branchRefResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!branchRefResponse.ok) {
			return NextResponse.json(
				{
					error: `Failed to get branch reference: ${branchRefResponse.statusText}`,
				},
				{ status: branchRefResponse.status }
			)
		}

		const branchData = await branchRefResponse.json()
		const latestCommitSha = branchData.object.sha

		// Get the tree associated with the latest commit
		const commitResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/commits/${latestCommitSha}`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!commitResponse.ok) {
			return NextResponse.json(
				{
					error: `Failed to get commit: ${commitResponse.statusText}`,
				},
				{ status: commitResponse.status }
			)
		}

		const commitData = await commitResponse.json()
		const baseTreeSha = commitData.tree.sha

		// Create blobs for each file
		const blobPromises = filteredFiles.map(async (file: { path: string; content: string }) => {
			const createBlobResponse = await fetch(
				`https://api.github.com/repos/${owner}/${repoName}/git/blobs`,
				{
					method: 'POST',
					headers: {
						Authorization: `token ${GITHUB_TOKEN}`,
						'Content-Type': 'application/json',
						Accept: 'application/vnd.github.v3+json',
						'X-GitHub-Api-Version': '2022-11-28',
					},
					body: JSON.stringify({
						content: file.content,
						encoding: 'utf-8',
					}),
				}
			)

			if (!createBlobResponse.ok) {
				throw new Error(`Failed to create blob for ${file.path}: ${createBlobResponse.statusText}`)
			}

			const blobData = await createBlobResponse.json()

			return {
				path: file.path,
				mode: '100644', // Regular file
				type: 'blob',
				sha: blobData.sha,
			}
		})

		let treeItems
		try {
			treeItems = await Promise.all(blobPromises)
		} catch (error) {
			return NextResponse.json(
				{
					error: `Error creating blobs: ${error instanceof Error ? error.message : String(error)}`,
				},
				{ status: 500 }
			)
		}

		// Create a tree with the new files
		const createTreeResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/trees`,
			{
				method: 'POST',
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
				body: JSON.stringify({
					base_tree: baseTreeSha,
					tree: treeItems,
				}),
			}
		)

		if (!createTreeResponse.ok) {
			return NextResponse.json(
				{
					error: `Failed to create tree: ${createTreeResponse.statusText}`,
				},
				{ status: createTreeResponse.status }
			)
		}

		const treeData = await createTreeResponse.json()

		// Create a commit
		const commitMessage =
			commits && commits.length > 0 ? commits[0].message : 'Update from local repository'

		const createCommitResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/commits`,
			{
				method: 'POST',
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
				body: JSON.stringify({
					message: commitMessage,
					tree: treeData.sha,
					parents: [latestCommitSha],
				}),
			}
		)

		if (!createCommitResponse.ok) {
			return NextResponse.json(
				{
					error: `Failed to create commit: ${createCommitResponse.statusText}`,
				},
				{ status: createCommitResponse.status }
			)
		}

		const newCommitData = await createCommitResponse.json()

		// Update the branch reference to point to the new commit
		const updateRefResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
				body: JSON.stringify({
					sha: newCommitData.sha,
					force: false,
				}),
			}
		)

		if (!updateRefResponse.ok) {
			return NextResponse.json(
				{
					error: `Failed to update branch reference: ${updateRefResponse.statusText}`,
				},
				{ status: updateRefResponse.status }
			)
		}

		return NextResponse.json({
			success: true,
			message: `Successfully pushed to ${branch}`,
			commitSha: newCommitData.sha,
			treeSha: treeData.sha,
		})
	} catch (error) {
		console.error('Error pushing to GitHub:', error)
		return NextResponse.json(
			{
				error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
			},
			{ status: 500 }
		)
	}
}
