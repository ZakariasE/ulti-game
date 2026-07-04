import { createContext, useContext, useEffect, useState } from 'react'
import { getSocket } from '../lib/socket'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    socket.connect()
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (err) => {
      setConnected(false)
      console.error('Socket connection error:', err.message)
    })
    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connect_error')
    }
  }, [])

  function emit(event, payload) {
    getSocket().emit(event, payload)
  }

  return (
    <SocketContext.Provider value={{ socket: getSocket(), connected, emit }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
