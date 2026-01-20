# Checklist & Delegation Backend API Guide (Zero to Hero)
# Checklist & Delegation Backend API Guide (Zero to Hero)

Base URL (local): `http://localhost:5050/api`

## Auth
No auth headers in this build (backed by role/name query params). Set these in query where noted:
- `role`: `admin` or `user`
- `username`: current user name (for `role=user`)

## Login
- **POST** `http://localhost:5050/api/login`
- Body: `{ "username": "<user>", "password": "<pass>" }` (if applicable; backend currently ignores password but retains structure)
- Response: `{ "status": "success" }` or relevant auth/role details depending on implementation

## Settings & Users
All `/api/settings` endpoints manage users, departments, and system access flags.

### List users (admin view)
- **GET** `http://localhost:5050/api/settings/users`
- Response: full user rows ordered by `id`. Includes `user_access`, `system_access`, and `page_access`.

### Get a user by ID
- **GET** `http://localhost:5050/api/settings/users/:id`
- Response: the user row for the provided `id`; returns `404` if the user is missing.

### Create a user
- **POST** `http://localhost:5050/api/settings/users`
- Body: `{ "username", "password", "email", "phone", "department", "givenBy", "employee_id", "role", "status", "user_access", "user_access1", "system_access", "page_access" }`
- Response: newly created user row.

### Update a user
- **PUT** `http://localhost:5050/api/settings/users/:id`
- Body: same shape as create (omit `password` to leave it unchanged).
- Response: updated user row.
- Notes:
  - You can send any subset of fields (no required keys) and the controller will update only those columns.
  - Fields that map to long text or lists such as `user_access1` and `system_access` may be provided as arrays; the backend joins them with commas before saving.
  - Example JSON:
    ```json
    {
      "user_access1": [
        "Admin Office - First Floor",
        "CCM",
        "Plant Area"
      ],
      "system_access": "HOUSEKEEPING"
    }
    ```

### Delete a user
- **DELETE** `http://localhost:5050/api/settings/users/:id`
- Response: `{ "message": "User deleted", "id": "<id>" }`.

### List departments
- **GET** `http://localhost:5050/api/settings/departments`
- Response: distinct `department`, `given_by`, and `id` from stored rows.

### List unique departments only
- **GET** `http://localhost:5050/api/settings/departments-only`
- Response: `[ { "department": "..." }, ... ]`.

### List unique `given_by` values
- **GET** `http://localhost:5050/api/settings/given-by`
- Response: `[ { "given_by": "..." }, ... ]`.

### Create/update a department
- **POST** `http://localhost:5050/api/settings/departments` / **PUT** `http://localhost:5050/api/settings/departments/:id`
- Body: `{ "name", "givenBy" }` for create; `{ "department", "given_by" }` for update.
- Response: affected department row.

### Toggle a system access flag
- **PATCH** `http://localhost:5050/api/settings/users/:id/system_access`
- Body: `{ "system_access": "<FLAG>" }` (case-insensitive). Adds the flag when absent or removes it when present.
- Response: updated user row.

## Quick Tasks
All endpoints are under `/api/tasks` and expect/return JSON.

### Fetch checklist (paginated, unique task descriptions)
- **POST** `http://localhost:5050/api/tasks/checklist`
- Body: `{ "page": 0, "pageSize": 50, "nameFilter": "", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }`
  - `startDate/endDate` optional; if omitted defaults to today.
- Response: `{ data: [ { ...task } ], total: <int> }`

### Fetch delegation (paginated)
- **POST** `http://localhost:5050/api/tasks/delegation`
- Same shape/body as checklist.

### Update checklist task
- **POST** `http://localhost:5050/api/tasks/update-checklist`
- Body: `{ "updatedTask": { ...fields }, "originalTask": { "department": "", "name": "", "task_description": "" } }`
- Response: `[ { ...updatedTaskRow } ]`

### Delete checklist tasks
- **POST** `http://localhost:5050/api/tasks/delete-checklist`
- Body: `{ "tasks": [ { "name": "", "task_description": "" } ] }`
- Response: echoed array.

### Delete delegation tasks
- **POST** `http://localhost:5050/api/tasks/delete-delegation`
- Body: `{ "taskIds": [ <id>, ... ] }`
- Response: echoed array.

