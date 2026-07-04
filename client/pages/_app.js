import { SocketProvider } from '../context/SocketContext'
import { GameProvider } from '../context/GameContext'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <SocketProvider>
      <GameProvider>
        <Component {...pageProps} />
      </GameProvider>
    </SocketProvider>
  )
}
