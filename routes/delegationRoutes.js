import express from "express";
import {
  fetchDelegationDataSortByDate,
  fetchDelegation_DoneDataSortByDate,
  insertDelegationDoneAndUpdate
} from "../controllers/delegationController.js";

const router = express.Router();

router.get("/delegation", fetchDelegationDataSortByDate);
router.get("/delegation-done", fetchDelegation_DoneDataSortByDate);
router.post("/delegation/submit", insertDelegationDoneAndUpdate);

export default router;
