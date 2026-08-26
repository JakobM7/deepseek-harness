import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'

async function makeCoreContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  return ctx
}

describe('agent-loop unpublished setup', () => {
  it('runs for configured roots before registry publication', async () => {
    const ctx = await makeCoreContext()
    const order: string[] = []

    ctx.on('agent-loop/unpublished-setup', ({ agent, owner }) => {
      order.push('setup')
      expect(owner).toBeUndefined()
      expect(ctx.agents.get(agent.id)).toBeUndefined()
      expect(ctx.sessions.get(agent.id)).toBeUndefined()
    })
    ctx.on('agent/created', () => { order.push('created') })

    await ctx.plugin(AgentLoop, {
      agents: [{ id: 'main', sessionId: SessionId('unpublished-root'), model: 'mock' }],
    })

    expect(order).toEqual(['setup', 'created'])
    expect(ctx.agents.get(SessionId('unpublished-root'))).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('rolls the whole unpublished Agent scope back when setup vetoes creation', async () => {
    const ctx = await makeCoreContext()
    const cleaned = vi.fn()
    const failure = new Error('composition rejected')

    ctx.on('agent-loop/unpublished-setup', ({ agent }) => {
      agent.ctx.effect(() => () => { cleaned() }, 'test unpublished contribution')
    })
    ctx.on('agent-loop/unpublished-setup', () => { throw failure })

    await expect(ctx.plugin(AgentLoop, {
      agents: [{ id: 'main', sessionId: SessionId('unpublished-veto'), model: 'mock' }],
    })).rejects.toThrow('composition rejected')

    await expect.poll(() => cleaned).toHaveBeenCalledOnce()
    expect(ctx.agents.get(SessionId('unpublished-veto'))).toBeUndefined()
    expect(ctx.sessions.get(SessionId('unpublished-veto'))).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('rejects async listeners instead of silently making configured startup async', async () => {
    const ctx = await makeCoreContext()
    ctx.on('agent-loop/unpublished-setup', () => Promise.resolve() as never)

    await expect(ctx.plugin(AgentLoop, {
      agents: [{ id: 'main', sessionId: SessionId('unpublished-async'), model: 'mock' }],
    })).rejects.toThrow('agent-loop/unpublished-setup listeners must be synchronous')

    expect(ctx.agents.get(SessionId('unpublished-async'))).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('runs before caller AgentSetup and reports the process-local parent', async () => {
    const ctx = await makeCoreContext()
    const order: string[] = []
    await ctx.plugin(AgentLoop, {
      agents: [{ id: 'main', sessionId: SessionId('unpublished-parent'), model: 'mock' }],
    })
    const parent = ctx.agents.get(SessionId('unpublished-parent'))
    expect(parent).toBeDefined()

    ctx.on('agent-loop/unpublished-setup', ({ agent, owner }) => {
      if (agent.id !== SessionId('unpublished-child')) return
      order.push('global')
      expect(owner).toBe(parent)
      expect(ctx.agents.get(agent.id)).toBeUndefined()
    })
    ctx.on('agent/created', ({ agent }) => {
      if (agent.id === SessionId('unpublished-child')) order.push('created')
    })

    const handle = await parent!.ctx.agents.create({
      sessionId: SessionId('unpublished-child'),
      agentOptions: { model: 'mock' },
      setup() {
        order.push('caller')
        return { commit() { order.push('commit') } }
      },
    })

    expect(order).toEqual(['global', 'caller', 'commit', 'created'])
    await handle.dispose()
    await ctx.fiber.dispose()
  })
})
