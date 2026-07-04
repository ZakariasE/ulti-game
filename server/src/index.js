const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { registerHandlers } = require('./socket/handlers')

const app = express()
const server = http.createServer(app)

// In development, accept any localhost origin (Next.js may pick 3000, 3001, 3002...).
// In production, lock down to CLIENT_URL.
const corsOrigin = process.env.CLIENT_URL
  ? process.env.CLIENT_URL
  : (origin, callback) => {
      if (!origin || /^https?:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    }

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
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
