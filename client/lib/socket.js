import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001', {
      autoConnect: false,
      reconnectionAttempts: 5,
    })
  }
  return socket
}