### Fetch users (names only)
- **GET** `http://localhost:5050/api/tasks/users`
- Response: `[ { "user_name": "Alice" }, ... ]`

## Dashboard (checklist/delegation)
All endpoints under `/api/dashboard`. Use `dashboardType` as `checklist` or `delegation`.

### List dashboard tasks (paged by view)
- **GET** `http://localhost:5050/api/dashboard`
- Query params: `dashboardType`, `staffFilter=all`, `departmentFilter=all`, `taskView=recent|upcoming|overdue|all`, `page=1`, `limit=50`, `role`, `username`
- Response: `[ { ...task } ]`

### Counts for views
- **GET** `http://localhost:5050/api/dashboard/count`
- Query params: `dashboardType`, `staffFilter`, `departmentFilter`, `taskView`, `role`, `username`
- Response: integer count.

### Totals (month-to-date)
- **GET** `http://localhost:5050/api/dashboard/total`
- Params: `dashboardType`, `staffFilter`, `departmentFilter`, `role`, `username`
- Response: integer.

### Completed (month-to-date)
- **GET** `http://localhost:5050/api/dashboard/completed`
- Same params; response integer.

### getNotDoneApiList
- **GET** `http://localhost:5050/api/dashboard/notdone/list`
- Same params; response integer.
### Pending today
- **GET** `http://localhost:5050/api/dashboard/pending`
- Same params; response integer.

### Pending today (submission not made yet)
- **GET** `http://localhost:5050/api/dashboard/pendingtoday`
- Same params as `/pending`; returns a count of tasks whose `task_start_date` is today and `submission_date` is still null (matching the `/pending` list view logic).

### Completed today (submissions recorded today)
- **GET** `http://localhost:5050/api/dashboard/completedtoday`
- Same params; returns a count of tasks whose `submission_date` is equal to the current date.

### Overdue (before today, not submitted)
- **GET** `http://localhost:5050/api/dashboard/overdue`
- Same params; response integer.

### Not done (status = no, submitted)
- **GET** `http://localhost:5050/api/dashboard/not-done`
- Same params; response integer.

### Staff list by department
- **GET** `http://localhost:5050/api/dashboard/staff?department=<name|all>`
- Response: `[ "Name", ... ]`

### Departments
- **GET** `http://localhost:5050/api/dashboard/departments`
- Response: `[ "STORE", ... ]`

### Staff task summary (month-to-date)
- **GET** `http://localhost:5050/api/dashboard/staff-summary?dashboardType=checklist|delegation`
- Response: `[ { id, name, totalTasks, completedTasks, pendingTasks, progress } ]`

## Date Range (checklist)
All date params are `YYYY-MM-DD` and inclusive (date-only comparison).

### Checklist tasks by date range
- **GET** `http://localhost:5050/api/dashboard/checklist/date-range`
- Query: `startDate`, `endDate`, `staffFilter=all`, `departmentFilter=all`
- Response: up to 5000 rows `[ { ...task } ]` ordered by `task_start_date`.

### Checklist stats by date range
- **GET** `http://localhost:5050/api/dashboard/checklist/date-range/stats`
- Same query as above.
- Response: `{ totalTasks, completedTasks, pendingTasks, overdueTasks, notDone, completionRate }`

### Checklist count by date range
- **GET** `http://localhost:5050/api/dashboard/checklist/date-range/count`
- Query: `startDate`, `endDate`, `staffFilter=all`, `departmentFilter=all`, `statusFilter=all|completed|pending|overdue`
- Response: integer count.

## Postman Usage (quick start)
1) Set a Collection variable `base = http://localhost:5050/api`.
2) For each request, use URL like `{{base}}/dashboard/checklist/date-range/stats?startDate=2025-01-06&endDate=2025-12-03`.
3) Add query params for `role` and `username` when testing user-specific data.
4) For POST bodies, set `raw` JSON (application/json) and paste payloads shown above.

## Troubleshooting
- Getting 0 on date range: ensure `startDate/endDate` are `YYYY-MM-DD`; for checklist, stats are inclusive on date-only.
- Empty responses with filters: check `staffFilter/departmentFilter` aren’t narrowing too far; use `all` to test.
- Large ranges: list endpoint caps at 5000 rows; use `/count` and `/stats` to inspect totals without the payload.
