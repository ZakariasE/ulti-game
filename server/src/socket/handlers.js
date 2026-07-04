const rooms = require('../rooms/RoomManager')
const {
  applyDeal, applyBidDiscard, applyDeclare, applyRob, applyBidPass,
  applyPlayCard, prepareNextRound, biddingSnapshot, handCounts, _getLegalCardIds,
} = require('../game/GameState')

function registerHandlers(io, socket) {
  // ── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('room:create', ({ playerName }) => {
    try {
      const { roomCode, state } = rooms.createRoom(socket.id, playerName)
      socket.join(roomCode)
      socket.emit('room:created', { roomCode, playerId: socket.id, seat: 0, players: state.players })
    } catch (err) {
      socket.emit('room:error', { message: err.message })
    }
  })

  socket.on('room:join', ({ roomCode, playerName }) => {
    try {
      const { state, player } = rooms.joinRoom(socket.id, roomCode, playerName)
      socket.join(roomCode)
      socket.emit('room:joined', {
        roomCode, playerId: socket.id, seat: player.seatIndex, players: state.players,
      })
      socket.to(roomCode).emit('room:playerJoined', { players: state.players })
    } catch (err) {
      socket.emit('room:error', { message: err.message })
    }
  })

  // ── Game start / deal ────────────────────────────────────────────────────────

  socket.on('game:start', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      if (!state) throw new Error('Room not found')
      if (state.players.length !== 3) throw new Error('Need exactly 3 players')
      if (state.phase !== 'LOBBY') throw new Error('Game already started')

      applyDeal(state)
      _dealAndAnnounce(io, roomCode, state)
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Bidding ────────────────────────────────────────────────────────────────

  socket.on('bid:discard', ({ roomCode, cardIds }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyBidDiscard(state, socket.id, cardIds)
      _sendHand(io, state, socket.id) // hand went 12 → 10
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:declare', ({ roomCode, contract, suit }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyDeclare(state, socket.id, contract, suit)
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:rob', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyRob(state, socket.id)
      _sendHand(io, state, socket.id) // hand went 10 → 12
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:pass', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyBidPass(state, socket.id)
      if (result.biddingComplete) {
        io.to(roomCode).emit('bid:resolved', {
          declarerId: result.declarerId, contract: result.contract, suit: result.suit,
        })
        _promptNextTurn(io, roomCode, state)
      } else {
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Card play ────────────────────────────────────────────────────────────────

  socket.on('card:play', ({ roomCode, cardId }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyPlayCard(state, socket.id, cardId)

      io.to(roomCode).emit('card:played', {
        playerId: socket.id,
        card: result.playedCard,
        trickSoFar: state.play.currentTrick.cards,
        handCounts: handCounts(state),
      })

      if (result.trickComplete) {
        io.to(roomCode).emit('trick:completed', { winnerId: result.winnerId, points: result.points })
        if (result.roundComplete) {
          io.to(roomCode).emit('round:completed', { result: state.roundResult, scores: state.scores })
        } else {
          setTimeout(() => _promptNextTurn(io, roomCode, state), 1200) // brief pause to view the trick
        }
      } else {
        _promptNextTurn(io, roomCode, state)
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('round:continue', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      if (!state._readyForNext) state._readyForNext = new Set()
      state._readyForNext.add(socket.id)

      const connected = state.players.filter((p) => p.isConnected).length
      if (state._readyForNext.size >= connected) {
        state._readyForNext = null
        prepareNextRound(state)
        applyDeal(state)
        _dealAndAnnounce(io, roomCode, state)
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('disconnect', () => {
    const roomCode = rooms.removePlayer(socket.id)
    if (roomCode) socket.to(roomCode).emit('room:playerLeft', { playerId: socket.id })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _dealAndAnnounce(io, roomCode, state) {
  io.to(roomCode).emit('game:started', {
    dealerIndex: state.dealerIndex,
    players: state.players,
  })
  state.players.forEach((p) => _sendHand(io, state, p.id))
  io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
}

function _sendHand(io, state, playerId) {
  io.to(playerId).emit('hand:dealt', { hand: state.hands[playerId] })
}

// Prompt whoever is next to act in the current trick (the leader for the first
// card, then each subsequent seat).
function _promptNextTurn(io, roomCode, state) {
  const { currentTrick } = state.play
  const turnSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  const player = state.players.find((p) => p.seatIndex === turnSeat)
  const legalCardIds = _getLegalCardIds(state, player.id)
  io.to(roomCode).emit('play:turnStart', { currentPlayerId: player.id, legalCardIds })
}

module.exports = { registerHandlers }
