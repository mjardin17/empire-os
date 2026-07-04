import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Empire OS',
  description: 'AI YouTube factory management system — Viral Engine',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
