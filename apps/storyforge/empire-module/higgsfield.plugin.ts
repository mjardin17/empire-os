/**
 * Higgsfield AI — PluginDescriptor for Empire OS PluginRegistry.
 *
 * Higgsfield is the default cinematic rendering provider for StoryForge.
 * It is already scaffolded in storyforge-engine/core/image/providers.py.
 * Activates when HIGGSFIELD_API_KEY + HIGGSFIELD_API_URL are set.
 *
 * Empire OS MCP server: mcp__16d46007-5a59-4d9d-8cc0-7748abeda183
 * Workspace ID: f4897b98   Plan: Plus
 */

import type { PluginDescriptor } from '@empire-os/core'

const capability = (name: string): { name: string; version: string } => ({ name, version: '1.0.0' })

export const HIGGSFIELD_PLUGIN: PluginDescriptor = {
  id: 'higgsfield',
  name: 'Higgsfield AI',
  version: '1.0.0',
  type: 'connector',
  capabilities: [
    capability('video-generate'),
    capability('image-generate'),
    capability('audio-generate'),
    capability('voice-clone'),
    capability('motion-control'),
    capability('shorts-studio'),
    capability('upscale-video'),
    capability('upscale-image'),
    capability('remove-background'),
    capability('reframe'),
    capability('dubbing'),
  ],
  description:
    'Cinematic AI video generation — default rendering provider for StoryForge. ' +
    'Character identity lock, lip-sync, motion control, upscaling. ' +
    'Connected via MCP (mcp__16d46007-5a59-4d9d-8cc0-7748abeda183).',
  status: 'active',
  registeredAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
  config: {
    workspaceId: 'f4897b98',
    plan: 'plus',
    mcpServer: 'mcp__16d46007-5a59-4d9d-8cc0-7748abeda183',
    // Python provider activates when these env vars are set:
    envVars: ['HIGGSFIELD_API_KEY', 'HIGGSFIELD_API_URL'],
    routingRules: {
      // Per Legend Empire routing rules — Higgsfield is ALWAYS used for:
      dialogueLipSync: true,
      characterIdentityLock: true,
    },
  },
}
