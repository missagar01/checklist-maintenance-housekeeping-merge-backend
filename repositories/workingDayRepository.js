import { query } from '../config/housekeppingdb.js';
import config from '../utils/config.js';

class WorkingDayRepository {
  async findAll() {
    if (config.env === 'test') {
      return [];
    }
    const result = await query(
      `SELECT working_date, day, week_num, month
       FROM working_day_calendar
       ORDER BY working_date ASC`
    );
    return result.rows;
  }
}

const workingDayRepository = new WorkingDayRepository();

// module.exports = { workingDayRepository };
export { workingDayRepository };
