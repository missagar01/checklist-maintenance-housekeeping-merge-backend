# Checklist & Delegation Backend API Guide (Zero to Hero)

Base URL (local): `http://localhost:5050/api`

## Auth
No auth headers in this build (backed by role/name query params). Set these in query where noted:
- `role`: `admin` or `user`
- `username`: current user name (for `role=user`)

## Quick Tasks
All endpoints are under `/api/tasks` and expect/return JSON.

### Fetch checklist (paginated, unique task descriptions)
- **POST** `/api/tasks/checklist`
- Body: `{ "page": 0, "pageSize": 50, "nameFilter": "", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }`
  - `startDate/endDate` optional; if omitted defaults to today.
- Response: `{ data: [ { ...task } ], total: <int> }`

### Fetch delegation (paginated)
- **POST** `/api/tasks/delegation`
- Same shape/body as checklist.

### Update checklist task
- **POST** `/api/tasks/update-checklist`
- Body: `{ "updatedTask": { ...fields }, "originalTask": { "department": "", "name": "", "task_description": "" } }`
- Response: `[ { ...updatedTaskRow } ]`

### Delete checklist tasks
- **POST** `/api/tasks/delete-checklist`
- Body: `{ "tasks": [ { "name": "", "task_description": "" } ] }`
- Response: echoed array.

### Delete delegation tasks
- **POST** `/api/tasks/delete-delegation`
- Body: `{ "taskIds": [ <id>, ... ] }`
- Response: echoed array.

### Fetch users (names only)
- **GET** `/api/tasks/users`
- Response: `[ { "user_name": "Alice" }, ... ]`

## Dashboard (checklist/delegation)
All endpoints under `/api/dashboard`. Use `dashboardType` as `checklist` or `delegation`.

### List dashboard tasks (paged by view)
- **GET** `/api/dashboard`
- Query params: `dashboardType`, `staffFilter=all`, `departmentFilter=all`, `taskView=recent|upcoming|overdue|all`, `page=1`, `limit=50`, `role`, `username`
- Response: `[ { ...task } ]`

### Counts for views
- **GET** `/api/dashboard/count`
- Query params: `dashboardType`, `staffFilter`, `departmentFilter`, `taskView`, `role`, `username`
- Response: integer count.

### Totals (month-to-date)
- **GET** `/api/dashboard/total`
- Params: `dashboardType`, `staffFilter`, `departmentFilter`, `role`, `username`
- Response: integer.

### Completed (month-to-date)
- **GET** `/api/dashboard/completed`
- Same params; response integer.

### Pending today
- **GET** `/api/dashboard/pending`
- Same params; response integer.

### Overdue (before today, not submitted)
- **GET** `/api/dashboard/overdue`
- Same params; response integer.

### Not done (status = no, submitted)
- **GET** `/api/dashboard/not-done`
- Same params; response integer.

### Staff list by department
- **GET** `/api/dashboard/staff?department=<name|all>`
- Response: `[ "Name", ... ]`

### Departments
- **GET** `/api/dashboard/departments`
- Response: `[ "STORE", ... ]`

### Staff task summary (month-to-date)
- **GET** `/api/dashboard/staff-summary?dashboardType=checklist|delegation`
- Response: `[ { id, name, totalTasks, completedTasks, pendingTasks, progress } ]`

## Date Range (checklist)
All date params are `YYYY-MM-DD` and inclusive (date-only comparison).

### Checklist tasks by date range
- **GET** `/api/dashboard/checklist/date-range`
- Query: `startDate`, `endDate`, `staffFilter=all`, `departmentFilter=all`
- Response: up to 5000 rows `[ { ...task } ]` ordered by `task_start_date`.

### Checklist stats by date range
- **GET** `/api/dashboard/checklist/date-range/stats`
- Same query as above.
- Response: `{ totalTasks, completedTasks, pendingTasks, overdueTasks, notDone, completionRate }`

### Checklist count by date range
- **GET** `/api/dashboard/checklist/date-range/count`
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
- Large ranges: list endpoint caps at 5000 rows; use `/count` and `/stats` to inspect totals without the payload.***
