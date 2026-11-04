import { DiagramShapeUtil } from './DiagramShapeUtil'
import { MathShapeUtil } from './MathShapeUtil'
import { ProblemFrameShapeUtil } from './ProblemFrameShapeUtil'
import { TranscriptionShapeUtil } from './TranscriptionShapeUtil'

/**
 * Tutor shapes: a posed problem with a work area, typeset math, a reading of the student's
 * handwriting, and diagrams from the representation library. Every editor needs them.
 */
export const TUTOR_SHAPE_UTILS = [ProblemFrameShapeUtil, MathShapeUtil, TranscriptionShapeUtil, DiagramShapeUtil]
