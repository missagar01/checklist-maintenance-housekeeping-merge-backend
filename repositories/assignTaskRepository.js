import { query } from '../config/housekeppingdb.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

const useMemory = config.env === 'test';

const ALLOWED_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const normalizeFrequency = (value) => {
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  return ALLOWED_FREQUENCIES.includes(lower) ? lower : 'daily';
};

const isConfirmedAttachment = (value) => {
  if (!value) return false;
  return String(value).trim().toLowerCase() === 'confirmed';
};

const computeDelay = (start, submission) => {
  if (!start || !submission) return null;
  const startDate = new Date(start);
  const submissionDate = new Date(submission);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(submissionDate.getTime())) {
    return null;
  }
  const diffDays = Math.floor(
    (submissionDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  return diffDays > 0 ? diffDays : 0;
};

// Format date to dd/mm/yyyy hh:mm:ss
const formatDate = (dateString) => {
  if (!dateString) return dateString;
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateString;
  }
};

const applyComputedDelay = (record) => {
  if (!record) return record;
  if (record.delay === null || record.delay === undefined) {
    const computed = computeDelay(record.task_start_date, record.submission_date);
    if (computed !== null) return { ...record, delay: computed };
  }
  return record;
};

// Format task_start_date and submission_date for dashboard APIs
const formatTaskDates = (record) => {
  if (!record) return record;
  const formatted = { ...record };
  if (record.task_start_date) {
    formatted.task_start_date = formatDate(record.task_start_date);
  }
  if (record.submission_date) {
    formatted.submission_date = formatDate(record.submission_date);
  }
  return formatted;
};

const serializeHod = (value) => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => (v === null || v === undefined ? '' : String(v))).join(',');
  }
  return String(value);
};

const normalizeDepartment = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const matchesDepartment = (recordDept, filterDept) => {
  if (!filterDept) return true;

  // Handle array of departments (multiple departments from user_access)
  if (Array.isArray(filterDept)) {
    if (filterDept.length === 0) return true;
    const normalizedRecord = normalizeDepartment(recordDept);
    return filterDept.some(dept => normalizeDepartment(dept) === normalizedRecord);
  }

  // Handle single department (string)
  const normalizedFilter = normalizeDepartment(filterDept);
  if (!normalizedFilter) return true;
  return normalizeDepartment(recordDept) === normalizedFilter;
};

const normalizeAssignee = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const matchesAssignee = (record, assignedTo) => {
  const target = normalizeAssignee(assignedTo);
  if (!target) return true;
  const name = normalizeAssignee(record?.name);
  const doer = normalizeAssignee(record?.doer_name2);
  return name === target || doer === target;
};

const padTwo = (value) => String(value).padStart(2, '0');
const formatLocalDateString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

// Get current month start and end dates
const getCurrentMonthStart = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return formatLocalDateString(start);
};

const getCurrentMonthEnd = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return formatLocalDateString(end);
};

const getNextMonthStart = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);
  return formatLocalDateString(nextMonth);
};

class AssignTaskRepository {
  constructor() {
    this.records = [];
    this.nextId = 1;
  }

