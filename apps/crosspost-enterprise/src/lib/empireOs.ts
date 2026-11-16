// The Empire OS server every panel talks to. Default http://localhost:4000 (Boss Listers keeps
// 3001). Set VITE_EMPIRE_OS_URL in apps/crosspost-enterprise/.env to point somewhere else.
export const EMPIRE_OS: string =
  ((import.meta as any).env?.VITE_EMPIRE_OS_URL as string | undefined)?.trim().replace(/\/+$/, "") || "http://localhost:4000";
