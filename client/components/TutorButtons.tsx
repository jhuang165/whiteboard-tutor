import { TUTOR_BUTTONS, TutorIntent } from '../../shared/tutor/TutorIntent'

/**
 * One-press tutor requests. Each button names the tutor mode for the turn, so the student
 * doesn't have to phrase the request (pedagogy-spec M1, M2, M3, M6).
 */
export function TutorButtons({ onPress }: { onPress: (intent: TutorIntent, message: string) => void }) {
	return (
		<div className="tutor-buttons">
			{TUTOR_BUTTONS.map(({ intent, label, message }) => (
				<button
					key={intent}
					type="button"
					className="tutor-button"
					data-intent={intent}
					onClick={() => onPress(intent, message)}
				>
					{label}
				</button>
			))}
		</div>
	)
}
