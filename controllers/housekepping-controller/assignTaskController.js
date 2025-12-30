import { assignTaskService } from '../../services/housekepping-services/assignTaskServices.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { notifyAssignmentUpdate } from '../../services/housekepping-services/whatsappServices.js';
import logger from '../../utils/logger.js'

const ALLOWED_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const parsePositiveInt = (value, { max, defaultValue } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return defaultValue;
  const capped = max ? Math.min(n, max) : n;
  return capped;
};

const normalizeFrequency = (value, { defaultValue } = {}) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const lower = String(value).toLowerCase();
  if (ALLOWED_FREQUENCIES.includes(lower)) return lower;
  return defaultValue !== undefined ? defaultValue : lower;
};

const toUploadedPath = (req, file) => {
  if (!file) return undefined;
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const base = host ? `${proto}://${host}` : '';
  // Use /api/uploads so the path works with the API base
  return `${base}/api/uploads/${file.filename}`;
};

const toUploadedMeta = (req, file) => {
  if (!file) return undefined;
  return {
    id: file.filename,
    url: toUploadedPath(req, file)
  };
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (_e) {
    return {};
  }
};

const extractRemark = (body = {}, query = {}) => {
  // Accept common variants and arrays; return undefined if nothing usable.
  const candidates = [
    body.remark,
    body['remark:'],
    body['remark '],
    body['Remark'],
    body['remark[]'],
    query.remark
  ];
  const found = candidates.find((v) => v !== undefined && v !== null);
  if (Array.isArray(found)) return found[0];
  if (Buffer.isBuffer(found)) return found.toString();
  return found;
};

const normalizeDepartmentValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
};

const parseDepartments = (value) => {
  if (!value) return [];
  if (typeof value !== 'string') return Array.isArray(value) ? value.map(normalizeDepartmentValue).filter(Boolean) : [];
  
  // Handle comma-separated departments - split by comma and normalize each
  return value
    .split(',')
    .map(d => {
      // Normalize: trim and replace multiple spaces with single space
      const normalized = d.replace(/\s+/g, ' ').trim();
      return normalized;
    })
    .filter(Boolean); // Remove empty strings
};

const resolveDepartment = (req) => {
  // For pending and history endpoints, token is not required
  // Use query parameter for department filtering
  const queryDept = req.query?.department;
  if (queryDept) {
    const departments = parseDepartments(queryDept);
    if (departments.length > 0) {
      return departments;
    }
  }

  // If token exists, use it as fallback (optional)
  if (req.user) {
    // For housekeeping, prioritize user_access1 over user_access
    const userAccess1 = req.user?.user_access1 || req.user?.userAccess1 || '';
    if (userAccess1) {
      const departments = parseDepartments(userAccess1);
      if (departments.length > 0) {
        return departments;
      }
    }

    // Fallback to user_access if user_access1 is not available
    const userAccess = req.user?.user_access || req.user?.userAccess || req.user?.department || '';
    if (userAccess) {
      const departments = parseDepartments(userAccess);
      if (departments.length > 0) {
        return departments;
      }
    }
  }

  // No department filter - return null to show all
  return null;
};

const extractAttachment = (body = {}, query = {}) => {
  const candidates = [
    body.attachment,
    body['attachment[]'],
    body['attachment '],
    body['Attachment'],
    query.attachment
  ];
  const found = candidates.find((v) => v !== undefined && v !== null);
  if (Array.isArray(found)) return found[0];
  if (Buffer.isBuffer(found)) return found.toString();
  return found;
};

const extractDoerName2 = (body = {}, query = {}) => {
  const candidates = [
    body.doer_name2,
    body['doer_name2[]'],
    query.doer_name2
  ];
  const found = candidates.find((v) => v !== undefined && v !== null);
  if (Array.isArray(found)) return found[0];
  if (Buffer.isBuffer(found)) return found.toString();
  return found;
};


const prepareCreatePayload = (payload = {}) => {
  const frequency = normalizeFrequency(payload.frequency, { defaultValue: 'daily' });
  if (frequency === 'one-time' && !payload.task_start_date) {
    throw new ApiError(400, 'task_start_date is required for one-time frequency');
  }
  return { ...payload, frequency };
};

const prepareUpdatePayload = (payload = {}) => {
  if (Object.prototype.hasOwnProperty.call(payload, 'frequency')) {
    const frequency = normalizeFrequency(payload.frequency, { defaultValue: 'daily' });
    if (frequency === 'one-time' && !payload.task_start_date) {
      throw new ApiError(400, 'task_start_date is required when setting frequency to one-time');
    }
    return { ...payload, frequency };
  }
  return payload;
};

