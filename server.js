const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // change this to your frontend domain in production
    methods: ["GET", "POST"],
  },
});

const PORT = 8080;
const allUsers = {};

app.use(cors());

app.get("/", (req, res) => {
  res.send("Video chat server is running");
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-user", (username) => {
    allUsers[username] = socket.id;
    io.emit("joined", allUsers);
    console.log(`${username} joined with socket id ${socket.id}`);
  });

  socket.on("offer", ({ from, to, offer }) => {
    const calleeSocketId = allUsers[to];
    if (calleeSocketId) {
      io.to(calleeSocketId).emit("offer", { from, to, offer });
    }
  });

  socket.on("answer", ({ from, to, answer }) => {
    const callerSocketId = allUsers[to];
    if (callerSocketId) {
      io.to(callerSocketId).emit("answer", { from, to, answer });
    }
  });

  socket.on("icecandidate", ({ from, to, candidate }) => {
    const otherSocketId = allUsers[to];
    if (otherSocketId) {
      io.to(otherSocketId).emit("icecandidate", candidate);
    }
  });

  socket.on("call-ended", ([from, to]) => {
    if (allUsers[from]) io.to(allUsers[from]).emit("call-ended");
    if (allUsers[to]) io.to(allUsers[to]).emit("call-ended");
  });

  socket.on("disconnect", () => {
    for (const [username, id] of Object.entries(allUsers)) {
      if (id === socket.id) {
        delete allUsers[username];
        break;
      }
    }
    io.emit("joined", allUsers);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
