import { NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

interface FileEntry {
	path: string
	content: string
	sha: string
	size: number
}

/**
 * Initialize a GitHub repository with the provided files
 */
export async function POST(request: Request) {
	console.log('API route hit: /api/git/initialize')
	try {
		if (!GITHUB_TOKEN) {
			console.error('[INIT] GitHub token not configured')
			return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
		}

		const octokit = new Octokit({ auth: GITHUB_TOKEN })

		const body = await request.json().catch((e) => {
			console.error('Failed to parse request body:', e)
			return {}
		})
		console.log('[DEBUG] Raw request body:', body)

		const { repoUrl, branch = 'main', files } = body
		console.log(`[DEBUG] repoUrl: ${repoUrl}`)
		console.log(`[DEBUG] branch: ${branch}`)
		console.log(`[DEBUG] files:`, files)

		if (!repoUrl || !files || !Array.isArray(files)) {
			console.error('Repository URL or files array is missing from request')
			return NextResponse.json(
				{ error: 'Repository URL and files array are required' },
				{ status: 400 }
			)
		}

		// Parse the GitHub repository information from URL
		const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i
		const match = repoUrl.match(repoRegex)
		console.log('[DEBUG] repoRegex match:', match)

		if (!match) {
			console.error(`Invalid GitHub URL format: ${repoUrl}`)
			return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
		}

		const [, owner, repo] = match
		const repoName = repo.replace('.git', '')
		console.log(`[DEBUG] owner: ${owner}`)
		console.log(`[DEBUG] repoName: ${repoName}`)

		// 1. Create the repository (private by default)
		console.log('[INIT] Creating repository on GitHub...')
		const { data: createRepoData } = await octokit.repos.createForAuthenticatedUser({
			name: repoName,
			private: true,
			auto_init: false,
		})
		console.log('[INIT] Repository created:', createRepoData.html_url)

		// Check if the repo is empty (no default branch)
		const { data: repoInfo } = await octokit.repos.get({
			owner,
			repo: repoName,
		})
		const isEmpty = !repoInfo.default_branch
		console.log('[INIT] Repo is empty:', isEmpty)

		// Find all non-empty files
		const nonEmptyFiles = files.filter((file: FileEntry) => file.content && file.content.length > 0)
		if (nonEmptyFiles.length === 0) {
			console.error('[INIT] No non-empty files to create initial commit')
			return NextResponse.json(
				{ error: 'No non-empty files to create initial commit' },
				{ status: 400 }
			)
		}

		// Filter out .env files
		const filteredFiles = nonEmptyFiles.filter((file: FileEntry) => !file.path.startsWith('.env'))
		if (filteredFiles.length === 0) {
			console.error('[INIT] No valid files after filtering .env files')
			return NextResponse.json(
				{ error: 'No valid files to create initial commit after filtering .env files' },
				{ status: 400 }
			)
		}

		const results = []

		// Create the first file using Contents API
		const firstFile = filteredFiles[0]
		console.log(`[INIT] Creating first file via Contents API: ${firstFile.path}`)
		try {
			const response = await octokit.repos.createOrUpdateFileContents({
				owner,
				repo: repoName,
				path: firstFile.path,
				message: 'Initial commit',
				content: Buffer.from(firstFile.content).toString('base64'),
				branch,
			})
			console.log('[INIT] First file created via Contents API:', response.data)
			results.push({ file: firstFile.path, result: response.data })

			// Get the latest commit SHA after creating the first file
			const { data: refData } = await octokit.git.getRef({
				owner,
				repo: repoName,
				ref: `heads/${branch}`,
			})
			const latestCommitSha = refData.object.sha

			// If there are more files, create them using blobs/tree approach
			// if (filteredFiles.length > 1) {
			// 	console.log('[INIT] Creating remaining files using Git Data API')

			// 	// Create blobs for each remaining file
			// 	const blobPromises = filteredFiles.slice(1).map(async (file) => {
			// 		const { data: blobData } = await octokit.git.createBlob({
			// 			owner,
			// 			repo: repoName,
			// 			content: Buffer.from(file.content).toString('base64'),
			// 			encoding: 'base64',
			// 		})
			// 		console.log(`[INIT] Created blob for ${file.path}:`, blobData.sha)
			// 		return {
			// 			path: file.path,
			// 			sha: blobData.sha,
			// 			mode: '100644' as const, // Regular file with explicit type
			// 			type: 'blob' as const,
			// 		}
			// 	})

			// 	const treeItems = await Promise.all(blobPromises)

			// 	// Create a tree containing all the blobs
			// 	const { data: treeData } = await octokit.git.createTree({
			// 		owner,
			// 		repo: repoName,
			// 		base_tree: latestCommitSha,
			// 		tree: treeItems,
			// 	})
			// 	console.log('[INIT] Created tree:', treeData.sha)

			// 	// Get the latest commit to use as parent
			// 	const { data: commitData } = await octokit.git.getCommit({
			// 		owner,
			// 		repo: repoName,
			// 		commit_sha: latestCommitSha,
			// 	})

			// 	// Create a commit with the new tree
			// 	const { data: newCommitData } = await octokit.git.createCommit({
			// 		owner,
			// 		repo: repoName,
			// 		message: 'Add remaining files',
			// 		tree: treeData.sha,
			// 		parents: [commitData.sha],
			// 	})
			// 	console.log('[INIT] Created commit:', newCommitData.sha)

			// 	// Update the branch reference to point to the new commit
			// 	const { data: refUpdateData } = await octokit.git.updateRef({
			// 		owner,
			// 		repo: repoName,
			// 		ref: `heads/${branch}`,
			// 		sha: newCommitData.sha,
			// 	})
			// 	console.log('[INIT] Updated branch reference:', refUpdateData)

			// 	// Add results for the remaining files
			// 	filteredFiles.slice(1).forEach((file) => {
			// 		results.push({ file: file.path, result: 'Added via Git Data API' })
			// 	})
			// }
		} catch (error) {
			console.error(`[INIT] Error creating repository files:`, error)
			return NextResponse.json(
				{ error: `Error creating repository files: ${error}` },
				{ status: 500 }
			)
		}

		console.log('[INIT] All files created:', results)
		return NextResponse.json({
			repo: createRepoData,
			branch,
			url: createRepoData.html_url,
			initialCommit: true,
			files: results,
		})
	} catch (error) {
		console.error('Error initializing repository:', error)
		return NextResponse.json(
			{
				error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
			},
			{ status: 500 }
		)
	}
}
