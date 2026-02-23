import { assignTaskRepository } from '../../repositories/assignTaskRepository.js';
import { workingDayRepository } from '../../repositories/workingDayRepository.js';

const ALLOWED_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const normalizeFrequency = (value) => {
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  return ALLOWED_FREQUENCIES.includes(lower) ? lower : 'daily';
};

const getEndOfYesterday = () => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
};

class AssignTaskService {
  create(input) {
    const frequency = normalizeFrequency(input.frequency);
    return assignTaskRepository.create({ ...input, frequency });
  }

  list(options = {}) {
    return assignTaskRepository.findAll(options);
  }

  getById(id) {
    return assignTaskRepository.findById(id);
  }

  async bulkCreate(items) {
    const results = [];
    for (const item of items) {
      // sequential to keep ids/tasks ordered
      // eslint-disable-next-line no-await-in-loop
      const frequency = normalizeFrequency(item.frequency);
      const created = await assignTaskRepository.create({ ...item, frequency });
      results.push(created);
    }
    return results;
  }

  async generateFromWorkingDays(base) {
    if (!base.task_start_date) {
      throw new Error('task_start_date is required for generation');
    }

    const allRows = await workingDayRepository.findAll();
    if (!allRows || allRows.length === 0) {
      throw new Error('No working days available');
    }

    const toMidnight = (d) => {
      const dt = new Date(d);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const startDate = toMidnight(base.task_start_date);
    if (Number.isNaN(startDate.getTime())) {
      throw new Error('Invalid task_start_date');
    }

    // Normalize working days to JS Date array sorted ASC
    const workingDates = allRows
      .map((row) => toMidnight(row.working_date || row))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);

    if (workingDates.length === 0) {
      throw new Error('No working days available');
    }

    const firstWorkingDate = workingDates[0];
    const lastWorkingDate = workingDates[workingDates.length - 1];
    if (startDate > lastWorkingDate) {
      throw new Error('No working days on/after task_start_date');
    }

    // If startDate is before the first working day, begin at the first working day
    const effectiveStart = startDate < firstWorkingDate ? firstWorkingDate : startDate;

    // Helper to add intervals
    const addDays = (d, days) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      next.setHours(0, 0, 0, 0);
      return next;
    };
    const addMonths = (d, months) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + months);
      next.setHours(0, 0, 0, 0);
      return next;
    };
    const addYears = (d, years) => {
      const next = new Date(d);
      next.setFullYear(next.getFullYear() + years);
      next.setHours(0, 0, 0, 0);
      return next;
    };

    // Find first working day >= effectiveStart
    let currentIndex = workingDates.findIndex((d) => d >= effectiveStart);
    if (currentIndex === -1) {
      throw new Error('No working days on/after task_start_date');
    }

    const pickDates = [];
    const freq = (base.frequency || 'daily').toLowerCase();
    const increment = (date) => {
      switch (freq) {
        case 'weekly':
          return addDays(date, 7);
        case 'monthly':
          return addMonths(date, 1);
        case 'yearly':
          return addYears(date, 1);
        case 'daily':
        default:
          return addDays(date, 1);
      }
    };

    // Always include the first working day on/after start
    pickDates.push(workingDates[currentIndex]);

    if (freq !== 'one-time') {
      // Generate until we exceed the last working day
      while (true) {
        const candidate = increment(pickDates[pickDates.length - 1]);
        if (candidate > lastWorkingDate) break;
        // find next working day >= candidate
        const nextIdx = workingDates.findIndex(
          (d, idx) => idx > currentIndex && d >= candidate
        );
        if (nextIdx === -1) break;

        pickDates.push(workingDates[nextIdx]);
        currentIndex = nextIdx;
      }
    }

    const tasks = pickDates.map((d) => ({
      ...base,
      frequency: freq,
      task_start_date: d.toISOString(),
      submission_date: null
    }));

    return this.bulkCreate(tasks);
  }

  update(id, input) {
    const payload = { ...input };
    if (Object.prototype.hasOwnProperty.call(input, 'frequency')) {
      payload.frequency = normalizeFrequency(input.frequency);
    }
    return assignTaskRepository.update(id, payload);
  }

  remove(id) {
    return assignTaskRepository.delete(id);
  }

  deleteMany(ids = []) {
    return assignTaskRepository.deleteMany(ids);
  }

  async listDepartments() {
    return assignTaskRepository.listDepartments();
  }

  async aggregateStats(cutoffOverride, options = {}) {
    // This is redirected to the optimized version below
    return this.aggregateStatsInternal(options);
  }

  async aggregateStatsInternal(options = {}) {
    // Optimized version implemented at the bottom
    return this.aggregateStats(null, options);
  }

  async stats(itemsOverride) {
    const items = itemsOverride || await this.list();
    const total = items.length;
    const now = new Date();

    const normalizeStatus = (s) => (s ? String(s).trim().toLowerCase() : '');

    let completed = 0;
    let pending = 0;
    let notDone = 0;
    let overdue = 0;

    items.forEach((task) => {
      const status = normalizeStatus(task.status);

      if (status === 'YES') {
        completed += 1;
        return;
      }
      if (status === 'NO') {
        notDone += 1;
        return;
      }

      const missingSubmission = !task.submission_date;
      let startPastNow = false;
      if (task.task_start_date) {
        const ts = new Date(task.task_start_date);
        startPastNow = !Number.isNaN(ts.getTime()) && ts < now;
      }

      if (missingSubmission) {
        if (startPastNow) {
          overdue += 1;
        } else {
          pending += 1;
        }
      }
    });

    const progress =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      not_done: notDone,
      overdue,
      progress_percent: progress
    };
  }

  // Override: count completed/not_done across all tasks; pending/overdue only for active tasks
  async stats(allItemsOverride, activeItemsOverride) {
    const allItems = allItemsOverride || await this.list();
    const activeItems = activeItemsOverride || allItems;
    const total = activeItems.length; // total should reflect active tasks (on/before today)
    const now = new Date();

    const normalizeStatus = (s) => (s ? String(s).trim().toLowerCase() : '');
    const cutoff = getEndOfYesterday();

    let completed = 0;
    let pending = 0;
    let notDone = 0;
    let overdue = 0;

    // Completed / not_done from all tasks
    allItems.forEach((task) => {
      const status = normalizeStatus(task.status);
      if (status === 'yes') {
        completed += 1;
      } else if (status === 'no') {
        notDone += 1;
      }
    });

    // Pending / overdue from active tasks (on or before the cutoff day)
    activeItems.forEach((task) => {
      const missingSubmission = !task.submission_date;
      if (!missingSubmission) return;

      const ts = task.task_start_date ? new Date(task.task_start_date) : null;
      const hasValidStart = ts && !Number.isNaN(ts.getTime());
      const startDay = hasValidStart ? new Date(ts) : null;
      if (startDay) {
        startDay.setHours(0, 0, 0, 0);
      }

      if (hasValidStart && startDay.getTime() <= cutoff.getTime()) {
        overdue += 1;
      } else {
        pending += 1;
      }
    });

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      not_done: notDone,
      overdue,
      progress_percent: progress
    };
  }

  // Return all tasks with start date < today and no submission
  async overdue(options = {}) {
    // Use today's date for comparison (not endOfYesterday) to match user's SQL query
    // If startDate/endDate provided, override cutoff
    return assignTaskRepository.findOverdue(null, options);
  }

  async notDone(options = {}) {
    return assignTaskRepository.findNotDone(options);
  }

  async countNotDone(options = {}) {
    return assignTaskRepository.countNotDone(options);
  }

  async notDoneWithTotal(options = {}) {
    const items = await assignTaskRepository.findNotDone(options);
    const total = await assignTaskRepository.countNotDone(options);
    return { items, total };
  }

  today(options = {}) {
    const today = new Date();
    // strip time to avoid TZ issues in ::date comparison
    today.setHours(0, 0, 0, 0);
    return assignTaskRepository.findByDate(today, options);
  }

  tomorrow(options = {}) {
    const tomorrow = new Date();
    // strip time to avoid TZ issues in ::date comparison
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return assignTaskRepository.findByDate(tomorrow, options);
  }

  async countToday(options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return assignTaskRepository.countByDate(today, options);
  }

  async countTomorrow(options = {}) {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return assignTaskRepository.countByDate(tomorrow, options);
  }

  async countOverdue(options = {}) {
    return assignTaskRepository.countOverdue(options);
  }

  pending(options = {}) {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999); // include up to today
    return assignTaskRepository.findPending(cutoff, options);
  }

  history(options = {}) {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999); // include up to today
    return assignTaskRepository.findHistory(cutoff, options);
  }

  async pendingWithTotal(options = {}) {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999); // include up to today
    const items = await assignTaskRepository.findPending(cutoff, options);
    const total = await assignTaskRepository.countPending(cutoff, options);
    return { items, total };
  }

  async historyWithTotal(options = {}) {
    // Pass null as cutoff so findHistory/countHistory default to current month filter
    const items = await assignTaskRepository.findHistory(null, options);
    const total = await assignTaskRepository.countHistory(null, options);
    return { items, total };
  }

  async todayWithTotal(options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = await assignTaskRepository.findByDate(today, options);
    const total = await assignTaskRepository.countByDate(today, options);
    return { items, total };
  }

  async tomorrowWithTotal(options = {}) {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const items = await assignTaskRepository.findByDate(tomorrow, options);
    const total = await assignTaskRepository.countByDate(tomorrow, options);
    return { items, total };
  }

  async aggregateStats(cutoffOverride, options = {}) {
    const { startDate, endDate } = options;

    // Default to current month if no range given
    let start = startDate;
    let end = endDate;

    if (!start || !end) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const pad = (n) => String(n).padStart(2, '0');
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      start = fmt(first);
      end = fmt(last);
    }

    // Run all counts in parallel for performance
    const [total, completed, pending, upcoming, overdue, notdone] = await Promise.all([
      // Total tasks in range
      this.list({ ...options, startDate: start, endDate: end }).then(items => items.length),
      // Completed tasks in range (status filtering now supported in repo)
      this.list({ ...options, status: 'yes', startDate: start, endDate: end }).then(items => items.length),
      // Pending tasks for today (unsubmitted only for stats)
      this.countToday({ ...options, pendingOnly: true }),
      // Upcoming tasks for tomorrow (unsubmitted only for stats)
      this.countTomorrow({ ...options, pendingOnly: true }),
      // Overdue tasks (repository already filters by current month if no range)
      this.countOverdue(options),
      // Not Done tasks (repository strictly filters by current month)
      this.countNotDone(options)
    ]);

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      upcoming,
      overdue,
      notdone,
      not_done: notdone,
      progress_percent: progress
    };
  }

  async markOverdueAsNotDone() {
    return assignTaskRepository.updateOverdueTasks();
  }
}

const assignTaskService = new AssignTaskService();

export { assignTaskService };
