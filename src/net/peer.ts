import Peer, { type DataConnection } from 'peerjs'

type GuestToHost<TAction> = { kind: 'join'; name: string } | { kind: 'action'; action: TAction }
type HostToGuest<TState> = { kind: 'state'; state: TState }

export function peerIdForCode(code: string): string {
  return `pips-${code.toLowerCase().replace(/[^a-z0-9-]/g, '')}`
}

export interface HostCallbacks<_TState, TAction> {
  onJoin: (guestId: string, name: string) => void
  onAction: (guestId: string, action: TAction) => void
  onLeave: (guestId: string) => void
  onError?: (message: string) => void
}

export interface HostHandle<TState> {
  broadcast: (state: TState) => void
  destroy: () => void
}

export function createHost<TState, TAction>(code: string, callbacks: HostCallbacks<TState, TAction>): HostHandle<TState> {
  const peer = new Peer(peerIdForCode(code))
  const conns = new Map<string, DataConnection>()

  peer.on('error', (err) => callbacks.onError?.(err.message))

  peer.on('connection', (conn) => {
    conns.set(conn.peer, conn)
    conn.on('data', (raw) => {
      const msg = raw as GuestToHost<TAction>
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
      const msg: HostToGuest<TState> = { kind: 'state', state }
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

export interface GuestCallbacks<TState> {
  onState: (state: TState) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (message: string) => void
}

export interface GuestHandle<TAction> {
  peerId: Promise<string>
  sendAction: (action: TAction) => void
  destroy: () => void
}

export function joinHost<TState, TAction>(code: string, name: string, callbacks: GuestCallbacks<TState>): GuestHandle<TAction> {
  const peer = new Peer()
  let conn: DataConnection | null = null

  const peerId = new Promise<string>((resolve, reject) => {
    peer.on('open', (id) => {
      conn = peer.connect(peerIdForCode(code), { reliable: true })
      conn.on('open', () => {
        conn!.send({ kind: 'join', name } satisfies GuestToHost<TAction>)
        callbacks.onConnected?.()
      })
      conn.on('data', (raw) => {
        const msg = raw as HostToGuest<TState>
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
      if (conn?.open) conn.send({ kind: 'action', action } satisfies GuestToHost<TAction>)
    },
    destroy() {
      conn?.close()
      peer.destroy()
    },
  }
}
