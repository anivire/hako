export function orderServers<T extends { id: string }>(servers: T[], order: string[], hidden: string[] = []): T[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  return servers
    .map((server, i) => ({ server, i }))
    .sort((a, b) => (rank.get(a.server.id) ?? order.length + a.i) - (rank.get(b.server.id) ?? order.length + b.i))
    .map(({ server }) => server)
    .filter((server) => !hidden.includes(server.id))
}
