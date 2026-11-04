import { Atom, atom } from 'tldraw'
import type { TutorTurnState } from '../../../shared/tutor/buildTutorTurnContent'
import type { TutorIntent } from '../../../shared/tutor/TutorIntent'
import { noteExposure } from '../../tutor/problemTracking'
import type { TldrawAgent } from '../TldrawAgent'
import { BaseAgentManager } from './BaseAgentManager'

const INITIAL_STATE: TutorTurnState = { intent: 'chat', hintsGiven: 0 }

/**
 * Tracks the tutor mode for the current turn and the hint ladder state.
 *
 * The intent is set when the student submits (a button press or a typed message) and
 * stays put for the agent's own follow-up requests in the same turn, so a continuation
 * keeps the mode the student asked for.
 */
export class AgentTutorManager extends BaseAgentManager {
	private $state: Atom<TutorTurnState>

	/** Hint presses so far, including any in flight. Shown to the model as `hintsGiven`. */
	private hintPresses = 0

	constructor(agent: TldrawAgent) {
		super(agent)
		this.$state = atom<TutorTurnState>('tutorTurn', INITIAL_STATE)
	}

	getState(): TutorTurnState {
		return this.$state.get()
	}

	/**
	 * Start a new turn with the given intent.
	 * For a hint, `hintsGiven` is the number of hints before this one. `reviewConcept` starts a
	 * Quiz turn as the scheduled review of that concept; `watchReason` is what triage flagged on
	 * a Watch turn.
	 */
	beginTurn(intent: TutorIntent, detail: { reviewConcept?: string; watchReason?: string } = {}): void {
		const hintsGiven = this.hintPresses
		if (intent === 'hint') this.hintPresses++
		const { reviewConcept, watchReason } = detail
		this.$state.set({
			intent,
			hintsGiven,
			...(intent === 'quiz' && reviewConcept ? { reviewConcept } : {}),
			...(intent === 'watch' && watchReason ? { watchReason } : {}),
		})
		this.exposurePending = intent === 'explain' || intent === 'wait-what'
	}

	/** Whether this turn's explanation still has to be recorded as exposure (L1). */
	private exposurePending = false

	/**
	 * Called when a request finishes without error or cancel. The first one after an Explain
	 * or Wait-what press records exposure for the current problem's concept.
	 */
	onRequestDone(): void {
		if (!this.exposurePending) return
		this.exposurePending = false
		noteExposure(this.agent.editor)
	}

	reset(): void {
		this.hintPresses = 0
		this.exposurePending = false
		this.$state.set(INITIAL_STATE)
	}
}
