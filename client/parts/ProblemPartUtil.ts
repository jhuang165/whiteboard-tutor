import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { ProblemPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { getLatestProblemFrame } from '../tutor/tutorMarks'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const ProblemPartUtil = registerPromptPartUtil(
	class ProblemPartUtil extends PromptPartUtil<ProblemPart> {
		static override type = 'problem' as const

		override getPart(_request: AgentRequest): ProblemPart {
			const frame = getLatestProblemFrame(this.editor)
			if (!frame) return { type: 'problem', problem: null }
			return {
				type: 'problem',
				problem: {
					shapeId: convertTldrawIdToSimpleId(frame.id),
					title: frame.props.title,
					statement: frame.props.statement,
				},
			}
		}
	}
)
