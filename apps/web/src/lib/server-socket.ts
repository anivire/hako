import { useQueryClient } from '@tanstack/react-query'
import type { ConsoleMessage, Server, ServerStats } from '@hako/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { keys } from './queries'

const MAX_CHARS = 400_000
export const SAMPLES = 120

type LogListener = (chunk: string, reset: boolean) => void

export interface ServerSocket {
  stats: ServerStats[]
  players: string[]
  connected: boolean
  loaded: boolean
  send: (command: string) => void
  buffer: () => string
  onLog: (listener: LogListener) => () => void
}

export function useServerSocket(id: string): ServerSocket {
  const client = useQueryClient()
  const [stats, setStats] = useState<ServerStats[]>([])
  const [players, setPlayers] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const log = useRef('')
  const listeners = useRef(new Set<LogListener>())
  useEffect(() => {
    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const emit = (chunk: string, reset: boolean) => {
      for (const listener of listeners.current) listener(chunk, reset)
    }
    const connect = () => {
      const ws = new WebSocket(api.consoleUrl(id))
      socket.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ConsoleMessage
        if (message.type === 'history') {
          setLoaded(true)
          log.current = message.data
          emit(message.data, true)
        } else if (message.type === 'log') {
          log.current = (log.current + message.data).slice(-MAX_CHARS)
          emit(message.data, false)
        } else if (message.type === 'players') {
          setPlayers(message.players)
        } else if (message.type === 'stats') {
          setStats((prev) => [...prev, message.stats].slice(-SAMPLES))
        } else {
          const previous = client.getQueryData<Server>(keys.server(id))?.status
          client.setQueryData<Server>(keys.server(id), (s) => (s ? { ...s, status: message.status, startedAt: message.startedAt } : s))
          if (previous && previous !== message.status) {
            client.invalidateQueries({ queryKey: keys.servers, exact: true })
            client.invalidateQueries({ queryKey: ['files', id] })
            client.invalidateQueries({ queryKey: ['file', id] })
            client.invalidateQueries({ queryKey: keys.addons(id) })
          }
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      socket.current?.close()
    }
  }, [id, client])
  const stable = useMemo(
    () => ({
      send: (command: string) => socket.current?.send(JSON.stringify({ type: 'command', command })),
      buffer: () => log.current,
      onLog: (listener: LogListener) => {
        listeners.current.add(listener)
        return () => {
          listeners.current.delete(listener)
        }
      },
    }),
    [],
  )
  return { stats, players, connected, loaded, ...stable }
}