const assignTaskController = {
  async create(req, res, next) {
    try {
      const prepared = prepareCreatePayload(req.body);
      const created = await assignTaskService.create(prepared);
      const meta = toUploadedMeta(req, req.file);
      res.status(201).json(meta ? { ...created, uploaded_image: meta } : created);
    } catch (err) {
      next(err);
    }
  },

  async bulkCreate(req, res, next) {
    try {
      const body = Array.isArray(req.body) ? req.body : [];
      const prepared = body.map((item) => prepareCreatePayload(item));
      const created = await assignTaskService.bulkCreate(prepared);
      res.status(201).json({ count: created.length, items: created });
    } catch (err) {
      next(err);
    }
  },

  async generateFromWorkingDays(req, res, next) {
    try {
      const created = await assignTaskService.generateFromWorkingDays(req.body || {});
      res.status(201).json({ count: created.length, items: created });
    } catch (err) {
      next(err);
    }
  },

  async list(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = req.query?.department;

      const items = await assignTaskService.list({ limit, offset: effectiveOffset, department });
      res.json(items);
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await assignTaskService.getById(req.params.id);
      if (!item) throw new ApiError(404, 'Assignment not found');
      res.json(item);
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const prepared = prepareUpdatePayload(req.body);
      const updated = await assignTaskService.update(req.params.id, prepared);
      if (!updated) throw new ApiError(404, 'Assignment not found');
      // Fire-and-forget notification; internal errors are logged inside the notifier.
      notifyAssignmentUpdate(updated);
      const meta = toUploadedMeta(req, req.file);
      res.json(meta ? { ...updated, uploaded_image: meta } : updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const removed = await assignTaskService.remove(req.params.id);
      if (!removed) throw new ApiError(404, 'Assignment not found');
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async stats(_req, res, next) {
    try {
      const snapshot = await assignTaskService.stats();
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  },

 
  async overdue(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = resolveDepartment(req);

      const { items, total } = await assignTaskService.overdueWithTotal({
        limit,
        offset: effectiveOffset,
        department
      });
      const payload = {
        items,
        total,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + items.length < total
      };
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },

  async notDone(_req, res, next) {
    try {
      const department = _req.query?.department;
      const items = await assignTaskService.notDone({ department });
      res.json(items);
    } catch (err) {
      next(err);
    }
  },

  async today(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = resolveDepartment(req);

      const { items, total } = await assignTaskService.todayWithTotal({
        limit,
        offset: effectiveOffset,
        department
      });
      const payload = {
        items,
        total,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + items.length < total
      };
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },

  async tomorrow(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = resolveDepartment(req);

      const { items, total } = await assignTaskService.tomorrowWithTotal({
        limit,
        offset: effectiveOffset,
        department
      });
      const payload = {
        items,
        total,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + items.length < total
      };
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },

  async countToday(req, res, next) {
    try {
      const department = resolveDepartment(req);
      const count = await assignTaskService.countToday({ department });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  },

  async countTomorrow(req, res, next) {
    try {
      const department = resolveDepartment(req);
      const count = await assignTaskService.countTomorrow({ department });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  },

  async countOverdue(req, res, next) {
    try {
      const department = resolveDepartment(req);
      const count = await assignTaskService.countOverdue({ department });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  },

  async pending(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = resolveDepartment(req);

      const { items, total } = await assignTaskService.pendingWithTotal({
        limit,
        offset: effectiveOffset,
        department
      });
      const payload = {
        items,
        total,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + items.length < total
      };
      if (req.query?.debug === '1') {
        payload.meta = {
          role: req.user?.role || null,
          department_used: department || null,
          token_department: normalizeDepartmentValue(req.user?.department) || null,
          token_access: normalizeDepartmentValue(req.user?.user_access) || null
        };
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },

  async history(req, res, next) {
    try {
      const limit = parsePositiveInt(req.query?.limit, { max: 100, defaultValue: 100 });
      const offset = parsePositiveInt(req.query?.offset, { defaultValue: 0 });
      const page = parsePositiveInt(req.query?.page, { defaultValue: 1 });
      const effectiveOffset = page && limit ? (page - 1) * limit : offset;
      const department = resolveDepartment(req);

      const { items, total } = await assignTaskService.historyWithTotal({
        limit,
        offset: effectiveOffset,
        department
      });
      const payload = {
        items,
        total,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + items.length < total
      };
      if (req.query?.debug === '1') {
        payload.meta = {
          role: req.user?.role || null,
          department_used: department || null,
          token_department: normalizeDepartmentValue(req.user?.department) || null,
          token_access: normalizeDepartmentValue(req.user?.user_access) || null
        };
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },

  // Mark an assignment as confirmed (stores marker in attachment column)
  async confirmAttachment(req, res, next) {
    try {
      const body = typeof req.body === 'string' ? safeJsonParse(req.body) : (req.body || {});
      const payload = {};

      const fileFromFields =
        req.file ||
        (req.files && Array.isArray(req.files) && req.files[0]) ||
        (req.files && req.files.image && req.files.image[0]) ||
        (req.files && req.files.upload && req.files.upload[0]);

      const uploadedImage = toUploadedPath(req, fileFromFields);
      const uploadedMeta = toUploadedMeta(req, fileFromFields);
      if (uploadedImage) {
        payload.image = uploadedImage;
      }

      const attachmentValue = extractAttachment(body, req.query);
      payload.attachment = attachmentValue !== undefined && attachmentValue !== null
        ? String(attachmentValue)
        : 'confirmed';

      // Prefer explicit remark key if present; otherwise accept common variants.
      const explicitRemark = Object.prototype.hasOwnProperty.call(body, 'remark')
        ? body.remark
        : undefined;
      const remarkValue = explicitRemark !== undefined ? explicitRemark : extractRemark(body, req.query);
      if (remarkValue !== undefined && remarkValue !== null) {
        payload.remark = String(remarkValue);
      }

      const doerName2Value = extractDoerName2(body, req.query);
      if (doerName2Value !== undefined && doerName2Value !== null) {
        payload.doer_name2 = String(doerName2Value);
      }

      const updated = await assignTaskService.update(req.params.id, payload);
      if (!updated) throw new ApiError(404, 'Assignment not found');
      res.json(uploadedMeta ? { ...updated, uploaded_image: uploadedMeta } : updated);
    } catch (err) {
      next(err);
    }
  },

  async confirmAttachmentBulk(req, res, next) {
    try {
      const body = typeof req.body === 'string' ? safeJsonParse(req.body) : (req.body || {});
      const rawIds = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
      const ids = rawIds
        .map((v) => (v !== undefined && v !== null ? String(v).trim() : ''))
        .filter(Boolean);

      if (ids.length === 0) {
        throw new ApiError(400, 'ids array is required for bulk confirm');
      }

      const fileFromFields =
        req.file ||
        (req.files && Array.isArray(req.files) && req.files[0]) ||
        (req.files && req.files.image && req.files.image[0]) ||
        (req.files && req.files.upload && req.files.upload[0]);

      const uploadedImage = toUploadedPath(req, fileFromFields);
      const uploadedMeta = toUploadedMeta(req, fileFromFields);

      const payload = {};
      if (uploadedImage) {
        payload.image = uploadedImage;
      }

      const attachmentValue = extractAttachment(body, req.query);
      payload.attachment = attachmentValue !== undefined && attachmentValue !== null
        ? String(attachmentValue)
        : 'confirmed';

      const explicitRemark = Object.prototype.hasOwnProperty.call(body, 'remark')
        ? body.remark
        : undefined;
      const remarkValue = explicitRemark !== undefined ? explicitRemark : extractRemark(body, req.query);
      if (remarkValue !== undefined && remarkValue !== null) {
        payload.remark = String(remarkValue);
      }

      const doerName2Value = extractDoerName2(body, req.query);
      if (doerName2Value !== undefined && doerName2Value !== null) {
        payload.doer_name2 = String(doerName2Value);
      }

      const successes = [];
      const failures = [];

      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const updated = await assignTaskService.update(id, payload);
        if (updated) {
          successes.push(uploadedMeta ? { ...updated, uploaded_image: uploadedMeta } : updated);
        } else {
          failures.push({ id, error: 'Not found' });
        }
      }

      res.json({
        updated: successes.length,
        failed: failures.length,
        items: successes,
        failures
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteBulk(req, res, next) {
    try {
      const body = typeof req.body === 'string' ? safeJsonParse(req.body) : (req.body || {});
      let raw = body.ids ?? body.id ?? body.task_id ?? body.task_ids;
      if (raw === undefined || raw === null) {
        throw new ApiError(400, 'ids array is required for bulk delete');
      }

      let ids;
      if (Array.isArray(raw)) {
        ids = raw;
      } else if (typeof raw === 'string') {
        ids = raw.split(',');
      } else {
        ids = [raw];
      }

      const normalized = ids
        .map((value) => (value !== undefined && value !== null ? String(value).trim() : ''))
        .filter(Boolean);

      if (normalized.length === 0) {
        throw new ApiError(400, 'ids array is required for bulk delete');
      }

      const deleted = await assignTaskService.deleteMany(normalized);
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  }
};

export { assignTaskController };