  async findAll(options = {}) {
    if (useMemory) {
      const { limit, offset, department } = options;
      const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const end = Number.isInteger(limit) && limit > 0 ? start + limit : undefined;
      const filtered = this.records
        .filter((r) => matchesDepartment(r.department, department))
        .sort((a, b) => {
          const aDate = new Date(a.task_start_date || 0);
          const bDate = new Date(b.task_start_date || 0);
          const aTs = Number.isNaN(aDate.getTime()) ? 0 : aDate.getTime();
          const bTs = Number.isNaN(bDate.getTime()) ? 0 : bDate.getTime();
          if (aTs !== bTs) return bTs - aTs; // newest first
          return Number(b.id) - Number(a.id);
        });
      return filtered.slice(start, end).map(record => formatTaskDates(applyComputedDelay(record)));
    }

    const params = [];
    const where = [];

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        where.push(`LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`);
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        where.push(`LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`);
      }
    }

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      where.push(`task_start_date::date >= $${params.length - 1}::date AND task_start_date::date <= $${params.length}::date`);
    }

    if (options.status) {
      params.push(options.status);
      where.push(`LOWER(TRIM(status)) = LOWER(TRIM($${params.length}))`);
    }

    let sql = 'SELECT * FROM assign_task';
    if (where.length) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    sql += ' ORDER BY task_start_date DESC NULLS LAST, id DESC';

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }


    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async listDepartments() {
    if (useMemory) {
      const departments = new Map();
      this.records.forEach((record) => {
        if (!record || !record.department) return;
        const trimmed = String(record.department).trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (!departments.has(key)) {
          departments.set(key, trimmed);
        }
      });
      return Array.from(departments.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }

    const sql = `
      SELECT department
      FROM (
        SELECT DISTINCT department
        FROM assign_task
        WHERE department IS NOT NULL
          AND trim(department) <> ''
      ) AS uniq
      ORDER BY LOWER(department) ASC
    `;
    const result = await query(sql);
    return result.rows
      .map((row) => (typeof row.department === 'string' ? row.department.trim() : row.department))
      .filter((department) => department);
  }

  async findById(id) {
    if (useMemory) {
      const record = this.records.find((r) => String(r.id) === String(id));
      return record ? formatTaskDates(applyComputedDelay(record)) : undefined;
    }
    const result = await query('SELECT * FROM assign_task WHERE id = $1', [id]);
    const record = result.rows[0];
    return record ? formatTaskDates(applyComputedDelay(record)) : undefined;
  }

  async findOverdue(cutoff, options = {}) {
    if (useMemory) {
      // Get current month boundaries
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);

      const endTs = cutoff ? cutoff.getTime() : Number.POSITIVE_INFINITY;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const filtered = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);

        // Filter by current month if no specific range provided
        if (!options.startDate && !options.endDate) {
          if (start < currentMonthStart || start >= nextMonthStart) return false;
        } else if (options.startDate && options.endDate) {
          const s = new Date(options.startDate);
          const e = new Date(options.endDate);
          if (start < s || start > e) return false;
        }

        // Filter by overdue (before today)
        if (start >= today) return false;
        if (start > endTs) return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        return !task.submission_date;
      });
      return filtered.map(record => formatTaskDates(applyComputedDelay(record)));
    }

    // Use today's date (not cutoff) for comparison: task_start_date < today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = formatLocalDateString(today);

    const params = [todayDate];
    let sql = `
      SELECT *
      FROM assign_task
      WHERE submission_date IS NULL
        AND task_start_date IS NOT NULL
        AND task_start_date::date < $1::date
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND task_start_date::date >= $2::date AND task_start_date::date <= $3::date`;
    } else {
      const currentMonthStart = getCurrentMonthStart();
      const nextMonthStart = getNextMonthStart();
      params.push(currentMonthStart, nextMonthStart);
      sql += ` AND task_start_date::date >= $2::date AND task_start_date::date < $3::date`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    sql += ' ORDER BY task_start_date ASC';

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async findPending(cutoff, options = {}) {
    if (useMemory) {
      const cutoffDay = cutoff ? new Date(cutoff) : new Date();
      cutoffDay.setHours(0, 0, 0, 0);
      const filtered = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);
        if (start.getTime() > cutoffDay.getTime()) return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        if (!matchesAssignee(task, options.assignedTo)) return false;
        return !task.submission_date;
      }).sort((a, b) => {
        const aConfirmed = isConfirmedAttachment(a.attachment);
        const bConfirmed = isConfirmedAttachment(b.attachment);
        if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1; // confirmed first
        const aDate = new Date(a.task_start_date);
        const bDate = new Date(b.task_start_date);
        const aTs = Number.isNaN(aDate.getTime()) ? 0 : aDate.getTime();
        const bTs = Number.isNaN(bDate.getTime()) ? 0 : bDate.getTime();
        if (aTs !== bTs) return bTs - aTs; // newest first
        return Number(b.id) - Number(a.id);
      });
      return filtered.map(record => formatTaskDates(applyComputedDelay(record)));
    }

    const params = [];
    let sql = `
      SELECT *
      FROM assign_task
      WHERE submission_date IS NULL
        AND task_start_date IS NOT NULL
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND task_start_date::date >= $${params.length - 1}::date AND task_start_date::date <= $${params.length}::date`;
    } else {
      const effectiveCutoff = cutoff || new Date();
      params.push(effectiveCutoff);
      sql += ` AND task_start_date::date <= $${params.length}::date`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }
    if (options.assignedTo) {
      params.push(options.assignedTo);
      sql += ` AND (LOWER(name) = LOWER($${params.length}) OR LOWER(doer_name2) = LOWER($${params.length}))`;
    }

    // Show confirmed rows first, then current/newest dates
    sql += `
      ORDER BY
        CASE WHEN LOWER(attachment) = 'confirmed' THEN 0 ELSE 1 END,
        task_start_date DESC,
        id DESC
    `;

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async findHistory(cutoff, options = {}) {
    if (useMemory) {
      const endTs = cutoff ? cutoff.getTime() : Number.POSITIVE_INFINITY;
      const filtered = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        if (start > endTs) return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        if (!matchesAssignee(task, options.assignedTo)) return false;
        return !!task.submission_date;
      });
      const { limit, offset } = options;
      const startIdx = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const endIdx = Number.isInteger(limit) && limit > 0 ? startIdx + limit : undefined;
      return filtered.slice(startIdx, endIdx).map(record => formatTaskDates(applyComputedDelay(record)));
    }

    const params = [];
    let sql = `
      SELECT *
      FROM assign_task
      WHERE submission_date IS NOT NULL
        AND task_start_date IS NOT NULL
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND submission_date::date >= $${params.length - 1}::date AND submission_date::date <= $${params.length}::date`;
    } else if (!cutoff) {
      // ⭐ Default to current month based on completion (submission_date)
      sql += ` AND submission_date >= DATE_TRUNC('month', CURRENT_DATE) `;
    } else {
      params.push(cutoff);
      sql += ` AND submission_date <= $${params.length}`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }
    if (options.assignedTo) {
      params.push(options.assignedTo);
      sql += ` AND (LOWER(name) = LOWER($${params.length}) OR LOWER(doer_name2) = LOWER($${params.length}))`;
    }

    sql += ' ORDER BY task_start_date DESC';

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async countPending(cutoff, options = {}) {
    const params = [];
    let sql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE submission_date IS NULL
        AND task_start_date IS NOT NULL
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND task_start_date::date >= $${params.length - 1}::date AND task_start_date::date <= $${params.length}::date`;
    } else {
      const effectiveCutoff = cutoff || new Date();
      params.push(effectiveCutoff);
      sql += ` AND task_start_date::date <= $${params.length}::date`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }
    if (options.assignedTo) {
      params.push(options.assignedTo);
      sql += ` AND (LOWER(name) = LOWER($${params.length}) OR LOWER(doer_name2) = LOWER($${params.length}))`;
    }

    const result = await query(sql, params);
    return Number(result.rows[0]?.count || 0);
  }

  async countHistory(cutoff, options = {}) {
    const params = [];
    let sql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE submission_date IS NOT NULL
        AND task_start_date IS NOT NULL
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND submission_date::date >= $${params.length - 1}::date AND submission_date::date <= $${params.length}::date`;
    } else if (!cutoff) {
      // ⭐ Default to current month based on completion (submission_date)
      sql += ` AND submission_date >= DATE_TRUNC('month', CURRENT_DATE) `;
    } else {
      params.push(cutoff);
      sql += ` AND submission_date <= $${params.length}`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }
    if (options.assignedTo) {
      params.push(options.assignedTo);
      sql += ` AND (LOWER(name) = LOWER($${params.length}) OR LOWER(doer_name2) = LOWER($${params.length}))`;
    }

    const result = await query(sql, params);
    return Number(result.rows[0]?.count || 0);
  }

  async aggregateStats(cutoff, options = {}) {
    // Use the SAME count methods as working APIs (countOverdue, countPending, countByDate)
    // This ensures department filter works correctly

    // Calculate today and tomorrow dates - USE EXACT SAME LOGIC AS TODAY API
    const todayDay = new Date();
    todayDay.setHours(0, 0, 0, 0); // Today (same as today API)
    const tomorrowDay = new Date(todayDay);
    tomorrowDay.setDate(tomorrowDay.getDate() + 1); // Tomorrow

    // Pending: today's tasks with no submission - USE SAME LOGIC AS TODAY API
    if (options.startDate && options.endDate) {
      const start = options.startDate;
      const end = options.endDate;
      const nextMonthBoundary = new Date(end);
      nextMonthBoundary.setDate(nextMonthBoundary.getDate() + 1);
      const nextMonthBoundaryStr = formatLocalDateString(nextMonthBoundary);

      const targetDate = end;
      const currentMonthStart = start;
      const nextMonthStart = nextMonthBoundaryStr;

      return this._executeAggregateStats(targetDate, currentMonthStart, nextMonthStart, options);
    }

    const todayDate = formatLocalDateString(todayDay);
    const currentMonthStart = getCurrentMonthStart();
    const nextMonthStart = getNextMonthStart();

    return this._executeAggregateStats(todayDate, currentMonthStart, nextMonthStart, options);
  }

  async _executeAggregateStats(targetDate, currentMonthStart, nextMonthStart, options = {}) {
    // 1. Prepare Pending Query
    const pendingParams = [targetDate, currentMonthStart, nextMonthStart];
    let pendingSql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE task_start_date::date = $1::date
        AND task_start_date::date >= $2::date
        AND task_start_date::date < $3::date
        AND submission_date IS NULL
    `;

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          pendingParams.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${pendingParams.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        pendingSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        pendingParams.push(options.department);
        pendingSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${pendingParams.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    // 2. Prepare Completed Query
    // Count completed tasks (status = 'yes') in current month TILL TARGET DATE with department filter
    const completedParams = [currentMonthStart, targetDate];
    let completedSql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE task_start_date IS NOT NULL
        AND task_start_date::date >= $1::date
        AND task_start_date::date <= $2::date
        AND LOWER(TRIM(status)) = 'yes'
    `;

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          completedParams.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${completedParams.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        completedSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        completedParams.push(options.department);
        completedSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${completedParams.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    // 3. Prepare Total Query
    // Total = All tasks in current month TILL TARGET DATE (not full month)
    const totalParams = [currentMonthStart, targetDate];
    let totalSql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE task_start_date IS NOT NULL
        AND task_start_date::date >= $1::date
        AND task_start_date::date <= $2::date
    `;

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          totalParams.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${totalParams.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        totalSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        totalParams.push(options.department);
        totalSql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${totalParams.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    // ✅ OPTIMIZED: Run all 5 operations in parallel
    const [
      overdue,
      upcoming,
      pendingResult,
      completedResult,
      totalResult
    ] = await Promise.all([
      this.countOverdue(options),
      this.countByDate(new Date(targetDate), options), // Use targetDate for upcoming if needed? No, tomorrow logic is different
      query(pendingSql, pendingParams),
      query(completedSql, completedParams),
      query(totalSql, totalParams)
    ]);

    // Handle upcoming correctly if we are in a custom range
    let finalUpcoming = upcoming;
    if (options.startDate && options.endDate) {
      // For custom range, upcoming is not really defined the same way. 
      // Keeping it as is or could be tasks for the day after endDate if within same month.
    }

    const pending = Number(pendingResult.rows[0]?.count || 0);
    const completed = Number(completedResult.rows[0]?.count || 0);
    const total = Number(totalResult.rows[0]?.count || 0);

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (!useMemory) {
      logger.info({
        department: options.department,
        currentMonthStart,
        targetDate,
        note: 'PARALLEL EXECUTION: aggregateStats',
        total,
        completed,
        pending,
        upcoming: finalUpcoming,
        overdue,
        progress
      }, 'aggregateStats - Optimized Parallel Execution');
    }

    return {
      total,
      completed,
      pending,
      upcoming: finalUpcoming,
      overdue,
      progress_percent: progress
    };
  }

  async countByDate(targetDate, options = {}) {
    if (useMemory) {
      // Get current month boundaries for filtering
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);

      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);

        // Filter by current month if no specific range provided
        if (!options.startDate && !options.endDate) {
          if (start < currentMonthStart || start >= nextMonthStart) return false;
        }

        // Filter by department
        if (!matchesDepartment(task.department, options.department)) return false;

        return start >= dayStart && start < dayEnd;
      }).length;
      return count;
    }

    const formattedDate = formatLocalDateString(targetDate);
    if (!formattedDate) {
      return 0;
    }

    const params = [formattedDate];
    let sql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE task_start_date::date = $1::date
    `;

    if (options.pendingOnly) {
      sql += ` AND submission_date IS NULL `;
    }

    // Only apply month boundaries if NO custom date range is provided
    if (!options.startDate || !options.endDate) {
      const currentMonthStart = getCurrentMonthStart();
      const nextMonthStart = getNextMonthStart();
      params.push(currentMonthStart, nextMonthStart);
      sql += ` AND task_start_date::date >= $2::date AND task_start_date::date < $3::date`;
    }

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    const result = await query(sql, params);
    return Number(result.rows[0]?.count || 0);
  }

  async countOverdue(options = {}) {
    if (useMemory) {
      // Get current month boundaries
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const count = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);

        // Filter by current month if no specific range provided
        if (!options.startDate && !options.endDate) {
          if (start < currentMonthStart || start >= nextMonthStart) return false;
        } else if (options.startDate && options.endDate) {
          const s = new Date(options.startDate);
          const e = new Date(options.endDate);
          if (start < s || start > e) return false;
        }

        // Filter by overdue (before today)
        if (start >= today) return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        return !task.submission_date;
      }).length;
      return count;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = formatLocalDateString(today);

    const params = [todayDate];
    let sql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE submission_date IS NULL
        AND task_start_date IS NOT NULL
        AND task_start_date::date < $1::date
    `;

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      sql += ` AND task_start_date::date >= $2::date AND task_start_date::date <= $3::date`;
    } else {
      const currentMonthStart = getCurrentMonthStart();
      const nextMonthStart = getNextMonthStart();
      params.push(currentMonthStart, nextMonthStart);
      sql += ` AND task_start_date::date >= $2::date AND task_start_date::date < $3::date`;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    const result = await query(sql, params);
    return Number(result.rows[0]?.count || 0);
  }

  async findByDate(targetDate, options = {}) {
    if (useMemory) {
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const filtered = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        return start >= dayStart && start < dayEnd;
      });

      const { limit, offset } = options;
      const startIdx = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const endIdx = Number.isInteger(limit) && limit > 0 ? startIdx + limit : undefined;
      return filtered.slice(startIdx, endIdx).map(record => formatTaskDates(applyComputedDelay(record)));
    }

    const params = [targetDate];
    let sql = `
      SELECT *
      FROM assign_task
      WHERE task_start_date::date = $1::date
    `;

    if (options.pendingOnly) {
      sql += ` AND submission_date IS NULL `;
    }

    if (options.department) {
      // Handle multiple departments (array) or single department (string)
      if (Array.isArray(options.department) && options.department.length > 0) {
        // Use IN clause for multiple departments
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string') {
        // Single department
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    sql += ' ORDER BY id ASC';

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async create(input) {
    if (useMemory) {
      return this.createInMemory(input);
    }
    const now = new Date().toISOString();
    const submissionDate = input.submission_date ?? null;

    const seqResult = await query(
      "SELECT nextval(pg_get_serial_sequence('assign_task','id')) AS id"
    );
    const id = seqResult.rows[0].id;
    const taskId = String(id);
    const computedDelay = computeDelay(input.task_start_date, submissionDate);
    const frequency = normalizeFrequency(input.frequency);
    const hod = serializeHod(input.hod);

    const sql = `
      INSERT INTO assign_task (
        id, task_id, department, given_by, name, task_description, remark, status,
        image, attachment, doer_name2, hod, frequency, task_start_date, submission_date,
        delay, remainder, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING id, task_id, department, given_by, name, task_description, remark, status,
        image, attachment, doer_name2, hod, frequency, task_start_date, submission_date,
        delay, remainder, created_at;
    `;

    const params = [
      id,
      taskId,
      input.department,
      input.given_by || null,
      input.name,
      input.task_description,
      input.remark || null,
      input.status || null,
      input.image || null,
      input.attachment || null,
      input.doer_name2 || null,
      hod,
      frequency,
      input.task_start_date || null,
      submissionDate,
      input.delay ?? computedDelay,
      input.remainder || null,
      now
    ];

    const result = await query(sql, params);
    const record = result.rows[0];
    return record ? formatTaskDates(applyComputedDelay(record)) : undefined;
  }

  async update(id, input) {
    if (useMemory) {
      return this.updateInMemory(id, input);
    }

    // Try to find by id first (integer), then by task_id (string) if id lookup fails
    let existing = await this.findById(id);
    let actualId = id;

    if (!existing) {
      // If id is a string that looks like a number, try converting it
      const numericId = Number(id);
      if (!Number.isNaN(numericId) && Number.isInteger(numericId)) {
        existing = await this.findById(numericId);
        if (existing) {
          actualId = numericId;
        }
      }
      // If still not found, try finding by task_id
      if (!existing) {
        const result = await query('SELECT * FROM assign_task WHERE task_id = $1', [String(id)]);
        const record = result.rows[0];
        if (record) {
          existing = formatTaskDates(applyComputedDelay(record));
          actualId = record.id; // Use the actual id from the database for the update
        }
      }
    }
    if (!existing) return null;

    const submissionDate = Object.prototype.hasOwnProperty.call(input, 'submission_date')
      ? input.submission_date
      : existing.submission_date;
    const taskStartDate = input.task_start_date ?? existing.task_start_date;
    const computedDelay = computeDelay(taskStartDate, submissionDate);

    const fields = [
      'department',
      'given_by',
      'name',
      'task_description',
      'remark',
      'status',
      'image',
      'attachment',
      'doer_name2',
      'hod',
      'frequency',
      'task_start_date',
      'submission_date',
      'delay',
      'remainder'
    ];

    const setClauses = [];
    const params = [];
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        let value = input[field];
        if (field === 'frequency') {
          value = normalizeFrequency(value);
        }
        if (field === 'delay' && computedDelay !== null) {
          value = computedDelay;
        }
        if (field === 'submission_date') {
          value = submissionDate;
        }
        if (field === 'hod') {
          value = serializeHod(value);
        }
        setClauses.push(`${field} = $${params.length + 1}`);
        params.push(value);
      }
    });

    // ensure delay updates when dates change even if delay not explicitly provided
    const datesChanged = Object.prototype.hasOwnProperty.call(input, 'submission_date') ||
      Object.prototype.hasOwnProperty.call(input, 'task_start_date');
    if (!Object.prototype.hasOwnProperty.call(input, 'delay') && computedDelay !== null && datesChanged) {
      setClauses.push(`${'delay'} = $${params.length + 1}`);
      params.push(computedDelay);
    }

    if (setClauses.length === 0) {
      return existing ? formatTaskDates(applyComputedDelay(existing)) : null;
    }

    params.push(actualId);

    const sql = `
      UPDATE assign_task
      SET ${setClauses.join(', ')}
      WHERE id = $${params.length}
      RETURNING *;
    `;

    const result = await query(sql, params);
    const record = result.rows[0];
    return record ? formatTaskDates(applyComputedDelay(record)) : null;
  }

  async delete(id) {
    if (useMemory) {
      return this.deleteInMemory(id);
    }
    const result = await query('DELETE FROM assign_task WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids = []) {
    const normalized = Array.isArray(ids)
      ? ids.map((value) => (value !== undefined && value !== null ? String(value).trim() : '')).filter(Boolean)
      : [];

    if (normalized.length === 0) {
      return 0;
    }

    if (useMemory) {
      const idSet = new Set(normalized);
      const before = this.records.length;
      this.records = this.records.filter((record) => {
        const idMatch = idSet.has(String(record?.id));
        const taskIdMatch = idSet.has(String(record?.task_id));
        return !(idMatch || taskIdMatch);
      });
      return before - this.records.length;
    }

    const numericIds = normalized
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));

    const params = [numericIds, normalized];
    const sql = `
      DELETE FROM assign_task
      WHERE id = ANY($1::int[])
         OR task_id = ANY($2::text[])
    `;
    const result = await query(sql, params);
    return result.rowCount || 0;
  }

  async createInMemory(input) {
    const now = new Date().toISOString();
    const id = this.nextId++;
    const submissionDate = input.submission_date ?? null;
    const computedDelay = computeDelay(input.task_start_date, submissionDate);
    const frequency = normalizeFrequency(input.frequency);
    const record = {
      id,
      task_id: String(id),
      department: input.department,
      name: input.name,
      task_description: input.task_description,
      given_by: input.given_by || null,
      remark: input.remark || null,
      status: input.status || null,
      image: input.image || null,
      attachment: input.attachment || null,
      doer_name2: input.doer_name2 || null,
      hod: input.hod || null,
      frequency,
      task_start_date: input.task_start_date || null,
      submission_date: submissionDate,
      delay: input.delay ?? computedDelay,
      remainder: input.remainder || null,
      created_at: now
    };
    this.records.push(record);
    return formatTaskDates(applyComputedDelay(record));
  }

  async updateInMemory(id, input) {
    const idx = this.records.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return null;
    const base = { ...this.records[idx], ...input };
    if (Object.prototype.hasOwnProperty.call(input, 'frequency')) {
      base.frequency = normalizeFrequency(input.frequency);
    }
    const computedDelay = computeDelay(base.task_start_date, base.submission_date);
    if (computedDelay !== null) {
      base.delay = computedDelay;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'hod')) {
      base.hod = serializeHod(input.hod);
    }
    this.records[idx] = base;
    return formatTaskDates(applyComputedDelay(base));
  }

  async deleteInMemory(id) {
    const before = this.records.length;
    this.records = this.records.filter((r) => String(r.id) !== String(id));
    return this.records.length < before;
  }
  async findNotDone(options = {}) {
    if (useMemory) {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);

      const filtered = this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);

        if (start < currentMonthStart || start >= nextMonthStart) return false;
        if (!task.submission_date) return false;
        if (String(task.status || '').trim().toLowerCase() !== 'no') return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        return true;
      });
      const { limit, offset } = options;
      const startIdx = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const endIdx = Number.isInteger(limit) && limit > 0 ? startIdx + limit : undefined;
      return filtered.slice(startIdx, endIdx).map(record => formatTaskDates(applyComputedDelay(record)));
    }

    const currentMonthStart = getCurrentMonthStart();
    const nextMonthStart = getNextMonthStart();

    const params = [currentMonthStart, nextMonthStart];
    let sql = `
      SELECT *
      FROM assign_task
      WHERE LOWER(TRIM(status)) = 'no'
        AND submission_date IS NOT NULL
        AND task_start_date::date >= $1::date
        AND task_start_date::date < $2::date
    `;

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    sql += ' ORDER BY task_start_date ASC';

    const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
    const hasOffset = Number.isInteger(options.offset) && options.offset > 0;

    if (hasLimit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (hasOffset) {
      if (!hasLimit) sql += ' LIMIT ALL';
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows.map(record => formatTaskDates(applyComputedDelay(record)));
  }

  async countNotDone(options = {}) {
    if (useMemory) {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);
      return this.records.filter((task) => {
        if (!task || !task.task_start_date) return false;
        const start = new Date(task.task_start_date);
        if (Number.isNaN(start.getTime())) return false;
        start.setHours(0, 0, 0, 0);
        if (start < currentMonthStart || start >= nextMonthStart) return false;
        if (!task.submission_date) return false;
        if (String(task.status || '').trim().toLowerCase() !== 'no') return false;
        if (!matchesDepartment(task.department, options.department)) return false;
        return true;
      }).length;
    }

    const currentMonthStart = getCurrentMonthStart();
    const nextMonthStart = getNextMonthStart();

    const params = [currentMonthStart, nextMonthStart];
    let sql = `
      SELECT COUNT(*) as count
      FROM assign_task
      WHERE LOWER(TRIM(status)) = 'no'
        AND submission_date IS NOT NULL
        AND task_start_date::date >= $1::date
        AND task_start_date::date < $2::date
    `;

    if (options.department) {
      if (Array.isArray(options.department) && options.department.length > 0) {
        const placeholders = options.department.map((_, idx) => {
          params.push(options.department[idx]);
          return `LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
        }).join(', ');
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) IN (${placeholders})`;
      } else if (typeof options.department === 'string' && options.department.trim() !== '') {
        params.push(options.department);
        sql += ` AND LOWER(REGEXP_REPLACE(TRIM(department), '\\\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${params.length}), '\\\\s+', ' ', 'g'))`;
      }
    }

    const result = await query(sql, params);
    return Number(result.rows[0]?.count || 0);
  }

  async updateOverdueTasks() {
    if (useMemory) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let count = 0;
      this.records.forEach((task) => {
        if (!task.submission_date && task.task_start_date) {
          const start = new Date(task.task_start_date);
          if (start < today) {
            task.status = 'no';
            task.attachment = 'confirmed';
            task.submission_date = new Date().toISOString();
            const computed = computeDelay(task.task_start_date, task.submission_date);
            if (computed !== null) task.delay = computed;
            count++;
          }
        }
      });
      return count;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatLocalDateString(today);

    // Update criteria: submission_date is NULL and task_start_date < today
    // New values: status = 'no', attachment = 'confirmed', submission_date = NOW()
    const sql = `
      UPDATE assign_task
      SET 
        status = 'no',
        attachment = 'confirmed',
        submission_date = CURRENT_TIMESTAMP,
        delay = EXTRACT(DAY FROM (CURRENT_TIMESTAMP - task_start_date))
      WHERE submission_date IS NULL
        AND task_start_date IS NOT NULL
        AND task_start_date::date < $1::date
    `;

    const result = await query(sql, [todayStr]);
    return result.rowCount || 0;
  }
}

const assignTaskRepository = new AssignTaskRepository();
export { assignTaskRepository };
