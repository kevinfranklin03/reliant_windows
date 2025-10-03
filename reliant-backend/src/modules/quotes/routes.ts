import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler";
import * as QuotesController from "./quotes.controller";

const router = Router();

// keep using your existing controller functions
router.get("/", asyncHandler(QuotesController.list));
router.get("/:id", asyncHandler(QuotesController.getById));
router.put("/:id", asyncHandler(QuotesController.update));
router.patch("/:id/status", asyncHandler(QuotesController.updateStatus));
router.delete("/:id", asyncHandler(QuotesController.remove));
router.post("/", asyncHandler(QuotesController.createQuote));

// AI
router.post("/ai-suggest", asyncHandler(QuotesController.aiSuggestPrice));

export default router;
