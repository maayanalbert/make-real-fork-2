// File traversal and gitignore handling utilities

// Check if a path should be ignored based on gitignore patterns
const shouldIgnore = (path: string, patterns: string[]): boolean => {
	// Always ignore node_modules and .env files
	if (path.includes('node_modules') || path === 'node_modules' || path.startsWith('.env')) {
		console.log('Ignoring node_modules or .env:', path)
		return true
	}

	// Add .git to patterns
	patterns.push('.git')

	return patterns.some((pattern) => {
		// Handle directory patterns
		if (path.startsWith(pattern) || path.startsWith(pattern.slice(1))) {
			console.log('Directory pattern match:', pattern, 'for path:', path)
			return true
		}

		// Handle wildcards
		let regexPattern = pattern
			.replace(/\./g, '\\.') // Escape dots
			.replace(/\*/g, '[^/]*') // * matches anything except /
			.replace(/\?/g, '.') // ? matches any single character

		// Handle leading slash
		if (pattern.startsWith('/')) {
			regexPattern = '^' + regexPattern
		} else {
			regexPattern = '^' + regexPattern + '|^.*/' + regexPattern + '$'
		}

		const regex = new RegExp(regexPattern)
		const matches = regex.test(path)
		if (matches) {
			console.log('Pattern match:', pattern, 'for path:', path)
		}
		return matches
	})
}

// Parse gitignore file content
const parseGitignore = (content: string): string[] => {
	return content
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'))
}

// Read files from directory recursively
const readFilesRecursively = async (
	dirHandle: FileSystemDirectoryHandle,
	path = '',
	ignorePatterns: string[] = []
): Promise<{ path: string; content: string }[]> => {
	const results: { path: string; content: string }[] = []

	// Check if dirHandle has values method before proceeding
	if (!dirHandle.values) {
		console.error('Directory handle does not support values() method')
		return results
	}

	try {
		// Try to read gitignore if we're at the root
		if (path === '') {
			try {
				if (dirHandle.getFileHandle) {
					const gitignoreHandle = await dirHandle.getFileHandle('.gitignore')
					if (gitignoreHandle) {
						const file = await gitignoreHandle.getFile()
						const content = await file.text()
						const patterns = parseGitignore(content)
						ignorePatterns = [...ignorePatterns, ...patterns]
						console.log('Found .gitignore with patterns:', ignorePatterns)
					}
				}
			} catch (error) {
				console.log('No .gitignore file found, using default patterns')
			}
		}

		// Read directory entries
		for await (const entry of dirHandle.values()) {
			const entryPath = path ? `${path}/${entry.name}` : entry.name

			// Skip if path should be ignored
			if (shouldIgnore(entryPath, ignorePatterns)) {
				continue
			}

			// Skip paths with special characters that might cause filesystem issues
			if (hasProblematicPath(entryPath)) {
				console.log(`Skipping problematic path: ${entryPath}`)
				continue
			}

			if (entry.kind === 'file') {
				const fileHandle = entry as FileSystemFileHandle
				const file = await fileHandle.getFile()
				const content = await file.text()
				results.push({ path: entryPath, content })
			} else if (entry.kind === 'directory') {
				const subDirHandle = entry as FileSystemDirectoryHandle
				// No need to check subDirHandle.values since we cast it to the same type
				const subEntries = await readFilesRecursively(subDirHandle, entryPath, ignorePatterns)
				results.push(...subEntries)
			}
		}
	} catch (error) {
		console.error('Error reading directory:', error)
	}

	return results
}

// Check if a path contains characters that might cause problems with LightningFS
const hasProblematicPath = (path: string): boolean => {
	// Check for problematic patterns like parentheses, special characters, etc.
	if (path.includes('(') || path.includes(')')) {
		console.log(`Path contains parentheses which may cause issues: ${path}`)
		return true
	}

	// Other potentially problematic characters in paths
	const problematicChars = ['*', '?', '<', '>', '|', '"', ':', '[', ']']
	for (const char of problematicChars) {
		if (path.includes(char)) {
			console.log(`Path contains problematic character '${char}': ${path}`)
			return true
		}
	}

	return false
}

export { readFilesRecursively, shouldIgnore, parseGitignore }
