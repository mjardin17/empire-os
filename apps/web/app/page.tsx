export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Empire OS</h1>
      <p>Viral Engine — AI YouTube factory management system</p>
      <nav style={{ marginTop: '1rem' }}>
        <ul>
          <li><a href="/dashboard">Dashboard</a></li>
          <li><a href="/channels">Channels</a></li>
          <li><a href="/episodes">Episodes</a></li>
          <li><a href="/pipeline">Pipeline</a></li>
          <li><a href="/agents">Agents</a></li>
          <li><a href="/analytics">Analytics</a></li>
          <li><a href="/settings">Settings</a></li>
        </ul>
      </nav>
    </main>
  )
}
