import { DurableObject } from 'cloudflare:workers'
import {
	ConceptSummary,
	EvidenceEvent,
	EvidenceLevel,
	EvidenceRecord,
	summarizeEvidence,
	toEvidenceRecord,
} from '../../shared/tutor/evidence'
import type { HistoryProblem } from '../../shared/tutor/history'
import type { ProblemVerification, VerificationStatus } from '../../shared/tutor/verification'
import { Environment } from '../environment'

/**
 * One learner's store (PLAN §4 LearnerDO): the problems they were posed with their checked
 * answers, and their evidence records (pedagogy-spec L). SQLite-backed; called over RPC.
 *
 * Checked answers live only here, so the client never receives them.
 */
export class LearnerDurableObject extends DurableObject<Environment> {
	private sql: SqlStorage

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.sql = ctx.storage.sql
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS problems (
				problem_id TEXT PRIMARY KEY,
				concept TEXT NOT NULL,
				title TEXT NOT NULL DEFAULT '',
				statement TEXT NOT NULL,
				status TEXT NOT NULL,
				answer TEXT NOT NULL,
				method TEXT NOT NULL,
				issue TEXT NOT NULL,
				checked_with_code INTEGER NOT NULL,
				checked_at INTEGER NOT NULL,
				posed_at INTEGER
			);
			CREATE TABLE IF NOT EXISTS evidence (
				id TEXT PRIMARY KEY,
				concept TEXT NOT NULL,
				level TEXT NOT NULL,
				problem_id TEXT,
				hint_rungs TEXT NOT NULL,
				at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS evidence_concept ON evidence (concept);
		`)
		// Stores made before session history have no title or posed time.
		const columns = this.sql
			.exec<{ name: string }>('PRAGMA table_info(problems)')
			.toArray()
			.map((c) => c.name)
		if (!columns.includes('title')) this.sql.exec(`ALTER TABLE problems ADD COLUMN title TEXT NOT NULL DEFAULT ''`)
		if (!columns.includes('posed_at')) this.sql.exec('ALTER TABLE problems ADD COLUMN posed_at INTEGER')
	}

	/** List a problem as soon as it is posed, so history keeps it even if its check fails. */
	notePosed(problem: PosedProblem) {
		this.sql.exec(
			`INSERT OR IGNORE INTO problems
				(problem_id, concept, title, statement, status, answer, method, issue, checked_with_code, checked_at, posed_at)
			VALUES (?, ?, ?, ?, 'pending', '', '', '', 0, 0, ?)`,
			problem.problemId,
			problem.concept,
			problem.title,
			problem.statement,
			Date.now()
		)
	}

	saveVerification(problem: PosedProblem, result: ProblemVerification) {
		const now = Date.now()
		this.sql.exec(
			`INSERT INTO problems
				(problem_id, concept, title, statement, status, answer, method, issue, checked_with_code, checked_at, posed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (problem_id) DO UPDATE SET
				status = excluded.status, answer = excluded.answer, method = excluded.method,
				issue = excluded.issue, checked_with_code = excluded.checked_with_code, checked_at = excluded.checked_at`,
			problem.problemId,
			problem.concept,
			problem.title,
			problem.statement,
			result.status,
			result.answer,
			result.method,
			result.issue,
			result.checkedWithCode ? 1 : 0,
			now,
			now
		)
	}

	/** The check threw. A late success can still overwrite this. */
	noteCheckFailed(problemId: string) {
		this.sql.exec(`UPDATE problems SET status = 'failed' WHERE problem_id = ? AND status = 'pending'`, problemId)
	}

	getVerification(problemId: string): ProblemVerification | null {
		const row = this.sql
			.exec<{ status: string; answer: string; method: string; issue: string; checked_with_code: number }>(
				`SELECT status, answer, method, issue, checked_with_code FROM problems
				WHERE problem_id = ? AND status IN ('checked', 'flawed')`,
				problemId
			)
			.toArray()[0]
		if (!row) return null
		return {
			status: row.status === 'flawed' ? 'flawed' : 'checked',
			answer: row.answer,
			method: row.method,
			issue: row.issue,
			checkedWithCode: row.checked_with_code === 1,
		}
	}

	/** Store the record for an event, at the level the shared rules give it. Null if it adds nothing. */
	recordEvidence(event: EvidenceEvent): EvidenceRecord | null {
		const record = toEvidenceRecord(event, this.listEvidence(), Date.now(), crypto.randomUUID())
		if (!record) return null
		this.sql.exec(
			'INSERT INTO evidence (id, concept, level, problem_id, hint_rungs, at) VALUES (?, ?, ?, ?, ?, ?)',
			record.id,
			record.concept,
			record.level,
			record.problemId,
			JSON.stringify(record.hintRungs),
			record.at
		)
		return record
	}

	/** Every record, newest first. */
	listEvidence(): EvidenceRecord[] {
		return this.sql
			.exec<{ id: string; concept: string; level: string; problem_id: string | null; hint_rungs: string; at: number }>(
				'SELECT id, concept, level, problem_id, hint_rungs, at FROM evidence ORDER BY at DESC'
			)
			.toArray()
			.map((row) => ({
				id: row.id,
				concept: row.concept,
				level: row.level as EvidenceLevel,
				problemId: row.problem_id,
				hintRungs: JSON.parse(row.hint_rungs) as string[],
				at: row.at,
			}))
	}

	getSummary(): ConceptSummary[] {
		return summarizeEvidence(this.listEvidence())
	}

	/** Every posed problem, newest first, without its checked answer or method. */
	listProblems(): HistoryProblem[] {
		return this.sql
			.exec<{
				problem_id: string
				concept: string
				title: string
				statement: string
				status: string
				issue: string
				posed_at: number
			}>(
				`SELECT problem_id, concept, title, statement, status, issue, COALESCE(posed_at, checked_at) AS posed_at
				FROM problems ORDER BY posed_at DESC`
			)
			.toArray()
			.map((row) => ({
				problemId: row.problem_id,
				concept: row.concept,
				title: row.title,
				statement: row.statement,
				posedAt: row.posed_at,
				verification: row.status as VerificationStatus,
				issue: row.status === 'flawed' ? row.issue : '',
			}))
	}
}

interface PosedProblem {
	problemId: string
	concept: string
	title: string
	statement: string
}

/** Learner ids come from the browser, so accept only the UUID shape the client makes. */
export function isLearnerId(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
}

export function getLearnerStub(env: Environment, learnerId: string) {
	return env.LEARNER_DURABLE_OBJECT.get(env.LEARNER_DURABLE_OBJECT.idFromName(learnerId))
}
