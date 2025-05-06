import { NextResponse } from 'next/server'

// This would normally be loaded from an environment variable
// For production, use proper environment variable management
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

/**
 * Switch to a branch, creating it if it doesn't exist
 * This route handles both switching to an existing branch and creating a new one
 */
export async function POST(request: Request) {
	try {
		console.log('[Switch Branch] Starting branch switch operation')

		// Validate GitHub token is available
		if (!GITHUB_TOKEN) {
			console.error('[Switch Branch] GitHub token not configured')
			return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
		}

		// Get info from request
		const { repoUrl, branchName, fromBranch } = await request.json()
		console.log('[Switch Branch] Request details:', { repoUrl, branchName, fromBranch })

		if (!repoUrl) {
			console.error('[Switch Branch] Repository URL is missing')
			return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
		}

		if (!branchName) {
			console.error('[Switch Branch] Branch name is missing')
			return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
		}

		// Parse the GitHub repository information from URL
		const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i
		const match = repoUrl.match(repoRegex)

		if (!match) {
			console.error('[Switch Branch] Invalid GitHub URL format:', repoUrl)
			return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
		}

		const [, owner, repo] = match
		const repoName = repo.replace('.git', '')
		console.log(`[Switch Branch] Parsed repo info: owner=${owner}, repo=${repoName}`)

		// First, check if branch exists
		console.log(`[Switch Branch] Checking if branch ${branchName} exists`)
		const branchResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/branches/${branchName}`,
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
			console.log(
				`[Switch Branch] Branch ${branchName} doesn't exist, creating it from ${
					fromBranch || 'main'
				}`
			)

			// Get the source branch reference
			const sourceBranch = fromBranch || 'main'
			console.log(`[Switch Branch] Getting reference for source branch: ${sourceBranch}`)
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
					`[Switch Branch] Failed to get source branch reference:`,
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
			console.log(`[Switch Branch] Got source branch reference:`, refData)

			// Create the new branch
			console.log(
				`[Switch Branch] Creating new branch ${branchName} pointing to ${refData.object.sha}`
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
						ref: `refs/heads/${branchName}`,
						sha: refData.object.sha,
					}),
				}
			)

			if (!createBranchResponse.ok) {
				const errorText = await createBranchResponse.text()
				console.error(`[Switch Branch] Failed to create branch:`, errorText)
				return NextResponse.json(
					{
						error: `Failed to create branch: ${createBranchResponse.statusText}`,
						details: errorText,
					},
					{ status: createBranchResponse.status }
				)
			}

			const createResult = await createBranchResponse.json()
			console.log(`[Switch Branch] Successfully created new branch:`, createResult)
		} else if (!branchResponse.ok) {
			console.error(`[Switch Branch] Failed to check branch:`, await branchResponse.text())
			return NextResponse.json(
				{
					error: `Failed to check branch: ${branchResponse.statusText}`,
				},
				{ status: branchResponse.status }
			)
		} else {
			console.log(`[Switch Branch] Branch ${branchName} already exists`)
		}

		// Get the tree for the branch
		console.log(`[Switch Branch] Getting tree for branch ${branchName}`)
		const treeResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repoName}/git/trees/${branchName}?recursive=1`,
			{
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		if (!treeResponse.ok) {
			console.error(`[Switch Branch] Failed to get tree:`, await treeResponse.text())
			return NextResponse.json(
				{
					error: `Failed to get tree: ${treeResponse.statusText}`,
				},
				{ status: treeResponse.status }
			)
		}

		const treeData = await treeResponse.json()
		console.log(`[Switch Branch] Got tree with ${treeData.tree.length} items`)

		// Get all blob contents
		console.log(
			`[Switch Branch] Getting blob contents for ${
				treeData.tree.filter((item: any) => item.type === 'blob').length
			} files`
		)
		const files = await Promise.all(
			treeData.tree
				.filter((item: any) => item.type === 'blob')
				.map(async (item: any) => {
					console.log(`[Switch Branch] Getting blob for ${item.path}`)
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
							`[Switch Branch] Failed to get blob for ${item.path}:`,
							await blobResponse.text()
						)
						throw new Error(`Failed to get blob for ${item.path}`)
					}

					const blobData = await blobResponse.json()
					return {
						path: item.path,
						content: atob(blobData.content),
					}
				})
		)

		console.log(`[Switch Branch] Successfully got all file contents`)
		return NextResponse.json({
			success: true,
			message: `Successfully switched to branch ${branchName}`,
			files,
		})
	} catch (error) {
		console.error('[Switch Branch] Error:', error)
		return NextResponse.json(
			{
				error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
			},
			{ status: 500 }
		)
	}
}
