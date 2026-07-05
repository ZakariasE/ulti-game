const { createGameState } = require('../game/GameState')

class RoomManager {
  constructor() {
    this.rooms = new Map()       // roomCode → GameState
    this.socketToRoom = new Map() // socketId → roomCode
  }

  _generateCode() {
    let code
    do {
      code = Math.random().toString(36).slice(2, 8).toUpperCase()
    } while (this.rooms.has(code))
    return code
  }

  createRoom(socketId, playerName, options) {
    const roomCode = this._generateCode()
    const player = { id: socketId, name: playerName, seatIndex: 0, isConnected: true }
    const state = createGameState(roomCode, [player], options)
    this.rooms.set(roomCode, state)
    this.socketToRoom.set(socketId, roomCode)
    return { roomCode, state }
  }

  joinRoom(socketId, roomCode, playerName) {
    const state = this.rooms.get(roomCode)
    if (!state) throw new Error('Room not found')
    if (state.phase !== 'LOBBY') throw new Error('Game already in progress')
    if (state.players.length >= 3) throw new Error('Room is full')
    if (state.players.some((p) => p.id === socketId)) throw new Error('Already in room')

    const player = {
      id: socketId,
      name: playerName,
      seatIndex: state.players.length,
      isConnected: true,
    }
    state.players.push(player)
    this.socketToRoom.set(socketId, roomCode)
    return { state, player }
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode) || null
  }

  getRoomBySocket(socketId) {
    const roomCode = this.socketToRoom.get(socketId)
    return roomCode ? { roomCode, state: this.rooms.get(roomCode) } : null
  }

  removePlayer(socketId) {
    const roomCode = this.socketToRoom.get(socketId)
    if (!roomCode) return null
    const state = this.rooms.get(roomCode)
    if (state) {
      const player = state.players.find((p) => p.id === socketId)
      if (player) player.isConnected = false
      // Clean up empty rooms
      if (state.players.every((p) => !p.isConnected)) {
        this.rooms.delete(roomCode)
      }
    }
    this.socketToRoom.delete(socketId)
    return roomCode
  }
}

module.exports = new RoomManager()
