import {
  fetchAllUserScoresService,
  fetchUserScoreByIdService
} from "../services/userScoreService.js";

/**
 * GET ALL
 */
export const getAllUserScores = async (req, res, next) => {
  try {
    const {
      startDate = "2025-12-01",
      endDate = "2026-01-01"
    } = req.query;

    const data = await fetchAllUserScoresService(startDate, endDate);

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET BY USER NAME
 */
export const getUserScoreById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      startDate = "2025-12-01",
      endDate = "2026-01-01"
    } = req.query;

    const data = await fetchUserScoreByIdService(
      id,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      user: id,
      count: data.length,
      data
    });
  } catch (error) {
    next(error);
  }
};
