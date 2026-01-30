import {
  fetchAllUserScoresService,
  fetchUserScoreByIdService
} from "../services/userScoreService.js";

/* -------------------- DATE RESOLVER -------------------- */
const resolveDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    return { startDate, endDate };
  }

  const now = new Date();

  const firstDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const firstDayOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  );

  return {
    startDate: firstDayOfMonth.toISOString().split("T")[0],
    endDate: firstDayOfNextMonth.toISOString().split("T")[0],
  };
};

/**
 * GET ALL USERS SCORES
 */
export const getAllUserScores = async (req, res, next) => {
  try {
    const { startDate, endDate } = resolveDateRange(
      req.query.startDate,
      req.query.endDate
    );

    const data = await fetchAllUserScoresService(startDate, endDate);

    res.status(200).json({
      success: true,
      startDate,
      endDate,
      count: data.length,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET SINGLE USER SCORE (by NAME)
 * Route param is still :id (DO NOT CHANGE ROUTE)
 */
export const getUserScoreById = async (req, res, next) => {
  try {
    const userName = decodeURIComponent(req.params.id);

    const { startDate, endDate } = resolveDateRange(
      req.query.startDate,
      req.query.endDate
    );

    const data = await fetchUserScoreByIdService(
      userName,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      userName,
      startDate,
      endDate,
      count: data.length,
      data
    });
  } catch (error) {
    next(error);
  }
};
