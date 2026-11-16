/**
 * Boss Listers EmpireModule: the reseller app (boss-listers-mvp) runs as its own Next.js
 * process. Empire OS proxies /bosslisters/* to its Empire OS contract routes.
 *
 *   BOSSLISTERS_BASE_URL    default http://localhost:3001 (Boss Listers' own port)
 *   BOSSLISTERS_EMPIRE_KEY  sent as X-Empire-Key; must equal EMPIRE_SHARED_KEY in Boss Listers.
 *                           Without it only /empire/health works.
 *
 * Posting to selling sites stays in Boss Listers. Through Empire OS you can read the stock
 * list and add an item as an unlisted draft; nothing here can post or publish a listing.
 */

import { RemoteAppModule } from '@empire-os/core'
import type { RemoteAppOptions } from '@empire-os/core'

export const BOSSLISTERS_DEFAULT_URL = 'http://localhost:3001'

export function bossListersOptions(env: Record<string, string | undefined> = process.env): RemoteAppOptions {
  return {
    moduleId: 'bosslisters',
    name: 'Boss Listers',
    version: '1.0.0',
    description: 'Reseller platform: in-house stock list, cross-listing to selling sites, orders. Runs as its own app.',
    baseUrlEnv: 'BOSSLISTERS_BASE_URL',
    defaultBaseUrl: BOSSLISTERS_DEFAULT_URL,
    capabilities: ['listing-summary', 'listing-list', 'platform-status', 'stock-add-draft'],
    endpoints: [
      { path: '/empire/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/empire/event', method: 'POST', description: 'Accept an Empire OS event' },
      { path: '/empire/event', method: 'GET', description: 'Last 50 events Boss Listers received' },
      { path: '/empire/listings', method: 'GET', description: 'Stock list totals by stage and the newest items (?limit=&stage=)' },
      { path: '/empire/platforms', method: 'GET', description: 'Which selling sites have credentials set (no live calls)' },
      { path: '/empire/stock/add', method: 'POST', description: 'Add an item to the stock list as an unlisted draft ("dryRun": true only checks)' },
    ],
    forwardTopics: ['system.alert'],
    authHeaders: (): Record<string, string> => {
      const key = (env.BOSSLISTERS_EMPIRE_KEY || '').trim()
      return key ? { 'x-empire-key': key } : {}
    },
    priority: 20,
    env,
  }
}

export class BossListersModule extends RemoteAppModule {
  constructor(env: Record<string, string | undefined> = process.env) {
    super(bossListersOptions(env))
  }
}

export default BossListersModule
