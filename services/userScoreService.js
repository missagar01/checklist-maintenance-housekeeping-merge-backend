import {pool} from "../config/db.js";

const BASE_QUERY = `
WITH base_tasks AS (
    SELECT
        c.name,
        c.status,
        c.task_start_date::date AS task_date,
        c.submission_date::date AS submission_date_only,
        CASE
            WHEN c.department IN ('DISPATCH', 'INWARD', 'CRUSHER') THEN 'DISPATCH'
            WHEN c.department IN ('HR', 'PC', 'AUTOMATION', 'ADMIN', 'ACCOUNTS', 'WB') THEN 'ADMIN'
            WHEN c.department IN ('PROJECT', 'TRANSPORT') THEN 'PROJECT'
            WHEN c.department IN ('CCM', 'CCM ELECTRICAL') THEN 'CCM'
            WHEN c.department IN ('SMS PRODUCTION', 'LAB AND QUALITY CONTROL') THEN 'SMS OPERATION'
            ELSE c.department
        END AS department
    FROM public.checklist c
    WHERE c.task_start_date::date >= $1
      AND c.task_start_date::date <  $2
      AND c.name <> 'Sheelesh Marele'
      /**USER_FILTER**/
),
summary AS (
    SELECT
        department,
        name AS doer,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
        COUNT(*) FILTER (
            WHERE lower(status::text) = 'yes'
              AND submission_date_only <= task_date
        ) AS total_done_on_time
    FROM base_tasks
    GROUP BY department, name
),
scores AS (
    SELECT
        department,
        doer,
        total_tasks,
        total_completed_tasks,
        total_done_on_time,
        ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2) AS completion_score,
        ROUND((total_done_on_time::numeric / NULLIF(total_completed_tasks,0)) * 100 - 100, 2) AS ontime_score
    FROM summary
)
SELECT *
FROM (
    SELECT
        department,
        doer,
        total_tasks,
        total_completed_tasks,
        total_done_on_time,
        completion_score,
        ontime_score,
        ROUND(completion_score + ontime_score, 2) AS total_score
    FROM scores

    UNION ALL

    SELECT
        department,
        'TOTAL' AS doer,
        SUM(total_tasks),
        SUM(total_completed_tasks),
        SUM(total_done_on_time),
        ROUND(
            (SUM(total_completed_tasks)::numeric / NULLIF(SUM(total_tasks),0)) * 100 - 100,
            2
        ),
        ROUND(
            (SUM(total_done_on_time)::numeric / NULLIF(SUM(total_completed_tasks),0)) * 100 - 100,
            2
        ),
        ROUND(
            (
                (SUM(total_completed_tasks)::numeric / NULLIF(SUM(total_tasks),0)) * 100 - 100
            ) +
            (
                (SUM(total_done_on_time)::numeric / NULLIF(SUM(total_completed_tasks),0)) * 100 - 100
            ),
            2
        )
    FROM scores
    GROUP BY department
) final_result
ORDER BY
    department,
    CASE WHEN doer = 'TOTAL' THEN 1 ELSE 0 END,
    doer;
`;

/**
 * GET ALL USERS
 */
export const fetchAllUserScoresService = async (startDate, endDate) => {
  const query = BASE_QUERY.replace("/**USER_FILTER**/", "");
  const { rows } = await pool.query(query, [startDate, endDate]);
  return rows;
};

/**
 * GET SINGLE USER (by name)
 */
export const fetchUserScoreByIdService = async (
  userName,
  startDate,
  endDate
) => {
  const query = BASE_QUERY.replace(
    "/**USER_FILTER**/",
    "AND c.name = $3"
  );

  const { rows } = await pool.query(query, [
    startDate,
    endDate,
    userName
  ]);

  return rows;
};
