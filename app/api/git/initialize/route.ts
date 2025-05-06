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

		const results = []
		for (const file of nonEmptyFiles) {
			console.log(`[INIT] Creating file via Contents API: ${file.path}`)
			console.log('[INIT] Params:', {
				owner,
				repo: repoName,
				path: file.path,
				branch,
				contentPreview: file.content.slice(0, 100),
				contentLength: file.content.length,
			})
			try {
				const response: any = await octokit.repos.createOrUpdateFileContents({
					owner,
					repo: repoName,
					path: file.path,
					message: results.length === 0 ? 'Initial commit' : `Add ${file.path}`,
					content: Buffer.from(file.content).toString('base64'),
					branch,
				})
				console.log('[INIT] createOrUpdateFileContents response:', response)
				results.push({ file: file.path, result: response.data })
			} catch (error) {
				console.error(`[INIT] Error creating file ${file.path}:`, error)
				results.push({ file: file.path, error })
			}
		}
		console.log('[INIT] All files created via Contents API:', results)
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
