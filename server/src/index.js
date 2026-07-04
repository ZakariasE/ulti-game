const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { registerHandlers } = require('./socket/handlers')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)
  registerHandlers(io, socket)
  socket.on('disconnect', () => console.log(`[disconnect] ${socket.id}`))
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
