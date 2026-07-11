import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { EventDto, GameDto } from '@/app/core/models/dto'

const updateScore = vi.fn()
vi.mock('@/app/features/events/services/events.api', () => ({
  eventsApi: {
    updateScore: (...args: unknown[]) => updateScore(...args)
  }
}))

import { useScoreAutosave, getResultFromScores } from '@/app/features/events/composables/useScoreAutosave'

function makeGame(id: string): GameDto {
  return {
    id,
    roundIndex: 0,
    courtIndex: 0,
    team1: [{ id: 'p1', displayName: 'A' }, { id: 'p2', displayName: 'B' }],
    team2: [{ id: 'p3', displayName: 'C' }, { id: 'p4', displayName: 'D' }],
    result: 'UNSET'
  }
}

function makeEvent(): EventDto {
  return {
    id: 'e1',
    groupId: 'g1',
    status: 'GENERATED',
    courts: 1,
    rounds: 1,
    participantCount: 4,
    games: [makeGame('game1')]
  }
}

// The composable registers onUnmounted, so exercise it inside a component
function setup() {
  const event = ref<EventDto | null>(makeEvent())
  const onError = vi.fn()
  const reload = vi.fn().mockResolvedValue(undefined)
  let engine!: ReturnType<typeof useScoreAutosave>
  const wrapper = mount(
    defineComponent({
      setup() {
        engine = useScoreAutosave(event, { onError, reload })
        return () => null
      }
    })
  )
  return { event, onError, reload, engine, wrapper }
}

describe('useScoreAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateScore.mockReset()
    updateScore.mockImplementation(async (gameId: string, body: { scoreTeam1?: number; scoreTeam2?: number }) => ({
      ...makeGame(gameId),
      scoreTeam1: body.scoreTeam1,
      scoreTeam2: body.scoreTeam2,
      result: getResultFromScores(body.scoreTeam1, body.scoreTeam2)
    }))
  })

  it('applies the score optimistically and debounces the save', async () => {
    const { event, engine } = setup()
    engine.debouncedSave('game1', 11, 7)

    // Optimistic before any network call
    expect(event.value!.games[0].scoreTeam1).toBe(11)
    expect(event.value!.games[0].result).toBe('TEAM1_WIN')
    expect(updateScore).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(updateScore).toHaveBeenCalledOnce()
    expect(updateScore).toHaveBeenCalledWith('game1', { scoreTeam1: 11, scoreTeam2: 7 })
  })

  it('collapses rapid edits into one save', async () => {
    const { engine } = setup()
    engine.debouncedSave('game1', 1, 0)
    await vi.advanceTimersByTimeAsync(200)
    engine.debouncedSave('game1', 11, 0)
    await vi.advanceTimersByTimeAsync(200)
    engine.debouncedSave('game1', 11, 9)
    await vi.advanceTimersByTimeAsync(500)

    expect(updateScore).toHaveBeenCalledOnce()
    expect(updateScore).toHaveBeenCalledWith('game1', { scoreTeam1: 11, scoreTeam2: 9 })
  })

  it('marks GENERATED events IN_PROGRESS after a successful save', async () => {
    const { event, engine } = setup()
    await engine.saveNow('game1', 11, 5)
    expect(event.value!.status).toBe('IN_PROGRESS')
    expect(engine.savedGameIds.value.has('game1')).toBe(true)
  })

  it('queues a save issued while another is in flight, then runs it after backoff', async () => {
    const { engine } = setup()
    let resolveFirst!: (v: unknown) => void
    updateScore.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve })
    )

    void engine.saveNow('game1', 5, 0)
    void engine.saveNow('game1', 11, 3) // queued behind the in-flight save
    expect(updateScore).toHaveBeenCalledOnce()

    resolveFirst({ ...makeGame('game1'), scoreTeam1: 5, scoreTeam2: 0, result: 'TEAM1_WIN' })
    await vi.advanceTimersByTimeAsync(1000) // queued save runs after base backoff
    expect(updateScore).toHaveBeenCalledTimes(2)
    expect(updateScore).toHaveBeenLastCalledWith('game1', { scoreTeam1: 11, scoreTeam2: 3 })
  })

  it('reports the error and reloads after a failed save with nothing queued', async () => {
    const { onError, reload, engine } = setup()
    updateScore.mockRejectedValueOnce(new Error('network down'))
    await engine.saveNow('game1', 8, 8)
    expect(onError).toHaveBeenCalledWith('network down')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('flushes a pending debounced save on unmount so no score is lost', async () => {
    const { engine, wrapper } = setup()
    engine.debouncedSave('game1', 11, 2)
    expect(updateScore).not.toHaveBeenCalled()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(updateScore).toHaveBeenCalledWith('game1', { scoreTeam1: 11, scoreTeam2: 2 })
  })

  it('derives results including ties', () => {
    expect(getResultFromScores(11, 7)).toBe('TEAM1_WIN')
    expect(getResultFromScores(3, 9)).toBe('TEAM2_WIN')
    expect(getResultFromScores(8, 8)).toBe('TIE')
    expect(getResultFromScores(undefined, 5)).toBe('UNSET')
  })
})
