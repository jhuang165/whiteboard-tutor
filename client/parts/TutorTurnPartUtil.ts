import { TutorTurnPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const TutorTurnPartUtil = registerPromptPartUtil(
	class TutorTurnPartUtil extends PromptPartUtil<TutorTurnPart> {
		static override type = 'tutorTurn' as const

		override getPart(_request: AgentRequest): TutorTurnPart {
			return { type: 'tutorTurn', ...this.agent.tutor.getState() }
		}
	}
)
