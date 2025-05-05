import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type WorkingDirectoryContextType = {
	workingDirectory: string
	setWorkingDirectory: (path: string) => void
	isDirectorySet: boolean
}

const WorkingDirectoryContext = createContext<WorkingDirectoryContextType | undefined>(undefined)

const STORAGE_KEY = 'working-directory-path'

export function WorkingDirectoryProvider({ children }: { children: ReactNode }) {
	const [workingDirectory, setWorkingDirectoryState] = useState<string>('')
	const [isDirectorySet, setIsDirectorySet] = useState<boolean>(false)

	// Load from localStorage on initial mount
	useEffect(() => {
		const storedPath = localStorage.getItem(STORAGE_KEY)
		if (storedPath) {
			setWorkingDirectoryState(storedPath)
			setIsDirectorySet(true)
		}
	}, [])

	// Function to update the working directory and save to localStorage
	const setWorkingDirectory = (path: string) => {
		localStorage.setItem(STORAGE_KEY, path)
		setWorkingDirectoryState(path)
		setIsDirectorySet(true)
	}

	return (
		<WorkingDirectoryContext.Provider
			value={{ workingDirectory, setWorkingDirectory, isDirectorySet }}
		>
			{children}
		</WorkingDirectoryContext.Provider>
	)
}

export function useWorkingDirectory() {
	const context = useContext(WorkingDirectoryContext)
	if (context === undefined) {
		throw new Error('useWorkingDirectory must be used within a WorkingDirectoryProvider')
	}
	return context
}
