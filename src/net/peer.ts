import Peer, { type DataConnection } from 'peerjs'
import type { Action, RoomState } from '../types'

type GuestToHost = { kind: 'join'; name: string } | { kind: 'action'; action: Action }
type HostToGuest = { kind: 'state'; state: RoomState }

export function peerIdForCode(code: string): string {
  return `pips-${code.toLowerCase().replace(/[^a-z0-9-]/g, '')}`
}

export interface HostCallbacks {
  onJoin: (guestId: string, name: string) => void
  onAction: (guestId: string, action: Action) => void
  onLeave: (guestId: string) => void
  onError?: (message: string) => void
}

export interface HostHandle {
  broadcast: (state: RoomState) => void
  destroy: () => void
}

export function createHost(code: string, callbacks: HostCallbacks): HostHandle {
  const peer = new Peer(peerIdForCode(code))
  const conns = new Map<string, DataConnection>()

  peer.on('error', (err) => callbacks.onError?.(err.message))

  peer.on('connection', (conn) => {
    conns.set(conn.peer, conn)
    conn.on('data', (raw) => {
      const msg = raw as GuestToHost
      if (msg.kind === 'join') callbacks.onJoin(conn.peer, msg.name)
      else if (msg.kind === 'action') callbacks.onAction(conn.peer, msg.action)
    })
    conn.on('close', () => {
      conns.delete(conn.peer)
      callbacks.onLeave(conn.peer)
    })
  })

  return {
    broadcast(state) {
      const msg: HostToGuest = { kind: 'state', state }
      conns.forEach((conn) => {
        if (conn.open) conn.send(msg)
      })
    },
    destroy() {
      conns.forEach((c) => c.close())
      peer.destroy()
    },
  }
}

export interface GuestCallbacks {
  onState: (state: RoomState) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (message: string) => void
}

export interface GuestHandle {
  peerId: Promise<string>
  sendAction: (action: Action) => void
  destroy: () => void
}

export function joinHost(code: string, name: string, callbacks: GuestCallbacks): GuestHandle {
  const peer = new Peer()
  let conn: DataConnection | null = null

  const peerId = new Promise<string>((resolve, reject) => {
    peer.on('open', (id) => {
      conn = peer.connect(peerIdForCode(code), { reliable: true })
      conn.on('open', () => {
        conn!.send({ kind: 'join', name } satisfies GuestToHost)
        callbacks.onConnected?.()
      })
      conn.on('data', (raw) => {
        const msg = raw as HostToGuest
        if (msg.kind === 'state') callbacks.onState(msg.state)
      })
      conn.on('close', () => callbacks.onDisconnected?.())
      resolve(id)
    })
    peer.on('error', (err) => {
      callbacks.onError?.(err.message)
      reject(err)
    })
  })

  return {
    peerId,
    sendAction(action) {
      if (conn?.open) conn.send({ kind: 'action', action } satisfies GuestToHost)
    },
    destroy() {
      conn?.close()
      peer.destroy()
    },
  }
}
