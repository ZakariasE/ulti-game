const rooms = require('../rooms/RoomManager')
const {
  applyDeal, applyBidDiscard, applyDeclare, applyRob, applyBidPass,
  applyFirstLead, applyKontra, applyPlayCard, prepareNextRound,
  availableMarriages, marriageOptionsFor, eligibleKontra, biddingSnapshot,
  publicDeclaration, handCounts, _getLegalCardIds,
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
      _sendHand(io, state, socket.id)
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // payload: { type:'simple'|'trump'|'notrump', components?, color?, contract? }
  socket.on('bid:declare', ({ roomCode, ...payload }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyDeclare(state, socket.id, payload)
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:rob', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyRob(state, socket.id)
      _sendHand(io, state, socket.id)
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
          declarerId: result.declarerId,
          declaration: publicDeclaration(result.declaration),
        })
        // Privately tell the declarer what they can announce at the opening lead.
        const decl = state.play.declaration
        io.to(result.declarerId).emit('opening:info', {
          needTrump: !decl.isNoTrump && decl.color === 'normal',
          availableMarriages: availableMarriages(state.hands[result.declarerId]),
        })
        _promptNextTurn(io, roomCode, state)
      } else {
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Kontra (per component, at the player's card-play window) ──────────────────

  socket.on('kontra:call', ({ roomCode, components }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const { kontra, raised } = applyKontra(state, socket.id, components)
      io.to(roomCode).emit('kontra:updated', { kontra, raised, byId: socket.id })
      _promptNextTurn(io, roomCode, state) // refresh the current player's kontra options
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Card play ────────────────────────────────────────────────────────────────

  socket.on('play:firstLead', ({ roomCode, cardId, trumpSuit, announcedMarriages }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyFirstLead(state, socket.id, cardId, trumpSuit, announcedMarriages)
      io.to(roomCode).emit('declarer:trump', { trumpSuit: state.play.declaration.trumpSuit })
      io.to(roomCode).emit('declarer:marriages', { announcedMarriages: state.play.declaration.announcedMarriages })
      _afterPlay(io, roomCode, state, socket.id, result)
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('card:play', ({ roomCode, cardId, announcedMarriages }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const wasFirstCard = state.play.cardsPlayed[socket.id] === 0
      const result = applyPlayCard(state, socket.id, cardId, announcedMarriages)
      const mine = state.play.marriages[socket.id]
      if (wasFirstCard && mine && mine.length) {
        io.to(roomCode).emit('marriage:announced', { playerId: socket.id, marriages: mine })
      }
      _afterPlay(io, roomCode, state, socket.id, result)
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
      io.to(roomCode).emit('round:ready', { readyCount: state._readyForNext.size, total: connected })

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
  io.to(roomCode).emit('game:started', { dealerIndex: state.dealerIndex, players: state.players })
  state.players.forEach((p) => _sendHand(io, state, p.id))
  io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
}

function _sendHand(io, state, playerId) {
  io.to(playerId).emit('hand:dealt', { hand: state.hands[playerId] })
}

function _afterPlay(io, roomCode, state, playerId, result) {
  io.to(roomCode).emit('card:played', {
    playerId,
    card: result.playedCard,
    trickSoFar: state.play.currentTrick.cards,
    handCounts: handCounts(state),
  })

  if (result.trickComplete) {
    const lastTrick = state.play.completedTricks[state.play.completedTricks.length - 1]
    io.to(roomCode).emit('trick:completed', {
      winnerId: result.winnerId,
      points: result.points,
      cards: lastTrick.cards,
    })

    if (state.play.declaration.open && state.play.trickCount === 1) {
      io.to(roomCode).emit('declarer:revealed', {
        declarerId: state.play.declarerId,
        hand: state.hands[state.play.declarerId],
      })
    }

    if (result.roundComplete) {
      io.to(roomCode).emit('round:completed', { result: state.roundResult, scores: state.scores })
    } else {
      setTimeout(() => _promptNextTurn(io, roomCode, state), 1200)
    }
  } else {
    _promptNextTurn(io, roomCode, state)
  }
}

function _promptNextTurn(io, roomCode, state) {
  const { currentTrick } = state.play
  const turnSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  const player = state.players.find((p) => p.seatIndex === turnSeat)
  io.to(roomCode).emit('play:turnStart', {
    currentPlayerId: player.id,
    legalCardIds: _getLegalCardIds(state, player.id),
    needsOpeningLead: !state.play.openingLeadDone && player.id === state.play.declarerId,
    kontraOptions: eligibleKontra(state, player.id),
    marriageOptions: marriageOptionsFor(state, player.id),
    kontra: state.play.kontra,
    trumpSuit: state.play.declaration.trumpSuit,
  })
}

module.exports = { registerHandlers }
