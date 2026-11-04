import { useEffect, useState } from 'react'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { ProactiveWatcher } from './ProactiveWatcher'

const WATCH_KEY = 'whiteboard-tutor:watch'

/** The student's opt-in for proactive watching (M8), kept in this browser. Off by default. */
export function useProactiveWatch(agent: TldrawAgent): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(() => localStorage.getItem(WATCH_KEY) === 'on')

	useEffect(() => {
		localStorage.setItem(WATCH_KEY, on ? 'on' : 'off')
		if (!on) return
		const watcher = new ProactiveWatcher(agent)
		watcher.start()
		return () => watcher.stop()
	}, [agent, on])

	return [on, setOn]
}
