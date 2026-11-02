import { Atom, atom } from 'tldraw'
import type { TutorTurnState } from '../../../shared/tutor/buildTutorTurnContent'
import type { TutorIntent } from '../../../shared/tutor/TutorIntent'
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
	 * Start a new student turn with the given intent.
	 * For a hint, `hintsGiven` is the number of hints before this one.
	 */
	beginTurn(intent: TutorIntent): void {
		const hintsGiven = this.hintPresses
		if (intent === 'hint') this.hintPresses++
		this.$state.set({ intent, hintsGiven })
	}

	reset(): void {
		this.hintPresses = 0
		this.$state.set(INITIAL_STATE)
	}
}
