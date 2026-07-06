const rooms = require('../rooms/RoomManager')
const {
  applyDeal, applyBidDiscard, applyDeclare, applyRob, applyBidPass,
  applyFirstLead, applyKontra, applyPlayCard, startClaim, respondClaim, prepareNextRound,
  startBuli, buliSnapshot,
  availableMarriages, marriageOptionsFor, eligibleKontra, biddingSnapshot,
  publicDeclaration, handCounts, _getLegalCardIds,
} = require('../game/GameState')

function registerHandlers(io, socket) {
  // ── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('room:create', ({ playerName, options }) => {
    try {
      const { roomCode, state } = rooms.createRoom(socket.id, playerName, options)
      socket.join(roomCode)
      socket.emit('room:created', {
        roomCode, playerId: socket.id, seat: 0, players: state.players, options: state.options,
      })
    } catch (err) {
      socket.emit('room:error', { message: err.message })
    }
  })

  socket.on('room:join', ({ roomCode, playerName }) => {
    try {
      const { state, player } = rooms.joinRoom(socket.id, roomCode, playerName)
      socket.join(roomCode)
      socket.emit('room:joined', {
        roomCode, playerId: socket.id, seat: player.seatIndex, players: state.players, options: state.options,
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
      if (state.options.buli.on) startBuli(state)
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
      const result = applyBidDiscard(state, socket.id, cardIds)
      _sendHand(io, state, socket.id)
      if (result && result.biddingComplete) {
        // Félkezes: the declarer's post-deal discard starts play.
        _announceResolved(io, roomCode, state, result)
      } else {
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // payload: { type:'simple'|'trump'|'notrump', components?, color?, contract? }
  socket.on('bid:declare', ({ roomCode, ...payload }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const res = applyDeclare(state, socket.id, payload)
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      if (res && res.revealed) {
        io.to(roomCode).emit('felkezes:reveal', state.felkezesReveal)
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:rob', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyRob(state, socket.id)
      _sendHand(io, state, socket.id)
      io.to(socket.id).emit('talon:held', { cardIds: state.talonInHand.cardIds })
      io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:pass', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyBidPass(state, socket.id)
      if (result.redeal) {
        // Félkezes: all passed → redealt, whole-hand value doubled.
        state.players.forEach((p) => _sendHand(io, state, p.id))
        io.to(roomCode).emit('felkezes:redeal', { multiplier: result.multiplier })
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      } else if (result.secondDeal) {
        // Félkezes: reserve dealt; send everyone their new hands, hide the reveal,
        // declarer discards.
        state.players.forEach((p) => _sendHand(io, state, p.id))
        io.to(roomCode).emit('felkezes:reveal', null)
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      } else if (result.biddingComplete) {
        _announceResolved(io, roomCode, state, result)
      } else {
        io.to(roomCode).emit('bid:state', { ...biddingSnapshot(state), handCounts: handCounts(state) })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Card play ────────────────────────────────────────────────────────────────
  // Kontra is staged on the client and committed together with the card the
  // player is about to lay down (so it can be freely toggled beforehand).

  socket.on('play:firstLead', ({ roomCode, cardId, trumpSuit, announcedMarriages, kontra }) => {
    try {
      const state = rooms.getRoom(roomCode)
      _commitKontra(io, roomCode, state, socket.id, kontra)
      const result = applyFirstLead(state, socket.id, cardId, trumpSuit, announcedMarriages)
      io.to(roomCode).emit('declarer:trump', { trumpSuit: state.play.declaration.trumpSuit })
      io.to(roomCode).emit('declarer:marriages', { announcedMarriages: state.play.declaration.announcedMarriages })
      _afterPlay(io, roomCode, state, socket.id, result)
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('card:play', ({ roomCode, cardId, announcedMarriages, kontra }) => {
    try {
      const state = rooms.getRoom(roomCode)
      _commitKontra(io, roomCode, state, socket.id, kontra)
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

  // ── Claim: "nincs több ütés" ───────────────────────────────────────────────

  socket.on('claim:start', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const { hand } = startClaim(state, socket.id)
      io.to(roomCode).emit('declarer:revealed', { declarerId: socket.id, hand })
      io.to(roomCode).emit('claim:pending', { declarerId: socket.id })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('claim:respond', ({ roomCode, agree }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const res = respondClaim(state, socket.id, agree)
      if (res.rejected) {
        io.to(roomCode).emit('claim:result', { accepted: false })
      } else if (res.accepted) {
        io.to(roomCode).emit('claim:result', { accepted: true })
        io.to(roomCode).emit('round:completed', _roundCompleted(state))
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
      io.to(roomCode).emit('round:ready', { readyCount: state._readyForNext.size, total: connected })

      if (state._readyForNext.size >= connected) {
        state._readyForNext = null
        if (state.buli && state.buli.over) {
          // Buli finished — show its result instead of dealing the next hand.
          state.phase = 'BULI_OVER'
          io.to(roomCode).emit('buli:completed', {
            buli: buliSnapshot(state), declaredScores: state.declaredScores,
          })
        } else {
          prepareNextRound(state)
          applyDeal(state)
          _dealAndAnnounce(io, roomCode, state)
        }
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // Start the next buli (keeps declaredScores + history).
  socket.on('buli:next', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      if (!state.buli || !state.buli.over) throw new Error('No finished buli')
      startBuli(state)
      prepareNextRound(state)
      applyDeal(state)
      _dealAndAnnounce(io, roomCode, state)
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

function _roundCompleted(state) {
  return {
    result: state.roundResult,
    scores: state.scores,
    declaredScores: state.declaredScores,
    buli: buliSnapshot(state),
  }
}

// Bidding resolved → announce the declarer/contract and begin play.
function _announceResolved(io, roomCode, state, result) {
  io.to(roomCode).emit('bid:resolved', {
    declarerId: result.declarerId,
    declaration: publicDeclaration(result.declaration),
  })
  const decl = state.play.declaration
  io.to(result.declarerId).emit('opening:info', {
    needTrump: !decl.isNoTrump && decl.color === 'normal',
    availableMarriages: availableMarriages(state.hands[result.declarerId]),
  })
  _promptNextTurn(io, roomCode, state)
}

// Apply the kontra components a player staged, just before they play their card.
function _commitKontra(io, roomCode, state, playerId, components) {
  if (!components || !components.length) return
  const { kontra, raised } = applyKontra(state, playerId, components)
  if (raised.length) io.to(roomCode).emit('kontra:updated', { kontra, raised, byId: playerId })
}

function _dealAndAnnounce(io, roomCode, state) {
  io.to(roomCode).emit('game:started', {
    dealerIndex: state.dealerIndex, players: state.players, options: state.options,
    buli: buliSnapshot(state), declaredScores: state.declaredScores,
  })
  state.players.forEach((p) => _sendHand(io, state, p.id))
  // Tell the first bidder which two of their cards came from the talon.
  if (state.talonInHand) {
    io.to(state.talonInHand.playerId).emit('talon:held', { cardIds: state.talonInHand.cardIds })
  }
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
      io.to(roomCode).emit('round:completed', _roundCompleted(state))
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
