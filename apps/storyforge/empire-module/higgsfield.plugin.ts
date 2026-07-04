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

export const HIGGSFIELD_PLUGIN: PluginDescriptor = {
  id: 'higgsfield',
  name: 'Higgsfield AI',
  version: '1.0.0',
  type: 'connector',
  capabilities: [
    'video-generate',
    'image-generate',
    'audio-generate',
    'voice-clone',
    'motion-control',
    'shorts-studio',
    'upscale-video',
    'upscale-image',
    'remove-background',
    'reframe',
    'dubbing',
  ],
  description:
    'Cinematic AI video generation — default rendering provider for StoryForge. ' +
    'Character identity lock, lip-sync, motion control, upscaling. ' +
    'Connected via MCP (mcp__16d46007-5a59-4d9d-8cc0-7748abeda183).',
  status: 'active',
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
