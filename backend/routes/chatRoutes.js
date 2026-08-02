import express from "express";
import { 
  getAllChats, 
  getChatById, 
  deleteChat, 
  renameChat, 
  createOrUpdateChat 
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/chats", getAllChats);
router.get("/chat/:id", getChatById);
router.delete("/chat/:id", deleteChat);
router.put("/chat/:id", renameChat);
router.post("/chat", createOrUpdateChat);

export default router;