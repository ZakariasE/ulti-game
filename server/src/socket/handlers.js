const rooms = require('../rooms/RoomManager')
const {
  applyDeal, applyTalonTake, applyTalonPass, applyDiscard,
  applyBid, applyPass, applyPlayCard, prepareNextRound, _getLegalCardIds,
} = require('../game/GameState')

function registerHandlers(io, socket) {
  // ── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('room:create', ({ playerName }) => {
    try {
      const { roomCode, state } = rooms.createRoom(socket.id, playerName)
      socket.join(roomCode)
      socket.emit('room:created', {
        roomCode,
        playerId: socket.id,
        seat: 0,
        players: state.players,
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
        roomCode,
        playerId: socket.id,
        seat: player.seatIndex,
        players: state.players,
      })
      socket.to(roomCode).emit('room:playerJoined', { players: state.players })
    } catch (err) {
      socket.emit('room:error', { message: err.message })
    }
  })

  // ── Game start ─────────────────────────────────────────────────────────────

  socket.on('game:start', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      if (!state) throw new Error('Room not found')
      if (state.players.length !== 3) throw new Error('Need exactly 3 players')
      if (state.phase !== 'LOBBY') throw new Error('Game already started')

      const { hands, talon } = applyDeal(state)

      io.to(roomCode).emit('game:started', {
        dealerIndex: state.dealerIndex,
        firstBidderSeat: state.bidding.currentBidderSeat,
        players: state.players,
      })

      // Send each player their private hand
      state.players.forEach((p) => {
        const isFirstBidder = p.seatIndex === state.bidding.currentBidderSeat
        io.to(p.id).emit('hand:dealt', { hand: hands[p.seatIndex], isFirstBidder })
      })

      // Offer talon to first bidder
      const firstBidder = state.players.find((p) => p.seatIndex === state.bidding.currentBidderSeat)
      io.to(roomCode).emit('bid:talonOffered', { playerId: firstBidder.id })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Bidding ────────────────────────────────────────────────────────────────

  socket.on('talon:take', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const { talonCards } = applyTalonTake(state, socket.id)
      io.to(socket.id).emit('bid:talonCards', { cards: talonCards })
      io.to(roomCode).emit('bid:talonTaken', { playerId: socket.id })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('talon:pass', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyTalonPass(state, socket.id)

      if (result.forced) {
        io.to(result.forcedPlayerId).emit('bid:talonCards', { cards: result.talonCards })
        io.to(roomCode).emit('bid:forced', { playerId: result.forcedPlayerId })
      } else {
        const nextPlayer = state.players.find((p) => p.seatIndex === result.nextBidderSeat)
        io.to(roomCode).emit('bid:talonPassed', {
          fromPlayerId: socket.id,
          toPlayerId: nextPlayer.id,
        })
        io.to(roomCode).emit('bid:talonOffered', { playerId: nextPlayer.id })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('talon:discard', ({ roomCode, cardIds }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyDiscard(state, socket.id, cardIds)
      // Client now needs to bid — BidPanel will prompt them
      io.to(roomCode).emit('bid:discarded', { playerId: socket.id })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:place', ({ roomCode, contract, suit }) => {
    try {
      const state = rooms.getRoom(roomCode)
      applyBid(state, socket.id, contract, suit)
      const nextPlayer = state.players.find((p) => p.seatIndex === state.bidding.currentBidderSeat)
      io.to(roomCode).emit('bid:placed', {
        playerId: socket.id,
        contract,
        suit,
        nextBidderId: nextPlayer.id,
      })
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('bid:pass', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyPass(state, socket.id)

      if (result.biddingComplete) {
        io.to(roomCode).emit('bid:resolved', {
          declarerId: result.declarerId,
          contract: result.contract,
          suit: result.suit,
        })
        _startTrick(io, roomCode, state)
      } else {
        const nextPlayer = state.players.find((p) => p.seatIndex === state.bidding.currentBidderSeat)
        io.to(roomCode).emit('bid:passed', {
          playerId: socket.id,
          nextBidderId: nextPlayer.id,
        })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Card play ──────────────────────────────────────────────────────────────

  socket.on('card:play', ({ roomCode, cardId }) => {
    try {
      const state = rooms.getRoom(roomCode)
      const result = applyPlayCard(state, socket.id, cardId)
      const card = result // playCard mutates state; find the card that was played
      // Find what card was played (it's been removed from hand, so check completed tricks or current trick)
      const playedEntry = state.play.currentTrick.cards.find((c) => c.playerId === socket.id)
        || state.play.completedTricks[state.play.completedTricks.length - 1]?.cards.find(
          (c) => c.playerId === socket.id
        )

      io.to(roomCode).emit('card:played', {
        playerId: socket.id,
        card: playedEntry?.card || { id: cardId },
        trickSoFar: state.play.currentTrick.cards,
      })

      if (result.trickComplete) {
        io.to(roomCode).emit('trick:completed', {
          winnerId: result.winnerId,
          points: result.points,
        })

        if (result.roundComplete) {
          io.to(roomCode).emit('round:completed', {
            result: state.roundResult,
            scores: state.scores,
          })
        } else {
          _startTrick(io, roomCode, state)
        }
      } else {
        _startTrick(io, roomCode, state)
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  socket.on('round:continue', ({ roomCode }) => {
    try {
      const state = rooms.getRoom(roomCode)
      // Track who has confirmed
      if (!state._readyForNext) state._readyForNext = new Set()
      state._readyForNext.add(socket.id)

      if (state._readyForNext.size >= state.players.filter((p) => p.isConnected).length) {
        state._readyForNext = null
        prepareNextRound(state)
        const { hands } = applyDeal(state)

        io.to(roomCode).emit('game:started', {
          dealerIndex: state.dealerIndex,
          firstBidderSeat: state.bidding.currentBidderSeat,
          players: state.players,
        })

        state.players.forEach((p) => {
          const isFirstBidder = p.seatIndex === state.bidding.currentBidderSeat
          io.to(p.id).emit('hand:dealt', { hand: hands[p.seatIndex], isFirstBidder })
        })

        const firstBidder = state.players.find(
          (p) => p.seatIndex === state.bidding.currentBidderSeat
        )
        io.to(roomCode).emit('bid:talonOffered', { playerId: firstBidder.id })
      }
    } catch (err) {
      socket.emit('game:error', { message: err.message })
    }
  })

  // ── Disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const roomCode = rooms.removePlayer(socket.id)
    if (roomCode) {
      socket.to(roomCode).emit('room:playerLeft', { playerId: socket.id })
    }
  })
}

function _startTrick(io, roomCode, state) {
  const { currentTrick } = state.play
  const leaderSeat = currentTrick.leaderSeat
  const leader = state.players.find((p) => p.seatIndex === leaderSeat)
  const legalCardIds = _getLegalCardIds(state, leader.id)

  io.to(roomCode).emit('play:turnStart', {
    currentPlayerId: leader.id,
    legalCardIds,
  })
}

module.exports = { registerHandlers }
