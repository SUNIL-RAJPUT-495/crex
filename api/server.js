import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { initSocket } from "./socket/socket.js";
import matchRoutes from "./routes/matchRoutes.js";

// Load environment variables
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Database Connection
let mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
    console.error("CRITICAL ERROR: MONGODB_URI is not set in environment variables.");
    process.exit(1);
}

// Replace placeholders if present
if (mongoURI.includes("<db_username>")) {
    mongoURI = mongoURI.replace("<db_username>", process.env.MONGODB_USERNAME || "");
}
if (mongoURI.includes("<db_password>")) {
    mongoURI = mongoURI.replace("<db_password>", process.env.MONGODB_PASSWORD || "");
}

mongoose.connect(mongoURI)
    .then(() => console.log("Connected successfully to MongoDB Database"))
    .catch((err) => console.error("MongoDB Connection Error:", err.message));

// Create HTTP and Socket.io server
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Initialize Socket.io updates engine
initSocket(io);

// API Routes
app.use("/api/matches", matchRoutes);

app.get("/", (req, res) => {
    res.send("CREX Scraper REST & Real-time API is Running");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});