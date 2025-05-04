import { createContext, useContext, useState, ReactNode } from 'react'
import { TLShapeId } from 'tldraw'

type FocusPreviewContextType = {
	focusedPreviewId: TLShapeId | null
	setFocusedPreviewId: (id: TLShapeId | null) => void
}

const FocusPreviewContext = createContext<FocusPreviewContextType | undefined>(undefined)

export function FocusPreviewProvider({ children }: { children: ReactNode }) {
	const [focusedPreviewId, setFocusedPreviewId] = useState<TLShapeId | null>(null)

	return (
		<FocusPreviewContext.Provider value={{ focusedPreviewId, setFocusedPreviewId }}>
			{children}
		</FocusPreviewContext.Provider>
	)
}

export function useFocusPreview() {
	const context = useContext(FocusPreviewContext)
	if (context === undefined) {
		throw new Error('useFocusPreview must be used within a FocusPreviewProvider')
	}
	return context
}
