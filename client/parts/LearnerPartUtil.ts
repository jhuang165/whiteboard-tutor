import { LearnerPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { getLearnerId } from '../tutor/learnerApi'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/** Who the learner is. The worker fills in their evidence summary from the learner store. */
export const LearnerPartUtil = registerPromptPartUtil(
	class LearnerPartUtil extends PromptPartUtil<LearnerPart> {
		static override type = 'learner' as const

		override getPart(_request: AgentRequest): LearnerPart {
			return { type: 'learner', learnerId: getLearnerId() }
		}
	}
)
