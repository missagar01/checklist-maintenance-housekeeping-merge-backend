import { query } from '../config/housekeppingdb.js';
class UserRepository {
  async findByUsername(userName) {
    const result = await query(
      'SELECT id, user_name, password, role, email_id, department, user_access FROM users WHERE user_name = $1 LIMIT 1',
      [userName]
    );
    return result.rows[0] || null;
  }

  async findAll() {
    const result = await query(
      'SELECT * FROM users ORDER BY id ASC'
    );
    return result.rows;
  }

  async findById(id) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1 LIMIT 1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input) {
    const result = await query(
      `INSERT INTO users (
         user_name, password, email_id, number, department, given_by,
         role, status, user_access, leave_date, remark, leave_end_date,
         employee_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13
       )
       RETURNING *`,
      [
        input.user_name,
        input.password,
        input.email_id || null,
        input.number || null,
        input.department || null,
        input.given_by || null,
        input.role || null,
        input.status || null,
        input.user_access || null,
        input.leave_date || null,
        input.remark || null,
        input.leave_end_date || null,
        input.employee_id || null
      ]
    );
    return result.rows[0];
  }

  async update(id, input) {
    const fields = [
      'user_name',
      'password',
      'email_id',
      'number',
      'department',
      'given_by',
      'role',
      'status',
      'user_access',
      'leave_date',
      'remark',
      'leave_end_date',
      'employee_id'
    ];

    const setClauses = [];
    const params = [];

    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        setClauses.push(`${field} = $${params.length + 1}`);
        params.push(input[field]);
      }
    });

    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1) {
      return this.findById(id);
    }

    params.push(id);

    const result = await query(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async delete(id) {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async listByDepartment() {
    const result = await query(
      `SELECT
         id,
         user_name,
         department
       FROM users
       WHERE department IS NOT NULL AND trim(department) <> ''
       ORDER BY LOWER(department), user_name`
    );
    return result.rows;
  }
}

const userRepository = new UserRepository();

export { userRepository };
