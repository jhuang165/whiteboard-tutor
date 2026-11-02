import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { ProblemPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { getProblemState } from '../tutor/problemState'
import { getLatestProblemFrame } from '../tutor/tutorMarks'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/** The current problem and its attempt state. The worker adds the checked answer. */
export const ProblemPartUtil = registerPromptPartUtil(
	class ProblemPartUtil extends PromptPartUtil<ProblemPart> {
		static override type = 'problem' as const

		override getPart(_request: AgentRequest): ProblemPart {
			const frame = getLatestProblemFrame(this.editor)
			if (!frame) return { type: 'problem', problem: null }
			const state = getProblemState(frame)
			return {
				type: 'problem',
				problem: {
					shapeId: convertTldrawIdToSimpleId(frame.id),
					problemId: state.problemId,
					concept: state.concept,
					title: frame.props.title,
					statement: frame.props.statement,
					status: state.status,
					hintRungs: state.hintRungs,
					incorrectChecks: state.incorrectChecks,
					verification: state.verification,
				},
			}
		}
	}
)
