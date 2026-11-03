import { MathShapeUtil } from './MathShapeUtil'
import { ProblemFrameShapeUtil } from './ProblemFrameShapeUtil'
import { TranscriptionShapeUtil } from './TranscriptionShapeUtil'

/**
 * Tutor shapes: a posed problem with a work area, typeset math, and a reading of the
 * student's handwriting. Every editor needs them.
 */
export const TUTOR_SHAPE_UTILS = [ProblemFrameShapeUtil, MathShapeUtil, TranscriptionShapeUtil]
