import express from "express";
import {
  archive,
  create,
  createMemory,
  deleteFile,
  duplicate,
  editMemory,
  getOne,
  list,
  listChats,
  listFiles,
  listMemories,
  pin,
  pinned,
  recent,
  remove,
  removeMemory,
  rename,
  searchKnowledge,
  unarchive,
  unpin,
  update,
  uploadFile,
} from "../controllers/projectController.js";

const router = express.Router();

router.get("/projects", list);
router.get("/projects/recent", recent);
router.get("/projects/pinned", pinned);
router.post("/projects", create);

router.get("/projects/:id", getOne);
router.put("/projects/:id", update);
router.put("/projects/:id/rename", rename);
router.post("/projects/:id/pin", pin);
router.post("/projects/:id/unpin", unpin);
router.post("/projects/:id/archive", archive);
router.post("/projects/:id/unarchive", unarchive);
router.post("/projects/:id/duplicate", duplicate);
router.delete("/projects/:id", remove);

router.get("/projects/:id/files", listFiles);
router.post("/projects/:id/files", uploadFile);
router.delete("/projects/:id/files/:fileId", deleteFile);
router.post("/projects/:id/knowledge/search", searchKnowledge);

router.get("/projects/:id/memories", listMemories);
router.post("/projects/:id/memories", createMemory);
router.put("/projects/:id/memories/:memoryId", editMemory);
router.delete("/projects/:id/memories/:memoryId", removeMemory);

router.get("/projects/:id/chats", listChats);

export default router;
