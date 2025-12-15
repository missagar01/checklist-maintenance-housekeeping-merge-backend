import { z } from 'zod';

const assignTaskSchema = z.object({
  department: z.string().min(1, 'department is required'),
  name: z.string().min(1, 'name is required'),
  task_description: z.string().min(1, 'task_description is required'),
  given_by: z.string().optional(),
  remark: z.string().optional(),
  status: z.string().optional(),
  image: z.string().optional(),
  attachment: z.string().optional(),
  doer_name2: z.string().optional(),
  hod: z.union([z.string(), z.array(z.string())]).optional(),
  frequency: z.string().optional(),
  // Accept raw date/time strings; DB will store as DATE, delay uses JS Date parsing.
  task_start_date: z.string().min(1, 'task_start_date is required'),
  submission_date: z.string().optional(),
  delay: z.number().int().optional(),
  remainder: z.string().optional()
});

const updateAssignTaskSchema = assignTaskSchema.partial();

const assignTaskListSchema = z.array(assignTaskSchema).min(1, 'tasks required');

export { assignTaskSchema, updateAssignTaskSchema, assignTaskListSchema };
