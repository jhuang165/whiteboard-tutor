import { FormEventHandler, useCallback, useRef } from 'react'
import { TutorIntent } from '../../shared/tutor/TutorIntent'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { EvidencePanel } from './EvidencePanel'
import { ReviewQueue } from './ReviewQueue'
import { TodoList } from './TodoList'
import { TutorButtons } from './TutorButtons'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)

	// Start a student turn. Sending a new message interrupts the current request.
	const send = useCallback(
		(intent: TutorIntent, message: string, reviewConcept?: string) => {
			agent.tutor.beginTurn(intent, reviewConcept)
			agent.interrupt({
				input: {
					agentMessages: [message],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent]
	)

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// Clear the chat input (context is cleared after it's captured in requestAgentActions)
			inputRef.current.value = ''

			send('chat', value)
		},
		[agent, send]
	)

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<EvidencePanel />
				<button className="new-chat-button" onClick={handleNewChat}>
					+
				</button>
			</div>
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ReviewQueue onStart={(concept, message) => send('quiz', message, concept)} />
				<TutorButtons onPress={send} />
				<ChatInput handleSubmit={handleSubmit} inputRef={inputRef} />
			</div>
		</div>
	)
}
